import type { Server } from 'node:http';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  // Vercel and Nginx reuse open connections. Node closes idle ones after 5 s, and a request sent on a connection
  // Node is just closing comes back as "502 Bad Gateway", so keep them open longer than the proxy does.
  const server = app.getHttpServer() as Server;
  server.keepAliveTimeout = 75_000;
  server.headersTimeout = 76_000;

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  await app.listen(port, config.get('HOST', { infer: true }));
  Logger.log(`API ready on http://localhost:${port}/api  (docs: http://localhost:${port}/docs)`, 'Bootstrap');
}

await bootstrap();
