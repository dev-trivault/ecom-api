import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { StockMovementType } from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export const STOCK_STATUSES = ['all', 'in_stock', 'low', 'out', 'reorder'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export class StockQueryDto extends PaginationQueryDto {
  /**
   * all | in_stock | low (above zero but at or below the SKU's low-stock level) |
   * out (zero or less) | reorder (low + out)
   */
  @IsOptional()
  @IsIn(STOCK_STATUSES)
  status: StockStatus = 'all';

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}

export class MovementQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  /** From date, inclusive (YYYY-MM-DD, business timezone) */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  /** To date, inclusive (YYYY-MM-DD, business timezone) */
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class StockAdjustmentDto {
  @IsUUID()
  variantId: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  /**
   * SET: `quantity` is the physical count, stock is corrected to it.
   * CHANGE: `quantity` is added (positive) or removed (negative).
   */
  @IsIn(['SET', 'CHANGE'])
  mode: 'SET' | 'CHANGE';

  @Type(() => Number)
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  quantity: number;

  /** Why the stock is being corrected, e.g. "Physical count", "Damaged in storage" */
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reason: string;
}
