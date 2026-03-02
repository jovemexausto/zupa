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
  KVStore,
  AgentState,
  JsonValue
} from '@zupa/core';
import { accessPolicyNode } from './accessPolicy';
import { eventDedupGateNode } from './eventDedupGate';
import { llmNode } from './llmNode';
import { toolExecutionNodeNode } from './toolExecutionNode';
import { commandDispatchGateNode } from './commandDispatchGate';
import { contentResolutionNode } from './contentResolution';
import { contextAssemblyNode } from './contextAssembly';
import { persistenceHooksNode } from './persistenceHooks';
import { promptBuildNode } from './promptBuild';
import { responseFinalizeNode } from './responseFinalize';

import { interactiveStreamingNode } from './interactiveStreamingNode';

/**
 * Defines the shared state schema for the Zupa agent runtime graph.
 */
export interface RuntimeState<TAgentState extends Record<string, JsonValue> = KVStore> {
  session?: Session | ActiveSession<TAgentState>;
  user?: User;
  replyTarget?: string;
  inboundDuplicate?: boolean | undefined;
  createdUser?: boolean | undefined;
  resolvedContent?: string | undefined;
  inbound?: InboundMessage | undefined;
  commandHandled?: boolean | undefined;
  /**
   * Session scratchpad — developer-owned KV store / generic state object.
   * Lives as a top-level graph state field so it is checkpointed at every
   * node transition, guaranteeing deterministic time-travel and resumability.
   * Values must be strictly JSON-serializable (validated by GraphAgentStateStore).
   */
  agentState?: AgentState<TAgentState> | undefined;
  assembledContext?: {
    history: Message[];
    relevantMemories?: VectorSearchResult[];
    summaries?: string[];
  } | undefined;
  builtPrompt?: string | undefined;
  llmResponse?: LLMResponse | undefined;
  toolResults?: Array<{ toolCallId: string; result: string }> | undefined;
  inputModality?: 'text' | 'voice' | undefined;
  outputModality?: 'text' | 'voice' | undefined;
}

/** Handler type for the Pregel executor – returns a NodeResult. */
export type RuntimeNodeHandler<T = unknown> = (
  context: RuntimeEngineContext<T> & { state: Readonly<RuntimeState> }
) => Promise<NodeResult<Partial<RuntimeState>>>;

export type RuntimeNodeHandlerMap<T = unknown> = Record<EngineNodeName, RuntimeNodeHandler<T>>;

export function buildDefaultNodeHandlers<T = unknown>(): RuntimeNodeHandlerMap<T> {
  return {
    turn_setup: turnSetupNode as RuntimeNodeHandler<T>,
    event_dedup_gate: eventDedupGateNode as RuntimeNodeHandler<T>,
    access_policy: accessPolicyNode as RuntimeNodeHandler<T>,
    command_dispatch_gate: commandDispatchGateNode as RuntimeNodeHandler<T>,
    content_resolution: contentResolutionNode as RuntimeNodeHandler<T>,
    context_assembly: contextAssemblyNode as RuntimeNodeHandler<T>,
    prompt_build: promptBuildNode as RuntimeNodeHandler<T>,
    llm_node: llmNode as RuntimeNodeHandler<T>,
    tool_execution_node: toolExecutionNodeNode as RuntimeNodeHandler<T>,
    response_finalize: responseFinalizeNode as RuntimeNodeHandler<T>,
    interactive_streaming_node: interactiveStreamingNode as RuntimeNodeHandler<T>,
    persistence_hooks: persistenceHooksNode as RuntimeNodeHandler<T>
  };
}
// TODO: Remove this
import { turnSetupNode } from './turnSetup';

export { RuntimeNodeHandler as EngineNodeHandler, RuntimeNodeHandlerMap as EngineNodeHandlerMap };
