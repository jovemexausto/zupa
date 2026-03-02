import { defineNode } from "@zupa/engine";
import { type RuntimeEngineContext } from "@zupa/core";
import { type RuntimeState } from "./index";

/**
 * Finalizes persistence by recording the assistant's response message and
 * incrementing the session message count. This node runs at the end of a turn
 * and stores both the raw response content and token usage metrics.
 *
 * Preconditions: session and user must be set; outputModality must be defined.
 * This node ensures the response is durable even if subsequent cleanup fails.
 */
export const persistenceHooksNode = defineNode<RuntimeState, RuntimeEngineContext>(
  async (context) => {
    const { resources, state } = context;
    const session = state.session;
    const user = state.user;

    if (session && user && state.outputModality && (state.replyContent || state.llmResponse)) {
      await resources.domainStore.incrementSessionMessageCount(session.id);

      const contentText =
        (state.replyContent as string) || (state.llmResponse?.content as string) || "";
      await resources.domainStore.createMessage({
        sessionId: session.id,
        userId: user.id,
        role: "assistant",
        contentText,
        inputModality: (state.inputModality as "text" | "voice") || "text",
        outputModality: state.outputModality as "text" | "voice",
        tokensUsed: state.llmResponse?.tokensUsed || { promptTokens: 0, completionTokens: 0 },
        latencyMs: state.llmResponse?.latencyMs || 0,
      });
    }

    return {
      stateDiff: {},
      nextTasks: [],
    };
  },
);
