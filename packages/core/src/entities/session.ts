/**
 * Strict JSON-serializable value type.
 * Only these types may be stored in the session KV store to guarantee
 * deterministic graph checkpointing (no functions, classes, Maps, Sets, etc.).
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type KVStore = Record<string, JsonValue>;

export interface Session {
  id: string;
  userId: string;
  startedAt: Date;
  endedAt: Date | null;
  summary: string | null;
  messageCount: number;
  metadata: Record<string, unknown>;
}

export interface SessionState {
  get<T extends JsonValue>(key: string): Promise<T | null>;
  set<T extends JsonValue>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  all(): Promise<KVStore>;
}

export interface ActiveSession extends Session {
  kv: SessionState;
}
