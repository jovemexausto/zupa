import { type DatabaseProvider as DatabasePort } from '@zupa/core';

export interface EndSessionOptions {
    session: { id: string; kv?: { all(): Promise<Record<string, unknown>> } };
    endedAt: Date;
    sessionManager: Pick<DatabasePort, 'endSessionWithSummary'>;
}

/**
 * 
 * TODO: We're bounding llm, database, kv and session manager this is not ideal.
 * We should inspect and redesing this concept to be more flexible and aligned with recent codebase practices.
 * look for: endSessionWithSummary(sessionId: string, endedAt: Date, summary: string): Promise<void>;
 * High-level helper to end a session and capture its final KV state as a summary.
 * High-level helper to end a session and capture its final KV state as a JSON summary.
 * Note: If using an LLM, a summary generator node should ideally replace this simple stringification.
 */
export async function endSessionWithKvHandoff(options: EndSessionOptions): Promise<void> {
    const { session, endedAt, sessionManager } = options;
    const kv = session.kv ? await session.kv.all() : {};
    // TODO: why we're calling it sessionManager if it is calling database.endSessionWithSummary?
    await sessionManager.endSessionWithSummary(session.id, endedAt, JSON.stringify(kv));
}
