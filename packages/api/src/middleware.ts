import { Router, Request, Response } from 'express';

export interface ZupaApiOptions {
    /** Optional static auth token. Admin clients must provide this. */
    authToken?: string;
    /** Function to retrieve the current agent ID or session ID */
    getAgentId: () => string;
    /** Function to get the latest QR code session link (if waiting for WhatsApp auth) */
    getLatestAuthQr: () => { qr: string; updatedAt: string } | null;
    /** Function to check if the underlying transport is online */
    isOnline: () => boolean;
}

/**
 * Creates an Express router containing the base Zupa REST API endpoints.
 * Includes health checks, auth token validation, and WhatsApp QR rendering.
 */
export function createZupaApi(options: ZupaApiOptions): Router {
    const router = Router();

    // Middleware to enforce static auth token
    const requireAuth = (req: Request, res: Response, next: Function) => {
        if (!options.authToken) {
            return next();
        }

        const queryToken = req.query.token as string | undefined;
        if (queryToken && queryToken === options.authToken) {
            return next();
        }

        const authHeader = req.headers.authorization?.trim();
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice('Bearer '.length);
            if (token === options.authToken) {
                return next();
            }
        }

        res.status(401).json({ status: 'error', message: 'Unauthorized' });
    };

    // Health check endpoint (always accessible)
    router.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            agentId: options.getAgentId(),
            online: options.isOnline()
        });
    });

    // Auth/QR code endpoint (requires auth)
    router.get('/auth/qr', requireAuth, async (req, res) => {
        const isOnline = options.isOnline();
        const qrState = options.getLatestAuthQr();

        if (!qrState) {
            if (isOnline) {
                res.status(200).json({ status: 'online', message: 'Agent is already online' });
                return;
            }

            res.status(404).json({ status: 'error', message: 'QR payload not available yet' });
            return;
        }

        res.status(200).json({
            status: 'ok',
            qr: qrState.qr,
            updatedAt: qrState.updatedAt
        });
    });

    return router;
}
