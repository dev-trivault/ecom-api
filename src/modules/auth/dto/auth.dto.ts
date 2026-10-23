import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const lowerTrim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  /** Your full name */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @Transform(lowerTrim)
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  /** Business / store name */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  businessName: string;
}

export class LoginDto {
  @Transform(lowerTrim)
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  /** Optional: log in to a specific business when the user belongs to several */
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class RefreshDto {
  /** Not needed from the web app: the refresh token is sent as an httpOnly cookie */
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
