import { Request, Response, NextFunction } from 'express';

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

      const cleanup = () => {
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

export function resetRateLimits() {
  rateLimitStore.clear();
  dailyQuotaStore.clear();
  activeConcurrencyMap.clear();
}

