import { describe, expect, it } from 'vitest';
import {
  FakeMessagingTransport,
  createFakeRuntimeDeps,
  createFakeRuntimeConfig,
  DEFAULT_USER
} from '@zupa/testing';
import {
  buildCommandRegistry,
  dispatchCommandIfPresent,
  AgentRuntime
} from '../src/index';
import { type AgentContext } from '@zupa/core';

describe('commands capability slice', () => {
  it('registers commands and dispatches them when a keyword is found', async () => {
    const deps = createFakeRuntimeDeps();
    const runtimeConfig = createFakeRuntimeConfig({
      commands: {
        info: {
          description: 'Show info',
          handler: async (ctx: AgentContext) => {
            await ctx.resources.transport.sendText(ctx.replyTarget, 'Info is here!');
          }
        }
      }
    });

    const runtime = new AgentRuntime({
      runtimeConfig,
      runtimeResources: deps
    });

    await runtime.start();
    const user = await deps.database.createUser(DEFAULT_USER);
    const session = await deps.database.createSession(user.id);

    const context: any = {
      message: { from: DEFAULT_USER.externalUserId, body: '/info' },
      user,
      session: { ...session, kv: {} },
      replyTarget: DEFAULT_USER.externalUserId,
      resources: deps
    };

    const registry = buildCommandRegistry(runtimeConfig.commands || {});
    const handled = await dispatchCommandIfPresent({
      rawText: '/info',
      commandContext: context,
      commandRegistry: registry,
      llm: deps.llm
    });

    expect(handled).toBe(true);
    const transport = deps.transport as FakeMessagingTransport;
    expect(transport.getSentMessages().some(m => m.text === 'Info is here!')).toBe(true);
    await runtime.close();
  });
});
