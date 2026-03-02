import { defineNode } from "@zupa/engine";
import {
  type RuntimeEngineContext,
  type LLMResponse,
  withTimeout,
  retryIdempotent,
} from "@zupa/core";
import { type RuntimeState } from "./index";

/**
 * Invokes the LLM with the built prompt and assembled context.
 * Applies timeout, retry logic, and error handling for robustness.
 *
 * For streaming UI channels, delegates to interactive_streaming_node to handle
 * token streaming directly. For other channels, awaits the full LLM response
 * and continues to response_finalize.
 *
 * Output: llmResponse in state (may be deferred for streaming)
 */
export const llmNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
  const { resources, state, config } = context;
  const prompt = state.builtPrompt;
  const history = state.history || [];
  const messages = history.map((m) => ({
    role: m.role,
    content: m.contentText,
  }));

  if (!prompt) {
    throw new Error("LLM Node Error: builtPrompt is missing from state");
  }

  const { finalizationStrategy } = config;
  const isUiChannel = context.inbound.source === "ui_channel";
  const clientId = context.inbound.clientId;

  if (
    finalizationStrategy === "streaming" &&
    isUiChannel &&
    clientId &&
    resources.reactiveUi &&
    resources.llm.stream
  ) {
    // Fast-path for streaming: bypass llmNode and let responseFinalize handle the streaming
    return {
      stateDiff: {},
      nextTasks: ["response_finalize"],
    };
  }

  // Buffered logic...

  const response: LLMResponse = await withTimeout({
    timeoutMs: config.llmTimeoutMs ?? 30_000,
    label: "LLM complete",
    run: () =>
      retryIdempotent({
        maxRetries: config.maxIdempotentRetries ?? 2,
        baseDelayMs: config.retryBaseDelayMs ?? 75,
        jitterMs: config.retryJitterMs ?? 25,
        run: () =>
          resources.llm.complete({
            messages,
            systemPrompt: prompt,
            outputSchema: config.outputSchema || undefined,
            tools: config.tools || undefined,
          }),
      }),
  });

  const logger = context.logger;

  logger.debug(
    {
      prompt,
      model: response.model,
      toolCalls: response.toolCalls.length,
      promptLength: prompt.length,
    },
    "LLM completion successful",
  );

  return {
    stateDiff: { llmResponse: response },
    nextTasks: response.toolCalls.length > 0 ? ["tool_execution_node"] : ["response_finalize"],
  };
});
