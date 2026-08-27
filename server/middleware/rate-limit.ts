import { Request, Response, NextFunction } from 'express';

// In-memory sliding window rate limiter
// NOTE: In-memory store is single-process only. For multi-instance horizontal scaling
// in production, a shared store (Redis, Cloudflare KV / Durable Objects, or DB table) must be configured.
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

export function createRateLimiter(windowMs: number, maxRequests: number, keyPrefix: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : '';
    const key = `${keyPrefix}:${ip}:${email}`;
    const now = Date.now();

    const bucket = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    rateLimitStore.set(key, bucket);

    if (bucket.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Thao tác quá nhiều lần. Vui lòng thử lại sau ${retryAfterSeconds} giây.`,
          requestId: (req as any).requestId,
        },
        message: `Thao tác quá nhiều lần. Vui lòng thử lại sau ${retryAfterSeconds} giây.`,
      });
    }

    next();
  };
}

export function resetRateLimits() {
  rateLimitStore.clear();
}
