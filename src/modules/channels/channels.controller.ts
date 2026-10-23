import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { CreateChannelDto, UpdateChannelDto } from './channels.dto.js';
import { ChannelsService } from './channels.service.js';

@ApiTags('Sales channels')
@ApiBearerAuth()
@Controller({ path: 'channels', version: '1' })
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.channels.list(user.organizationId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateChannelDto) {
    return this.channels.create(user.organizationId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChannelDto) {
    return this.channels.update(user.organizationId, id, dto);
  }
}
