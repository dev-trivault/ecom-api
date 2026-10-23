import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ProductsController, VariantsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [ProductsController, VariantsController],
  providers: [ProductsService],
})
export class CatalogModule {}
