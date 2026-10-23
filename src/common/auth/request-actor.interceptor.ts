import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import type { AuthUser } from './auth-user.js';
import { runAsActor } from './request-actor.js';

/** Makes the authenticated user available to the Prisma audit extension for the whole request. */
@Injectable()
export class RequestActorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user) return next.handle();
    return new Observable((subscriber) => runAsActor(user.userId, () => next.handle().subscribe(subscriber)));
  }
}
