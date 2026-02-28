import { describe, expect, it, vi } from 'vitest';

import { finalizeResponse } from '../src/capabilities/chat/finalizeResponse';

describe('response capability slice', () => {
  it('synthesizes and sends voice when voice modality is preferred and TTS succeeds', async () => {
    const sendVoice = vi.fn(async () => {
      return;
    });

    const result = await finalizeResponse({
      input: {
        replyTarget: '15550000000@c.us',
        replyText: 'bom dia',
        preferredVoiceReply: true,
        userId: 'u1',
        sessionId: 's1'
      },
      messaging: {
        sendText: vi.fn(async () => {
          return;
        }),
        sendVoice,
        sendMedia: vi.fn(async () => {
          return;
        }),
        sendTyping: vi.fn(async () => {
          return;
        }),
      },
      ttsProvider: {
        synthesize: vi.fn(async () => ({
          audioPath: '/tmp/voxpal/outbound.ogg',
          durationSeconds: 1,
          latencyMs: 10
        }))
      },
      config: {
        audioStoragePath: '/tmp/voxpal',
        ttsVoice: 'nova',
        agentLanguage: 'pt'
      }
    });

    expect(result.outputModality).toBe('voice');
    expect(result.contentAudioUrl).toBe('outbound.ogg');
    expect(sendVoice).toHaveBeenCalledWith('15550000000@c.us', '/tmp/voxpal/outbound.ogg');
  });

  it('falls back to text when TTS fails', async () => {
    const sendText = vi.fn(async () => {
      return;
    });

    const result = await finalizeResponse({
      input: {
        replyTarget: '15550000000@c.us',
        replyText: 'hello',
        preferredVoiceReply: true,
        userId: 'u1',
        sessionId: 's1'
      },
      messaging: {
        sendText,
        sendVoice: vi.fn(async () => {
          return;
        }),
        sendMedia: vi.fn(async () => {
          return;
        }),
        sendTyping: vi.fn(async () => {
          return;
        }),
      },
      ttsProvider: {
        synthesize: vi.fn(async () => {
          throw new Error('tts timeout');
        })
      },
      config: {
        audioStoragePath: '/tmp/voxpal',
        ttsVoice: 'alloy',
        agentLanguage: 'en'
      }
    });

    expect(result).toEqual({ outputModality: 'text', contentAudioUrl: null });
    expect(sendText).toHaveBeenCalledWith('15550000000@c.us', 'hello');
  });

  it('falls back to text when TTS call exceeds timeout', async () => {
    const sendText = vi.fn(async () => {
      return;
    });

    const result = await finalizeResponse({
      input: {
        replyTarget: '15550000000@c.us',
        replyText: 'hello',
        preferredVoiceReply: true,
        userId: 'u1',
        sessionId: 's1'
      },
      messaging: {
        sendText,
        sendVoice: vi.fn(async () => {
          return;
        }),
        sendMedia: vi.fn(async () => {
          return;
        }),
        sendTyping: vi.fn(async () => {
          return;
        }),
      },
      ttsProvider: {
        synthesize: vi.fn(async () => {
          await new Promise(() => {
            return;
          });
          return { audioPath: '/tmp/never.ogg', durationSeconds: 0, latencyMs: 0 };
        })
      },
      config: {
        audioStoragePath: '/tmp/voxpal',
        ttsVoice: 'alloy',
        agentLanguage: 'en',
        ttsTimeoutMs: 20
      } as never
    });

    expect(result).toEqual({ outputModality: 'text', contentAudioUrl: null });
    expect(sendText).toHaveBeenCalledWith('15550000000@c.us', 'hello');
  });

  it('retries TTS on transient failure and still sends voice', async () => {
    const sendVoice = vi.fn(async () => {
      return;
    });
    const sendText = vi.fn(async () => {
      return;
    });
    let calls = 0;

    const result = await finalizeResponse({
      input: {
        replyTarget: '15550000000@c.us',
        replyText: 'hello',
        preferredVoiceReply: true,
        userId: 'u1',
        sessionId: 's1'
      },
      messaging: {
        sendText,
        sendVoice,
        sendMedia: vi.fn(async () => {
          return;
        }),
        sendTyping: vi.fn(async () => {
          return;
        }),
      },
      ttsProvider: {
        synthesize: vi.fn(async () => {
          calls += 1;
          if (calls === 1) {
            throw new Error('temporary tts outage');
          }
          return { audioPath: '/tmp/voxpal/retried.ogg', durationSeconds: 1, latencyMs: 5 };
        })
      },
      config: {
        audioStoragePath: '/tmp/voxpal',
        ttsVoice: 'alloy',
        agentLanguage: 'en',
        ttsTimeoutMs: 500,
        maxIdempotentRetries: 2,
        retryBaseDelayMs: 1,
        retryJitterMs: 0
      } as never
    });

    expect(calls).toBe(2);
    expect(result).toEqual({ outputModality: 'voice', contentAudioUrl: 'retried.ogg' });
    expect(sendVoice).toHaveBeenCalledTimes(1);
    expect(sendText).not.toHaveBeenCalled();
  });
});
