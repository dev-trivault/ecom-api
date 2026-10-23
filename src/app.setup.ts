import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ACCESS_COOKIE } from './common/auth/cookies.js';
import type { Env } from './config/env.js';

/**
 * HTTP-level configuration shared by main.ts and the e2e tests, so tests exercise the
 * exact same prefix, versioning, validation and middleware as production.
 */
export function configureApp(app: NestExpressApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  if (config.get('TRUST_PROXY', { infer: true })) app.set('trust proxy', true);

  app.use(helmet());
  app.use(cookieParser());
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : false, credentials: true });

  // Routes look like /api/v1/products. Health is unversioned: /api/health
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Ecom Business API')
        .setDescription(
          'Inventory management API. Log in with POST /api/v1/auth/login, copy `accessToken` and click Authorize.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .addCookieAuth(ACCESS_COOKIE)
        .build(),
    );
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs/json',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
    });
  }
}
