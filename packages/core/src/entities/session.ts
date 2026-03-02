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

/**
 * Public agent state. By default, an unstructured key-value store.
 * Generics allow type-safe access while preserving graph checkpointability.
 */
export type AgentState<T extends Record<string, JsonValue> = KVStore> = T;

export interface Session {
  id: string;
  userId: string;
  startedAt: Date;
  lastActiveAt: Date;
  endedAt: Date | null;
  summary: string | null;
  messageCount: number;
  metadata: Record<string, unknown>;
}

export interface SessionState<TState extends Record<string, JsonValue> = KVStore> {
  get<K extends Extract<keyof TState, string>>(key: K): Promise<TState[K] | null>;
  set<K extends Extract<keyof TState, string>>(key: K, value: TState[K]): Promise<void>;
  delete<K extends Extract<keyof TState, string>>(key: K): Promise<void>;
  all(): Promise<TState>;
}

export interface ActiveSession<TState extends Record<string, JsonValue> = KVStore> extends Session {
  agentState: SessionState<TState>;
}
