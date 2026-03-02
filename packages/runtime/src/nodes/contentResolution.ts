import { defineNode } from "@zupa/engine";
import { type RuntimeEngineContext, resolveInboundContent } from "@zupa/core";
import { type RuntimeState } from "./index";

/**
 * Extracts and normalizes the text content from the inbound message.
 * Handles multimodal inputs by delegating to the STT provider if audio
 * is detected, then applies language-specific processing (e.g., language
 * detection, normalization).
 *
 * Also persists the incoming message to the domain store for audit and history.
 *
 * Output: contentText, inputModality in state
 */
export const contentResolutionNode = defineNode<RuntimeState, RuntimeEngineContext>(
  async (context) => {
    const { resources, inbound, config, state } = context;

    const { contentText, inputModality } = await resolveInboundContent({
      message: inbound,
      sttProvider: resources.stt,
      config: {
        agentLanguage: config.language || "en",
        ...(config.sttTimeoutMs !== undefined && {
          sttTimeoutMs: config.sttTimeoutMs,
        }),
        ...(config.maxIdempotentRetries !== undefined && {
          maxIdempotentRetries: config.maxIdempotentRetries,
        }),
        ...(config.retryBaseDelayMs !== undefined && {
          retryBaseDelayMs: config.retryBaseDelayMs,
        }),
        ...(config.retryJitterMs !== undefined && {
          retryJitterMs: config.retryJitterMs,
        }),
      },
    });

    const user = state.user;
    const session = state.session;

    if (user && session) {
      await resources.domainStore.createMessage({
        sessionId: session.id,
        userId: user.id,
        role: "user",
        contentText,
        inputModality,
        outputModality: "text",
        tokensUsed: { promptTokens: 0, completionTokens: 0 },
        latencyMs: 0,
      });
    }

    return {
      stateDiff: {
        resolvedContent: contentText,
        inbound: { ...inbound, body: contentText },
        inputModality,
      },
      nextTasks: ["context_assembly"],
    };
  },
);
