import { Module } from '@nestjs/common';
import { DocumentNumberService } from './document-number.service.js';
import { InventoryController, WarehousesController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { StockService } from './stock.service.js';
import { WarehousesService } from './warehouses.service.js';

@Module({
  controllers: [InventoryController, WarehousesController],
  providers: [InventoryService, StockService, DocumentNumberService, WarehousesService],
  exports: [InventoryService, StockService, DocumentNumberService, WarehousesService],
})
export class InventoryModule {}
