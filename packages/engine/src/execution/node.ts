import {
  type NodeResult
} from '@zupa/core';

export interface PregelNode<TState, TContext, TStateDiff = Partial<TState>> {
  (context: TContext & { state: Readonly<TState> }): Promise<NodeResult<TStateDiff>>;
}

/**
 * High-level helper to define a Pregel graph node with type safety.
 */
export function defineNode<TState = any, TContext = any, TStateDiff = Partial<TState>>(
  handler: (context: TContext & { state: Readonly<TState> }) => Promise<NodeResult<TStateDiff>>
): PregelNode<TState, TContext, TStateDiff> {
  return handler;
}
