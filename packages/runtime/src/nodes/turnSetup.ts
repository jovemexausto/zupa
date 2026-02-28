import { defineNode } from '@zupa/engine';
import { type RuntimeEngineContext } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * turn_setup
 * 
 * This node is the common entrypoint for any new turn (new message) in Zupa.
 * It resets all ephemeral, turn-specific state fields to ensure the 
 * execution graph starts with a clean slate, while preserving 
 * durable session state like 'user', 'session', and 'kv'.
 */
export const turnSetupNode = defineNode<RuntimeState, RuntimeEngineContext>(async (_context) => {
    const stateDiff: Partial<RuntimeState> = {
        inboundDuplicate: undefined,
        commandHandled: undefined,
        resolvedContent: undefined,
        assembledContext: undefined,
        builtPrompt: undefined,
        llmResponse: undefined,
        toolResults: undefined,
        inputModality: undefined,
        outputModality: undefined,
    };

    return {
        stateDiff,
        nextTasks: ['event_dedup_gate']
    };
});
