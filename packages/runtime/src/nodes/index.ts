import {
  RuntimeEngineContext,
  EngineNodeName,
  NodeResult,
  Session,
  ActiveSession,
  User,
  InboundMessage,
  LLMResponse,
  Message,
  VectorSearchResult,
  KVStore
} from '@zupa/core';
import { accessPolicyNode } from './accessPolicy';
import { eventDedupGateNode } from './eventDedupGate';
import { llmNodeNode } from './llmNode';
import { toolExecutionNodeNode } from './toolExecutionNode';
import { commandDispatchGateNode } from './commandDispatchGate';
import { contentResolutionNode } from './contentResolution';
import { contextAssemblyNode } from './contextAssembly';
import { persistenceHooksNode } from './persistenceHooks';
import { promptBuildNode } from './promptBuild';
import { responseFinalizeNode } from './responseFinalize';
import { sessionAttachNode } from './sessionAttach';
import { telemetryEmitNode } from './telemetryEmit';

/**
 * Defines the shared state schema for the Zupa agent runtime graph.
 */
export interface RuntimeState {
  session?: Session | ActiveSession;
  user?: User;
  replyTarget?: string;
  inboundDuplicate?: boolean;
  createdUser?: boolean;
  resolvedContent?: string;
  inbound?: InboundMessage;
  commandHandled?: boolean;
  /**
   * Session scratchpad — developer-owned KV store.
   * Lives as a top-level graph state field so it is checkpointed at every
   * node transition, guaranteeing deterministic time-travel and resumability.
   * Values must be strictly JSON-serializable (validated by GraphKVStore).
   */
  kv?: KVStore;
  assembledContext?: {
    history: Message[];
    relevantMemories?: VectorSearchResult[];
    summaries?: string[];
  };
  builtPrompt?: string;
  llmResponse?: LLMResponse;
  toolResults?: Array<{ toolCallId: string; result: string }>;
}

/** Handler type for the Pregel executor – returns a NodeResult. */
export type RuntimeNodeHandler<T = unknown> = (
  context: RuntimeEngineContext<T> & { state: Readonly<RuntimeState> }
) => Promise<NodeResult<Partial<RuntimeState>>>;

export type RuntimeNodeHandlerMap<T = unknown> = Record<EngineNodeName, RuntimeNodeHandler<T>>;

export function buildDefaultNodeHandlers<T = unknown>(): RuntimeNodeHandlerMap<T> {
  return {
    event_dedup_gate: eventDedupGateNode as RuntimeNodeHandler<T>,
    access_policy: accessPolicyNode as RuntimeNodeHandler<T>,
    session_attach: sessionAttachNode as RuntimeNodeHandler<T>,
    command_dispatch_gate: commandDispatchGateNode as RuntimeNodeHandler<T>,
    content_resolution: contentResolutionNode as RuntimeNodeHandler<T>,
    context_assembly: contextAssemblyNode as RuntimeNodeHandler<T>,
    prompt_build: promptBuildNode as RuntimeNodeHandler<T>,
    llm_node: llmNodeNode as RuntimeNodeHandler<T>,
    tool_execution_node: toolExecutionNodeNode as RuntimeNodeHandler<T>,
    response_finalize: responseFinalizeNode as RuntimeNodeHandler<T>,
    persistence_hooks: persistenceHooksNode as RuntimeNodeHandler<T>,
    telemetry_emit: telemetryEmitNode as RuntimeNodeHandler<T>
  };
}
// TODO: Remove this
export { RuntimeNodeHandler as EngineNodeHandler, RuntimeNodeHandlerMap as EngineNodeHandlerMap };
