interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Simple in-process sliding-window rate limiter.
 * Not suitable for multi-process deployments without an external store;
 * replace with KV-backed equivalent when deploying to Workers.
 */
export class RateLimiter {
  private readonly store = new Map<string, Bucket>();

  constructor(
    /** Maximum requests allowed per window. */
    private readonly max: number,
    /** Window length in milliseconds. */
    private readonly windowMs: number,
  ) {}

  /**
   * Records one hit for `key`.
   * Returns true when the request is within limits, false when it should be blocked.
   */
  check(key: string, nowMs = Date.now()): boolean {
    const bucket = this.store.get(key);
    if (!bucket || nowMs >= bucket.resetAt) {
      this.store.set(key, { count: 1, resetAt: nowMs + this.windowMs });
      return true;
    }
    if (bucket.count >= this.max) return false;
    bucket.count++;
    return true;
  }
}
