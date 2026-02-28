import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
