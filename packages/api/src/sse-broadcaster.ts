import { DashboardProvider } from '@zupa/core';
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

    /**
     * Express route handler establishing the SSE stream.
     * Use e.g., `app.get('/agent/events', broadcaster.handleConnection.bind(broadcaster))`
     */
    public handleConnection(req: unknown, res: Response): void {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // CORS should typically be applied by earlier middleware, but we ensure it's open for the stream
        res.setHeader('Access-Control-Allow-Origin', '*');

        const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        this.clients.set(clientId, { id: clientId, response: res });

        // Send initial connection event
        res.write('event: connected\ndata: {"status":"ok"}\n\n');

        res.on('close', () => {
            this.clients.delete(clientId);
        });
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

    /** Cleanup the broadcaster on shutdown */
    public async destroy(): Promise<void> {
        for (const { response } of this.clients.values()) {
            response.end();
        }
        this.clients.clear();
    }
}
