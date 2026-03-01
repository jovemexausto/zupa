import { defineNode } from '@zupa/engine';
import { normalizeExternalUserId, resolveReplyTarget, type RuntimeEngineContext, GraphAgentStateStore, type ActiveSession } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * access_policy
 *
 * Checks user-level restrictions and hydrates the ActiveSession with its KV store.
 * The user and session records are pre-resolved in AgentRuntime to ensure consistent threadId.
 */
export const accessPolicyNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { state, config, resources } = context;
  const inboundFrom = context.inbound.from;
  const inboundExternalUserId = normalizeExternalUserId(inboundFrom);
  const singleUser = config.singleUser;

  // 1. Check restrictions
  if (singleUser && inboundExternalUserId !== singleUser) {
    const replyTarget = resolveReplyTarget(inboundFrom, inboundExternalUserId);
    await resources.transport.sendText(
      replyTarget,
      'This agent is currently restricted to a single configured user.'
    );
    return {
      stateDiff: {},
      nextTasks: [] // exit graph
    };
  }

  // 2. Hydrate ActiveSession with agent state store
  // The session record was pre-loaded by AgentRuntime.
  // We wrap the state's `agentState` field (loaded from checkpoint) into the GraphAgentStateStore manager.
  if (state.session) {
    const stateStore = new GraphAgentStateStore(state.agentState ?? {});
    const activeSession: ActiveSession = { ...state.session, agentState: stateStore };

    return {
      stateDiff: {
        session: activeSession,
        agentState: await stateStore.all()
      },
      nextTasks: ['command_dispatch_gate']
    };
  }

  return {
    stateDiff: {},
    nextTasks: ['command_dispatch_gate']
  };
});
