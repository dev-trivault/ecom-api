import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { pageArgs, paginated } from '../../common/dto/pagination.dto.js';
import { patchText } from '../../common/utils/strings.js';
import { CreateSupplierDto, SupplierQueryDto, UpdateSupplierDto } from './suppliers.dto.js';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SupplierQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.SupplierWhereInput = {
      ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { city: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        ...pageArgs(query),
        include: { _count: { select: { purchases: { where: { status: 'COMPLETED' } } } } },
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginated(items, total, query);
  }

  async get(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const totals = await this.prisma.purchase.aggregate({
      where: { supplierId: id, status: 'COMPLETED' },
      _sum: { totalAmount: true, totalQuantity: true },
      _count: true,
    });
    return {
      ...supplier,
      purchaseCount: totals._count,
      totalPurchased: totals._sum.totalAmount ?? 0,
      totalUnits: totals._sum.totalQuantity ?? 0,
    };
  }

  async create(dto: CreateSupplierDto) {
    await this.assertNameFree(dto.name);
    return this.prisma.supplier.create({ data: { ...this.data(dto), name: dto.name } });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (dto.name && dto.name.toLowerCase() !== supplier.name.toLowerCase()) {
      await this.assertNameFree(dto.name);
    }
    return this.prisma.supplier.update({
      where: { id },
      data: { ...this.data(dto), name: dto.name, isActive: dto.isActive },
    });
  }

  private data(dto: Partial<CreateSupplierDto>) {
    return {
      contactPerson: patchText(dto.contactPerson),
      phone: patchText(dto.phone),
      email: patchText(dto.email, (v) => v.toLowerCase()),
      gstin: patchText(dto.gstin, (v) => v.toUpperCase()),
      address: patchText(dto.address),
      city: patchText(dto.city),
      notes: patchText(dto.notes),
    };
  }

  private async assertNameFree(name: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException(`A supplier named "${existing.name}" already exists`);
  }
}
