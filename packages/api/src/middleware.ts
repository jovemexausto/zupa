import { Router, Request, Response } from 'express';

export interface ZupaApiState {
    agentId: string;
    latestAuthQr: { qr: string; updatedAt: string } | null;
    isOnline: boolean;
}

export interface ZupaApiOptions {
    /** Optional static auth token. Admin clients must provide this. */
    authToken?: string | undefined;
    /** Autonomous state source for the API endpoints */
    state: ZupaApiState;
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
    router.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            agentId: options.state.agentId,
            online: options.state.isOnline
        });
    });

    // Auth/QR code endpoint (requires auth)
    router.get('/auth/qr', requireAuth, async (_req, res) => {
        const { isOnline, latestAuthQr } = options.state;

        if (!latestAuthQr) {
            if (isOnline) {
                res.status(200).json({ status: 'online', message: 'Agent is already online' });
                return;
            }

            res.status(404).json({ status: 'error', message: 'QR payload not available yet' });
            return;
        }

        res.status(200).json({
            status: 'ok',
            qr: latestAuthQr.qr,
            updatedAt: latestAuthQr.updatedAt
        });
    });

    return router;
}
