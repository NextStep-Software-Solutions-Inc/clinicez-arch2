export interface RetryContext {
  previousRetryCount: number;
  elapsedMilliseconds: number;
  retryReason: Error;
}

export interface IRetryPolicy {
  nextRetryDelayInMilliseconds(retryContext: RetryContext): number | null;
}

export interface RetryPolicyOptions {
  initialDelayMs?: number;    // Default: 500ms
  maxDelayMs?: number;        // Default: 30000ms (30s ceiling)
  factor?: number;            // Default: 2.0 (exponential multiplier)
  jitterFactor?: number;      // Default: 0.25 (±25% randomized jitter)
  maxAttempts?: number;       // Default: Infinity
}

export class ExponentialBackoffRetryPolicy implements IRetryPolicy {
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly factor: number;
  private readonly jitterFactor: number;
  private readonly maxAttempts: number;

  constructor(options?: RetryPolicyOptions) {
    this.initialDelayMs = options?.initialDelayMs ?? 500;
    this.maxDelayMs = options?.maxDelayMs ?? 30000;
    this.factor = options?.factor ?? 2.0;
    this.jitterFactor = Math.min(1.0, Math.max(0, options?.jitterFactor ?? 0.25));
    this.maxAttempts = options?.maxAttempts ?? Infinity;
  }

  public nextRetryDelayInMilliseconds(retryContext: RetryContext): number | null {
    if (retryContext.previousRetryCount >= this.maxAttempts) {
      return null;
    }

    // base = min(maxDelay, initialDelay * factor ^ previousRetryCount)
    const exponentialDelay = this.initialDelayMs * Math.pow(this.factor, retryContext.previousRetryCount);
    const cappedDelay = Math.min(this.maxDelayMs, exponentialDelay);

    // Jitter: uniform random in [cappedDelay * (1 - jitter), cappedDelay * (1 + jitter)]
    const jitterSpan = cappedDelay * this.jitterFactor;
    const randomJitter = (Math.random() * 2 - 1) * jitterSpan;
    const computedDelay = Math.round(cappedDelay + randomJitter);

    return Math.min(this.maxDelayMs, Math.max(100, computedDelay));
  }
}
