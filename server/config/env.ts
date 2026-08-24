import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export function parseBooleanEnv(val: unknown): boolean | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  return undefined;
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.preprocess((val) => (val ? Number(val) : 3000), z.number().default(3000)),
  APP_MODE: z.enum(['demo', 'production']).default('demo'),
  APP_BASE_URL: z.string().default('http://localhost:3000'),

  // Aiven MySQL Database Configuration
  AIVEN_MYSQL_HOST: z.string().optional().default(''),
  AIVEN_MYSQL_PORT: z.preprocess((val) => (val ? Number(val) : 3306), z.number().default(3306)),
  AIVEN_APP_USER: z.string().optional().default(''),
  AIVEN_APP_PASSWORD: z.string().optional().default(''),
  AIVEN_MYSQL_DATABASE: z.string().optional().default('defaultdb'),
  AIVEN_CA_CERT: z.string().optional(),

  // Session Secret & Security Policy
  SESSION_SECRET: z.string().default('jami-ai-production-secret-key-32-chars-min'),
  ADMIN_SECRET_KEY: z.string().optional(),
  COOKIE_SECURE: z.preprocess(parseBooleanEnv, z.boolean().optional()),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).optional().default('lax'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  VITE_API_BASE_URL: z.string().optional(),

  // Demo Login Flag
  DEMO_LOGIN_ENABLED: z.preprocess(parseBooleanEnv, z.boolean().optional()),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function parseEnv(): EnvConfig {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const errorIssues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    if (process.env.APP_MODE === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error(`[JAMI Config ERROR] Production environment configuration invalid: ${errorIssues}`);
    }
    console.warn('[JAMI Config] Notice during environment parse:', errorIssues);
    return EnvSchema.parse({});
  }

  const parsed = result.data;
  const isProd = parsed.APP_MODE === 'production' || parsed.NODE_ENV === 'production';

  if (isProd) {
    const missing: string[] = [];
    if (!parsed.AIVEN_MYSQL_HOST) missing.push('AIVEN_MYSQL_HOST');
    if (!parsed.AIVEN_APP_USER) missing.push('AIVEN_APP_USER');
    if (!parsed.AIVEN_APP_PASSWORD) missing.push('AIVEN_APP_PASSWORD');

    if (missing.length > 0) {
      throw new Error(`[JAMI Config ERROR] Production mode requires valid Aiven MySQL credentials. Missing: ${missing.join(', ')}`);
    }

    if (parsed.SESSION_SECRET === 'jami-ai-production-secret-key-32-chars-min' || parsed.SESSION_SECRET.length < 32) {
      throw new Error('[JAMI Config ERROR] SESSION_SECRET must be set to a secure random string of at least 32 characters in Production mode.');
    }
  }

  // Determine DEMO_LOGIN_ENABLED default
  if (parsed.DEMO_LOGIN_ENABLED === undefined) {
    parsed.DEMO_LOGIN_ENABLED = !isProd;
  }

  return parsed;
}

export const env = parseEnv();
