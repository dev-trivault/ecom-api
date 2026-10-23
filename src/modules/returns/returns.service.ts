import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, Tx } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { pageArgs, paginated } from '../../common/dto/pagination.dto.js';
import { dateRange, toDbDate } from '../../common/utils/dates.js';
import { clean } from '../../common/utils/strings.js';
import { DocumentNumberService } from '../inventory/document-number.service.js';
import { StockService } from '../inventory/stock.service.js';
import { WarehousesService } from '../inventory/warehouses.service.js';
import { CreateReturnDto, ReturnItemDto, ReturnQueryDto } from './returns.dto.js';

const TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

const itemsWithVariant = {
  include: {
    variant: {
      select: { id: true, sku: true, size: true, color: true, product: { select: { id: true, name: true } } },
    },
  },
} satisfies Prisma.ReturnItemDefaultArgs;

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly numbers: DocumentNumberService,
    private readonly warehouses: WarehousesService,
  ) {}

  async list(organizationId: string, query: ReturnQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.SalesReturnWhereInput = {
      organizationId,
      status: query.status,
      channelId: query.channelId,
      type: query.type,
      returnDate: dateRange(query.from, query.to),
      ...(query.condition ? { items: { some: { condition: query.condition } } } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { orderNumber: { contains: search, mode: 'insensitive' } },
              { trackingNumber: { contains: search, mode: 'insensitive' } },
              { items: { some: { variant: { sku: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.salesReturn.findMany({
        where,
        orderBy: [{ returnDate: 'desc' }, { createdAt: 'desc' }],
        ...pageArgs(query),
        include: {
          channel: { select: { id: true, name: true, code: true, color: true } },
          createdBy: { select: { id: true, name: true } },
          items: itemsWithVariant,
        },
      }),
      this.prisma.salesReturn.count({ where }),
    ]);
    return paginated(items, total, query);
  }

  async get(organizationId: string, id: string) {
    const salesReturn = await this.prisma.salesReturn.findFirst({
      where: { id, organizationId },
      include: {
        channel: { select: { id: true, name: true, code: true, color: true } },
        warehouse: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        dispatch: { select: { id: true, number: true, dispatchDate: true, orderNumber: true } },
        items: itemsWithVariant,
      },
    });
    if (!salesReturn) throw new NotFoundException('Return not found');
    const cancelledBy = salesReturn.cancelledById
      ? await this.prisma.user.findUnique({
          where: { id: salesReturn.cancelledById },
          select: { id: true, name: true },
        })
      : null;
    return { ...salesReturn, cancelledBy };
  }

  async create(user: AuthUser, dto: CreateReturnDto) {
    const organizationId = user.organizationId;
    const orderNumber = clean(dto.orderNumber);

    const id = await this.prisma.$transaction(async (tx) => {
      const channel = await tx.salesChannel.findFirst({ where: { id: dto.channelId, organizationId } });
      if (!channel) throw new NotFoundException('Sales channel not found');

      // Returned products may have been deactivated since they were sold, so allow inactive SKUs.
      await this.stock.loadVariants(
        tx,
        organizationId,
        dto.items.map((i) => i.variantId),
        { allowInactive: true },
      );

      const dispatch = await this.findOriginalDispatch(tx, organizationId, dto, orderNumber);
      if (dispatch) await this.assertNotOverReturned(tx, dispatch.id, dto.items);

      const warehouseId = await this.warehouses.resolve(tx, organizationId, dto.warehouseId ?? dispatch?.warehouseId);
      const number = await this.numbers.next(tx, organizationId, 'RETURN');
      const good = dto.items.filter((i) => i.condition === 'GOOD');

      const salesReturn = await tx.salesReturn.create({
        data: {
          organizationId,
          number,
          channelId: dto.channelId,
          warehouseId,
          dispatchId: dispatch?.id,
          type: dto.type,
          orderNumber: orderNumber ?? dispatch?.orderNumber,
          trackingNumber: clean(dto.trackingNumber),
          returnDate: toDbDate(dto.returnDate),
          notes: clean(dto.notes),
          totalQuantity: dto.items.reduce((s, i) => s + i.quantity, 0),
          restockedQuantity: good.reduce((s, i) => s + i.quantity, 0),
          createdById: user.userId,
          items: {
            createMany: {
              data: dto.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, condition: i.condition })),
            },
          },
        },
      });

      await this.stock.apply(
        tx,
        { organizationId, warehouseId, userId: user.userId, salesReturnId: salesReturn.id },
        good.map((i) => ({ variantId: i.variantId, quantity: i.quantity, type: 'RETURN' as const })),
      );
      return salesReturn.id;
    }, TX_OPTIONS);

    return this.get(organizationId, id);
  }

  /** Cancelling takes the restocked (GOOD) units back out of stock. */
  async cancel(user: AuthUser, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const salesReturn = await tx.salesReturn.findFirst({
        where: { id, organizationId: user.organizationId },
        include: { items: true },
      });
      if (!salesReturn) throw new NotFoundException('Return not found');
      if (salesReturn.status === 'CANCELLED') throw new BadRequestException('This return is already cancelled');

      const { count } = await tx.salesReturn.updateMany({
        where: { id, status: 'COMPLETED' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: user.userId, cancelReason: reason },
      });
      if (count === 0) throw new ConflictException('This return was just cancelled by someone else');

      await this.stock.apply(
        tx,
        {
          organizationId: user.organizationId,
          warehouseId: salesReturn.warehouseId,
          userId: user.userId,
          salesReturnId: id,
        },
        salesReturn.items
          .filter((i) => i.condition === 'GOOD')
          .map((i) => ({
            variantId: i.variantId,
            quantity: -i.quantity,
            type: 'RETURN_CANCELLED' as const,
            note: reason,
          })),
      );
    }, TX_OPTIONS);
    return this.get(user.organizationId, id);
  }

  private async findOriginalDispatch(tx: Tx, organizationId: string, dto: CreateReturnDto, orderNumber: string | null) {
    if (dto.dispatchId) {
      const dispatch = await tx.dispatch.findFirst({ where: { id: dto.dispatchId, organizationId } });
      if (!dispatch) throw new NotFoundException('Original packing entry not found');
      if (dispatch.status === 'CANCELLED')
        throw new BadRequestException(`Packing entry ${dispatch.number} is cancelled`);
      if (dispatch.channelId !== dto.channelId) {
        throw new BadRequestException(`Packing entry ${dispatch.number} belongs to a different sales channel`);
      }
      return dispatch;
    }
    if (!orderNumber) return null;
    return tx.dispatch.findFirst({
      where: {
        organizationId,
        channelId: dto.channelId,
        status: 'COMPLETED',
        orderNumber: { equals: orderNumber, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** A linked return cannot bring back more units of a SKU than were packed for that order. */
  private async assertNotOverReturned(tx: Tx, dispatchId: string, items: ReturnItemDto[]) {
    const [packed, previous] = await Promise.all([
      tx.dispatchItem.findMany({
        where: { dispatchId },
        include: { variant: { select: { sku: true } } },
      }),
      tx.returnItem.findMany({
        where: { salesReturn: { dispatchId, status: 'COMPLETED' } },
        select: { variantId: true, quantity: true },
      }),
    ]);
    const packedQty = new Map<string, number>();
    for (const p of packed) packedQty.set(p.variantId, (packedQty.get(p.variantId) ?? 0) + p.quantity);
    const returnedQty = new Map<string, number>();
    for (const r of [...previous, ...items])
      returnedQty.set(r.variantId, (returnedQty.get(r.variantId) ?? 0) + r.quantity);

    for (const [variantId, qty] of returnedQty) {
      const sent = packedQty.get(variantId) ?? 0;
      if (sent === 0) {
        throw new BadRequestException(
          'A returned SKU was not part of this order. Remove it or unlink the packing entry.',
        );
      }
      if (qty > sent) {
        const sku = packed.find((p) => p.variantId === variantId)?.variant.sku;
        throw new BadRequestException(
          `Only ${sent} unit(s) of ${sku} were packed for this order, but ${qty} would be returned`,
        );
      }
    }
  }
}
