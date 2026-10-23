import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DocumentListQueryDto } from '../../common/dto/date-range.dto.js';

export class PurchaseItemDto {
  @IsUUID()
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity: number;

  /** Price paid per unit */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost: number;
}

export class CreatePurchaseDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  /** Defaults to the main warehouse */
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  /** Supplier's bill / invoice number */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  invoiceNumber?: string;

  /** YYYY-MM-DD */
  @IsDateString({ strict: true })
  purchaseDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /** Also save each unit cost as the SKU's current cost price (default true) */
  @IsOptional()
  @IsBoolean()
  updateCostPrice: boolean = true;

  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  items: PurchaseItemDto[];
}

export class PurchaseQueryDto extends DocumentListQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}
