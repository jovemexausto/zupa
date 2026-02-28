import { UserRecord } from '../entities/user';
import { MessageRecord } from '../entities/message';
import { SessionRecord } from '../entities/session';
import { RuntimeResource } from "../lifecycle";
import { StateSnapshot, CheckpointSaver } from '../contracts/checkpoint';
import { LedgerWriter } from '../contracts/ledger';

export interface RuntimeDatabasePort extends RuntimeResource, CheckpointSaver, LedgerWriter {
  claimInboundEvent(eventKey: string): Promise<'claimed' | 'duplicate'>;
  findUser(externalUserId: string): Promise<UserRecord | null>;
  createUser(data: { externalUserId: string; displayName: string; preferences?: object }): Promise<UserRecord>;
  touchUserLastActive(userId: string): Promise<void>;
  updateUserPreferences(userId: string, prefs: object): Promise<void>;
  countUserMessagesSince(userId: string, since: Date): Promise<number>;
  findActiveSession(userId: string): Promise<SessionRecord | null>;
  createSession(userId: string): Promise<SessionRecord>;
  incrementSessionMessageCount(sessionId: string, amount?: number): Promise<void>;
  endSession(sessionId: string, summary: string): Promise<void>;
  endSessionWithSummary(sessionId: string, endedAt: Date, kv: Record<string, unknown>): Promise<void>;
  getRecentSummaries(userId: string, limit: number): Promise<string[]>;
  getSessionKV(sessionId: string): Promise<Record<string, unknown>>;
  updateSessionKV(sessionId: string, kv: Record<string, unknown>): Promise<void>;
  createMessage(data: Omit<MessageRecord, 'id' | 'createdAt' | 'metadata'> & { metadata?: Record<string, unknown> }): Promise<MessageRecord>;
  getRecentMessages(sessionId: string, limit: number): Promise<MessageRecord[]>;
  getMessagesWithMetadata(userId: string, since: Date): Promise<MessageRecord[]>;
  updateMessageMetadata(id: string, metadata: Record<string, unknown>): Promise<void>;
}
