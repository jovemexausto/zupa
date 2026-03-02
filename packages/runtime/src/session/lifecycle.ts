import { type DomainStore } from "@zupa/core";

export interface EndSessionOptions {
  session: { id: string; agentState?: { all(): Promise<Record<string, unknown>> } };
  endedAt: Date;
  sessionManager: Pick<DomainStore, "endSessionWithSummary">;
}

/**
 * High-level helper to end a session and capture its final KV state as a JSON summary.
 * Note: If using an LLM, a summary generator node should ideally replace this simple stringification.
 */
export async function endSessionWithKvHandoff(options: EndSessionOptions): Promise<void> {
  const { session, endedAt, sessionManager } = options;
  const kv = session.agentState ? await session.agentState.all() : {};
  await sessionManager.endSessionWithSummary(session.id, endedAt, JSON.stringify(kv));
}
