import type { RequestHandler } from 'express';
import { ApiError } from '../http/errors.js';

// Bounded, single-process fixed window for the credential exchange endpoint.
// req.ip uses the socket address because Express trust proxy remains disabled.
export function authRateLimit(maximum = 30, windowMs = 60_000, now = Date.now): RequestHandler {
  const buckets = new Map<string, { count: number; until: number }>();
  return (request, response, next) => {
    const instant = now();
    for (const [key, bucket] of buckets) if (bucket.until <= instant) buckets.delete(key);
    const key = request.ip ?? 'unknown';
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 5000) {
        response.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        next(new ApiError(429, 42901, 'Authentication rate limit exceeded')); return;
      }
      bucket = { count: 0, until: instant + windowMs }; buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > maximum) {
      response.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - instant) / 1000))));
      next(new ApiError(429, 42901, 'Authentication rate limit exceeded')); return;
    }
    next();
  };
}
