import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, IsTimeZone, Matches, MaxLength, MinLength } from 'class-validator';
import { OptionalOrEmpty } from '../../common/dto/validators.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateBusinessDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @OptionalOrEmpty()
  @Matches(/^[0-9A-Z]{15}$/i, { message: 'GSTIN must be 15 letters/numbers' })
  gstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @OptionalOrEmpty()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  /** Allow packing entries even when the system shows not enough stock */
  @IsOptional()
  @IsBoolean()
  isNegativeStockAllowed?: boolean;
}
