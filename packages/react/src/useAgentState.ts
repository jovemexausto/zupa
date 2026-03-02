import { useState, useEffect } from 'react';
import { type JsonValue } from '@zupa/core';
import { useZupa } from './context';
import { ZupaEvent } from './connection';

/**
 * Syncs the local React state with the Remote Agent State in real-time.
 * TODO: let user select which keys to sync
 * @param initialState Optional starting state
 * @returns The current synchronized agent state
 */
export function useAgentState<T extends Record<string, JsonValue>>(
    initialState: T = {} as T
): T {
    const { connection } = useZupa();
    const [state, setState] = useState<T>(initialState);

    useEffect(() => {
        const unsubscribe = connection.subscribe((event: ZupaEvent) => {
            if (event.type === 'STATE_DELTA') {
                setState(prev => ({
                    ...prev,
                    ...event.payload as Partial<T>
                }));
            }
        });
        return () => { unsubscribe(); };
    }, [connection]);

    return state;
}
