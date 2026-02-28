import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { OpenAILLMProvider } from '../src/integrations/llm/openai';
import { OpenAIWhisperSTTProvider } from '../src/integrations/stt/openai';
import { OpenAITTSProvider } from '../src/integrations/tts/openai';

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
        chat: {
          completions: {
            create
          }
        }
      }
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
    const baseDir = path.join(tmpdir(), `zupa-stt-${Date.now()}`);
    await mkdir(baseDir, { recursive: true });
    const audioPath = path.join(baseDir, 'input.ogg');
    await writeFile(audioPath, 'fake-audio-bytes');

    const create = vi.fn(async () => ({ text: 'ola mundo' }));

    const provider = new OpenAIWhisperSTTProvider({
      apiKey: 'sk-test',
      client: {
        audio: {
          transcriptions: {
            create
          }
        }
      }
    });

    const result = await provider.transcribe({ audioPath, language: 'pt' });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'whisper-1', language: 'pt' }));
    expect(result.transcript).toBe('ola mundo');
    expect(result.confidence).toBe(1);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('synthesizes speech and writes audio file', async () => {
    const baseDir = path.join(tmpdir(), `zupa-tts-${Date.now()}`);
    await mkdir(baseDir, { recursive: true });
    const outputPath = path.join(baseDir, 'output.mp3');

    const create = vi.fn(async (_input: Record<string, unknown>) => ({
      arrayBuffer: async () => new TextEncoder().encode('audio').buffer
    }));

    const provider = new OpenAITTSProvider({
      apiKey: 'sk-test',
      model: 'gpt-4o-mini-tts',
      client: {
        audio: {
          speech: {
            create
          }
        }
      }
    });

    const result = await provider.synthesize({
      text: 'hello world',
      voice: 'alloy',
      outputPath,
      language: 'en'
    });

    const output = await readFile(outputPath);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: 'hello world' })
    );
    expect(output.toString()).toBe('audio');
    expect(result.audioPath).toBe(outputPath);
    expect(result.durationSeconds).toBe(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
