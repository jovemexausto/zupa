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
    const { resources, state, config } = context;
    const session = state.session;
    const user = state.user;
    const structured = state.llmResponse?.structured;

    if (session && user && state.outputModality && (state.replyContent || state.llmResponse)) {
      // TODO: why this is needed ? current session's messages live on checkpoint.
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

      resources.bus.emit({
        channel: "runtime",
        name: "response:persisted",
        payload: {
          requestId: context.meta.requestId,
          messageId: context.inbound.messageId,
          sessionId: session.id,
          userId: user.id,
          outputModality: state.outputModality,
        },
      });
    }

    if (session && user && structured !== undefined && structured !== null && config.onResponse) {
      const agentContext = {
        user,
        session,
        inbound: context.inbound,
        language: config.language,
        replyTarget: state.replyTarget || context.inbound.from,
        resources,
        config,
        endSession: async () => {
          await resources.domainStore.endSession(
            session.id,
            `Session ended at ${new Date().toISOString()}`,
          );
        },
      };

      try {
        await (config.onResponse as (s: unknown, ctx: unknown) => Promise<void>)(
          structured,
          agentContext,
        );
      } catch (err) {
        context.logger.error({ err }, "Error in onResponse callback");
        resources.bus.emit({
          channel: "runtime",
          name: "response:failed",
          payload: {
            requestId: context.meta.requestId,
            messageId: context.inbound.messageId,
            stage: "onResponse",
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }

    return {
      stateDiff: {},
      nextTasks: [],
    };
  },
);
