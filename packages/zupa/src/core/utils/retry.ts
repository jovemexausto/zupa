interface RetryIdempotentInput<T> {
  run: () => Promise<T>;
  maxRetries: number;
  baseDelayMs: number;
  jitterMs: number;
  isRetryable?: (error: unknown) => boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultIsRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('timeout')
    || message.includes('temporar')
    || message.includes('network')
    || message.includes('econnreset')
    || message.includes('econnrefused')
    || message.includes('429')
    || message.includes('5xx')
    || message.includes('503')
  );
}

function nextDelayMs(baseDelayMs: number, jitterMs: number, attempt: number): number {
  const expo = baseDelayMs * Math.pow(2, attempt);
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
  return expo + jitter;
}

export async function retryIdempotent<T>(input: RetryIdempotentInput<T>): Promise<T> {
  const isRetryable = input.isRetryable ?? defaultIsRetryable;

  for (let attempt = 0; attempt <= input.maxRetries; attempt += 1) {
    try {
      return await input.run();
    } catch (error) {
      const exhausted = attempt >= input.maxRetries;
      if (exhausted || !isRetryable(error)) {
        throw error;
      }

      const delayMs = nextDelayMs(input.baseDelayMs, input.jitterMs, attempt);
      await sleep(delayMs);
    }
  }

  throw new Error('retryIdempotent exhausted unexpectedly');
}
