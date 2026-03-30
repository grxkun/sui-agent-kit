/**
 * @module retry
 * Error handling utilities with exponential backoff for Sui transactions.
 */

// ── Error Types ──────────────────────────────────────────────────────────────

export class SuiAgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "SuiAgentError";
  }
}

export class InsufficientGasError extends SuiAgentError {
  constructor(cause?: unknown) {
    super("Insufficient gas for transaction", "INSUFFICIENT_GAS", cause);
    this.name = "InsufficientGasError";
  }
}

export class NetworkError extends SuiAgentError {
  constructor(message: string, cause?: unknown) {
    super(message, "NETWORK_ERROR", cause);
    this.name = "NetworkError";
  }
}

export class TransactionFailedError extends SuiAgentError {
  constructor(
    message: string,
    public readonly digest?: string,
    cause?: unknown
  ) {
    super(message, "TX_FAILED", cause);
    this.name = "TransactionFailedError";
  }
}

export class ObjectNotFoundError extends SuiAgentError {
  constructor(objectId: string, cause?: unknown) {
    super(`Object not found: ${objectId}`, "OBJECT_NOT_FOUND", cause);
    this.name = "ObjectNotFoundError";
  }
}

// ── Error Classification ─────────────────────────────────────────────────────

export function isRetryable(err: unknown): boolean {
  if (err instanceof InsufficientGasError) return false;
  if (err instanceof ObjectNotFoundError) return false;
  if (err instanceof NetworkError) return true;

  const message = err instanceof Error ? err.message : String(err);
  const retryablePatterns = [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "socket hang up",
    "429",
    "503",
    "502",
    "rate limit",
  ];
  return retryablePatterns.some((p) => message.toLowerCase().includes(p.toLowerCase()));
}

export function classifyError(err: unknown): SuiAgentError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("insufficient") && lower.includes("gas")) {
    return new InsufficientGasError(err);
  }
  if (lower.includes("object") && lower.includes("not found")) {
    return new ObjectNotFoundError("unknown", err);
  }
  if (
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed")
  ) {
    return new NetworkError(message, err);
  }
  return new SuiAgentError(message, "UNKNOWN", err);
}

// ── Retry Logic ──────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Max number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in ms (default: 500) */
  baseDelay?: number;
  /** Maximum delay cap in ms (default: 10000) */
  maxDelay?: number;
  /** Jitter factor 0-1 (default: 0.2) */
  jitter?: number;
  /** Callback fired on each retry */
  onRetry?: (attempt: number, error: SuiAgentError, nextDelayMs: number) => void;
}

const RETRY_DEFAULTS: Required<Omit<RetryOptions, "onRetry">> = {
  maxAttempts: 3,
  baseDelay: 500,
  maxDelay: 10_000,
  jitter: 0.2,
};

function computeDelay(attempt: number, opts: Required<Omit<RetryOptions, "onRetry">>): number {
  const exponential = opts.baseDelay * Math.pow(2, attempt);
  const capped = Math.min(exponential, opts.maxDelay);
  const jitterRange = capped * opts.jitter;
  return capped + (Math.random() * jitterRange * 2 - jitterRange);
}

/**
 * Execute an async function with exponential backoff retry.
 *
 * @example
 * ```ts
 * const result = await retryWithBackoff(
 *   () => client.signAndExecuteTransaction({ transaction: tx, signer }),
 *   { maxAttempts: 3, onRetry: (n, err) => console.warn(`Retry ${n}:`, err.message) }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...RETRY_DEFAULTS, ...options };

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (raw) {
      const err = raw instanceof SuiAgentError ? raw : classifyError(raw);

      // Don't retry non-retryable errors
      if (!isRetryable(err)) throw err;

      // Don't retry on last attempt
      if (attempt === opts.maxAttempts - 1) throw err;

      const delay = computeDelay(attempt, opts);
      options?.onRetry?.(attempt + 1, err, delay);

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Unreachable but satisfies TS
  throw new SuiAgentError("Retry exhausted", "RETRY_EXHAUSTED");
}
