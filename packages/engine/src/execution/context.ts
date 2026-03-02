import {
  type RuntimeEngineContext,
  type RuntimeConfig,
  type RuntimeEngineResources,
  type InboundMessage,
  type Logger,
  normalizeExternalUserId,
  resolveReplyTarget
} from '@zupa/core';

export interface CreateInitialRuntimeContextInput<T = any> {
  requestId: string;
  startedAt: Date;
  runtimeConfig: RuntimeConfig<T>;
  inbound: InboundMessage;
  runtimeResources: RuntimeEngineResources;
  logger: Logger;
}

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
    logger: input.logger
  };
}
