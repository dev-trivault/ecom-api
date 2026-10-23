import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DocumentListQueryDto } from '../../common/dto/date-range.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class DispatchItemDto {
  @IsUUID()
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity: number;
}

export class CreateDispatchDto {
  /** Marketplace the order came from */
  @IsUUID()
  channelId: string;

  /** Defaults to the main warehouse */
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  /** Marketplace order ID. The same order cannot be packed twice on one channel. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  orderNumber?: string;

  /** Courier AWB / tracking number */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  trackingNumber?: string;

  /** YYYY-MM-DD */
  @IsDateString({ strict: true })
  dispatchDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => DispatchItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  items: DispatchItemDto[];
}

export class DispatchQueryDto extends DocumentListQueryDto {
  @IsOptional()
  @IsUUID()
  channelId?: string;
}

export class DispatchLookupDto {
  /** Marketplace order ID or courier tracking number */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  orderNumber: string;

  @IsOptional()
  @IsUUID()
  channelId?: string;
}
