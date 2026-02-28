import type { ChannelReducer } from '../models/checkpoint';
import type { Message } from '@zupa/core';

/**
 * Appends new items to an array. If no previous array exists, it starts a new one.
 */
export function appendReducer<T>(): ChannelReducer<T[]> {
    return (prev: T[] | undefined, update: T[]) => [...(prev ?? []), ...update];
}

/**
 * A reducer that overwrites the previous value (standard channel behavior).
 */
export function lastWriteWinsReducer<T>(): ChannelReducer<T> {
    return (_prev: T | undefined, update: T) => update;
}

/**
 * A reducer that appends messages but enforces a maximum working memory window.
 */
export function boundedMessagesReducer(maxWindow: number): ChannelReducer<Message[]> {
    return (prev: Message[] | undefined, update: Message[]) => {
        const combined = [...(prev ?? []), ...update];
        if (combined.length > maxWindow) {
            return combined.slice(-maxWindow);
        }
        return combined;
    };
}

/**
 * Canonical State Channels for Zupa's Pregel-inspired Agentic Loop.
 */
export const CanonicalChannels = {
    messages: boundedMessagesReducer(50),
    toolResults: appendReducer<{ toolCallId: string; result: string }>(),
    intents: appendReducer<string>(),
    resumePayload: (_prev: unknown | undefined, update: unknown) => update
};
