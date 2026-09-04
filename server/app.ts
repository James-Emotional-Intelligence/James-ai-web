import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { apiRouter } from './routes/api';
import { env, isProduction } from './config/env';

import { createRateLimiter } from './middleware/rate-limit';
export { createRateLimiter };

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  // 1. Request ID Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || 'req_' + crypto.randomUUID().substring(0, 16);
    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  // 2. Security Headers Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Vary', 'Origin');
    next();
  });

  // Build canonical set of allowed origins
  const getAllowedOrigins = (): Set<string> => {
    const set = new Set<string>();
    try {
      if (env.APP_BASE_URL) {
        set.add(new URL(env.APP_BASE_URL).origin);
      }
    } catch {}

    if (env.CORS_ALLOWED_ORIGINS) {
      env.CORS_ALLOWED_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .forEach((o) => {
          try {
            set.add(new URL(o).origin);
          } catch {
            set.add(o);
          }
        });
    }

    return set;
  };

  const isOriginAllowed = (origin?: string): boolean => {
    if (!origin) return false;
    const allowed = getAllowedOrigins();

    if (allowed.has(origin)) return true;

    // In non-production or test runtime only, allow localhost origins
    if (!isProduction || env.NODE_ENV === 'test') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return true;
      }
    }

    return false;
  };

  // 3. Strict CORS Middleware with credentials
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (origin) {
      if (isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Requested-With, X-Request-Id, X-CSRF-Token, X-Admin-Key, X-Internal-Cron-Secret, X-Internal-Secret'
        );
        if (req.method === 'OPTIONS') {
          return res.sendStatus(204);
        }
      } else {
        if (req.method === 'OPTIONS') {
          return res.status(403).json({
            error: {
              code: 'CORS_ORIGIN_NOT_ALLOWED',
              message: 'Forbidden origin: Origin không được phép truy cập.',
              requestId: (req as any).requestId,
            },
          });
        }
      }
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });

  // 4. Body & Cookie Parsers (Must run before CSRF middleware so req.cookies is populated)
  app.use(express.raw({ limit: '50mb', type: ['application/pdf', 'image/*', 'application/octet-stream'] }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(cookieParser());

  // 5. CSRF / Same-Origin Verification Middleware for state-mutating requests
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      // Exclude internal routes authenticated via internal cron secret header or Bearer token
      const cronSecretHeader = (req.headers['x-internal-cron-secret'] || req.headers['x-internal-secret'] || '') as string;
      const bearerSecret = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
      const providedSecret = cronSecretHeader || bearerSecret;
      const expectedSecret = env.INTERNAL_CRON_SECRET || env.ADMIN_SECRET_KEY || 'jami-cron-internal-secret-key-32-chars';

      if (req.path.startsWith('/api/v1/internal/') && providedSecret && providedSecret === expectedSecret) {
        return next();
      }

      const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined);

      if (origin) {
        if (!isOriginAllowed(origin)) {
          return res.status(403).json({
            error: {
              code: 'CSRF_ORIGIN_MISMATCH',
              message: 'Yêu cầu không đến từ origin hợp lệ.',
              requestId: (req as any).requestId,
            },
          });
        }
      } else if (isProduction && env.NODE_ENV !== 'test') {
        // In production, require Origin or Referer for mutating browser requests with cookies
        if (req.cookies && Object.keys(req.cookies).length > 0) {
          return res.status(403).json({
            error: {
              code: 'CSRF_ORIGIN_MISSING',
              message: 'Yêu cầu thay đổi dữ liệu thiếu tiêu đề Origin/Referer.',
              requestId: (req as any).requestId,
            },
          });
        }
      }
    }
    next();
  });

  // 6. Mount API Router
  app.use('/api/v1', apiRouter);

  return app;
}
