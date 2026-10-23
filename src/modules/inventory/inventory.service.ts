import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { pageArgs, paginated } from '../../common/dto/pagination.dto.js';
import { timestampRange } from '../../common/utils/dates.js';
import { toCsv } from '../../common/utils/strings.js';
import { MovementQueryDto, StockAdjustmentDto, StockQueryDto } from './dto/inventory.dto.js';
import { StockService } from './stock.service.js';
import { WarehousesService } from './warehouses.service.js';

export interface StockRow {
  variantId: string;
  productId: string;
  productName: string;
  category: string | null;
  sku: string;
  size: string | null;
  color: string | null;
  costPrice: number;
  sellingPrice: number;
  lowStockThreshold: number;
  quantity: number;
  stockValue: number;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly warehouses: WarehousesService,
  ) {}

  /** Current stock per SKU, summed across warehouses unless one is chosen. */
  async listStock(organizationId: string, query: StockQueryDto) {
    const base = this.stockQuery(organizationId, query);
    const { skip, take } = pageArgs(query);

    // Reorder lists show the emptiest SKUs first; everything else is alphabetical.
    const order =
      query.status === 'reorder'
        ? Prisma.sql`ORDER BY quantity ASC, "productName" ASC, sku ASC`
        : Prisma.sql`ORDER BY "productName" ASC, sku ASC`;

    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<StockRow[]>(Prisma.sql`${base} ${order} LIMIT ${take} OFFSET ${skip}`),
      this.prisma.$queryRaw<{ count: number; units: number; value: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS count,
                          COALESCE(SUM(GREATEST(quantity, 0)), 0)::int AS units,
                          COALESCE(SUM("stockValue"), 0)::float8 AS value
                   FROM (${base}) s`,
      ),
    ]);
    const summary = totals[0] ?? { count: 0, units: 0, value: 0 };
    return { ...paginated(rows, summary.count, query), totalUnits: summary.units, totalValue: summary.value };
  }

  async exportStockCsv(organizationId: string, query: StockQueryDto): Promise<string> {
    const rows = await this.prisma.$queryRaw<StockRow[]>(
      Prisma.sql`${this.stockQuery(organizationId, query)} ORDER BY "productName" ASC, sku ASC`,
    );
    return toCsv(
      [
        'Product',
        'SKU',
        'Size',
        'Color',
        'Category',
        'Quantity',
        'Low stock level',
        'Cost price',
        'Selling price',
        'Stock value',
      ],
      rows.map((r) => [
        r.productName,
        r.sku,
        r.size,
        r.color,
        r.category,
        r.quantity,
        r.lowStockThreshold,
        r.costPrice,
        r.sellingPrice,
        r.stockValue,
      ]),
    );
  }

  async listMovements(organizationId: string, query: MovementQueryDto) {
    const { timezone } = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const search = query.search?.trim();
    const where: Prisma.StockMovementWhereInput = {
      organizationId,
      variantId: query.variantId,
      type: query.type,
      warehouseId: query.warehouseId,
      createdAt: timestampRange(timezone, query.from, query.to),
      ...(search
        ? {
            OR: [
              { variant: { sku: { contains: search, mode: 'insensitive' } } },
              { variant: { product: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        include: {
          variant: {
            select: { id: true, sku: true, size: true, color: true, product: { select: { id: true, name: true } } },
          },
          warehouse: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          purchase: { select: { id: true, number: true } },
          dispatch: { select: { id: true, number: true, orderNumber: true } },
          salesReturn: { select: { id: true, number: true, orderNumber: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return paginated(items, total, query);
  }

  async adjust(user: AuthUser, dto: StockAdjustmentDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.stock.loadVariants(tx, user.organizationId, [dto.variantId]);
      const warehouseId = await this.warehouses.resolve(tx, user.organizationId, dto.warehouseId);

      let change = dto.quantity;
      if (dto.mode === 'SET') {
        if (dto.quantity < 0) throw new BadRequestException('Physical count cannot be negative');
        const level = await tx.stockLevel.findUnique({
          where: { variantId_warehouseId: { variantId: dto.variantId, warehouseId } },
        });
        change = dto.quantity - (level?.quantity ?? 0);
      }
      if (change === 0) throw new BadRequestException('Stock is already at this quantity, nothing to adjust');

      await this.stock.apply(tx, { organizationId: user.organizationId, warehouseId, userId: user.userId }, [
        { variantId: dto.variantId, quantity: change, type: 'ADJUSTMENT', note: dto.reason.trim() },
      ]);
      const level = await tx.stockLevel.findUniqueOrThrow({
        where: { variantId_warehouseId: { variantId: dto.variantId, warehouseId } },
      });
      return { variantId: dto.variantId, warehouseId, change, quantity: level.quantity };
    });
  }

  private stockQuery(organizationId: string, query: StockQueryDto): Prisma.Sql {
    const search = query.search?.trim();
    const like = search ? `%${search}%` : null;
    const warehouseJoin = query.warehouseId
      ? Prisma.sql`AND sl.warehouse_id = ${query.warehouseId}::uuid`
      : Prisma.empty;
    const having = {
      all: Prisma.empty,
      in_stock: Prisma.sql`HAVING COALESCE(SUM(sl.quantity), 0) > 0`,
      low: Prisma.sql`HAVING COALESCE(SUM(sl.quantity), 0) > 0 AND COALESCE(SUM(sl.quantity), 0) <= v.low_stock_threshold`,
      out: Prisma.sql`HAVING COALESCE(SUM(sl.quantity), 0) <= 0`,
      reorder: Prisma.sql`HAVING COALESCE(SUM(sl.quantity), 0) <= v.low_stock_threshold`,
    }[query.status];

    return Prisma.sql`
      SELECT v.id AS "variantId",
             p.id AS "productId",
             p.name AS "productName",
             p.category,
             v.sku,
             v.size,
             v.color,
             v.cost_price::float8 AS "costPrice",
             v.selling_price::float8 AS "sellingPrice",
             v.low_stock_threshold AS "lowStockThreshold",
             COALESCE(SUM(sl.quantity), 0)::int AS quantity,
             (GREATEST(COALESCE(SUM(sl.quantity), 0), 0) * v.cost_price)::float8 AS "stockValue"
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN stock_levels sl ON sl.variant_id = v.id ${warehouseJoin}
      WHERE v.organization_id = ${organizationId}::uuid
        AND v.is_active = true
        AND p.is_active = true
        ${like ? Prisma.sql`AND (v.sku ILIKE ${like} OR p.name ILIKE ${like} OR v.barcode ILIKE ${like})` : Prisma.empty}
        ${query.category ? Prisma.sql`AND p.category = ${query.category}` : Prisma.empty}
      GROUP BY v.id, p.id
      ${having}`;
  }
}
