import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { CancelDocumentDto } from '../../common/dto/cancel-document.dto.js';
import { CreateDispatchDto, DispatchLookupDto, DispatchQueryDto } from './dispatches.dto.js';
import { DispatchesService } from './dispatches.service.js';

@ApiTags('Packing (stock out)')
@ApiBearerAuth()
@Controller({ path: 'dispatches', version: '1' })
export class DispatchesController {
  constructor(private readonly dispatches: DispatchesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: DispatchQueryDto) {
    return this.dispatches.list(user.organizationId, query);
  }

  @Get('lookup')
  @ApiOperation({ summary: 'Find packed orders by order ID or tracking number' })
  lookup(@CurrentUser() user: AuthUser, @Query() query: DispatchLookupDto) {
    return this.dispatches.lookup(user.organizationId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.dispatches.get(user.organizationId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Record a packed parcel / order. Removes the units from stock.' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDispatchDto) {
    return this.dispatches.create(user, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Cancel a packing entry (e.g. order cancelled before pickup). Puts units back.' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDocumentDto) {
    return this.dispatches.cancel(user, id, dto.reason);
  }
}
