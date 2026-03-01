import { type RuntimeResource } from "../lifecycle";
import { type JsonValue } from "../entities/session";

/**
 * ReactiveUiProvider — A session-aware, bidirectional port for AG-UI and CopilotKit style interactions.
 * Responsible for synchronizing agent state and streaming sub-word tokens down to specific connected clients.
 */
export interface ReactiveUiProvider extends RuntimeResource {
    /** Emits a partial state delta to a specific client to sync React components */
    emitStateDelta(clientId: string, delta: Partial<Record<string, JsonValue>>): void;

    /** Emits a sub-word language model token to a specific client */
    emitTokenChunk(clientId: string, chunk: { id: string; content: string }): void;

    /** Registers a handler for interactive UI events (like button clicks) or standard chatting from the client */
    onClientEvent(handler: (clientId: string, type: string, payload: unknown) => void): () => void;

    /** Registers a handler fired when a specific client connects */
    onClientConnect(handler: (clientId: string) => void): () => void;

    /** Registers a handler fired when a specific client disconnects */
    onClientDisconnect(handler: (clientId: string) => void): () => void;
}
