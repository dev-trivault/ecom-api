import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { OptionalOrEmpty } from '../../common/dto/validators.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateSupplierDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @OptionalOrEmpty()
  @IsEmail()
  email?: string;

  @OptionalOrEmpty()
  @Matches(/^[0-9A-Z]{15}$/i, { message: 'GSTIN must be 15 letters/numbers' })
  gstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SupplierQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status: 'active' | 'inactive' | 'all' = 'active';
}
