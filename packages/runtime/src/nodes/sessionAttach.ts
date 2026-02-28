import { defineNode } from '@zupa/engine';
import { type RuntimeEngineContext, type User, type ActiveSession, GraphKVStore } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * session_attach
 *
 * Fetches or creates the active session, then binds the graph-native KV store.
 * The KV state lives at RuntimeState.kv (top-level) and is checkpointed by the
 * engine on every node transition, guaranteeing deterministic resumability.
 */
export const sessionAttachNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { resources, state } = context;
  const user = state.user as User;

  if (!user) {
    return { stateDiff: {}, nextTasks: ['command_dispatch_gate'] };
  }

  let session = await resources.database.findActiveSession(user.id);
  if (!session) {
    session = await resources.database.createSession(user.id);
  }

  // Initialize the KV store from existing runtime state, or start fresh.
  // The KVStore object is shared by reference: mutations via GraphKVStore.set()
  // are visible in the state immediately and captured by the Engine's checkpoint.
  const kv = new GraphKVStore(state.kv ?? {});
  const activeSession: ActiveSession = { ...session, kv };

  return {
    stateDiff: {
      session: activeSession,
      kv: await kv.all() // ensure top-level RuntimeState.kv is initialized
    },
    nextTasks: ['command_dispatch_gate']
  };
});
