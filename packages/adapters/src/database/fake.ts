import {
    type DatabaseProvider,
    type Message,
    type Session,
    type User,
    type StateSnapshot,
    type LedgerEvent
} from '@zupa/core';
import { randomUUID } from 'node:crypto';

export class FakeDatabaseBackend implements DatabaseProvider {
    private readonly claimedInboundEvents = new Set<string>();
    private readonly users = new Map<string, User>();
    private readonly usersByNumber = new Map<string, string>();
    private readonly sessions = new Map<string, Session>();
    private readonly messages = new Map<string, Message[]>();
    public readonly sessionKv = new Map<string, Record<string, unknown>>();
    private readonly checkpoints = new Map<string, StateSnapshot[]>();
    private readonly ledger = new Map<string, LedgerEvent[]>();

    public async start(): Promise<void> { }
    public async close(): Promise<void> { }

    public async claimInboundEvent(eventKey: string): Promise<'claimed' | 'duplicate'> {
        if (this.claimedInboundEvents.has(eventKey)) return 'duplicate';
        this.claimedInboundEvents.add(eventKey);
        return 'claimed';
    }

    public async findUser(externalUserId: string): Promise<User | null> {
        const id = this.usersByNumber.get(externalUserId);
        return id ? this.users.get(id) ?? null : null;
    }

    public async createUser(data: { externalUserId: string; displayName: string; preferences?: object }): Promise<User> {
        const now = new Date();
        const user: User = {
            id: randomUUID(),
            externalUserId: data.externalUserId,
            displayName: data.displayName,
            preferences: (data.preferences as any) ?? {},
            createdAt: now,
            lastActiveAt: now
        };
        this.users.set(user.id, user);
        this.usersByNumber.set(user.externalUserId, user.id);
        return user;
    }

    public async updateUserPreferences(id: string, prefs: object): Promise<void> {
        const current = this.users.get(id);
        if (!current) throw new Error(`User not found: ${id}`);
        current.preferences = { ...current.preferences, ...(prefs as Record<string, unknown>) };
        this.users.set(id, current);
    }

    public async touchUserLastActive(id: string): Promise<void> {
        const current = this.users.get(id);
        if (!current) throw new Error(`User not found: ${id}`);
        current.lastActiveAt = new Date();
        this.users.set(id, current);
    }

    public async countUserMessagesSince(userId: string, since: Date): Promise<number> {
        const all = [...this.messages.values()].flat();
        return all.filter((m) => m.userId === userId && m.role === 'user' && m.createdAt >= since).length;
    }

    public async findActiveSession(userId: string): Promise<Session | null> {
        for (const session of this.sessions.values()) {
            if (session.userId === userId && session.endedAt === null) return session;
        }
        return null;
    }

    public async createSession(userId: string): Promise<Session> {
        const session: Session = {
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
        if (!session) throw new Error(`Session not found: ${id}`);
        session.messageCount += amount;
        this.sessions.set(id, session);
    }

    public async endSession(id: string, summary: string): Promise<void> {
        const session = this.sessions.get(id);
        if (!session) throw new Error(`Session not found: ${id}`);
        session.summary = summary;
        session.endedAt = new Date();
        this.sessions.set(id, session);
    }

    public async endSessionWithSummary(id: string, endedAt: Date, kv: Record<string, unknown>): Promise<void> {
        const session = this.sessions.get(id);
        if (!session) throw new Error(`Session not found: ${id}`);
        session.endedAt = endedAt;
        this.sessionKv.set(id, kv);
        this.sessions.set(id, session);
    }

    public async getRecentSummaries(userId: string, limit: number): Promise<string[]> {
        return [...this.sessions.values()]
            .filter((s) => s.userId === userId && typeof s.summary === 'string')
            .slice(-limit)
            .map((s) => s.summary as string);
    }

    public async getSessionKV(sessionId: string): Promise<Record<string, unknown>> {
        return { ...(this.sessionKv.get(sessionId) ?? {}) };
    }

    public async createMessage(data: Omit<Message, 'id' | 'createdAt' | 'metadata'> & { metadata?: Record<string, unknown> }): Promise<Message> {
        const message: Message = {
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

    public async getRecentMessages(sessionId: string, limit: number): Promise<Message[]> {
        const bucket = this.messages.get(sessionId) ?? [];
        return bucket.slice(-limit);
    }

    public async getMessagesWithMetadata(userId: string, since: Date): Promise<Message[]> {
        const all = [...this.messages.values()].flat();
        return all.filter((m) => m.userId === userId && m.createdAt >= since);
    }

    public async updateMessageMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
        for (const bucket of this.messages.values()) {
            const msg = bucket.find(m => m.id === id);
            if (msg) {
                msg.metadata = { ...msg.metadata, ...metadata };
                return;
            }
        }
    }

    public async updateSessionKV(sessionId: string, kv: Record<string, unknown>): Promise<void> {
        this.sessionKv.set(sessionId, { ...kv });
    }

    public async putCheckpoint(threadId: string, snapshot: StateSnapshot): Promise<void> {
        const threadCheckpoints = this.checkpoints.get(threadId) || [];
        threadCheckpoints.push(snapshot);
        this.checkpoints.set(threadId, threadCheckpoints);
    }

    public async getCheckpoint(threadId: string): Promise<StateSnapshot | null> {
        const threadCheckpoints = this.checkpoints.get(threadId) || [];
        return threadCheckpoints[threadCheckpoints.length - 1] || null;
    }

    public async getCheckpointById(threadId: string, checkpointId: string): Promise<StateSnapshot | null> {
        const threadCheckpoints = this.checkpoints.get(threadId) || [];
        return threadCheckpoints.find(c => c.checkpointId === checkpointId) || null;
    }

    public async getCheckpointHistory(threadId: string): Promise<StateSnapshot[]> {
        return this.checkpoints.get(threadId) || [];
    }

    public async appendLedgerEvent(sessionId: string, event: LedgerEvent): Promise<void> {
        const sessionEvents = this.ledger.get(sessionId) || [];
        sessionEvents.push(event);
        this.ledger.set(sessionId, sessionEvents);
    }
}
