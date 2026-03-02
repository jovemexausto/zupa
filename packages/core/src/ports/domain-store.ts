import { User } from "../entities/user";
import { Message } from "../entities/message";
import { Session } from "../entities/session";
import { RuntimeResource } from "../lifecycle";

/**
 * DomainStore handles the RELATIONAL and PRODUCT logic.
 * It manages users, sessions, and messages - the "source of truth"
 * for the product-level domain entities.
 */
export interface DomainStore extends RuntimeResource {
  // Event Deduplication
  claimInboundEvent(eventKey: string): Promise<"claimed" | "duplicate">;

  // Identity
  findUser(externalUserId: string): Promise<User | null>;
  createUser(data: {
    externalUserId: string;
    displayName: string;
    preferences?: object;
  }): Promise<User>;
  /** Updates a user's display name or preferences */
  updateUser(userId: string, data: { displayName?: string; preferences?: object }): Promise<void>;
  touchUserLastActive(userId: string): Promise<void>;
  updateUserPreferences(userId: string, prefs: object): Promise<void>;
  countUserMessagesSince(userId: string, since: Date): Promise<number>;

  // Session
  touchSession(sessionId: string): Promise<void>;
  findActiveSession(userId: string): Promise<Session | null>;
  createSession(userId: string): Promise<Session>;
  incrementSessionMessageCount(sessionId: string, amount?: number): Promise<void>;
  endSession(sessionId: string, summary: string): Promise<void>;
  endSessionWithSummary(sessionId: string, endedAt: Date, summary: string): Promise<void>;
  getRecentSummaries(userId: string, limit: number): Promise<string[]>;

  // Messaging Persistence
  createMessage(
    data: Omit<Message, "id" | "createdAt" | "metadata"> & { metadata?: Record<string, unknown> },
  ): Promise<Message>;
  getRecentMessages(sessionId: string, limit: number): Promise<Message[]>;
  getMessagesWithMetadata(userId: string, since: Date): Promise<Message[]>;
  updateMessageMetadata(id: string, metadata: Record<string, unknown>): Promise<void>;
}
