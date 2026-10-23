import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReturnCondition, ReturnType } from '../../generated/prisma/enums.js';
import { DocumentListQueryDto } from '../../common/dto/date-range.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ReturnItemDto {
  /** The SKU that was originally sent to the customer */
  @IsUUID()
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  quantity: number;

  /** Only GOOD items go back into sellable stock */
  @IsEnum(ReturnCondition)
  condition: ReturnCondition;
}

export class CreateReturnDto {
  @IsUUID()
  channelId: string;

  /** RTO = courier brought it back undelivered. CUSTOMER_RETURN = customer sent it back. */
  @IsEnum(ReturnType)
  type: ReturnType;

  /** Original packing entry. Found automatically from the order ID when left empty. */
  @IsOptional()
  @IsUUID()
  dispatchId?: string;

  /** Defaults to the packing entry's warehouse, else the main warehouse */
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  orderNumber?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  trackingNumber?: string;

  /** YYYY-MM-DD */
  @IsDateString({ strict: true })
  returnDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  items: ReturnItemDto[];
}

export class ReturnQueryDto extends DocumentListQueryDto {
  @IsOptional()
  @IsUUID()
  channelId?: string;

  @IsOptional()
  @IsEnum(ReturnType)
  type?: ReturnType;

  /** Only returns that contain at least one item in this condition */
  @IsOptional()
  @IsEnum(ReturnCondition)
  condition?: ReturnCondition;
}
