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
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  all(): Promise<Record<string, unknown>>;
}

export interface ActiveSession extends Session {
  kv: SessionState;
}
