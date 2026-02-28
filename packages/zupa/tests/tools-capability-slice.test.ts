import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { executeToolLifecycle } from '../src/capabilities/tools/hooks';
import { dispatchToolCall } from '../src/capabilities/tools/dispatch';
import { MessagingTransportPort } from '../src';
import { AgentContext } from '../src/core/domain';

describe('tools capability slice', () => {
  const messaging = {
    sendText: async () => {
      return;
    },
    sendVoice: async () => {
      return;
    },
    sendMedia: async () => {
      return;
    },
    sendTyping: async () => {
      return;
    }
  } as MessagingTransportPort;


  const ctx: AgentContext = {
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
      body: 'hello',
      fromMe: false
    },
    language: 'en',
    replyTarget: '+15550000000',
    resources: {
      transport: messaging,
      llm: {
        complete: async () => ({
          content: null,
          structured: null,
          toolCalls: [],
          tokensUsed: { promptTokens: 0, completionTokens: 0 },
          model: 'fake',
          latencyMs: 1
        })
      },
      stt: { transcribe: async () => ({ transcript: '', confidence: 1, latencyMs: 1 }) },
      tts: { synthesize: async () => ({ audioPath: '/tmp/out.ogg', durationSeconds: 1, latencyMs: 1 }) },
      storage: { put: async () => 'f', get: async () => Buffer.alloc(0) },
      vectors: { store: async () => undefined, search: async () => [] },
      database: {} as never,
      telemetry: { emit() {} }
    },
    endSession: async () => {
      return;
    }
  };

  it('executes before -> handler -> after deterministically', async () => {
    const order: string[] = [];
    const result = await executeToolLifecycle({
      tool: {
        name: 'search',
        description: 'Search records',
        parameters: z.object({ query: z.string() }),
        before: async (params) => {
          order.push('before');
          return { query: params.query.toUpperCase() };
        },
        handler: async (params) => {
          order.push(`handler:${params.query}`);
          return 'raw-result';
        },
        after: async (_params, handlerResult) => {
          order.push('after');
          return `${handlerResult}:processed`;
        }
      },
      params: { query: 'apple' },
      context: ctx
    });

    expect(order).toEqual(['before', 'handler:APPLE', 'after']);
    expect(result).toEqual({ status: 'ok', result: 'raw-result:processed' });
  });

  it('formats recoverable hook/handler errors for runtime loop consumption', async () => {
    const result = await executeToolLifecycle({
      tool: {
        name: 'search',
        description: 'Search records',
        parameters: z.object({ query: z.string() }),
        handler: async () => {
          throw new Error('upstream timeout');
        }
      },
      params: { query: 'apple' },
      context: ctx
    });

    expect(result).toEqual({
      status: 'recoverable_error',
      formatted: 'Tool search failed: upstream timeout'
    });
  });

  it('times out long-running tool execution with recoverable error', async () => {
    const result = await executeToolLifecycle({
      tool: {
        name: 'search',
        description: 'Search records',
        parameters: z.object({ query: z.string() }),
        handler: async () => {
          await new Promise(() => {
            return;
          });
          return 'never';
        }
      },
      params: { query: 'apple' },
      context: ctx,
      timeoutMs: 20
    } as never);

    expect(result.status).toBe('recoverable_error');
    expect((result as { formatted: string }).formatted).toContain('timed out');
  });

  it('validates tool params before execution in dispatch', async () => {
    const result = await dispatchToolCall({
      toolCall: {
        id: 'tc1',
        name: 'math',
        arguments: { a: 'x' }
      },
      tools: [
        {
              name: 'math',
              description: 'do math',
              parameters: z.object({ a: z.number() }),
              handler: async (params) => String((params as { a: number }).a)
            }
          ],
          context: ctx
        });

    expect(result.status).toBe('recoverable_error');
    expect((result as { formatted: string }).formatted).toContain('Invalid tool params for math:');
  });
});
