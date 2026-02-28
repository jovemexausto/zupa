import { defineNode } from '@zupa/engine';
import { type RuntimeKernelContext, applyLengthPreference, type AgentContext, type SessionWithKV } from '@zupa/core';
import nunjucks from 'nunjucks';
import { type RuntimeState } from './index';

/**
 * prompt_build
 */
export const promptBuildNode = defineNode<RuntimeState, RuntimeKernelContext>(async (context) => {
  const { config, state } = context;
  const template = config.prompt;

  if (!state.user || !state.session) {
    throw new Error('Prompt Build Error: user or session is missing from state');
  }

  // Create a bridge context for the prompt function if needed
  // We cast session here because prompt template functions usually expect .kv 
  // which is populated by context_assembly if it's there
  const agentContext: AgentContext<unknown> = {
    user: state.user,
    session: state.session as SessionWithKV,
    inbound: context.inbound,
    language: config.language,
    replyTarget: state.replyTarget!,
    resources: context.resources,
    config,
    endSession: async () => {
      await context.resources.database.endSession(state.session!.id, 'Session ended via prompt build');
    }
  };

  const resolvedTemplate = typeof template === 'function' ? await template(agentContext) : template;

  const prompt = nunjucks.renderString(resolvedTemplate, {
    user: state.user,
    session: state.session,
    state: state
  });

  const finalPrompt = applyLengthPreference(prompt, state.user.preferences);

  return {
    stateDiff: { builtPrompt: finalPrompt },
    nextTasks: ['llm_node']
  };
});
