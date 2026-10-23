import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { CreateSupplierDto, SupplierQueryDto, UpdateSupplierDto } from './suppliers.dto.js';
import { SuppliersService } from './suppliers.service.js';

@ApiTags('Suppliers')
@ApiBearerAuth()
@Controller({ path: 'suppliers', version: '1' })
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: SupplierQueryDto) {
    return this.suppliers.list(user.organizationId, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.get(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierDto) {
    return this.suppliers.create(user.organizationId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(user.organizationId, id, dto);
  }
}
