import { z } from 'zod';

const bool = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : ['true', '1', 'yes'].includes(v.toLowerCase())));

const optionalText = z
  .string()
  .optional()
  .transform((v) => v?.trim() || undefined);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  MAX_LOGIN_DEVICES: z.coerce.number().int().positive().default(3),
  WEB_APP_URL: z
    .url('WEB_APP_URL must be the web app address, e.g. https://app.yourstore.in')
    .default('http://localhost:3100'),
  SMTP_HOST: optionalText,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: optionalText,
  SMTP_PASSWORD: optionalText,
  MAIL_FROM: optionalText,
  CORS_ORIGINS: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
        : [],
    ),
  COOKIE_SECURE: z.string().optional(),
  TRUST_PROXY: bool(false),
  SWAGGER_ENABLED: bool(true),
});

export type Env = z.infer<typeof envSchema> & { COOKIE_SECURE_RESOLVED: boolean };

/** Used by ConfigModule. Fails fast at boot with a readable message when env is wrong. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  const env = parsed.data;
  // Password reset links point here, so a wrong value sends people to a page that is not ours.
  if (env.NODE_ENV === 'production' && !env.WEB_APP_URL.startsWith('https://')) {
    throw new Error('Invalid environment variables:\n  - WEB_APP_URL: must be the https:// address of the web app');
  }
  const cookieSecure =
    env.COOKIE_SECURE === undefined || env.COOKIE_SECURE === ''
      ? env.NODE_ENV === 'production'
      : ['true', '1', 'yes'].includes(env.COOKIE_SECURE.toLowerCase());
  return { ...env, COOKIE_SECURE_RESOLVED: cookieSecure };
}
