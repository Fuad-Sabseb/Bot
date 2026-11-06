import { Request, Response, NextFunction } from "express";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitBucket>();

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) {
  const { windowMs, maxRequests, message = "Too many requests. Please try again later." } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${req.baseUrl}${req.path}:${ip}`;
    const now = Date.now();

    const bucket = memoryStore.get(key);

    if (!bucket || now > bucket.resetAt) {
      memoryStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;

    if (bucket.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfterSeconds);
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message,
          retryAfterSeconds,
        },
      });
      return;
    }

    next();
  };
}
