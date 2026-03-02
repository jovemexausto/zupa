import type { RuntimeEngineContext } from '@zupa/core';
import {
    type EngineGraphSpec,
    CanonicalChannels,
    lastWriteWinsReducer,
    type ChannelReducer
} from '@zupa/engine';
import type { RuntimeState, RuntimeNodeHandlerMap } from '../nodes';

/**
 * Builds an EngineGraphSpec from the provided node handlers.
 * 
 * This establishes the channels (reducers) and the node mapping
 * required to execute the Zupa conversational graph state machine.
 * 
 * @param handlers A strongly typed map of node execution handlers.
 * @returns An EngineGraphSpec ready to be passed to an EngineExecutor.
 */
export function buildEngineGraphSpec<T = unknown>(
    handlers: RuntimeNodeHandlerMap<T>
): EngineGraphSpec<RuntimeState, RuntimeEngineContext<T>> {
    const channels: { [K in keyof RuntimeState]: ChannelReducer<RuntimeState[K]> } = {
        session: lastWriteWinsReducer(),
        user: lastWriteWinsReducer(),
        replyTarget: lastWriteWinsReducer(),
        inboundDuplicate: lastWriteWinsReducer(),
        createdUser: lastWriteWinsReducer(),
        resolvedContent: lastWriteWinsReducer(),
        inbound: lastWriteWinsReducer(),
        commandHandled: lastWriteWinsReducer(),
        agentState: lastWriteWinsReducer(),
        assembledContext: lastWriteWinsReducer(),
        builtPrompt: lastWriteWinsReducer(),
        llmResponse: lastWriteWinsReducer(),
        toolResults: (prev, update) => CanonicalChannels.toolResults(prev, update || [])
    };

    return {
        channels,
        nodes: handlers
    };
}
