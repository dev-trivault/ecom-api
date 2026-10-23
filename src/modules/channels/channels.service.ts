import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateChannelDto, UpdateChannelDto } from './channels.dto.js';

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.salesChannel.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(organizationId: string, dto: CreateChannelDto) {
    const count = await this.prisma.salesChannel.count({ where: { organizationId } });
    return this.prisma.salesChannel.create({
      data: { organizationId, name: dto.name, code: dto.code, color: dto.color, sortOrder: dto.sortOrder ?? count },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateChannelDto) {
    const channel = await this.prisma.salesChannel.findFirst({ where: { id, organizationId } });
    if (!channel) throw new NotFoundException('Sales channel not found');
    return this.prisma.salesChannel.update({ where: { id }, data: dto });
  }
}
