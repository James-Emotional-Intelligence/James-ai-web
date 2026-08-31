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
    next();
  });

  // 3. Strict CORS Middleware with credentials
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const allowedOrigins = (env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    if (origin) {
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
      const isPagesDev = origin.endsWith('.pages.dev') || origin.endsWith('.workers.dev');
      const isAllowed = !isProduction || isLocalhost || isPagesDev || allowedOrigins.length === 0 || allowedOrigins.includes(origin) || allowedOrigins.includes('*');
      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        );
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Requested-With, X-Request-Id, X-CSRF-Token, X-Admin-Key'
        );
        if (req.method === 'OPTIONS') {
          return res.sendStatus(204);
        }
      } else if (isProduction) {
        if (req.method === 'OPTIONS') {
          return res.status(403).json({ error: { code: 'CORS_ORIGIN_NOT_ALLOWED', message: 'Forbidden origin' } });
        }
      }
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });

  // 4. CSRF / Same-Origin Verification Middleware for state-mutating requests
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined);
      if (origin) {
        const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
        const isPagesDev = origin.endsWith('.pages.dev') || origin.endsWith('.workers.dev');
        const allowedOrigins = (env.CORS_ALLOWED_ORIGINS || '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);

        let appBaseOrigin = '';
        try {
          appBaseOrigin = new URL(env.APP_BASE_URL).origin;
        } catch {}

        const isAllowed = !isProduction || isLocalhost || isPagesDev || allowedOrigins.length === 0 || allowedOrigins.includes(origin) || allowedOrigins.includes('*') || (appBaseOrigin && appBaseOrigin === origin);

        if (!isAllowed) {
          return res.status(403).json({
            error: {
              code: 'CSRF_ORIGIN_MISMATCH',
              message: 'Yêu cầu không đến từ origin hợp lệ.',
              requestId: (req as any).requestId,
            },
          });
        }
      }
    }
    next();
  });

  // 5. Body & Cookie Parsers
  app.use(express.raw({ limit: '50mb', type: ['application/pdf', 'image/*', 'application/octet-stream'] }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(cookieParser());

  // 6. Mount API Router
  app.use('/api/v1', apiRouter);

  return app;
}
