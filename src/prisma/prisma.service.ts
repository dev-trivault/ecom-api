import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.js';
import { auditExtension } from './audit.extension.js';

/** Interactive transaction client, for helpers that must run inside a caller's transaction. */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
      log: ['warn', 'error'],
    });
    // The audit extension adds no types, so the extended client is still a PrismaService to every caller.
    return this.$extends(auditExtension) as this;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
