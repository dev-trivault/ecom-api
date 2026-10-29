import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateChannelDto, UpdateChannelDto } from './channels.dto.js';
import { ChannelsService } from './channels.service.js';

@ApiTags('Sales channels')
@ApiBearerAuth()
@Controller({ path: 'channels', version: '1' })
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  list() {
    return this.channels.list();
  }

  @Post()
  create(@Body() dto: CreateChannelDto) {
    return this.channels.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChannelDto) {
    return this.channels.update(id, dto);
  }
}
