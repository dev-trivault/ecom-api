import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, Tx } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { pageArgs, paginated } from '../../common/dto/pagination.dto.js';
import { dateRange, toDbDate } from '../../common/utils/dates.js';
import { clean } from '../../common/utils/strings.js';
import { DocumentNumberService } from '../inventory/document-number.service.js';
import { StockService } from '../inventory/stock.service.js';
import { WarehousesService } from '../inventory/warehouses.service.js';
import { CreatePurchaseDto, PurchaseQueryDto } from './purchases.dto.js';

const TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly numbers: DocumentNumberService,
    private readonly warehouses: WarehousesService,
  ) {}

  async list(query: PurchaseQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.PurchaseWhereInput = {
      status: query.status,
      supplierId: query.supplierId,
      purchaseDate: dateRange(query.from, query.to),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { invoiceNumber: { contains: search, mode: 'insensitive' } },
              { supplier: { name: { contains: search, mode: 'insensitive' } } },
              { items: { some: { variant: { sku: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
        ...pageArgs(query),
        include: {
          supplier: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return paginated(items, total, query);
  }

  async get(id: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        warehouse: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            variant: {
              select: { id: true, sku: true, size: true, color: true, product: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!purchase) throw new NotFoundException('Purchase not found');
    const cancelledBy = purchase.cancelledById
      ? await this.prisma.user.findUnique({ where: { id: purchase.cancelledById }, select: { id: true, name: true } })
      : null;
    return { ...purchase, cancelledBy };
  }

  async create(user: AuthUser, dto: CreatePurchaseDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.stock.loadVariants(
        tx,
        dto.items.map((i) => i.variantId),
      );
      if (dto.supplierId) {
        const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId } });
        if (!supplier) throw new NotFoundException('Supplier not found');
      }
      const warehouseId = await this.warehouses.resolve(tx, dto.warehouseId);
      const number = await this.numbers.next(tx, 'PURCHASE');

      const lines = dto.items.map((i) => {
        const unitCost = new Prisma.Decimal(i.unitCost);
        return { variantId: i.variantId, quantity: i.quantity, unitCost, lineTotal: unitCost.mul(i.quantity) };
      });

      const purchase = await tx.purchase.create({
        data: {
          number,
          supplierId: dto.supplierId,
          warehouseId,
          invoiceNumber: clean(dto.invoiceNumber),
          purchaseDate: toDbDate(dto.purchaseDate),
          notes: clean(dto.notes),
          totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
          totalAmount: lines.reduce((s, l) => s.add(l.lineTotal), new Prisma.Decimal(0)),
          createdById: user.userId,
          items: { createMany: { data: lines } },
        },
      });

      await this.stock.apply(
        tx,
        { warehouseId, userId: user.userId, purchaseId: purchase.id },
        lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          type: 'PURCHASE' as const,
          unitCost: l.unitCost,
        })),
      );

      if (dto.updateCostPrice) {
        // Last line wins when the same SKU appears twice
        const latestCost = new Map(lines.filter((l) => l.unitCost.gt(0)).map((l) => [l.variantId, l.unitCost]));
        for (const [variantId, costPrice] of latestCost) {
          await tx.productVariant.update({ where: { id: variantId }, data: { costPrice } });
        }
      }
      return purchase.id;
    }, TX_OPTIONS);

    return this.get(id);
  }

  /** Cancelling takes the purchased units back out of stock. The entry stays for the record. */
  async cancel(user: AuthUser, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!purchase) throw new NotFoundException('Purchase not found');
      if (purchase.status === 'CANCELLED') throw new BadRequestException('This purchase is already cancelled');

      // Conditional update: if two people cancel at once, only one succeeds.
      const { count } = await tx.purchase.updateMany({
        where: { id, status: 'COMPLETED' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: user.userId, cancelReason: reason },
      });
      if (count === 0) throw new ConflictException('This purchase was just cancelled by someone else');

      await this.stock.apply(
        tx,
        { warehouseId: purchase.warehouseId, userId: user.userId, purchaseId: id },
        purchase.items.map((i) => ({
          variantId: i.variantId,
          quantity: -i.quantity,
          type: 'PURCHASE_CANCELLED' as const,
          unitCost: i.unitCost,
          note: reason,
        })),
      );

      await this.restorePreviousCostPrices(tx, purchase.items);
    }, TX_OPTIONS);
    return this.get(id);
  }

  /**
   * If a SKU's cost price came from the cancelled purchase, fall back to the price of its
   * latest remaining purchase. Cost prices that were edited by hand since are left alone.
   */
  private async restorePreviousCostPrices(tx: Tx, items: { variantId: string; unitCost: Prisma.Decimal }[]) {
    for (const item of items) {
      const variant = await tx.productVariant.findUnique({
        where: { id: item.variantId },
        select: { costPrice: true },
      });
      if (!variant?.costPrice.equals(item.unitCost)) continue;
      const previous = await tx.purchaseItem.findFirst({
        where: { variantId: item.variantId, unitCost: { gt: 0 }, purchase: { status: 'COMPLETED' } },
        orderBy: [{ purchase: { purchaseDate: 'desc' } }, { purchase: { createdAt: 'desc' } }],
        select: { unitCost: true },
      });
      if (previous) {
        await tx.productVariant.update({ where: { id: item.variantId }, data: { costPrice: previous.unitCost } });
      }
    }
  }
}
