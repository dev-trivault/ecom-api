import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { addDays, toDbDate, todayIn } from '../../common/utils/dates.js';
import { InventoryService } from '../inventory/inventory.service.js';

const TREND_DAYS = 14;
const CHANNEL_WINDOW_DAYS = 30;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async summary(organizationId: string) {
    const { timezone } = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const today = todayIn(timezone);
    const monthStart = `${today.slice(0, 8)}01`;
    const trendStart = addDays(today, -(TREND_DAYS - 1));
    const channelStart = addDays(today, -(CHANNEL_WINDOW_DAYS - 1));
    const completed = { organizationId, status: 'COMPLETED' as const };

    const [
      stock,
      packedToday,
      returnedToday,
      purchasesThisMonth,
      channels,
      packedByChannel,
      returnedByChannel,
      trend,
      reorder,
      recent,
    ] = await Promise.all([
      this.stockTotals(organizationId),
      this.prisma.dispatch.aggregate({
        where: { ...completed, dispatchDate: toDbDate(today) },
        _count: true,
        _sum: { totalQuantity: true },
      }),
      this.prisma.salesReturn.aggregate({
        where: { ...completed, returnDate: toDbDate(today) },
        _count: true,
        _sum: { totalQuantity: true },
      }),
      this.prisma.purchase.aggregate({
        where: { ...completed, purchaseDate: { gte: toDbDate(monthStart) } },
        _count: true,
        _sum: { totalQuantity: true, totalAmount: true },
      }),
      this.prisma.salesChannel.findMany({ where: { organizationId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.dispatch.groupBy({
        by: ['channelId'],
        where: { ...completed, dispatchDate: { gte: toDbDate(channelStart) } },
        _count: true,
        _sum: { totalQuantity: true },
      }),
      this.prisma.salesReturn.groupBy({
        by: ['channelId'],
        where: { ...completed, returnDate: { gte: toDbDate(channelStart) } },
        _count: true,
        _sum: { totalQuantity: true },
      }),
      this.dailyTrend(organizationId, trendStart),
      this.inventory.listStock(organizationId, { status: 'reorder', page: 1, pageSize: 8 }),
      this.inventory.listMovements(organizationId, { page: 1, pageSize: 8 }),
    ]);

    const packed = new Map(packedByChannel.map((c) => [c.channelId, c]));
    const returned = new Map(returnedByChannel.map((c) => [c.channelId, c]));

    return {
      today,
      stock,
      packedToday: { orders: packedToday._count, units: packedToday._sum.totalQuantity ?? 0 },
      returnedToday: { parcels: returnedToday._count, units: returnedToday._sum.totalQuantity ?? 0 },
      purchasesThisMonth: {
        count: purchasesThisMonth._count,
        units: purchasesThisMonth._sum.totalQuantity ?? 0,
        amount: Number(purchasesThisMonth._sum.totalAmount ?? 0),
      },
      channels: channels
        .filter((c) => c.isActive || packed.has(c.id) || returned.has(c.id))
        .map((c) => {
          const packedUnits = packed.get(c.id)?._sum.totalQuantity ?? 0;
          const returnedUnits = returned.get(c.id)?._sum.totalQuantity ?? 0;
          return {
            id: c.id,
            name: c.name,
            code: c.code,
            color: c.color,
            packedOrders: packed.get(c.id)?._count ?? 0,
            packedUnits,
            returnedParcels: returned.get(c.id)?._count ?? 0,
            returnedUnits,
            returnRate: packedUnits > 0 ? returnedUnits / packedUnits : null,
          };
        }),
      channelWindowDays: CHANNEL_WINDOW_DAYS,
      trend,
      reorder: reorder.items,
      recentMovements: recent.items,
    };
  }

  private async stockTotals(organizationId: string) {
    const [row] = await this.prisma.$queryRaw<
      { skus: number; units: number; value: number; low: number; out: number }[]
    >(Prisma.sql`
      SELECT COUNT(*)::int AS skus,
             COALESCE(SUM(GREATEST(qty, 0)), 0)::int AS units,
             COALESCE(SUM(GREATEST(qty, 0) * cost), 0)::float8 AS value,
             COUNT(*) FILTER (WHERE qty > 0 AND qty <= threshold)::int AS low,
             COUNT(*) FILTER (WHERE qty <= 0)::int AS out
      FROM (
        SELECT v.id, v.cost_price AS cost, v.low_stock_threshold AS threshold,
               COALESCE(SUM(sl.quantity), 0) AS qty
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        LEFT JOIN stock_levels sl ON sl.variant_id = v.id
        WHERE v.organization_id = ${organizationId}::uuid AND v.is_active AND p.is_active
        GROUP BY v.id
      ) s`);
    return row ?? { skus: 0, units: 0, value: 0, low: 0, out: 0 };
  }

  /** Units packed and returned per day, with zero-filled days so charts have no gaps. */
  private async dailyTrend(organizationId: string, from: string) {
    const [packed, returned] = await Promise.all([
      this.prisma.dispatch.groupBy({
        by: ['dispatchDate'],
        where: { organizationId, status: 'COMPLETED', dispatchDate: { gte: toDbDate(from) } },
        _sum: { totalQuantity: true },
      }),
      this.prisma.salesReturn.groupBy({
        by: ['returnDate'],
        where: { organizationId, status: 'COMPLETED', returnDate: { gte: toDbDate(from) } },
        _sum: { totalQuantity: true },
      }),
    ]);
    const packedByDay = new Map(
      packed.map((p) => [p.dispatchDate.toISOString().slice(0, 10), p._sum.totalQuantity ?? 0]),
    );
    const returnedByDay = new Map(
      returned.map((r) => [r.returnDate.toISOString().slice(0, 10), r._sum.totalQuantity ?? 0]),
    );
    return Array.from({ length: TREND_DAYS }, (_, i) => {
      const date = addDays(from, i);
      return { date, packed: packedByDay.get(date) ?? 0, returned: returnedByDay.get(date) ?? 0 };
    });
  }
}
