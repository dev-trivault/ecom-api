import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv, type Env } from './config/env.js';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { RequestActorInterceptor } from './common/auth/request-actor.interceptor.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BusinessModule } from './modules/business/business.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { ChannelsModule } from './modules/channels/channels.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { DispatchesModule } from './modules/dispatches/dispatches.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { PurchasesModule } from './modules/purchases/purchases.module.js';
import { ReturnsModule } from './modules/returns/returns.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
    // Generous default; auth routes set tighter limits with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    BusinessModule,
    InventoryModule,
    CatalogModule,
    SuppliersModule,
    ChannelsModule,
    PurchasesModule,
    DispatchesModule,
    ReturnsModule,
    DashboardModule,
  ],
  providers: [
    // Order matters: rate limit, then authenticate.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestActorInterceptor },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
