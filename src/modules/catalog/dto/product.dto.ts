import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const money = { maxDecimalPlaces: 2 };

export class VariantFieldsDto {
  /** Your stock-keeping code, e.g. KURTA-RED-M. Letters, numbers, - _ . / allowed. */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9._\-/ ]+$/, { message: 'SKU can only contain letters, numbers, spaces and - _ . /' })
  sku: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  size?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  color?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  barcode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(money)
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(money)
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(money)
  @Min(0)
  mrp?: number;

  /** Warn when stock falls to this number or below */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  lowStockThreshold?: number;
}

export class CreateVariantDto extends VariantFieldsDto {
  /** Units of this SKU you already have in stock today */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  openingStock?: number;
}

export class UpdateVariantDto extends PartialType(VariantFieldsDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  hsnCode?: string;

  /** GST rate in percent, e.g. 5, 12, 18 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber(money)
  @Min(0)
  @Max(100)
  gstRate?: number;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imageUrl?: string;

  /** At least one SKU. A product without sizes/colours has exactly one. */
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  variants: CreateVariantDto[];
}

export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['variants'] as const)) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  /** active (default), inactive or all */
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status: 'active' | 'inactive' | 'all' = 'active';
}

export class VariantSearchDto {
  /** SKU, barcode or product name */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class VariantLookupDto {
  /** Exact SKU or barcode, e.g. from a barcode scanner */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code: string;
}
