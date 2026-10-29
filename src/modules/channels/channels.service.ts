import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateChannelDto, UpdateChannelDto } from './channels.dto.js';

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.salesChannel.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateChannelDto) {
    const count = await this.prisma.salesChannel.count();
    return this.prisma.salesChannel.create({
      data: { name: dto.name, code: dto.code, color: dto.color, sortOrder: dto.sortOrder ?? count },
    });
  }

  async update(id: string, dto: UpdateChannelDto) {
    const channel = await this.prisma.salesChannel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException('Sales channel not found');
    return this.prisma.salesChannel.update({ where: { id }, data: dto });
  }
}
