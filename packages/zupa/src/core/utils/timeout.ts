export class TimeoutError extends Error {
  public readonly timeoutMs: number;

  public constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

interface WithTimeoutInput<T> {
  timeoutMs: number;
  label: string;
  run: () => Promise<T>;
}

export async function withTimeout<T>(input: WithTimeoutInput<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      input.run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError(input.label, input.timeoutMs));
        }, input.timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
