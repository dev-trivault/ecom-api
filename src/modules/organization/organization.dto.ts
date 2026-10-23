import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';
import { OptionalOrEmpty } from '../../common/dto/validators.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateOrganizationDto {
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

export class AddMemberDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  /** Initial password. Ignored if this email already has an account. */
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsEnum(Role)
  role: Role;
}

export class UpdateMemberDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetMemberPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
