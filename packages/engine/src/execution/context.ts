import {
  type EngineNodeName,
  type RuntimeEngineContext,
  type RuntimeConfig,
  type RuntimeEngineResources,
  type InboundMessage,
  normalizeExternalUserId,
  resolveReplyTarget
} from '@zupa/core';

export interface CreateInitialRuntimeContextInput<T = any> {
  requestId: string;
  startedAt: Date;
  runtimeConfig: RuntimeConfig<T>;
  inbound: InboundMessage;
  runtimeResources: RuntimeEngineResources;
}

export const ENGINE_NODE_ORDER: readonly EngineNodeName[] = [
  'access_policy',
  'session_attach',
  'command_dispatch_gate',
  'content_resolution',
  'context_assembly',
  'prompt_build',
  'llm_node',
  'tool_execution_node',
  'response_finalize',
  'persistence_hooks',
  'telemetry_emit'
] as const;

export function createInitialRuntimeContext<T = any>(input: CreateInitialRuntimeContextInput<T>): RuntimeEngineContext<T> {
  return {
    meta: {
      requestId: input.requestId,
      startedAt: input.startedAt
    },
    config: input.runtimeConfig,
    inbound: input.inbound,
    resources: input.runtimeResources,
    state: {
      replyTarget: resolveReplyTarget(input.inbound.from, normalizeExternalUserId(input.inbound.from))
    },
    transport: input.runtimeResources.transport,
    telemetry: {
      nodeDurationsMs: {}
    }
  };
}
