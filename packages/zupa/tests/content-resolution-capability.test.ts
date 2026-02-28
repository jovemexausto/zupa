import { describe, expect, it, vi } from 'vitest';

import { resolveInboundContent } from '../src/capabilities/chat/resolveInbound';

describe('content resolution capability slice', () => {
  it('keeps text messages as text modality', async () => {
    const stt = {
      transcribe: vi.fn(async () => ({ transcript: 'should-not-run', confidence: 1, latencyMs: 1 }))
    };

    const resolved = await resolveInboundContent({
      message: {
        from: '+15550000000',
        body: 'hello',
        fromMe: false
      },
      sttProvider: stt,
      config: {
        audioStoragePath: './data/test-audio',
        agentLanguage: 'en'
      }
    });

    expect(resolved).toEqual({ contentText: 'hello', inputModality: 'text' });
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it('uses STT for voice messages and passes language hint', async () => {
    const transcribe = vi.fn(async () => ({ transcript: 'bom dia', confidence: 1, latencyMs: 10 }));

    const resolved = await resolveInboundContent({
      message: {
        from: '+15550000000',
        body: '',
        fromMe: false,
        hasMedia: true,
        type: 'ptt',
        downloadMedia: async () => ({
          data: Buffer.from('voice').toString('base64'),
          mimetype: 'audio/ogg',
          filename: null
        })
      },
      sttProvider: {
        transcribe
      },
      config: {
        audioStoragePath: './data/test-audio',
        agentLanguage: 'pt'
      }
    });

    expect(resolved).toEqual({ contentText: 'bom dia', inputModality: 'voice' });
    expect(transcribe).toHaveBeenCalledTimes(1);
    const calls = transcribe.mock.calls as unknown as Array<[{ language: string }]>;
    expect(calls[0]?.[0]).toMatchObject({ language: 'pt' });
  });

  it('falls back to text body when STT call exceeds timeout', async () => {
    const resolved = await resolveInboundContent({
      message: {
        from: '+15550000000',
        body: 'fallback body',
        fromMe: false,
        hasMedia: true,
        type: 'ptt',
        downloadMedia: async () => ({
          data: Buffer.from('voice').toString('base64'),
          mimetype: 'audio/ogg',
          filename: null
        })
      },
      sttProvider: {
        transcribe: async () => {
          await new Promise(() => {
            return;
          });
          return { transcript: 'never', confidence: 1, latencyMs: 1 };
        }
      },
      config: {
        audioStoragePath: './data/test-audio',
        agentLanguage: 'pt',
        sttTimeoutMs: 20
      } as never
    });

    expect(resolved).toEqual({ contentText: 'fallback body', inputModality: 'text' });
  });

  it('retries STT on transient failure and succeeds on second attempt', async () => {
    let calls = 0;
    const resolved = await resolveInboundContent({
      message: {
        from: '+15550000000',
        body: '',
        fromMe: false,
        hasMedia: true,
        type: 'ptt',
        downloadMedia: async () => ({
          data: Buffer.from('voice').toString('base64'),
          mimetype: 'audio/ogg',
          filename: null
        })
      },
      sttProvider: {
        transcribe: async () => {
          calls += 1;
          if (calls === 1) {
            throw new Error('temporary stt outage');
          }
          return { transcript: 'retry success', confidence: 1, latencyMs: 1 };
        }
      },
      config: {
        audioStoragePath: './data/test-audio',
        agentLanguage: 'pt',
        sttTimeoutMs: 2000,
        maxIdempotentRetries: 2,
        retryBaseDelayMs: 1,
        retryJitterMs: 0
      } as never
    });

    expect(calls).toBe(2);
    expect(resolved).toEqual({ contentText: 'retry success', inputModality: 'voice' });
  });
});
