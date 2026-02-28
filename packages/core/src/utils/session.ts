import { SessionState } from "../entities/session";
import { StateProvider } from "../ports/state";

class MemorySessionState implements SessionState {
    public constructor(
        private readonly sessionId: string,
        private readonly cache: Record<string, unknown>
    ) { }

    public async get<T>(key: string): Promise<T | null> {
        return (this.cache[key] as T | undefined) ?? null;
    }

    public async set<T>(key: string, value: T): Promise<void> {
        this.cache[key] = value;
    }

    public async delete(key: string): Promise<void> {
        delete this.cache[key];
    }

    public async all(): Promise<Record<string, unknown>> {
        return { ...this.cache };
    }
}

export class MemoryStateProvider implements StateProvider {
    readonly metadata = { name: 'memory-state-provider', version: '1.0.0' }
    private stores: Record<string, Record<string, unknown>> = {};

    public attach(sessionId: string): SessionState {
        if (!this.stores[sessionId]) {
            this.stores[sessionId] = {};
        }
        return new MemorySessionState(sessionId, this.stores[sessionId]);
    }

    public async destroy(): Promise<void> {
        this.stores = {};
    }
}
