import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skip authentication for this route (login, forgot password, health ...). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Injects the authenticated caller. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return request.user;
});
