import { SessionState } from "../entities/session";

export interface SessionKVBackend {
    updateSessionKV(sessionId: string, kv: Record<string, unknown>): Promise<void>;
}

export class SessionKVStore implements SessionState {
    public constructor(
        private readonly sessionId: string,
        private readonly db: SessionKVBackend,
        private readonly cache: Record<string, unknown>
    ) { }

    public async get<T>(key: string): Promise<T | null> {
        return (this.cache[key] as T | undefined) ?? null;
    }

    public async set<T>(key: string, value: T): Promise<void> {
        this.cache[key] = value;
        await this.db.updateSessionKV(this.sessionId, this.cache);
    }

    public async delete(key: string): Promise<void> {
        delete this.cache[key];
        await this.db.updateSessionKV(this.sessionId, this.cache);
    }

    public async all(): Promise<Record<string, unknown>> {
        return { ...this.cache };
    }
}
