import { describe, expect, it, vi } from 'vitest';

import { buildCommandRegistry } from '../src/capabilities/commands/registry';
import { dispatchCommandIfPresent } from '../src/capabilities/commands/dispatch';

describe('commands capability slice', () => {
  it('keeps built-ins and custom commands in new slice entrypoints', async () => {
    const sendText = vi.fn(async () => {
      return;
    });
    const transport = {
      sendText,
      sendVoice: vi.fn(async () => {
        return;
      }),
      sendMedia: vi.fn(async () => {
        return;
      }),
      sendTyping: vi.fn(async () => {
        return;
      })
    };
    const handled = await dispatchCommandIfPresent({
      rawText: '/help',
      commandRegistry: buildCommandRegistry({
        ping: {
          description: 'ping command',
          handler: async () => {
            return;
          }
        }
      }),
      commandContext: {
        user: {
          id: 'u1',
          externalUserId: '+15550000000',
          displayName: 'Test User',
          preferences: {},
          createdAt: new Date(),
          lastActiveAt: new Date()
        },
        session: {
          id: 's1',
          userId: 'u1',
          startedAt: new Date(),
          endedAt: null,
          summary: null,
          messageCount: 0,
          metadata: {},
          kv: {
            get: async () => null,
            set: async () => {
              return;
            },
            delete: async () => {
              return;
            },
            all: async () => ({})
          }
        },
        inbound: {
          from: '+15550000000',
          body: '/help',
          fromMe: false
        },
        language: 'en',
        replyTarget: '15550000000@c.us',
        resources: {
          transport,
          llm: {
            complete: vi.fn(async () => ({
              content: null,
              structured: {},
              toolCalls: [],
              tokensUsed: { promptTokens: 0, completionTokens: 0 },
              model: 'test',
              latencyMs: 1
            }))
          },
          stt: { transcribe: vi.fn(async () => ({ transcript: '', confidence: 1, latencyMs: 1 })) },
          tts: { synthesize: vi.fn(async () => ({ audioPath: '', durationSeconds: 0, latencyMs: 1 })) },
          storage: { put: vi.fn(async () => 'f'), get: vi.fn(async () => Buffer.alloc(0)) },
          vectors: { store: vi.fn(async () => undefined), search: vi.fn(async () => []) },
          database: {} as never,
          telemetry: { emit: vi.fn() }
        },
        endSession: vi.fn(async () => {
          return;
        })
      },
      llm: {
        complete: vi.fn(async () => ({
          content: null,
          structured: {},
          toolCalls: [],
          tokensUsed: { promptTokens: 0, completionTokens: 0 },
          model: 'test',
          latencyMs: 1
        }))
      }
    });

    expect(handled).toBe(true);
    const calls = sendText.mock.calls as unknown as Array<[string, string]>;
    const helpText = calls[0]?.[1];
    expect(typeof helpText).toBe('string');
    expect(helpText).toContain('/reset');
    expect(helpText).toContain('/usage');
    expect(helpText).toContain('/ping');
  });
});
