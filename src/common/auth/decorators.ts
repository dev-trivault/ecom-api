import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../../generated/prisma/enums.js';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Skip authentication for this route (login, register, health ...). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict a route to the given roles. Routes without @Roles are open to every member. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated caller. Always use `user.organizationId` to scope queries. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return request.user;
});
