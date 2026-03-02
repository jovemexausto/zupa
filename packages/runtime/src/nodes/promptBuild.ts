import { defineNode } from "@zupa/engine";
import {
  type RuntimeEngineContext,
  applyLengthPreference,
  applyModalityPreference,
  type AgentContext,
  type ActiveSession,
} from "@zupa/core";
import nunjucks from "nunjucks";
import { type RuntimeState } from "./index";

/**
 * Renders the prompt template using Nunjucks with the assembled context.
 * Injects working memory (history, summaries), user/session metadata, and
 * applies modality preferences (text vs. voice output).
 *
 * The template is configured via config.prompt and can be a string or a
 * function that receives the AgentContext. Length preferences are also applied
 * to control output size and complexity.
 *
 * Output: builtPrompt in state
 */
export const promptBuildNode = defineNode<RuntimeState, RuntimeEngineContext>(
  async (context) => {
    const { config, state } = context;
    const template = config.prompt;

    if (!state.user || !state.session) {
      throw new Error(
        "Prompt Build Error: user or session is missing from state",
      );
    }

    // Create a bridge context for the prompt function if needed
    // We cast session here because prompt template functions usually expect .kv
    // which is populated by context_assembly if it's there
    const agentContext: AgentContext<unknown> = {
      user: state.user,
      session: state.session as ActiveSession,
      inbound: context.inbound,
      language: config.language,
      replyTarget: state.replyTarget!,
      resources: context.resources,
      config,
      endSession: async () => {
        await context.resources.domainStore.endSession(
          state.session!.id,
          "Session ended via prompt build",
        );
      },
    };

    const resolvedTemplate =
      typeof template === "function" ? await template(agentContext) : template;

    const prompt = nunjucks.renderString(resolvedTemplate, {
      user: state.user,
      session: state.session,
      state: state,
    });

    let finalPrompt = applyLengthPreference(prompt, state.user.preferences);
    finalPrompt = applyModalityPreference(finalPrompt, state.user.preferences);

    let nextTasks = ["llm_node"];

    // Route to the interactive streaming node if conditions are met
    if (
      config.finalizationStrategy === "streaming" &&
      context.inbound.source === "ui_channel"
    ) {
      nextTasks = ["interactive_streaming_node"];
    }

    return {
      stateDiff: { builtPrompt: finalPrompt },
      nextTasks,
    };
  },
);
