import { defineNode } from "@zupa/engine";
import {
  type RuntimeEngineContext,
  type AgentContext,
  type ActiveSession,
} from "@zupa/core";
import { executeTools } from "./utils/executeTools";
import { RuntimeState } from ".";

/**
 * Executes tool calls requested by the LLM. For each tool in the configured
 * registry, validates inputs, executes the tool with the AgentContext, and
 * collects results.
 *
 * Tool results are persisted to state for the next LLM iteration. If no tools
 * are configured or no tool calls are present, skips to response_finalize.
 *
 * Preconditions: llmResponse with toolCalls, user, session, and replyTarget.
 */
export const toolExecutionNodeNode = defineNode<
  RuntimeState,
  RuntimeEngineContext
>(async (context) => {
  const { resources, state, config } = context;
  const llmResponse = state.llmResponse;
  const tools = config.tools || [];

  if (
    !llmResponse ||
    !llmResponse.toolCalls.length ||
    !state.user ||
    !state.session ||
    !state.replyTarget
  ) {
    return { stateDiff: {}, nextTasks: ["response_finalize"] };
  }

  const agentContext: AgentContext<unknown> = {
    user: state.user,
    session: state.session as ActiveSession,
    inbound: context.inbound,
    language: config.language,
    replyTarget: state.replyTarget,
    resources,
    config,
    endSession: async () => {
      await resources.domainStore.endSession(
        state.session!.id,
        "Session ended during tool execution",
      );
    },
  };

  const toolResults = await executeTools({
    toolCalls: llmResponse.toolCalls,
    tools,
    agentContext,
    logger: context.logger,
    toolTimeoutMs: config.toolTimeoutMs,
    maxIdempotentRetries: config.maxIdempotentRetries,
    retryBaseDelayMs: config.retryBaseDelayMs,
    retryJitterMs: config.retryJitterMs,
  });

  return {
    stateDiff: { toolResults },
    nextTasks: ["llm_node"], // Loop back to LLM for final response or more tools
  };
});
