import { type RuntimeDatabasePort as DatabasePort } from '@zupa/core';

export interface EndSessionOptions {
    session: { id: string; kv?: { all(): Promise<Record<string, unknown>> } };
    endedAt: Date;
    sessionManager: Pick<DatabasePort, 'endSessionWithSummary'>;
}

/**
 * TODO: We're bounding llm, kv and session manager this is not ideal.
 * We should inspect and redesing this concept to be more flexible and aligned with recent codebase practices.
 *
 * High-level helper to end a session and capture its final KV state as a summary.
 */
export async function endSessionWithKvHandoff(options: EndSessionOptions): Promise<void> {
    const { session, endedAt, sessionManager } = options;
    const kv = await session.kv?.all();
    await sessionManager.endSessionWithSummary(session.id, endedAt, kv ?? {});
}
