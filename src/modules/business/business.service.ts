import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../../prisma/prisma.service.js';
import { patchText } from '../../common/utils/strings.js';
import { UpdateBusinessDto } from './business.dto.js';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The business's details and settings: the single row the seed created. */
  get(db: Tx | PrismaService = this.prisma) {
    return db.business.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  }

  async update(dto: UpdateBusinessDto) {
    const { id } = await this.get();
    return this.prisma.business.update({
      where: { id },
      data: {
        name: dto.name,
        gstin: patchText(dto.gstin, (v) => v.toUpperCase()),
        phone: patchText(dto.phone),
        email: patchText(dto.email, (v) => v.toLowerCase()),
        address: patchText(dto.address),
        timezone: dto.timezone,
        isNegativeStockAllowed: dto.isNegativeStockAllowed,
      },
    });
  }
}
