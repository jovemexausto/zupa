import type { SessionWithKV } from './kv';

interface EndSessionWithKvHandoffInput {
  session: Pick<SessionWithKV, 'id' | 'kv'>;
  endedAt: Date;
  sessionManager: {
    endSessionWithSummary(sessionId: string, endedAt: Date, sessionKv?: Record<string, unknown>): Promise<void>;
  };
}

export async function endSessionWithKvHandoff(input: EndSessionWithKvHandoffInput): Promise<void> {
  const sessionKv = await input.session.kv.all();
  await input.sessionManager.endSessionWithSummary(input.session.id, input.endedAt, sessionKv);
}
