import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ReturnsController } from './returns.controller.js';
import { ReturnsService } from './returns.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
