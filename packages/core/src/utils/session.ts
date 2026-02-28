import { type JsonValue, type KVStore, type SessionState } from '../entities/session';
import { type StateProvider } from '../ports/state';

/**
 * Validates that a value is strictly JSON-serializable.
 * Throws a TypeError for functions, class instances, undefined, Sets, Maps, etc.
 */
function assertJsonValue(key: string, value: unknown): asserts value is JsonValue {
    if (value === null) return;
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') return;
    if (Array.isArray(value)) {
        value.forEach((item, i) => assertJsonValue(`${key}[${i}]`, item));
        return;
    }
    if (t === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            assertJsonValue(`${key}.${k}`, v);
        }
        return;
    }
    throw new TypeError(
        `session.kv.set("${key}"): value must be a JSON-serializable type (string, number, boolean, null, array, or plain object). Got: ${t}`
    );
}

/**
 * GraphKVStore — implements SessionState backed by a plain JS object that is
 * part of the durable graph's RuntimeState. Any mutations are inherently captured
 * by the Engine's checkpoint saver on each node completion, guaranteeing full
 * deterministic resumability / time-travel without an external backend.
 *
 * Strict JSON validation on every set() ensures the graph state always remains
 * safely serializable for SQLite checkpointing.
 */
export class GraphKVStore implements SessionState {
    public constructor(
        private readonly store: KVStore
    ) { }

    public async get<T extends JsonValue>(key: string): Promise<T | null> {
        return (this.store[key] as T | undefined) ?? null;
    }

    public async set<T extends JsonValue>(key: string, value: T): Promise<void> {
        assertJsonValue(key, value);
        this.store[key] = value;
    }

    public async delete(key: string): Promise<void> {
        delete this.store[key];
    }

    public async all(): Promise<KVStore> {
        return { ...this.store };
    }
}

/**
 * MemoryStateProvider — provides an in-memory StateProvider backed by GraphKVStore.
 * Useful for local dev, tests, or single-process deployments where the external
 * StateProvider abstraction is still desired (e.g., as a non-graph-native fallback).
 */
class MemoryKVStore implements SessionState {
    public constructor(
        private readonly sessionId: string,
        private readonly cache: KVStore
    ) { }

    public async get<T extends JsonValue>(key: string): Promise<T | null> {
        return (this.cache[key] as T | undefined) ?? null;
    }

    public async set<T extends JsonValue>(key: string, value: T): Promise<void> {
        assertJsonValue(key, value);
        this.cache[key] = value;
    }

    public async delete(key: string): Promise<void> {
        delete this.cache[key];
    }

    public async all(): Promise<KVStore> {
        return { ...this.cache };
    }
}

export class MemoryStateProvider implements StateProvider {
    readonly metadata = { name: 'memory-state-provider', version: '1.0.0' };
    private stores: Record<string, KVStore> = {};

    public attach(sessionId: string): SessionState {
        if (!this.stores[sessionId]) {
            this.stores[sessionId] = {};
        }
        return new MemoryKVStore(sessionId, this.stores[sessionId]);
    }

    public async destroy(): Promise<void> {
        this.stores = {};
    }
}
