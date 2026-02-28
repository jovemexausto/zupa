import { defineNode } from '@zupa/engine';
import {
  buildCommandRegistry,
  dispatchCommandIfPresent,
  type RuntimeEngineContext,
  type ActiveSession
} from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * command_dispatch_gate
 */
export const commandDispatchGateNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { state, config, resources, inbound } = context;

  if (typeof state.commandHandled === 'boolean') {
    return { stateDiff: {}, nextTasks: ['response_finalize'] };
  }

  if (state.inboundDuplicate === true) {
    return { stateDiff: { commandHandled: true }, nextTasks: [] };
  }

  const user = state.user;
  const session = state.session;
  const replyTarget = state.replyTarget;

  if (!user || !session || !replyTarget) {
    return { stateDiff: { commandHandled: true }, nextTasks: [] };
  }

  const recentMessagesCount = await resources.database.countUserMessagesSince(
    user.id,
    new Date(Date.now() - 60_000)
  );

  // TODO: why are rate limits hardcoded here? right on command dispatch gate?
  // It's not look like the best place to handle this
  if (recentMessagesCount >= (config.rateLimitPerUserPerMinute ?? 20)) {
    await resources.transport.sendText(
      replyTarget,
      'You are sending messages too quickly. Please wait a moment and try again.'
    );
    return { stateDiff: { commandHandled: true }, nextTasks: [] };
  }

  if (state.createdUser === true && config.welcomeMessage?.trim()) {
    await resources.transport.sendText(replyTarget, config.welcomeMessage.trim());
  }

  const handled = await dispatchCommandIfPresent({
    rawText: inbound.body,
    commandRegistry: buildCommandRegistry(config.commands),
    commandContext: {
      user,
      session: session as ActiveSession,
      inbound,
      language: config.language,
      replyTarget,
      resources,
      config,
      endSession: async () => {
        const summary = `Session ended at ${new Date().toISOString()}`;
        await resources.database.endSession(session.id, summary);
      }
    },
    llm: resources.llm
  });

  return {
    stateDiff: { commandHandled: handled },
    nextTasks: handled ? ['response_finalize'] : ['content_resolution']
  };
});
