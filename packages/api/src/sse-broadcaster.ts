import { DashboardProvider, EventBus } from '@zupa/core';
import { Response } from 'express';

interface ConnectedClient {
    id: string;
    response: Response;
}

/**
 * Express-compatible SSE broadcaster implementing DashboardProvider.
 * Streams JSON-formatted log lines and metrics to connected UI clients.
 */
export class SseDashboardBroadcaster implements DashboardProvider {
    private readonly clients = new Map<string, ConnectedClient>();
    private unsubscribe: (() => void) | null = null;

    constructor(private readonly bus: EventBus) {
        // Automatically attach to bus for streaming
        this.unsubscribe = this.bus.subscribe('*', (event) => {
            // Map bus event names to the dashboard's 'level' concept for backward compatibility
            this.emitLog(`${event.channel}:${event.name}`, event.payload);
        });
    }

    /**
     * Express route handler establishing the SSE stream.
     * Use e.g., `app.get('/agent/events', broadcaster.handleConnection.bind(broadcaster))`
     */
    public handleConnection(_req: unknown, res: Response): void {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        this.clients.set(clientId, { id: clientId, response: res });

        // Send initial connection event
        res.write('event: connected\ndata: {"status":"ok"}\n\n');

        res.on('close', () => {
            this.clients.delete(clientId);
        });
    }

    public async start(): Promise<void> {
        // Lifecycle start - connectivity is handled in constructor/subscription
    }

    public async close(): Promise<void> {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        for (const { response } of this.clients.values()) {
            response.end();
        }
        this.clients.clear();
    }

    /**
     * Implementation of DashboardProvider.emitLog.
     * Broadcasts the structured log object to all connected SSE clients.
     */
    public emitLog(level: string, payload: unknown): void {
        const message = JSON.stringify({ level, payload });
        const serialized = `data: ${message}\n\n`;

        for (const { response } of this.clients.values()) {
            response.write(serialized);
        }
    }

    /** @deprecated Use constructor-based attachment */
    public attachToBus(): void {
        // No-op for backward compatibility if needed, but we should prefer the new way
    }
}
