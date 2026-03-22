/**
 * Sprint Guardian — Per-Service Rate Limiter
 *
 * Token bucket rate limiter for external API calls.
 * Each service (GitHub, Jira, Slack) has its own bucket
 * with configurable limits matching their API rate limits.
 */

interface RateLimitConfig {
  /** Maximum tokens in the bucket */
  maxTokens: number;
  /** Tokens to refill per second */
  refillRate: number;
  /** Provider name for logging */
  provider: string;
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private readonly config: RateLimitConfig) {
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token. Returns true if allowed.
   */
  tryConsume(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Wait until a token is available, then consume it.
   */
  async waitForToken(): Promise<void> {
    while (!this.tryConsume()) {
      const waitTime = Math.ceil(1000 / this.config.refillRate);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Get current state of the bucket.
   */
  getState(): {
    provider: string;
    availableTokens: number;
    maxTokens: number;
  } {
    this.refill();
    return {
      provider: this.config.provider,
      availableTokens: Math.floor(this.tokens),
      maxTokens: this.config.maxTokens,
    };
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.config.maxTokens,
      this.tokens + elapsed * this.config.refillRate
    );
    this.lastRefill = now;
  }
}

// ── Pre-configured rate limiters for each service ──

const rateLimiters = new Map<string, TokenBucket>();

// GitHub: 5000 requests/hour = ~1.38/sec
rateLimiters.set(
  "github",
  new TokenBucket({
    maxTokens: 50, // Burst capacity
    refillRate: 1.38,
    provider: "github",
  })
);

// Jira: ~100 requests/minute for cloud = ~1.67/sec  
rateLimiters.set(
  "jira",
  new TokenBucket({
    maxTokens: 30,
    refillRate: 1.67,
    provider: "jira",
  })
);

// Slack: Tier 3 = 50 requests/minute = ~0.83/sec
rateLimiters.set(
  "slack",
  new TokenBucket({
    maxTokens: 20,
    refillRate: 0.83,
    provider: "slack",
  })
);

/**
 * Get the rate limiter for a service.
 * Call `tryConsume()` before making API calls.
 */
export function getRateLimiter(provider: string): TokenBucket {
  const limiter = rateLimiters.get(provider);
  if (!limiter) {
    // Create a conservative default limiter
    const defaultLimiter = new TokenBucket({
      maxTokens: 10,
      refillRate: 1,
      provider,
    });
    rateLimiters.set(provider, defaultLimiter);
    return defaultLimiter;
  }
  return limiter;
}

/**
 * Check if a request is allowed under rate limits.
 * Throws if rate limited.
 */
export async function enforceRateLimit(provider: string): Promise<void> {
  const limiter = getRateLimiter(provider);
  if (!limiter.tryConsume()) {
    console.warn(
      `[RateLimit] ${provider}: rate limit reached, waiting for token...`
    );
    await limiter.waitForToken();
  }
}

/**
 * Get rate limit status for all services.
 */
export function getAllRateLimitStatus(): Array<{
  provider: string;
  availableTokens: number;
  maxTokens: number;
}> {
  return Array.from(rateLimiters.values()).map((l) => l.getState());
}
