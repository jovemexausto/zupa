import { User } from '../entities/user';
import { Message } from '../entities/message';
import { Session } from '../entities/session';
import { RuntimeResource } from "../lifecycle";
import { StateSnapshot, CheckpointSaver } from '../contracts/checkpoint';
import { LedgerWriter } from '../contracts/ledger';

export interface DatabaseProvider extends RuntimeResource, CheckpointSaver, LedgerWriter {
  claimInboundEvent(eventKey: string): Promise<'claimed' | 'duplicate'>;
  findUser(externalUserId: string): Promise<User | null>;
  createUser(data: { externalUserId: string; displayName: string; preferences?: object }): Promise<User>;
  touchUserLastActive(userId: string): Promise<void>;
  updateUserPreferences(userId: string, prefs: object): Promise<void>;
  countUserMessagesSince(userId: string, since: Date): Promise<number>;
  findActiveSession(userId: string): Promise<Session | null>;
  createSession(userId: string): Promise<Session>;
  incrementSessionMessageCount(sessionId: string, amount?: number): Promise<void>;
  endSession(sessionId: string, summary: string): Promise<void>;
  endSessionWithSummary(sessionId: string, endedAt: Date, kv: Record<string, unknown>): Promise<void>;
  getRecentSummaries(userId: string, limit: number): Promise<string[]>;
  getSessionKV(sessionId: string): Promise<Record<string, unknown>>;
  updateSessionKV(sessionId: string, kv: Record<string, unknown>): Promise<void>;
  createMessage(data: Omit<Message, 'id' | 'createdAt' | 'metadata'> & { metadata?: Record<string, unknown> }): Promise<Message>;
  getRecentMessages(sessionId: string, limit: number): Promise<Message[]>;
  getMessagesWithMetadata(userId: string, since: Date): Promise<Message[]>;
  updateMessageMetadata(id: string, metadata: Record<string, unknown>): Promise<void>;
}
