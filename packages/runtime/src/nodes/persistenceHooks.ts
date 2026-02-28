import { defineNode } from '@zupa/engine';
import { type RuntimeEngineContext } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * persistence_hooks
 */
export const persistenceHooksNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { resources, state } = context;
  const session = state.session;

  if (session && state.llmResponse) {
    await resources.database.incrementSessionMessageCount(session.id);

    // Persist assistant reply to the Ledger
    await resources.database.createMessage({
      sessionId: session.id,
      userId: state.user!.id,
      role: 'assistant',
      contentText: state.llmResponse.content || '', // content is null for structured, but we store the text if available
      inputModality: 'text', // assistant messages don't have input modality
      outputModality: state.outputModality || 'text',
      tokensUsed: state.llmResponse.tokensUsed,
      latencyMs: state.llmResponse.latencyMs,
      metadata: state.llmResponse.structured as Record<string, unknown> || {}
    });
  }

  return {
    stateDiff: {},
    nextTasks: ['telemetry_emit']
  };
});
