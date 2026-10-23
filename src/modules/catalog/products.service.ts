import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, Tx } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { pageArgs, paginated } from '../../common/dto/pagination.dto.js';
import { clean, normalizeSku } from '../../common/utils/strings.js';
import { StockService } from '../inventory/stock.service.js';
import { WarehousesService } from '../inventory/warehouses.service.js';
import {
  CreateProductDto,
  CreateVariantDto,
  ProductQueryDto,
  UpdateProductDto,
  UpdateVariantDto,
  VariantFieldsDto,
} from './dto/product.dto.js';

const variantWithStock = {
  include: { stockLevels: { select: { quantity: true, warehouseId: true } } },
} satisfies Prisma.ProductVariantDefaultArgs;

type VariantWithStock = Prisma.ProductVariantGetPayload<typeof variantWithStock>;

/** Replaces raw stock rows with a single `stock` total, which is what the UI needs. */
function withStock<T extends VariantWithStock>(variant: T) {
  const { stockLevels, ...rest } = variant;
  return { ...rest, stock: stockLevels.reduce((sum, l) => sum + l.quantity, 0) };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly warehouses: WarehousesService,
  ) {}

  async list(organizationId: string, query: ProductQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      organizationId,
      ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
      ...(query.category ? { category: query.category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { brand: { contains: search, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
              { variants: { some: { barcode: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        ...pageArgs(query),
        include: { variants: { orderBy: { sku: 'asc' }, ...variantWithStock } },
      }),
      this.prisma.product.count({ where }),
    ]);
    const items = products.map((p) => {
      const variants = p.variants.map(withStock);
      return { ...p, variants, totalStock: variants.filter((v) => v.isActive).reduce((s, v) => s + v.stock, 0) };
    });
    return paginated(items, total, query);
  }

  async get(organizationId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
      include: { variants: { orderBy: { sku: 'asc' }, ...variantWithStock } },
    });
    if (!product) throw new NotFoundException('Product not found');
    const variants = product.variants.map(withStock);
    return { ...product, variants, totalStock: variants.filter((v) => v.isActive).reduce((s, v) => s + v.stock, 0) };
  }

  async categories(organizationId: string): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { organizationId, category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category!).filter(Boolean);
  }

  async create(user: AuthUser, dto: CreateProductDto) {
    const skus = dto.variants.map((v) => normalizeSku(v.sku));
    const duplicates = skus.filter((s, i) => skus.indexOf(s) !== i);
    if (duplicates.length)
      throw new BadRequestException(`Duplicate SKU in the form: ${[...new Set(duplicates)].join(', ')}`);
    await this.assertSkusFree(user.organizationId, skus);

    const productId = await this.prisma.$transaction(
      async (tx) => {
        const product = await tx.product.create({
          data: {
            organizationId: user.organizationId,
            name: dto.name,
            description: clean(dto.description),
            category: clean(dto.category),
            brand: clean(dto.brand),
            hsnCode: clean(dto.hsnCode),
            gstRate: dto.gstRate,
            imageUrl: clean(dto.imageUrl),
          },
        });
        await this.createVariants(tx, user, product.id, dto.variants);
        return product.id;
      },
      { timeout: 30_000 },
    );
    return this.get(user.organizationId, productId);
  }

  async update(organizationId: string, id: string, dto: UpdateProductDto) {
    await this.get(organizationId, id);
    await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description === undefined ? undefined : clean(dto.description),
        category: dto.category === undefined ? undefined : clean(dto.category),
        brand: dto.brand === undefined ? undefined : clean(dto.brand),
        hsnCode: dto.hsnCode === undefined ? undefined : clean(dto.hsnCode),
        gstRate: dto.gstRate,
        imageUrl: dto.imageUrl === undefined ? undefined : clean(dto.imageUrl),
        isActive: dto.isActive,
      },
    });
    return this.get(organizationId, id);
  }

  async addVariant(user: AuthUser, productId: string, dto: CreateVariantDto) {
    await this.get(user.organizationId, productId);
    await this.assertSkusFree(user.organizationId, [normalizeSku(dto.sku)]);
    await this.prisma.$transaction((tx) => this.createVariants(tx, user, productId, [dto]));
    return this.get(user.organizationId, productId);
  }

  async updateVariant(organizationId: string, variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, organizationId } });
    if (!variant) throw new NotFoundException('SKU not found');
    const sku = dto.sku === undefined ? undefined : normalizeSku(dto.sku);
    if (sku && sku !== variant.sku) await this.assertSkusFree(organizationId, [sku]);

    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        sku,
        size: dto.size === undefined ? undefined : clean(dto.size),
        color: dto.color === undefined ? undefined : clean(dto.color),
        barcode: dto.barcode === undefined ? undefined : clean(dto.barcode),
        costPrice: dto.costPrice,
        sellingPrice: dto.sellingPrice,
        mrp: dto.mrp,
        lowStockThreshold: dto.lowStockThreshold,
        isActive: dto.isActive,
      },
    });
    return this.get(organizationId, variant.productId);
  }

  /** Type-ahead search used by the "add item" box on purchase, packing and return forms. */
  async searchVariants(organizationId: string, q: string | undefined, limit: number) {
    const search = q?.trim();
    const variants = await this.prisma.productVariant.findMany({
      where: {
        organizationId,
        isActive: true,
        product: { isActive: true },
        ...(search
          ? {
              OR: [
                { sku: { contains: search, mode: 'insensitive' } },
                { barcode: { contains: search, mode: 'insensitive' } },
                { product: { name: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
      take: limit,
      include: { product: { select: { id: true, name: true } }, ...variantWithStock.include },
    });
    const upper = search?.toUpperCase();
    return variants
      .map(withStock)
      .sort(
        (a, b) => Number(b.sku === upper || b.barcode === search) - Number(a.sku === upper || a.barcode === search),
      );
  }

  /** Exact SKU or barcode match, for barcode scanners. */
  async lookupVariant(organizationId: string, code: string) {
    const trimmed = code.trim();
    const variant = await this.prisma.productVariant.findFirst({
      where: { organizationId, OR: [{ sku: normalizeSku(trimmed) }, { barcode: trimmed }] },
      include: { product: { select: { id: true, name: true, isActive: true } }, ...variantWithStock.include },
    });
    if (!variant) throw new NotFoundException(`No SKU or barcode matches "${trimmed}"`);
    return withStock(variant);
  }

  private async createVariants(tx: Tx, user: AuthUser, productId: string, variants: CreateVariantDto[]) {
    const warehouseId = await this.warehouses.resolve(tx, user.organizationId);
    const opening: { variantId: string; quantity: number; unitCost: number }[] = [];

    for (const input of variants) {
      const variant = await tx.productVariant.create({
        data: { organizationId: user.organizationId, productId, ...this.variantData(input) },
      });
      await tx.stockLevel.create({
        data: { organizationId: user.organizationId, variantId: variant.id, warehouseId, quantity: 0 },
      });
      if (input.openingStock) {
        opening.push({ variantId: variant.id, quantity: input.openingStock, unitCost: input.costPrice ?? 0 });
      }
    }

    await this.stock.apply(
      tx,
      { organizationId: user.organizationId, warehouseId, userId: user.userId },
      opening.map((o) => ({ ...o, type: 'OPENING' as const, note: 'Opening stock' })),
    );
  }

  private variantData(input: VariantFieldsDto) {
    return {
      sku: normalizeSku(input.sku),
      size: clean(input.size),
      color: clean(input.color),
      barcode: clean(input.barcode),
      costPrice: input.costPrice ?? 0,
      sellingPrice: input.sellingPrice ?? 0,
      mrp: input.mrp ?? null,
      lowStockThreshold: input.lowStockThreshold ?? 5,
    };
  }

  private async assertSkusFree(organizationId: string, skus: string[]) {
    const taken = await this.prisma.productVariant.findMany({
      where: { organizationId, sku: { in: skus } },
      select: { sku: true },
    });
    if (taken.length) {
      throw new ConflictException(`SKU already exists: ${taken.map((t) => t.sku).join(', ')}`);
    }
  }
}
