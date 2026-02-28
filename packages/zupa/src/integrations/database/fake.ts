import { randomUUID } from 'node:crypto';

import type { RuntimeDatabasePort } from '../../core/ports';
import type { MessageRecord, SessionRecord, UserRecord } from '../../core/domain';

export class FakeDatabaseBackend
  implements RuntimeDatabasePort
{
  private readonly claimedInboundEvents = new Set<string>();
  private readonly users = new Map<string, UserRecord>();
  private readonly usersByNumber = new Map<string, string>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly messages = new Map<string, MessageRecord[]>();
  public  readonly sessionKv = new Map<string, Record<string, unknown>>();

  public async claimInboundEvent(eventKey: string): Promise<'claimed' | 'duplicate'> {
    if (this.claimedInboundEvents.has(eventKey)) {
      return 'duplicate';
    }

    this.claimedInboundEvents.add(eventKey);
    return 'claimed';
  }

  public async findUser(externalUserId: string): Promise<UserRecord | null> {
    const id = this.usersByNumber.get(externalUserId);
    return id ? this.users.get(id) ?? null : null;
  }

  public async createUser(data: { externalUserId: string; displayName: string; preferences?: object }): Promise<UserRecord> {
    const now = new Date();
    const user: UserRecord = {
      id: randomUUID(),
      externalUserId: data.externalUserId,
      displayName: data.displayName,
      preferences: (data.preferences as UserRecord['preferences']) ?? {},
      createdAt: now,
      lastActiveAt: now
    };

    this.users.set(user.id, user);
    this.usersByNumber.set(user.externalUserId, user.id);
    return user;
  }

  public async updateUserPreferences(id: string, prefs: object): Promise<void> {
    const current = this.users.get(id);
    if (!current) {
      throw new Error(`User not found: ${id}`);
    }

    current.preferences = { ...current.preferences, ...(prefs as Record<string, unknown>) };
    this.users.set(id, current);
  }

  public async touchUserLastActive(id: string): Promise<void> {
    const current = this.users.get(id);
    if (!current) {
      throw new Error(`User not found: ${id}`);
    }

    current.lastActiveAt = new Date();
    this.users.set(id, current);
  }

  public async countUserMessagesSince(userId: string, since: Date): Promise<number> {
    const all = [...this.messages.values()].flat();
    return all.filter((message) => {
      return message.userId === userId && message.role === 'user' && message.createdAt >= since;
    }).length;
  }

  public async findActiveSession(userId: string): Promise<SessionRecord | null> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.endedAt === null) {
        return session;
      }
    }

    return null;
  }

  public async createSession(userId: string): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: randomUUID(),
      userId,
      startedAt: new Date(),
      endedAt: null,
      summary: null,
      messageCount: 0,
      metadata: {}
    };

    this.sessions.set(session.id, session);
    return session;
  }

  public async incrementSessionMessageCount(id: string, amount = 1): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    session.messageCount += amount;
    this.sessions.set(id, session);
  }

  public async endSession(id: string, summary: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    session.summary = summary;
    session.endedAt = new Date();
    this.sessions.set(id, session);
  }

  public async getRecentSummaries(userId: string, limit: number): Promise<string[]> {
    return [...this.sessions.values()]
      .filter((session) => session.userId === userId && typeof session.summary === 'string')
      .slice(-limit)
      .map((session) => session.summary as string);
  }

  public async getSessionKV(sessionId: string): Promise<Record<string, unknown>> {
    return { ...(this.sessionKv.get(sessionId) ?? {}) };
  }

  public async createMessage(data: Omit<MessageRecord, 'id' | 'createdAt' | 'metadata'> & { metadata?: Record<string, unknown> }): Promise<MessageRecord> {
    const message: MessageRecord = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
      metadata: data.metadata ?? {}
    };

    const bucket = this.messages.get(data.sessionId) ?? [];
    bucket.push(message);
    this.messages.set(data.sessionId, bucket);
    return message;
  }

  public async getRecentMessages(sessionId: string, limit: number): Promise<MessageRecord[]> {
    const bucket = this.messages.get(sessionId) ?? [];
    return bucket.slice(-limit);
  }

  public async getMessagesWithMetadata(userId: string, since: Date): Promise<MessageRecord[]> {
    const all = [...this.messages.values()].flat();
    return all.filter((message) => message.userId === userId && (message.createdAt ?? new Date(0)) >= since);
  }

  public async updateMessageMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
    for (const [sessionId, bucket] of this.messages.entries()) {
      const next = bucket.map((message) => {
        if (message.id === id) {
          return { ...message, metadata: { ...metadata } };
        }

        return message;
      });

      this.messages.set(sessionId, next);
    }
  }

  public async updateSessionKV(sessionId: string, kv: Record<string, unknown>): Promise<void> {
    this.sessionKv.set(sessionId, { ...kv });
  }
}
