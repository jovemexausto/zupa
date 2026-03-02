import { RuntimeResource } from "../lifecycle";
import { type JsonValue } from "../entities/session";

/**
 * ZupaEvent represents a single, immutable occurrence in the system.
 */
export interface ZupaEvent {
    /** Namespace/Channel (e.g., 'engine', 'agent', 'transport') */
    channel: string;
    /** Event identifier within the channel (e.g., 'node_complete', 'log') */
    name: string;
    /** Monotonic sequence ID assigned by the bus */
    seq: number;
    /** High-resolution timestamp assigned by the bus (ISO string) */
    timestamp: string;
    /** Principal event payload */
    payload: JsonValue;
    /** Optional contextual metadata */
    metadata?: Record<string, unknown>;
}

/**
 * EventBus handles high-performance, asynchronous event distribution.
 */
export interface EventBus extends RuntimeResource {
    /** 
     * BLAZING FAST: Ingests an event into the bus.
     * Returns immediately. Processing happens asynchronously.
     */
    emit(event: Omit<ZupaEvent, 'seq' | 'timestamp'>): void;

    /**
     * Registers a background reducer/middleware.
     * Reducers can transform, filter (by returning null), or branch (by returning array) events.
     */
    use(reducer: (event: ZupaEvent) => ZupaEvent | ZupaEvent[] | null): void;

    /**
     * Subscribes a listener to specific event patterns (e.g., 'agent:*', 'engine:node_complete').
     */
    subscribe(pattern: string, handler: (event: ZupaEvent) => void): () => void;
}
