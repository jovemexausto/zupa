import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildCommandRegistry } from '../src/capabilities/commands/registry';
import { dispatchCommandIfPresent } from '../src/capabilities/commands/dispatch';
import { resolveInboundContent } from '../src/capabilities/chat/resolveInbound';
import { finalizeResponse } from '../src/capabilities/chat/finalizeResponse';
import { SessionKVStore } from '../src/capabilities/session/kv';
import { dispatchToolCall } from '../src/capabilities/tools/dispatch';
import { executeKernelPipeline } from '../src/core/kernel/execute';
import { FakeDatabaseBackend } from '../src/integrations/database/fake';
import { FakeMessagingTransport } from '../src/integrations/transport/fake';
import { FakeLLMProvider, FakeSTTProvider, FakeTTSProvider } from '../src/testing/fakes';

describe('zupa e2e', () => {
  const llm = new FakeLLMProvider([
    {
      content: null,
      structured: { reply: 'ok' },
      toolCalls: [],
      tokensUsed: { promptTokens: 0, completionTokens: 0 },
      model: 'fake',
      latencyMs: 1
    }
  ]);
  const sttProvider = new FakeSTTProvider();
  const ttsProvider = new FakeTTSProvider();

  const runtimeConfig = {
    prompt: 'system',
    language: 'en' as const,
  };

  it('short-circuits command path before non-command phases', async () => {
    const db = new FakeDatabaseBackend();
    const messaging = new FakeMessagingTransport();
    const storage = { put: async () => 'f', get: async () => Buffer.alloc(0) }
    const vectors = { store: async () => undefined, search: async () => [] }
    const user = await db.createUser({ externalUserId: '+15550000000', displayName: 'User' });
    const session = await db.createSession(user.id);
    const sessionWithKv = {
      ...session,
      kv: new SessionKVStore(session.id, db, {})
    };

    const context = await executeKernelPipeline({
      requestId: 'req_123',
      startedAt: new Date(),
      runtimeConfig,
      runtimeResources: {
        transport: messaging,
        llm,
        stt: sttProvider,
        tts: ttsProvider,
        storage,
        vectors,
        database: db,
        telemetry: { emit() {} }
      },
      inbound: { from: user.externalUserId, body: '/usage', fromMe: false },
      handlers: {
        session_attach: async (ctx) => {
          ctx.state.user = user;
          ctx.state.session = sessionWithKv;
          ctx.state.messaging = messaging;
          ctx.state.db = db;
        },
        command_dispatch_gate: async (ctx) => {
          const inbound = ctx.inbound as { body: string; from: string; fromMe: boolean };
          const resources = {
            transport: messaging,
            llm,
            stt: sttProvider,
            tts: ttsProvider,
            storage,
            vectors,
            database: db,
            telemetry: { emit() {} }
          };
          const handled = await dispatchCommandIfPresent({
            rawText: inbound.body,
            commandRegistry: buildCommandRegistry(),
            commandContext: {
              user,
              session: sessionWithKv,
              inbound,
              language: runtimeConfig.language,
              replyTarget: `${user.externalUserId}@c.us`,
              resources,
              endSession: async () => {
                return;
              }
            },
            llm: {
              complete: async () => ({
                content: null,
                structured: {},
                toolCalls: [],
                tokensUsed: { promptTokens: 0, completionTokens: 0 },
                model: 'fake',
                latencyMs: 0
              })
            }
          });

          ctx.state.commandHandled = handled;
        },
        content_resolution: async (ctx) => {
          if (ctx.state.commandHandled === true) {
            ctx.state.contentResolutionSkipped = true;
            return;
          }

          throw new Error('content_resolution should have been skipped after command handling');
        }
      }
    });

    expect(context.state.commandHandled).toBe(true);
    expect(context.state.contentResolutionSkipped).toBe(true);
    expect(messaging.sentText).toHaveLength(1);
    expect(messaging.sentText[0]?.text).toContain('not available yet');
  });

  it('runs voice -> stt -> tool -> tts response flow through kernel phases', async () => {
    const db = new FakeDatabaseBackend();
    const messaging = new FakeMessagingTransport();
    const storage = { put: async () => 'f', get: async () => Buffer.alloc(0) };
    const vectors = { store: async () => undefined, search: async () => [] };
    const stt = new FakeSTTProvider('ping nova');
    const tts = new FakeTTSProvider();

    const user = await db.createUser({ externalUserId: '+15551112222', displayName: 'Voice User' });
    const session = await db.createSession(user.id);
    const sessionWithKv = {
      ...session,
      kv: new SessionKVStore(session.id, db, {})
    };

    const context = await executeKernelPipeline({
      requestId: 'req_123',
      startedAt: new Date(),
      runtimeConfig: { ...runtimeConfig, language: 'pt' },
      runtimeResources: {
        transport: messaging,
        llm,
        stt: sttProvider,
        tts: ttsProvider,
        storage,
        vectors,
        database: db,
        telemetry: { emit() {} }
      },
      inbound: {
        from: user.externalUserId,
        body: '',
        fromMe: false,
        hasMedia: true,
        type: 'ptt',
        downloadMedia: async () => ({
          data: Buffer.from('voice-bytes').toString('base64'),
          mimetype: 'audio/ogg',
          filename: null
        })
      },
      handlers: {
        session_attach: async (ctx) => {
          ctx.state.user = user;
          ctx.state.session = sessionWithKv;
          ctx.state.messaging = messaging;
          ctx.state.db = db;
        },
        command_dispatch_gate: async (ctx) => {
          const inbound = ctx.inbound;
          const resources = {
            transport: messaging,
            llm,
            stt,
            tts,
            storage,
            vectors,
            database: db,
            telemetry: { emit() {} }
          };
          ctx.state.commandHandled = await dispatchCommandIfPresent({
            rawText: inbound.body,
            commandRegistry: buildCommandRegistry(),
            commandContext: {
              user,
              session: sessionWithKv,
              inbound,
              language: 'pt',
              replyTarget: `${user.externalUserId}@c.us`,
              resources,
              endSession: async () => {
                return;
              }
            },
            llm: {
              complete: async () => ({
                content: null,
                structured: {},
                toolCalls: [],
                tokensUsed: { promptTokens: 0, completionTokens: 0 },
                model: 'fake',
                latencyMs: 0
              })
            }
          });
        },
        content_resolution: async (ctx) => {
          if (ctx.state.commandHandled === true) {
            return;
          }

          const resolved = await resolveInboundContent({
            message: ctx.inbound as never,
            sttProvider: stt,
            config: {
              audioStoragePath: './data/e2e-audio',
              agentLanguage: 'pt'
            }
          });

          ctx.state.content = resolved;
        },
        agentic_loop: async (ctx) => {
          if (ctx.state.commandHandled === true) {
            return;
          }

          const toolResult = await dispatchToolCall({
            toolCall: {
              id: 'tc1',
              name: 'echo',
              arguments: { text: (ctx.state.content as { contentText: string }).contentText }
            },
            tools: [
              {
                name: 'echo',
                description: 'echo text',
                parameters: z.object({ text: z.string() }),
                handler: async (params) => `tool:${(params as { text: string }).text}`
              }
            ],
            context: {
              user,
              session: sessionWithKv,
              inbound: ctx.inbound as { from: string; body: string; fromMe: boolean },
              language: 'pt',
              replyTarget: `${user.externalUserId}@c.us`,
              resources: {
                transport: messaging,
                llm,
                stt,
                tts,
                storage,
                vectors,
                database: db,
                telemetry: { emit() {} }
              },
              endSession: async () => {
                return;
              }
            }
          });

          ctx.state.replyText = toolResult.status === 'ok' ? toolResult.result : toolResult.formatted;
        },
        response_finalize: async (ctx) => {
          if (ctx.state.commandHandled === true) {
            return;
          }

          const final = await finalizeResponse({
            input: {
              replyTarget: `${user.externalUserId}@c.us`,
              replyText: ctx.state.replyText as string,
              preferredVoiceReply: true,
              userId: user.id,
              sessionId: session.id
            },
            ttsProvider: tts,
            messaging,
            config: {
              audioStoragePath: './packages/zupa/data/e2e-audio',
              ttsVoice: 'nova',
              agentLanguage: 'pt'
            }
          });

          ctx.state.final = final;
        }
      }
    });

    expect(context.state.commandHandled).toBe(false);
    expect((context.state.content as { inputModality: string }).inputModality).toBe('voice');
    expect((context.state.replyText as string)).toBe('tool:ping nova');
    expect((context.state.final as { outputModality: string }).outputModality).toBe('voice');
    expect(messaging.sentVoice).toHaveLength(1);
    expect(tts.lastRequest?.language).toBe('pt');
    expect(stt.lastRequest?.language).toBe('pt');
  });
});
