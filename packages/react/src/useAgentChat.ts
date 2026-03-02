import { useState, useCallback, useEffect } from 'react';
import { useZupa } from './context';
import { ZupaEvent } from './connection';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
}

/**
 * Handle interactive chat with an agent.
 * Manages message history and streaming token assembly.
 */
export function useAgentChat() {
    const { connection } = useZupa();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);

    useEffect(() => {
        const unsubscribe = connection.subscribe((event: ZupaEvent) => {
            if (event.type === 'TOKEN_CHUNK') {
                const { id, content } = event.payload;
                setIsStreaming(true);

                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant' && (lastMsg.id === id || lastMsg.isStreaming)) {
                        return [
                            ...prev.slice(0, -1),
                            { ...lastMsg, id, content: lastMsg.content + content, isStreaming: true }
                        ];
                    } else {
                        return [
                            ...prev,
                            { id, role: 'assistant', content, isStreaming: true }
                        ];
                    }
                });
            } else if (event.type === 'STATE_DELTA') {
                // If we get a state delta, it might signal completion or other metadata
                // For now we just use tokens
            }
        });
        return () => { unsubscribe(); };
    }, [connection]);

    const sendMessage = useCallback((text: string) => {
        const id = Math.random().toString(36).slice(2);
        setMessages(prev => {
            // Mark previous streaming message as finished
            const cleaned = prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m);
            return [...cleaned, { id, role: 'user', content: text }];
        });
        setIsStreaming(false);

        connection.send('INBOUND_MESSAGE', { body: text });
    }, [connection]);

    return {
        messages,
        sendMessage,
        isStreaming,
        clearMessages: () => setMessages([])
    };
}
