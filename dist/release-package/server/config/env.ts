import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export function parseBooleanEnv(val: unknown): boolean | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') {
    if (val === 1) return true;
    if (val === 0) return false;
    throw new Error(`Invalid boolean environment value: ${val}`);
  }
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
    throw new Error(`Invalid boolean environment value: "${val}". Must be "true", "false", "1", or "0".`);
  }
  throw new Error(`Invalid boolean environment value type: ${typeof val}`);
}

export function normalizeApiBaseUrl(url?: string): string {
  if (!url) return '/api/v1';
  let clean = String(url).trim();
  if (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  if (clean.endsWith('/api/v1')) {
    return clean;
  }
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return `${clean}/api/v1`;
  }
  if (clean === '/api' || clean === '/api/v1') {
    return '/api/v1';
  }
  return `${clean}/api/v1`;
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
  AIVEN_CA_CERT_PATH: z.string().optional(),

  // Session Secret & Security Policy
  SESSION_SECRET: z.string().default('jami-ai-production-secret-key-32-chars-min'),
  ADMIN_SECRET_KEY: z.string().optional(),
  INTERNAL_CRON_SECRET: z.string().default('jami-cron-internal-secret-key-32-chars'),
  COOKIE_SECURE: z.preprocess(parseBooleanEnv, z.boolean().optional()),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).optional().default('lax'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  VITE_API_BASE_URL: z.string().optional(),

  // Demo Login Flag
  DEMO_LOGIN_ENABLED: z.preprocess(parseBooleanEnv, z.boolean().optional()),

  // Password Reset Policy
  PASSWORD_RESET_ENABLED: z.preprocess(parseBooleanEnv, z.boolean().default(false)),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.preprocess((val) => (val ? Number(val) : 587), z.number().optional()),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // OpenAI Configuration
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_TEXT_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime'),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('whisper-1'),
  OPENAI_VOICE: z.string().default('alloy'),

  // Storage Configuration (Local Disk vs Cloudflare R2/S3)
  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  LOCAL_STORAGE_ROOT: z.string().default('./storage'),
  MATERIAL_MAX_UPLOAD_MB: z.preprocess((val) => (val ? Number(val) : 25), z.number().default(25)),
  LOCAL_STORAGE_QUOTA_MB_PER_USER: z.preprocess((val) => (val ? Number(val) : 1000), z.number().default(1000)),
  LOCAL_STORAGE_MIN_FREE_MB: z.preprocess((val) => (val ? Number(val) : 2048), z.number().default(2048)),
  TEMP_FILE_MAX_AGE_HOURS: z.preprocess((val) => (val ? Number(val) : 24), z.number().default(24)),

  // Cloudflare R2 Object Storage Configuration (S3-Compatible)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('jami-materials'),
  R2_ENDPOINT: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),

  // Soft Books (Sách Mềm) Limits & Quotas
  BOOK_MAX_UPLOAD_MB: z.preprocess((val) => (val ? Number(val) : 100), z.number().default(100)),
  BOOK_STORAGE_QUOTA_MB: z.preprocess((val) => (val ? Number(val) : 1000), z.number().default(1000)),
  BOOK_MAX_PAGES: z.preprocess((val) => (val ? Number(val) : 1500), z.number().default(1500)),
  BOOK_MAX_UNCOMPRESSED_MB: z.preprocess((val) => (val ? Number(val) : 500), z.number().default(500)),
  BOOK_MAX_ZIP_ENTRIES: z.preprocess((val) => (val ? Number(val) : 10000), z.number().default(10000)),
  AI_DAILY_QUOTA: z.preprocess((val) => (val ? Number(val) : 100), z.number().default(100)),
  AI_MAX_CONCURRENCY_PER_USER: z.preprocess((val) => (val ? Number(val) : 3), z.number().default(3)),

  // AI Wallet, Billing & Registration Code Configuration
  AI_DEFAULT_CREDIT_VND: z.preprocess((val) => (val ? Number(val) : 25000), z.number().default(25000)),
  AI_USD_TO_VND_RATE: z.preprocess((val) => (val ? Number(val) : 27000), z.number().int().positive().default(27000)),
  AI_PRICING_TIER: z.enum(['standard']).default('standard'),
  AI_LOW_BALANCE_WARNING_VND: z.preprocess((val) => (val ? Number(val) : 5000), z.number().default(5000)),
  AI_REALTIME_SESSION_RESERVE_VND: z.preprocess((val) => (val ? Number(val) : 10000), z.number().default(10000)),
  AI_GLOBAL_DAILY_BUDGET_VND: z.preprocess((val) => (val ? Number(val) : 5000000), z.number().default(5000000)),
  AI_USER_DAILY_SPEND_LIMIT_VND: z.preprocess((val) => (val ? Number(val) : 500000), z.number().default(500000)),
  REGISTRATION_CODE_PEPPER: z.string().min(16).default('jami-registration-code-pepper-secret-32-chars'),
  ADMIN_CONTACT_ZALO: z.string().default('https://zalo.me/g/jami_support'),
  ADMIN_CONTACT_EMAIL: z.string().default('admin@jami.edu.vn'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

export function parseEnv(): EnvConfig {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const errorIssues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`[JAMI Config ERROR] Invalid environment configuration: ${errorIssues}`);
  }

  const parsed = result.data;
  const isProdRuntime = parsed.NODE_ENV === 'production';
  const effectiveProduction = isProdRuntime || parsed.APP_MODE === 'production';
  const isLocalhost = parsed.APP_BASE_URL.includes('localhost') || parsed.APP_BASE_URL.includes('127.0.0.1');

  if (effectiveProduction && parsed.NODE_ENV !== 'test') {
    // 1. Mandatory Strong Session Secret
    if (
      !parsed.SESSION_SECRET ||
      parsed.SESSION_SECRET === 'jami-ai-production-secret-key-32-chars-min' ||
      parsed.SESSION_SECRET.length < 32
    ) {
      throw new Error('[JAMI Config ERROR] SESSION_SECRET must be set to a secure random string of at least 32 characters in Production mode.');
    }

    // 2. Mandatory Strong Internal Cron Secret
    if (
      !parsed.INTERNAL_CRON_SECRET ||
      parsed.INTERNAL_CRON_SECRET === 'jami-cron-internal-secret-key-32-chars' ||
      parsed.INTERNAL_CRON_SECRET.length < 32
    ) {
      throw new Error('[JAMI Config ERROR] INTERNAL_CRON_SECRET must be set to a secure random string of at least 32 characters in Production mode.');
    }

    // 3. Mandatory HTTPS Base URL (unless explicit localhost test run)
    if (!isLocalhost && !parsed.APP_BASE_URL.startsWith('https://')) {
      throw new Error('[JAMI Config ERROR] APP_BASE_URL must use HTTPS in Production mode on live domains.');
    }

    // 4. Database configuration validation
    if (parsed.APP_MODE === 'production') {
      const missing: string[] = [];
      if (!parsed.AIVEN_MYSQL_HOST) missing.push('AIVEN_MYSQL_HOST');
      if (!parsed.AIVEN_APP_USER) missing.push('AIVEN_APP_USER');
      if (!parsed.AIVEN_APP_PASSWORD) missing.push('AIVEN_APP_PASSWORD');

      if (missing.length > 0) {
        throw new Error(`[JAMI Config ERROR] Production mode requires valid Aiven MySQL credentials. Missing: ${missing.join(', ')}`);
      }

      const hasCa = Boolean(parsed.AIVEN_CA_CERT || parsed.AIVEN_CA_CERT_PATH);
      if (parsed.AIVEN_MYSQL_HOST && !hasCa && isProdRuntime) {
        throw new Error('[JAMI Config ERROR: CONFIG_AIVEN_CA_MISSING] Production environment connecting to Aiven MySQL requires AIVEN_CA_CERT or AIVEN_CA_CERT_PATH.');
      }
    }

    // 5. Cookie Secure Check
    if (parsed.COOKIE_SECURE === undefined) {
      parsed.COOKIE_SECURE = !isLocalhost;
    } else if (parsed.COOKIE_SECURE === false && !isLocalhost) {
      throw new Error('[JAMI Config ERROR] COOKIE_SECURE must be true in Production mode on non-localhost origins.');
    }

    // 6. CORS wildcard prohibition in production
    if (parsed.CORS_ALLOWED_ORIGINS && parsed.CORS_ALLOWED_ORIGINS.includes('*')) {
      throw new Error('[JAMI Config ERROR] CORS_ALLOWED_ORIGINS cannot contain wildcard "*" in Production mode.');
    }

    // 7. Password Reset SMTP Check
    if (parsed.PASSWORD_RESET_ENABLED && (!parsed.SMTP_HOST || !parsed.SMTP_USER)) {
      throw new Error('[JAMI Config ERROR] PASSWORD_RESET_ENABLED=true in production requires SMTP configuration (SMTP_HOST, SMTP_USER).');
    }

    // 8. Registration Code Pepper Secret Check
    if (
      !parsed.REGISTRATION_CODE_PEPPER ||
      parsed.REGISTRATION_CODE_PEPPER === 'jami-registration-code-pepper-secret-32-chars' ||
      parsed.REGISTRATION_CODE_PEPPER.length < 32
    ) {
      throw new Error('[JAMI Config ERROR] REGISTRATION_CODE_PEPPER must be set to a secure random string of at least 32 characters in Production mode.');
    }
  }

  // Determine COOKIE_SECURE default for non-production
  if (parsed.COOKIE_SECURE === undefined) {
    parsed.COOKIE_SECURE = false;
  }

  // Determine DEMO_LOGIN_ENABLED default
  if (parsed.DEMO_LOGIN_ENABLED === undefined) {
    parsed.DEMO_LOGIN_ENABLED = !isProdRuntime && parsed.APP_MODE !== 'production';
  }

  return parsed;
}

export const env = parseEnv();

export const isProductionRuntime = env.NODE_ENV === 'production';
export const effectiveProduction = isProductionRuntime || env.APP_MODE === 'production';
export const isDatabaseRequired = env.APP_MODE === 'production' && env.NODE_ENV !== 'test';
export const isDemoMode = (env.APP_MODE === 'demo' || env.NODE_ENV === 'test') && env.DEMO_LOGIN_ENABLED === true && !isProductionRuntime;
export const isProduction = effectiveProduction && env.NODE_ENV !== 'test';

