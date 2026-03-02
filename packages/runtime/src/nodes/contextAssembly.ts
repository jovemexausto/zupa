import { defineNode } from "@zupa/engine";
import { type RuntimeEngineContext } from "@zupa/core";
import { type RuntimeState } from "./index";

/**
 * Assembles the working memory context for the LLM by fetching recent messages
 * and episodic summaries. This context window is configurable via maxWorkingMemory
 * (default 20) and maxEpisodicMemory (default 3).
 *
 * The assembled context is later injected into the prompt template to give
 * the LLM access to conversation history and user knowledge summaries.
 *
 * Output: assembledContext in state
 */
export const contextAssemblyNode = defineNode<RuntimeState, RuntimeEngineContext>(
  async (context) => {
    const { resources, state, config } = context;
    const user = state.user;
    const session = state.session;

    if (!user || !session) {
      return { stateDiff: {}, nextTasks: ["prompt_build"] };
    }

    const recentSummaries = await resources.domainStore.getRecentSummaries(
      user.id,
      config.maxEpisodicMemory || 3,
    );

    const assembledContext = {
      summaries: recentSummaries,
    };

    return {
      stateDiff: { assembledContext },
      nextTasks: ["prompt_build"],
    };
  },
);
