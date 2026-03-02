import {
    type LLMProvider,
    type LLMCompleteOptions,
    type LLMResponse,
    type LLMStreamChunk
} from '@zupa/core';

export class FakeLLMProvider implements LLMProvider {
    private responses: LLMResponse[];
    private callCount = 0;

    public setResponses(responses: LLMResponse[]): void {
        this.responses = responses;
        this.callCount = 0;
    }

    public constructor(responses?: LLMResponse[]) {
        this.responses = responses ?? [
            {
                content: 'Fake response',
                structured: null,
                toolCalls: [],
                tokensUsed: { promptTokens: 0, completionTokens: 0 },
                model: 'fake-model',
                latencyMs: 10
            }
        ];
    }

    public async start(): Promise<void> { }
    public async close(): Promise<void> { }

    public async complete(options: LLMCompleteOptions): Promise<LLMResponse> {
        const response = this.responses[this.callCount % this.responses.length];
        if (!response) {
            throw new Error('FakeLLMProvider: No response available');
        }
        this.callCount++;

        if (options.outputSchema && response.structured === null && response.content) {
            // Basic simulation of structured output
            return {
                ...response,
                content: null,
                structured: { reply: response.content }
            };
        }

        return response;
    }

    public async *stream(options: LLMCompleteOptions): AsyncGenerator<LLMStreamChunk, LLMResponse, unknown> {
        const response = this.responses[this.callCount % this.responses.length];
        if (!response) {
            throw new Error('FakeLLMProvider: No response available');
        }
        this.callCount++;

        const words = (response.content || '').split(' ');
        for (let i = 0; i < words.length; i++) {
            yield {
                id: `chunk-${i}`,
                content: words[i] + (i < words.length - 1 ? ' ' : '')
            };
        }

        if (options.outputSchema && response.structured === null && response.content) {
            return {
                ...response,
                content: null,
                structured: { reply: response.content }
            };
        }
        return response;
    }
}
