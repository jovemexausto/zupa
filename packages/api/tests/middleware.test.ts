import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createZupaApi } from '../src/middleware';

describe('Zupa API Middleware', () => {
    it('serves /health check correctly', async () => {
        const app = express();
        app.use('/', createZupaApi({
            getAgentId: () => 'agent-123',
            getLatestAuthQr: () => null,
            isOnline: () => true
        }));

        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: 'ok',
            agentId: 'agent-123',
            online: true
        });
    });

    describe('Static Auth Token', () => {
        const authOptions = {
            authToken: 'secret-token',
            getAgentId: () => 'agent-1',
            getLatestAuthQr: () => null,
            isOnline: () => false
        };

        it('denies access to /auth/qr without token', async () => {
            const app = express();
            app.use('/', createZupaApi(authOptions));

            const response = await request(app).get('/auth/qr');
            expect(response.status).toBe(401);
        });

        it('grants access to /auth/qr with query token', async () => {
            const app = express();
            app.use('/', createZupaApi(authOptions));

            const response = await request(app).get('/auth/qr?token=secret-token');
            expect(response.status).not.toBe(401);
        });

        it('grants access to /auth/qr with Bearer token', async () => {
            const app = express();
            app.use('/', createZupaApi(authOptions));

            const response = await request(app)
                .get('/auth/qr')
                .set('Authorization', 'Bearer secret-token');

            expect(response.status).not.toBe(401);
        });
    });

    describe('/auth/qr endpoints', () => {
        const app = express();
        app.use('/', createZupaApi({
            getAgentId: () => 'test',
            getLatestAuthQr: () => ({ qr: 'test-qr-data', updatedAt: '2023-01-01T00:00:00.000Z' }),
            isOnline: () => false
        }));

        it('returns JSON payload with qr info', async () => {
            const response = await request(app).get('/auth/qr');
            expect(response.status).toBe(200);
            expect(response.body.status).toBe('ok');
            expect(response.body.qr).toBe('test-qr-data');
            expect(response.body.updatedAt).toBe('2023-01-01T00:00:00.000Z');
        });
    });
});
