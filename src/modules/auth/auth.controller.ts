import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../../config/env.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../common/auth/cookies.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { AuthService, ClientMeta, IssuedTokens } from './auth.service.js';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RefreshDto, ResetPasswordDto } from './dto/auth.dto.js';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Public auth settings used by the login page' })
  getConfig() {
    return this.auth.publicConfig();
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Log in with email and password (when MAX_LOGIN_DEVICES are already logged in, the oldest login is logged out)',
  })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { tokens, authUser } = await this.auth.login(dto, clientMeta(req));
    return this.respondWithSession(res, tokens, authUser);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a new access token using the refresh token (cookie or body)' })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    try {
      const tokens = await this.auth.refresh(token, clientMeta(req));
      this.setCookies(res, tokens);
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.accessTokenExpiresIn,
      };
    } catch (error) {
      this.clearCookies(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Log out this device' })
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(token);
    this.clearCookies(res);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user and business' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change your password (logs out your other devices)' })
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user, dto);
  }

  @ApiBearerAuth()
  @Get('devices')
  @ApiOperation({ summary: 'Devices where you are logged in' })
  listDevices(@CurrentUser() user: AuthUser) {
    return this.auth.listDevices(user);
  }

  @ApiBearerAuth()
  @Post('devices/:id/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Log out another device, freeing its place' })
  async logoutDevice(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.auth.logoutDevice(user, id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Email a link to choose a new password. Same reply whether or not the email is the login.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.auth.forgotPassword(dto, clientMeta(req));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password with the token from the email link. Logs out every device.' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.resetPassword(dto);
    this.clearCookies(res);
  }

  private async respondWithSession(res: Response, tokens: IssuedTokens, authUser: AuthUser) {
    this.setCookies(res, tokens);
    const session = await this.auth.me(authUser);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.accessTokenExpiresIn,
      ...session,
    };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE_RESOLVED', { infer: true }),
      sameSite: 'lax',
      path: '/',
    };
  }

  private setCookies(res: Response, tokens: IssuedTokens) {
    const options = this.cookieOptions();
    res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...options, maxAge: tokens.accessTokenExpiresIn * 1000 });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...options, expires: tokens.refreshTokenExpiresAt });
  }

  private clearCookies(res: Response) {
    const options = this.cookieOptions();
    res.clearCookie(ACCESS_COOKIE, options);
    res.clearCookie(REFRESH_COOKIE, options);
  }
}

function clientMeta(req: Request): ClientMeta {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
}
