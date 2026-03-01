import type {
  EngineNodeName,
  RuntimeEngineContext,
  RuntimeEngineResources,
  InboundMessage,
  RuntimeConfig,
  NodeResult
} from '@zupa/core';

export interface CreateInitialRuntimeContextInput {
  requestId: string;
  startedAt: Date;
  inbound: InboundMessage;
  runtimeConfig: RuntimeConfig;
  runtimeResources: RuntimeEngineResources;
}

/** Pregel-native graph node contract. */
export interface RuntimeEngineNode {
  name: EngineNodeName;
  run(context: RuntimeEngineContext): Promise<NodeResult>;
}

export interface RuntimeEngineNodeHooks {
  onNodeStart?(event: { node: EngineNodeName; context: RuntimeEngineContext }): void;
  onNodeEnd?(event: { node: EngineNodeName; context: RuntimeEngineContext; durationMs: number }): void;
  onNodeError?(event: { node: EngineNodeName; context: RuntimeEngineContext; error: unknown }): void;
}
