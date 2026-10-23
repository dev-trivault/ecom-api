import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsHexColor, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateChannelDto {
  /** Display name, e.g. "Meesho" or "Own Website" */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name: string;

  /** Short unique code, e.g. MEESHO */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_]{2,20}$/, { message: 'Code must be 2-20 letters, numbers or _' })
  code: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateChannelDto extends PartialType(CreateChannelDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
