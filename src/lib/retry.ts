/**
 * Sprint Guardian — Retry Utility
 *
 * Exponential backoff with jitter for resilient API calls.
 * Supports:
 * - Configurable max retries
 * - Exponential backoff with jitter
 * - Retry-specific error detection
 * - Per-attempt hooks for logging
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;

  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;

  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;

  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;

  /** Whether to add jitter to prevent thundering herd (default: true) */
  jitter?: boolean;

  /** Custom function to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;

  /** Called before each retry attempt */
  onRetry?: (attempt: number, error: unknown, delay: number) => void;

  /** Operation name for logging */
  operationName?: string;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: defaultIsRetryable,
  onRetry: defaultOnRetry,
  operationName: "operation",
};

/**
 * Default retry eligibility check.
 * Retries on network errors, timeouts, and 5xx/429 HTTP errors.
 */
function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes("fetch failed") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("network")
    ) {
      return true;
    }

    // Rate limiting
    if (message.includes("429") || message.includes("rate limit")) {
      return true;
    }

    // Server errors
    if (message.includes("500") || message.includes("502") || 
        message.includes("503") || message.includes("504")) {
      return true;
    }
  }

  return false;
}

function defaultOnRetry(
  attempt: number,
  error: unknown,
  delay: number
): void {
  console.log(
    `[Retry] Attempt ${attempt} failed, retrying in ${delay}ms: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

/**
 * Calculate delay with exponential backoff and optional jitter.
 */
function calculateDelay(
  attempt: number,
  options: Required<RetryOptions>
): number {
  const exponentialDelay =
    options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
  const capped = Math.min(exponentialDelay, options.maxDelayMs);

  if (options.jitter) {
    // Full jitter: random between 0 and capped delay
    return Math.floor(Math.random() * capped);
  }

  return capped;
}

/**
 * Execute a function with retry logic.
 *
 * @example
 * const data = await withRetry(
 *   () => fetchExternalAPI(url),
 *   { maxRetries: 3, operationName: 'github-api-call' }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Last attempt — don't retry
      if (attempt > opts.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!opts.isRetryable(error)) {
        throw error; // Non-retryable errors fail immediately
      }

      const delay = calculateDelay(attempt, opts);
      opts.onRetry(attempt, error, delay);

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Simple circuit breaker for external service calls.
 * Opens after `failureThreshold` consecutive failures.
 * Enters half-open state after `resetTimeoutMs`.
 */
export class CircuitBreaker {
  private state: "closed" | "open" | "half_open" = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private readonly serviceName: string,
    private readonly failureThreshold: number = 5,
    private readonly resetTimeoutMs: number = 30000,
    private readonly halfOpenMaxAttempts: number = 2
  ) {}

  /**
   * Execute a function through the circuit breaker.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      // Check if enough time has passed to try again
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "half_open";
        this.successCount = 0;
        console.log(
          `[CircuitBreaker] ${this.serviceName}: half-open, attempting probe`
        );
      } else {
        throw new Error(
          `Circuit breaker OPEN for ${this.serviceName}. ` +
          `Service unavailable. Will retry after ${
            Math.ceil(
              (this.resetTimeoutMs - (Date.now() - this.lastFailureTime)) / 1000
            )
          }s.`
        );
      }
    }

    try {
      const result = await fn();

      if (this.state === "half_open") {
        this.successCount++;
        if (this.successCount >= this.halfOpenMaxAttempts) {
          this.state = "closed";
          this.failureCount = 0;
          console.log(
            `[CircuitBreaker] ${this.serviceName}: closed (recovered)`
          );
        }
      } else {
        this.failureCount = 0; // Reset on success
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.state === "half_open") {
        this.state = "open";
        console.log(
          `[CircuitBreaker] ${this.serviceName}: re-opened (half-open probe failed)`
        );
      } else if (this.failureCount >= this.failureThreshold) {
        this.state = "open";
        console.log(
          `[CircuitBreaker] ${this.serviceName}: OPENED after ${this.failureCount} failures`
        );
      }

      throw error;
    }
  }

  getState(): { state: string; failures: number } {
    return { state: this.state, failures: this.failureCount };
  }
}

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
