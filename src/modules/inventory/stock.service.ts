import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { StockMovementType } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Tx } from '../../prisma/prisma.service.js';

export interface StockChange {
  variantId: string;
  /** Signed: positive adds stock, negative removes stock. */
  quantity: number;
  type: StockMovementType;
  unitCost?: Prisma.Decimal | number | string | null;
  note?: string | null;
}

export interface StockContext {
  organizationId: string;
  warehouseId: string;
  userId: string;
  purchaseId?: string;
  dispatchId?: string;
  salesReturnId?: string;
}

export interface VariantInfo {
  id: string;
  sku: string;
  productName: string;
}

/**
 * The only place that changes stock.
 *
 * Every change writes one append-only row to `stock_movements` (the ledger) and updates the
 * running total in `stock_levels`, inside the caller's transaction. Because the total is
 * updated with an atomic increment, concurrent entries for the same SKU cannot lose updates.
 */
@Injectable()
export class StockService {
  async apply(tx: Tx, ctx: StockContext, changes: StockChange[]): Promise<void> {
    const effective = changes.filter((c) => c.quantity !== 0);
    if (effective.length === 0) return;

    const { isNegativeStockAllowed } = await tx.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { isNegativeStockAllowed: true },
    });
    if (!isNegativeStockAllowed) await this.assertAvailable(tx, ctx, effective);

    // A fixed lock order (by variant id) prevents deadlocks between two entries that
    // touch the same SKUs at the same moment.
    const ordered = [...effective].sort((a, b) => a.variantId.localeCompare(b.variantId));

    for (const change of ordered) {
      const level = await tx.stockLevel.upsert({
        where: { variantId_warehouseId: { variantId: change.variantId, warehouseId: ctx.warehouseId } },
        create: {
          organizationId: ctx.organizationId,
          variantId: change.variantId,
          warehouseId: ctx.warehouseId,
          quantity: change.quantity,
        },
        update: { quantity: { increment: change.quantity } },
      });

      // Guards against a race with another entry committed after assertAvailable ran.
      if (!isNegativeStockAllowed && change.quantity < 0 && level.quantity < 0) {
        const variant = await tx.productVariant.findUnique({ where: { id: change.variantId }, select: { sku: true } });
        throw new BadRequestException(
          `Not enough stock for ${variant?.sku ?? 'this SKU'}. Available: ${level.quantity - change.quantity}, needed: ${-change.quantity}`,
        );
      }

      await tx.stockMovement.create({
        data: {
          organizationId: ctx.organizationId,
          warehouseId: ctx.warehouseId,
          variantId: change.variantId,
          type: change.type,
          quantity: change.quantity,
          balanceAfter: level.quantity,
          unitCost: change.unitCost ?? null,
          note: change.note ?? null,
          purchaseId: ctx.purchaseId,
          dispatchId: ctx.dispatchId,
          salesReturnId: ctx.salesReturnId,
          createdById: ctx.userId,
        },
      });
    }
  }

  /**
   * Loads the given variants, making sure they exist in this organization.
   * Inactive SKUs are rejected unless `allowInactive` (needed when reversing old entries).
   */
  async loadVariants(
    tx: Tx,
    organizationId: string,
    variantIds: string[],
    { allowInactive = false } = {},
  ): Promise<Map<string, VariantInfo & { costPrice: Prisma.Decimal }>> {
    const unique = [...new Set(variantIds)];
    const variants = await tx.productVariant.findMany({
      where: { id: { in: unique }, organizationId },
      select: {
        id: true,
        sku: true,
        isActive: true,
        costPrice: true,
        product: { select: { name: true, isActive: true } },
      },
    });
    if (variants.length !== unique.length) {
      throw new NotFoundException('One or more products were not found. Please refresh and try again.');
    }
    if (!allowInactive) {
      const inactive = variants.filter((v) => !v.isActive || !v.product.isActive);
      if (inactive.length) {
        throw new BadRequestException(`These SKUs are inactive: ${inactive.map((v) => v.sku).join(', ')}`);
      }
    }
    return new Map(
      variants.map((v) => [v.id, { id: v.id, sku: v.sku, productName: v.product.name, costPrice: v.costPrice }]),
    );
  }

  /** Checks all outgoing quantities up front so the user sees every short SKU at once. */
  private async assertAvailable(tx: Tx, ctx: StockContext, changes: StockChange[]) {
    const needed = new Map<string, number>();
    for (const c of changes) needed.set(c.variantId, (needed.get(c.variantId) ?? 0) + c.quantity);
    const outgoing = [...needed].filter(([, qty]) => qty < 0);
    if (outgoing.length === 0) return;

    const levels = await tx.stockLevel.findMany({
      where: { warehouseId: ctx.warehouseId, variantId: { in: outgoing.map(([id]) => id) } },
      select: { variantId: true, quantity: true },
    });
    const available = new Map(levels.map((l) => [l.variantId, l.quantity]));
    const short = outgoing.filter(([id, qty]) => (available.get(id) ?? 0) + qty < 0);
    if (short.length === 0) return;

    const variants = await tx.productVariant.findMany({
      where: { id: { in: short.map(([id]) => id) } },
      select: { id: true, sku: true },
    });
    const skus = new Map(variants.map((v) => [v.id, v.sku]));
    const details = short
      .map(([id, qty]) => `${skus.get(id)} (available ${Math.max(available.get(id) ?? 0, 0)}, needed ${-qty})`)
      .join(', ');
    throw new BadRequestException(`Not enough stock: ${details}`);
  }
}
