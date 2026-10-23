import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, Tx } from '../../prisma/prisma.service.js';
import { clean } from '../../common/utils/strings.js';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto.js';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.warehouse.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  create(organizationId: string, dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({
      data: { organizationId, name: dto.name.trim(), address: clean(dto.address) },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id, organizationId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    if (dto.isActive === false && warehouse.isDefault) {
      throw new BadRequestException('The default warehouse cannot be deactivated');
    }
    return this.prisma.warehouse.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        address: dto.address === undefined ? undefined : clean(dto.address),
        isActive: dto.isActive,
      },
    });
  }

  /** The warehouse to use for an entry: the one asked for, or the business's default. */
  async resolve(db: Tx | PrismaService, organizationId: string, warehouseId?: string): Promise<string> {
    const warehouse = await db.warehouse.findFirst({
      where: warehouseId ? { id: warehouseId, organizationId, isActive: true } : { organizationId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    if (!warehouse) throw new BadRequestException('No active warehouse found');
    return warehouse.id;
  }
}
