import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

// Rate Limiting & Quota Store (In-memory sliding window + daily quota + active concurrency)
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface UserDailyQuotaBucket {
  count: number;
  dateKey: string; // "YYYY-MM-DD"
}

const rateLimitStore = new Map<string, RateLimitBucket>();
const dailyQuotaStore = new Map<string, UserDailyQuotaBucket>();
const activeConcurrencyMap = new Map<string, number>();

export function createRateLimiter(
  windowMs: number,
  maxRequests: number,
  keyPrefix: string,
  options?: {
    useUserId?: boolean;
    maxConcurrency?: number;
    dailyQuota?: number;
  }
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).userId || (req as any).user?.id || '';
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const identifier = (options?.useUserId && userId) ? `usr_${userId}` : `ip_${ip}`;
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : '';
    const key = `${keyPrefix}:${identifier}${email ? `:${email}` : ''}`;
    const now = Date.now();

    // 1. Check Active Concurrency (if specified)
    if (options?.maxConcurrency && userId) {
      const activeCount = activeConcurrencyMap.get(userId) || 0;
      if (activeCount >= options.maxConcurrency) {
        return res.status(429).json({
          error: {
            code: 'AI_CONCURRENCY_EXCEEDED',
            message: `Bạn đang có ${activeCount} tác vụ AI đang xử lý. Vui lòng chờ tác vụ hiện tại hoàn tất.`,
            requestId: (req as any).requestId,
          },
          message: `Bạn đang có ${activeCount} tác vụ AI đang xử lý. Vui lòng chờ tác vụ hiện tại hoàn tất.`,
        });
      }
      activeConcurrencyMap.set(userId, activeCount + 1);

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        const cur = activeConcurrencyMap.get(userId) || 1;
        if (cur <= 1) {
          activeConcurrencyMap.delete(userId);
        } else {
          activeConcurrencyMap.set(userId, cur - 1);
        }
      };

      res.on('finish', cleanup);
      res.on('close', cleanup);
    }

    // 2. Check Daily Quota (if specified)
    if (options?.dailyQuota && userId) {
      const dateKey = new Date().toISOString().substring(0, 10);
      const quotaBucket = dailyQuotaStore.get(userId) || { count: 0, dateKey };
      if (quotaBucket.dateKey !== dateKey) {
        quotaBucket.count = 0;
        quotaBucket.dateKey = dateKey;
      }

      if (quotaBucket.count >= options.dailyQuota) {
        return res.status(429).json({
          error: {
            code: 'AI_QUOTA_EXCEEDED',
            message: `Bạn đã đạt hạn mức ${options.dailyQuota} lượt AI hôm nay. Hạn mức sẽ được làm mới vào ngày mai.`,
            requestId: (req as any).requestId,
          },
          message: `Bạn đã đạt hạn mức ${options.dailyQuota} lượt AI hôm nay. Hạn mức sẽ được làm mới vào ngày mai.`,
        });
      }
      quotaBucket.count += 1;
      dailyQuotaStore.set(userId, quotaBucket);
    }

    // 3. Sliding Window Burst Rate Limiting
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

/**
 * Specialized Auth Rate Limiter that enforces separate buckets for IP and Identifier/Email
 * to prevent both distributed brute-force and IP spraying.
 */
export function createAuthRateLimiter(options?: {
  ipWindowMs?: number;
  ipMaxRequests?: number;
  emailWindowMs?: number;
  emailMaxRequests?: number;
}) {
  const ipWindowMs = options?.ipWindowMs || 60 * 1000;
  const ipMaxRequests = options?.ipMaxRequests || 20;
  const emailWindowMs = options?.emailWindowMs || 60 * 1000;
  const emailMaxRequests = options?.emailMaxRequests || 5;

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : '';

    // Check IP bucket
    const ipKey = `auth_ip:${ip}`;
    const ipBucket = rateLimitStore.get(ipKey) || { count: 0, resetAt: now + ipWindowMs };
    if (now > ipBucket.resetAt) {
      ipBucket.count = 0;
      ipBucket.resetAt = now + ipWindowMs;
    }
    ipBucket.count += 1;
    rateLimitStore.set(ipKey, ipBucket);

    if (ipBucket.count > ipMaxRequests) {
      const retryAfterSeconds = Math.ceil((ipBucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Địa chỉ IP đã gửi quá nhiều yêu cầu xác thực. Vui lòng thử lại sau ${retryAfterSeconds} giây.`,
          requestId: (req as any).requestId,
        },
        message: `Địa chỉ IP đã gửi quá nhiều yêu cầu xác thực. Vui lòng thử lại sau ${retryAfterSeconds} giây.`,
      });
    }

    // Check Email bucket if email is present
    if (email) {
      const emailKey = `auth_email:${email}`;
      const emailBucket = rateLimitStore.get(emailKey) || { count: 0, resetAt: now + emailWindowMs };
      if (now > emailBucket.resetAt) {
        emailBucket.count = 0;
        emailBucket.resetAt = now + emailWindowMs;
      }
      emailBucket.count += 1;
      rateLimitStore.set(emailKey, emailBucket);

      if (emailBucket.count > emailMaxRequests) {
        const retryAfterSeconds = Math.ceil((emailBucket.resetAt - now) / 1000);
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: `Tài khoản ${email} đã thử đăng nhập quá số lần cho phép. Vui lòng thử lại sau ${retryAfterSeconds} giây.`,
            requestId: (req as any).requestId,
          },
          message: `Tài khoản ${email} đã thử đăng nhập quá số lần cho phép. Vui lòng thử lại sau ${retryAfterSeconds} giây.`,
        });
      }
    }

    next();
  };
}

export function resetRateLimits() {
  rateLimitStore.clear();
  dailyQuotaStore.clear();
  activeConcurrencyMap.clear();
}

export const aiRateLimiter = createRateLimiter(60 * 1000, 30, 'ai_limit', {
  useUserId: true,
  maxConcurrency: env.AI_MAX_CONCURRENCY_PER_USER || 3,
  dailyQuota: env.AI_DAILY_QUOTA || 100,
});

export const authRateLimiter = createAuthRateLimiter({
  ipWindowMs: 60 * 1000,
  ipMaxRequests: 20,
  emailWindowMs: 60 * 1000,
  emailMaxRequests: 5,
});
