import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AccessTokenPayload, AuthUser } from './auth-user.js';
import { ACCESS_COOKIE } from './cookies.js';
import { IS_PUBLIC_KEY } from './decorators.js';

/**
 * Global guard: every route requires a valid access token unless marked @Public().
 * The token is read from the `Authorization: Bearer` header (Swagger, scripts, future
 * mobile app) or from the httpOnly `access_token` cookie (web app).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Please log in to continue');

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      request.user = {
        userId: payload.sub,
        organizationId: payload.org,
        role: payload.role,
        sessionId: payload.sid,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Your session has expired, please log in again');
    }
  }

  private extractToken(request: Request): string | undefined {
    const [type, value] = request.headers.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && value) return value;
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[ACCESS_COOKIE];
  }
}
