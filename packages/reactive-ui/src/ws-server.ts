import { WebSocketServer, WebSocket } from 'ws';
import { ReactiveUiProvider, JsonValue } from '@zupa/core';
import type { IncomingMessage } from 'http';

/**
 * WebSocket implementation of the Zupa Reactive UI Provider.
 * Allows connecting React (or other) frontend clients to stream
 * state deltas and tokens in real-time, and receive client events.
 */
export class WsReactiveUiServer implements ReactiveUiProvider {
    private wss?: WebSocketServer;
    private readonly clients = new Map<string, WebSocket>();

    private eventHandlers = new Set<(clientId: string, type: string, payload: unknown) => void>();
    private connectHandlers = new Set<(clientId: string) => void>();
    private disconnectHandlers = new Set<(clientId: string) => void>();

    /**
     * Attaches the WebSocket server to an existing HTTP/S server.
     */
    public attach(server: import('http').Server | import('https').Server, path: string = '/zupa/ws') {
        this.wss = new WebSocketServer({ server, path });

        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
            // Extract or generate a client ID
            // For real-time sync we often want the client to provide their session ID
            const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
            const clientId = url.searchParams.get('clientId') ?? `ws-${Date.now()}-${Math.random().toString(16).slice(2)}`;

            this.clients.set(clientId, ws);

            ws.on('message', (data: string) => {
                try {
                    const parsed = JSON.parse(data.toString());
                    if (parsed.type && this.eventHandlers.size > 0) {
                        for (const handler of this.eventHandlers) {
                            handler(clientId, parsed.type, parsed.payload);
                        }
                    }
                } catch (e) {
                    console.error(`[WsReactiveUiServer] Failed to parse incoming message from ${clientId}:`, e);
                }
            });

            ws.on('close', () => {
                this.clients.delete(clientId);
                for (const handler of this.disconnectHandlers) {
                    handler(clientId);
                }
            });

            // Trigger connect handlers
            for (const handler of this.connectHandlers) {
                handler(clientId);
            }
        });
    }

    public emitStateDelta(clientId: string, delta: Partial<Record<string, JsonValue>>): void {
        const ws = this.clients.get(clientId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'STATE_DELTA',
                payload: delta
            }));
        }
    }

    public emitTokenChunk(clientId: string, chunk: { id: string; content: string }): void {
        const ws = this.clients.get(clientId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'TOKEN_CHUNK',
                payload: chunk
            }));
        }
    }

    public onClientEvent(handler: (clientId: string, type: string, payload: unknown) => void): () => void {
        this.eventHandlers.add(handler);
        return () => this.eventHandlers.delete(handler);
    }

    public onClientConnect(handler: (clientId: string) => void): () => void {
        this.connectHandlers.add(handler);
        return () => this.connectHandlers.delete(handler);
    }

    public onClientDisconnect(handler: (clientId: string) => void): () => void {
        this.disconnectHandlers.add(handler);
        return () => this.disconnectHandlers.delete(handler);
    }

    public async destroy(): Promise<void> {
        for (const ws of this.clients.values()) {
            ws.close();
        }
        this.clients.clear();
        this.eventHandlers.clear();
        this.connectHandlers.clear();
        this.disconnectHandlers.clear();

        if (this.wss) {
            return new Promise((resolve, reject) => {
                this.wss!.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    }
}
