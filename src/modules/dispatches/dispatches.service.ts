import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { pageArgs, paginated } from '../../common/dto/pagination.dto.js';
import { dateRange, toDbDate } from '../../common/utils/dates.js';
import { clean } from '../../common/utils/strings.js';
import { DocumentNumberService } from '../inventory/document-number.service.js';
import { StockService } from '../inventory/stock.service.js';
import { WarehousesService } from '../inventory/warehouses.service.js';
import { CreateDispatchDto, DispatchLookupDto, DispatchQueryDto } from './dispatches.dto.js';

const TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

const itemsWithVariant = {
  include: {
    variant: {
      select: { id: true, sku: true, size: true, color: true, product: { select: { id: true, name: true } } },
    },
  },
} satisfies Prisma.DispatchItemDefaultArgs;

/** Returns recorded against a packing entry, with item quantities so the UI can work out what is left. */
const linkedReturns = {
  orderBy: { createdAt: 'asc' },
  select: {
    id: true,
    number: true,
    status: true,
    type: true,
    returnDate: true,
    items: { select: { variantId: true, quantity: true } },
  },
} satisfies Prisma.Dispatch$salesReturnsArgs;

@Injectable()
export class DispatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly numbers: DocumentNumberService,
    private readonly warehouses: WarehousesService,
  ) {}

  async list(query: DispatchQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.DispatchWhereInput = {
      status: query.status,
      channelId: query.channelId,
      dispatchDate: dateRange(query.from, query.to),
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
      this.prisma.dispatch.findMany({
        where,
        orderBy: [{ dispatchDate: 'desc' }, { createdAt: 'desc' }],
        ...pageArgs(query),
        include: {
          channel: { select: { id: true, name: true, code: true, color: true } },
          createdBy: { select: { id: true, name: true } },
          items: itemsWithVariant,
        },
      }),
      this.prisma.dispatch.count({ where }),
    ]);
    return paginated(items, total, query);
  }

  async get(id: string) {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id },
      include: {
        channel: { select: { id: true, name: true, code: true, color: true } },
        warehouse: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: itemsWithVariant,
        salesReturns: linkedReturns,
      },
    });
    if (!dispatch) throw new NotFoundException('Packing entry not found');
    const cancelledBy = dispatch.cancelledById
      ? await this.prisma.user.findUnique({ where: { id: dispatch.cancelledById }, select: { id: true, name: true } })
      : null;
    return { ...dispatch, cancelledBy };
  }

  /** Finds packed orders by order ID or tracking number. Used to pre-fill return entries. */
  async lookup(query: DispatchLookupDto) {
    return this.prisma.dispatch.findMany({
      where: {
        status: 'COMPLETED',
        channelId: query.channelId,
        OR: [
          { orderNumber: { equals: query.orderNumber, mode: 'insensitive' } },
          { trackingNumber: { equals: query.orderNumber, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        channel: { select: { id: true, name: true, code: true, color: true } },
        items: itemsWithVariant,
        salesReturns: linkedReturns,
      },
    });
  }

  async create(user: AuthUser, dto: CreateDispatchDto) {
    const orderNumber = clean(dto.orderNumber);

    const id = await this.prisma.$transaction(async (tx) => {
      const channel = await tx.salesChannel.findUnique({ where: { id: dto.channelId } });
      if (!channel) throw new NotFoundException('Sales channel not found');
      if (!channel.isActive) throw new BadRequestException(`${channel.name} is turned off in settings`);

      if (orderNumber) {
        const existing = await tx.dispatch.findFirst({
          where: {
            channelId: dto.channelId,
            status: 'COMPLETED',
            orderNumber: { equals: orderNumber, mode: 'insensitive' },
          },
          select: { number: true },
        });
        if (existing) {
          throw new ConflictException(`Order ${orderNumber} on ${channel.name} is already packed (${existing.number})`);
        }
      }

      await this.stock.loadVariants(
        tx,
        dto.items.map((i) => i.variantId),
      );
      const warehouseId = await this.warehouses.resolve(tx, dto.warehouseId);
      const number = await this.numbers.next(tx, 'DISPATCH');

      const dispatch = await tx.dispatch.create({
        data: {
          number,
          channelId: dto.channelId,
          warehouseId,
          orderNumber,
          trackingNumber: clean(dto.trackingNumber),
          dispatchDate: toDbDate(dto.dispatchDate),
          notes: clean(dto.notes),
          totalQuantity: dto.items.reduce((s, i) => s + i.quantity, 0),
          createdById: user.userId,
          items: { createMany: { data: dto.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) } },
        },
      });

      await this.stock.apply(
        tx,
        { warehouseId, userId: user.userId, dispatchId: dispatch.id },
        dto.items.map((i) => ({ variantId: i.variantId, quantity: -i.quantity, type: 'DISPATCH' as const })),
      );
      return dispatch.id;
    }, TX_OPTIONS);

    return this.get(id);
  }

  /** Cancelling puts the packed units back into stock. */
  async cancel(user: AuthUser, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const dispatch = await tx.dispatch.findUnique({
        where: { id },
        include: { items: true, salesReturns: { where: { status: 'COMPLETED' }, select: { number: true } } },
      });
      if (!dispatch) throw new NotFoundException('Packing entry not found');
      if (dispatch.status === 'CANCELLED') throw new BadRequestException('This packing entry is already cancelled');
      if (dispatch.salesReturns.length) {
        throw new BadRequestException(
          `Cancel the return ${dispatch.salesReturns.map((r) => r.number).join(', ')} first`,
        );
      }

      const { count } = await tx.dispatch.updateMany({
        where: { id, status: 'COMPLETED' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: user.userId, cancelReason: reason },
      });
      if (count === 0) throw new ConflictException('This packing entry was just cancelled by someone else');

      await this.stock.apply(
        tx,
        { warehouseId: dispatch.warehouseId, userId: user.userId, dispatchId: id },
        dispatch.items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          type: 'DISPATCH_CANCELLED' as const,
          note: reason,
        })),
      );
    }, TX_OPTIONS);
    return this.get(id);
  }
}
