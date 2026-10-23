import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto.js';
import { MovementQueryDto, StockAdjustmentDto, StockQueryDto } from './dto/inventory.dto.js';
import { InventoryService } from './inventory.service.js';
import { WarehousesService } from './warehouses.service.js';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('stock')
  @ApiOperation({ summary: 'Current stock per SKU with totals' })
  listStock(@CurrentUser() user: AuthUser, @Query() query: StockQueryDto) {
    return this.inventory.listStock(user.organizationId, query);
  }

  @Get('stock/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="stock.csv"')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Download current stock as CSV (same filters as the stock list)' })
  async exportStock(@CurrentUser() user: AuthUser, @Query() query: StockQueryDto) {
    // Leading BOM so Excel opens the file as UTF-8
    return '﻿' + (await this.inventory.exportStockCsv(user.organizationId, query));
  }

  @Get('movements')
  @ApiOperation({ summary: 'Stock ledger: every stock in / out, newest first' })
  listMovements(@CurrentUser() user: AuthUser, @Query() query: MovementQueryDto) {
    return this.inventory.listMovements(user.organizationId, query);
  }

  @Post('adjustments')
  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @ApiOperation({ summary: 'Correct stock after a physical count, damage or loss' })
  adjust(@CurrentUser() user: AuthUser, @Body() dto: StockAdjustmentDto) {
    return this.inventory.adjust(user, dto);
  }
}

@ApiTags('Warehouses')
@ApiBearerAuth()
@Controller({ path: 'warehouses', version: '1' })
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.warehouses.list(user.organizationId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(user.organizationId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehouses.update(user.organizationId, id, dto);
  }
}
