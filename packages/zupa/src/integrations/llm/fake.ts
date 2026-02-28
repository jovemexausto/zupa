import type { LLMProviderPort } from '../../core/ports';

export type LLMCompleteOptions = Parameters<LLMProviderPort['complete']>[0];
export type LLMResponse = Awaited<ReturnType<LLMProviderPort['complete']>>;

export class FakeLLMProvider implements LLMProviderPort {
  private readonly queue: LLMResponse[];
  public readonly requests: LLMCompleteOptions[] = [];

  public constructor(responses: LLMResponse[] = []) {
    this.queue = [...responses];
  }

  public async complete(options: LLMCompleteOptions): Promise<LLMResponse> {
    this.requests.push(options);
    const next = this.queue.shift();
    if (!next) {
      throw new Error('FakeLLMProvider queue is empty');
    }

    return next;
  }
}
