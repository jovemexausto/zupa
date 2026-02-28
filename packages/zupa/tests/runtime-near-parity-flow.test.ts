import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { executeKernelPipeline } from '../src/core/kernel/execute';
import { buildDefaultKernelHandlers } from '../src/core/kernel/phases';
import { createFakeRuntimeDeps } from '../src/testing/fakes';
import { FakeMessagingTransport } from '../src/integrations/transport/fake';

function baseRuntimeConfig() {
  return {
    prompt: 'system',
    language: 'en' as const,
    maxToolIterations: 3,
    maxWorkingMemory: 20,
    maxEpisodicMemory: 3,
    semanticSearchLimit: 3,
    rateLimitPerUserPerMinute: 20,
    ttsVoice: 'alloy',
    audioStoragePath: './data/test-audio',
    fallbackReply: 'fallback'
  };
}

describe('runtime near-parity flow', () => {
  it('deduplicates repeated inbound events by id', async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database;
    const transport = deps.transport as FakeMessagingTransport;

    const inbound = {
      id: 'evt_same_1',
      from: '+15554445555',
      body: 'hello',
      fromMe: false
    };

    await executeKernelPipeline({
      requestId: 'req_dedupe_first',
      startedAt: new Date(),
      runtimeConfig: baseRuntimeConfig(),
      runtimeResources: deps,
      inbound,
      handlers: buildDefaultKernelHandlers()
    });

    const firstMessages = await db.getMessagesWithMetadata(
      ((await db.findUser('+15554445555'))?.id as string),
      new Date(0)
    );
    const firstTextCount = transport.sentText.length;

    const secondContext = await executeKernelPipeline({
      requestId: 'req_dedupe_second',
      startedAt: new Date(),
      runtimeConfig: baseRuntimeConfig(),
      runtimeResources: deps,
      inbound,
      handlers: buildDefaultKernelHandlers()
    });

    const secondMessages = await db.getMessagesWithMetadata(
      ((await db.findUser('+15554445555'))?.id as string),
      new Date(0)
    );

    expect(secondContext.state.commandHandled).toBe(true);
    expect(secondMessages).toHaveLength(firstMessages.length);
    expect(transport.sentText).toHaveLength(firstTextCount);
  });

  it('enforces single-user policy with immediate guard message', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = deps.transport as FakeMessagingTransport;

    const context = await executeKernelPipeline({
      requestId: 'req_guard',
      startedAt: new Date(),
      runtimeConfig: {
        ...baseRuntimeConfig(),
        singleUser: '+15550000000'
      },
      runtimeResources: deps,
      inbound: { from: '+15559999999@c.us', body: 'hello', fromMe: false },
      handlers: buildDefaultKernelHandlers()
    });

    expect(context.state.access).toEqual({ allowed: false, reason: 'single_user_mismatch' });
    expect(context.state.commandHandled).toBe(true);
    expect(transport.sentText[0]?.text).toContain('restricted to a single configured user');
  });

  it('blocks requests when per-user rate limit is exceeded', async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database;
    const transport = deps.transport as FakeMessagingTransport;

    const user = await db.createUser({
      externalUserId: '+15551112222',
      displayName: 'Rate Limited'
    });
    const session = await db.createSession(user.id);
    await db.createMessage({
      sessionId: session.id,
      userId: user.id,
      role: 'user',
      contentText: 'spam',
      inputModality: 'text',
      outputModality: 'text',
      tokensUsed: { promptTokens: 0, completionTokens: 0 },
      latencyMs: 0,
      metadata: {}
    });

    const context = await executeKernelPipeline({
      requestId: 'req_rate_limit',
      startedAt: new Date(),
      runtimeConfig: {
        ...baseRuntimeConfig(),
        rateLimitPerUserPerMinute: 1
      },
      runtimeResources: deps,
      inbound: { from: '+15551112222', body: 'hello', fromMe: false },
      handlers: buildDefaultKernelHandlers()
    });

    expect(context.state.commandHandled).toBe(true);
    expect(transport.sentText.at(-1)?.text).toContain('too quickly');
  });

  it('renders hybrid prompt context and falls back when schema parse path fails', async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database;
    const user = await db.createUser({
      externalUserId: '+15553334444',
      displayName: 'Ana'
    });
    await db.createSession(user.id);

    let calls = 0;
    deps.llm = {
      async complete(options) {
        calls += 1;
        if (options.outputSchema) {
          throw new Error('structured parse failed');
        }

        return {
          content: 'fallback llm text',
          structured: null,
          toolCalls: [],
          tokensUsed: { promptTokens: 1, completionTokens: 1 },
          model: 'fake',
          latencyMs: 1
        };
      }
    };

    const context = await executeKernelPipeline({
      requestId: 'req_prompt_schema',
      startedAt: new Date(),
      runtimeConfig: {
        ...baseRuntimeConfig(),
        prompt: async () => 'Hi {{ user.displayName }} :: {{ custom }}',
        outputSchema: z.object({ reply: z.string() }),
        context: async () => ({ custom: 'CTX' })
      },
      runtimeResources: deps,
      inbound: { from: '+15553334444', body: 'hello', fromMe: false },
      handlers: buildDefaultKernelHandlers()
    });

    const promptInput = context.state.promptInput as { systemPrompt: string };
    expect(promptInput.systemPrompt).toContain('Ana');
    expect(promptInput.systemPrompt).toContain('CTX');
    expect(calls).toBe(2);
    expect((context.state.replyDraft as { text: string }).text).toBe('fallback llm text');
  });

  it('uses fallback reply when llm call exceeds configured timeout', async () => {
    const deps = createFakeRuntimeDeps();
    deps.llm = {
      async complete() {
        await new Promise(() => {
          return;
        });
        return {
          content: null,
          structured: null,
          toolCalls: [],
          tokensUsed: { promptTokens: 0, completionTokens: 0 },
          model: 'fake',
          latencyMs: 1
        };
      }
    };

    const context = await executeKernelPipeline({
      requestId: 'req_llm_timeout',
      startedAt: new Date(),
      runtimeConfig: {
        ...baseRuntimeConfig(),
        llmTimeoutMs: 20,
        fallbackReply: 'timeout fallback'
      } as never,
      runtimeResources: deps,
      inbound: { from: '+15553330000', body: 'hello', fromMe: false, id: 'evt_llm_timeout' },
      handlers: buildDefaultKernelHandlers()
    });

    expect((context.state.replyDraft as { text: string }).text).toBe('timeout fallback');
  });

  it('retries llm on transient failure and keeps successful response', async () => {
    const deps = createFakeRuntimeDeps();
    let calls = 0;
    deps.llm = {
      async complete() {
        calls += 1;
        if (calls === 1) {
          throw new Error('temporary network error');
        }
        return {
          content: 'retried llm reply',
          structured: null,
          toolCalls: [],
          tokensUsed: { promptTokens: 1, completionTokens: 1 },
          model: 'fake',
          latencyMs: 1
        };
      }
    };

    const context = await executeKernelPipeline({
      requestId: 'req_llm_retry',
      startedAt: new Date(),
      runtimeConfig: {
        ...baseRuntimeConfig(),
        maxIdempotentRetries: 2,
        retryBaseDelayMs: 1,
        retryJitterMs: 0
      } as never,
      runtimeResources: deps,
      inbound: { from: '+15553339999', body: 'hello', fromMe: false, id: 'evt_llm_retry' },
      handlers: buildDefaultKernelHandlers()
    });

    expect(calls).toBe(2);
    expect((context.state.replyDraft as { text: string }).text).toBe('retried llm reply');
  });

  it('expires stale active session and creates a new one', async () => {
    const deps = createFakeRuntimeDeps();
    const db = deps.database;
    const user = await db.createUser({
      externalUserId: '+15558889999',
      displayName: 'Idle User'
    });
    const staleSession = await db.createSession(user.id);
    staleSession.startedAt = new Date(Date.now() - (31 * 60_000));

    const context = await executeKernelPipeline({
      requestId: 'req_idle_expire',
      startedAt: new Date(),
      runtimeConfig: {
        ...baseRuntimeConfig(),
        sessionIdleTimeoutMinutes: 30
      } as never,
      runtimeResources: deps,
      inbound: { from: '+15558889999', body: 'hello', fromMe: false, id: 'evt_idle_expire' },
      handlers: buildDefaultKernelHandlers()
    });

    const sessionRef = context.state.sessionRef as { id: string };
    expect(sessionRef.id).not.toBe(staleSession.id);
    const summaries = await db.getRecentSummaries(user.id, 5);
    expect(summaries.join(' ')).toContain('inactive');
  });
});
