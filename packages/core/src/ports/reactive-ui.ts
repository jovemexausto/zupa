import { type RuntimeResource } from "../lifecycle";
import { type JsonValue } from "../entities/session";
import { type OutboundMessage } from "./transport";

/**
 * ReactiveUiProvider — A session-aware, bidirectional port for AG-UI and CopilotKit style interactions.
 * Responsible for synchronizing agent state and streaming sub-word tokens down to specific connected clients.
 *
 * Implementations should subscribe to 'agent:stream:*' for outbound tokens and
 * emit 'transport:inbound' for client interactions.
 */
export interface ReactiveUiProvider extends RuntimeResource {
  /** Emits a partial state delta to a specific client to sync React components */
  emitStateDelta(clientId: string, delta: Partial<Record<string, JsonValue>>): void;

  /** Emits a sub-word language model token to a specific client */
  emitTokenChunk(clientId: string, chunk: { id: string; content: string }): void;

  /** Emits a full side-channel message to a specific client */
  emitSideMessage(clientId: string, message: OutboundMessage): void;
}
