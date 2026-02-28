import { defineNode } from '@zupa/engine';
import { type RuntimeEngineContext, type LLMResponse } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * llm_node
 */
export const llmNodeNode = defineNode<RuntimeState, RuntimeEngineContext>(async (context) => {
    const { resources, state, config } = context;
    const prompt = state.builtPrompt;
    const history = state.assembledContext?.history || [];
    const messages = history.map(m => ({
        role: m.role,
        content: m.contentText
    }));

    if (!prompt) {
        throw new Error('LLM Node Error: builtPrompt is missing from state');
    }

    const response: LLMResponse = await resources.llm.complete({
        messages,
        systemPrompt: prompt,
        outputSchema: config.outputSchema || undefined,
        tools: config.tools || undefined
    });

    return {
        stateDiff: { llmResponse: response },
        nextTasks: response.toolCalls.length > 0 ? ['tool_execution_node'] : ['response_finalize']
    };
});
