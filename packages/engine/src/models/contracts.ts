import type {
  KernelNodeName,
  RuntimeKernelContext,
  RuntimeKernelResources,
  InboundMessage,
  RuntimeConfig,
  NodeResult
} from '@zupa/core';

export interface CreateInitialRuntimeContextInput {
  requestId: string;
  startedAt: Date;
  inbound: InboundMessage;
  runtimeConfig: RuntimeConfig;
  runtimeResources: RuntimeKernelResources;
}

/** Legacy mutation-based node interface. */
export interface RuntimeKernelLegacyNode {
  name: KernelNodeName;
  run(context: RuntimeKernelContext): Promise<void>;
}

/** Pregel-native graph node contract. */
export interface RuntimeKernelNode {
  name: KernelNodeName;
  run(context: RuntimeKernelContext): Promise<NodeResult>;
}

export interface RuntimeKernelNodeHooks {
  onNodeStart?(event: { node: KernelNodeName; context: RuntimeKernelContext }): void;
  onNodeEnd?(event: { node: KernelNodeName; context: RuntimeKernelContext; durationMs: number }): void;
  onNodeError?(event: { node: KernelNodeName; context: RuntimeKernelContext; error: unknown }): void;
}
