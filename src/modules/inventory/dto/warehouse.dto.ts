import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
