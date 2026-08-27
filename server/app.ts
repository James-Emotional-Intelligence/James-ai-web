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

    // In local dev, allow localhost defaults
    if (!isProduction) {
      if (!allowedOrigins.includes('http://localhost:3000')) allowedOrigins.push('http://localhost:3000');
      if (!allowedOrigins.includes('http://localhost:5173')) allowedOrigins.push('http://localhost:5173');
      if (!allowedOrigins.includes('http://127.0.0.1:3000')) allowedOrigins.push('http://127.0.0.1:3000');
      if (!allowedOrigins.includes('http://127.0.0.1:5173')) allowedOrigins.push('http://127.0.0.1:5173');
    }

    if (origin) {
      const isAllowed = allowedOrigins.includes(origin);
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
      if (isProduction && origin) {
        const allowedOrigins = (env.CORS_ALLOWED_ORIGINS || '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);
        const appBaseOrigin = new URL(env.APP_BASE_URL).origin;
        allowedOrigins.push(appBaseOrigin);

        if (!allowedOrigins.includes(origin)) {
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
  app.use(express.raw({ limit: '30mb', type: ['application/pdf', 'image/*', 'application/octet-stream'] }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // 6. Mount API Router
  app.use('/api/v1', apiRouter);

  return app;
}
