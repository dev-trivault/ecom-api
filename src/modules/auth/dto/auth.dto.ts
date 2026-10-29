import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const lowerTrim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class LoginDto {
  @Transform(lowerTrim)
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
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

export class ForgotPasswordDto {
  /** The login email. A reset link is sent to it if it belongs to the account. */
  @Transform(lowerTrim)
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  /** The token from the reset link in the email */
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
