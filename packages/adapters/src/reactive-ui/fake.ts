import { type ReactiveUiProvider, type JsonValue } from '@zupa/core';

export class FakeReactiveUiProvider implements ReactiveUiProvider {
    public emittedChunks: Array<{ clientId: string; chunk: { id: string; content: string } }> = [];
    public emittedDeltas: Array<{ clientId: string; delta: Partial<Record<string, JsonValue>> }> = [];

    public emitStateDelta(clientId: string, delta: Partial<Record<string, JsonValue>>): void {
        this.emittedDeltas.push({ clientId, delta });
    }

    public emitTokenChunk(clientId: string, chunk: { id: string; content: string }): void {
        this.emittedChunks.push({ clientId, chunk });
    }

    public onClientEvent(handler: (clientId: string, type: string, payload: unknown) => void): () => void {
        return () => { };
    }

    public onClientConnect(handler: (clientId: string) => void): () => void {
        return () => { };
    }

    public onClientDisconnect(handler: (clientId: string) => void): () => void {
        return () => { };
    }

    public async start(): Promise<void> { }
    public async close(): Promise<void> { }
}
