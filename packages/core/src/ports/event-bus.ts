import { RuntimeResource } from "../lifecycle";
import { type JsonValue } from "../entities/session";

/**
 * ZupaEvent represents a single, immutable occurrence in the system.
 */
export interface ZupaEvent<TPayload = JsonValue> {
    /** Namespace/Channel (e.g., 'engine', 'agent', 'transport') */
    channel: string;
    /** Event identifier within the channel (e.g., 'node_complete', 'log') */
    name: string;
    /** Monotonic sequence ID assigned by the bus */
    seq: number;
    /** High-resolution timestamp assigned by the bus (ISO string) */
    timestamp: string;
    /** Principal event payload */
    payload: TPayload;
    /** Optional contextual metadata */
    metadata?: Record<string, unknown>;
}

/**
 * EventBus handles high-performance, asynchronous event distribution.
 */
export interface EventBus extends RuntimeResource<void> {
    /** 
     * BLAZING FAST: Ingests an event into the bus.
     * Returns immediately. Processing happens asynchronously.
     */
    emit<T = JsonValue>(event: Omit<ZupaEvent<T>, 'seq' | 'timestamp'>): void;

    /**
     * Registers a background reducer/middleware.
     * Reducers can transform, filter (by returning null), or branch (by returning array) events.
     */
    use(reducer: (event: ZupaEvent<any>) => ZupaEvent<any> | ZupaEvent<any>[] | null): void;

    /**
     * Subscribes a listener to specific event patterns (e.g., 'agent:*', 'engine:node_complete').
     */
    subscribe<T = JsonValue>(pattern: string, handler: (event: ZupaEvent<T>) => void): () => void;
}
