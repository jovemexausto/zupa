import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  OpenAILLMProvider,
  OpenAIWhisperSTTProvider,
  OpenAITTSProvider
} from '../src/index';
import OpenAI from 'openai';

describe('openai providers', () => {
  it('maps llm completion response to canonical contract', async () => {
    const create = vi.fn(async (_input: unknown) => ({
      model: 'gpt-4o-mini',
      usage: { prompt_tokens: 12, completion_tokens: 5 },
      choices: [
        {
          message: {
            content: '{"reply":"hello"}',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'save_note',
                  arguments: '{"text":"remember this"}'
                }
              }
            ]
          }
        }
      ]
    }));

    const provider = new OpenAILLMProvider({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      client: {
        chat: { completions: { create } }
      } as unknown as OpenAI
    });

    const result = await provider.complete({
      systemPrompt: 'you are helpful',
      messages: [{ role: 'user', content: 'hey' }],
      outputSchema: z.object({ reply: z.string() })
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.content).toBeNull();
    expect(result.structured).toEqual({ reply: 'hello' });
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'save_note', arguments: { text: 'remember this' } }]);
    expect(result.tokensUsed).toEqual({ promptTokens: 12, completionTokens: 5 });
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('streams llm completion chunks and returns final stats', async () => {
    async function* mockStream() {
      yield { id: 'chunk_1', choices: [{ delta: { content: 'hello ' } }], model: 'gpt-4o-mini' };
      yield { id: 'chunk_2', choices: [{ delta: { content: 'world' } }], model: 'gpt-4o-mini', usage: { prompt_tokens: 10, completion_tokens: 2 } };
    }

    const create = vi.fn().mockReturnValue(mockStream());

    const provider = new OpenAILLMProvider({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      client: {
        chat: { completions: { create } }
      } as unknown as OpenAI
    });

    const stream = provider.stream({
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'stream this' }]
    });

    const chunks = [];
    let finalResult;
    while (true) {
      const result = await stream.next();
      if (result.done) {
        finalResult = result.value;
        break;
      }
      chunks.push(result.value);
    }

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ stream: true, stream_options: { include_usage: true } }));

    expect(chunks).toEqual([
      { id: 'chunk_1', content: 'hello ' },
      { id: 'chunk_2', content: 'world' }
    ]);

    expect(finalResult.content).toBe('hello world');
    expect(finalResult.tokensUsed).toEqual({ promptTokens: 10, completionTokens: 2 });
    expect(finalResult.model).toBe('gpt-4o-mini');
  });

  it('supports nullable schemas in structured outputs without throwing', async () => {
    const create = vi.fn(async (_input: unknown) => ({
      model: 'gpt-4o-mini',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      choices: [
        {
          message: {
            content: '{"reply":"hello","modality":null}',
          }
        }
      ]
    }));

    const provider = new OpenAILLMProvider({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      client: {
        chat: { completions: { create } }
      } as unknown as OpenAI
    });

    const TestSchema = z.object({
      reply: z.string(),
      modality: z.enum(['text', 'voice']).nullable()
    });

    const result = await provider.complete({
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hey' }],
      outputSchema: TestSchema
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.structured).toEqual({ reply: 'hello', modality: null });
  });

  it('transcribes with whisper and normalizes language', async () => {
    const create = vi.fn(async () => ({ text: 'ola mundo' }));

    const provider = new OpenAIWhisperSTTProvider({
      apiKey: 'sk-test',
      client: {
        audio: { transcriptions: { create } }
      } as unknown as OpenAI
    });

    const result = await provider.transcribe({ audio: Buffer.from('fake'), format: 'audio/ogg', language: 'pt' });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'whisper-1', language: 'pt' }));
    expect(result.transcript).toBe('ola mundo');
    expect(result.confidence).toBe(1);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('synthesizes speech and returns audio buffer', async () => {
    const create = vi.fn(async (_input: Record<string, unknown>) => ({
      arrayBuffer: async () => new TextEncoder().encode('audio').buffer
    }));

    const provider = new OpenAITTSProvider({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini-tts',
      client: {
        audio: { speech: { create } }
      } as unknown as OpenAI
    });

    const result = await provider.synthesize({
      text: 'hello world',
      voice: 'alloy',
      language: 'en'
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: 'hello world' })
    );
    expect(result.audio.toString()).toBe('audio');
    expect(result.durationSeconds).toBe(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
