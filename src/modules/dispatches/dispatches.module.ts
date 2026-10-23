import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { DispatchesController } from './dispatches.controller.js';
import { DispatchesService } from './dispatches.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [DispatchesController],
  providers: [DispatchesService],
})
export class DispatchesModule {}
