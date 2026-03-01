import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { WsReactiveUiServer } from '../src/ws-server';
import { createServer, Server } from 'http';
import WebSocket from 'ws';

describe('WsReactiveUiServer', () => {
    let httpServer: Server;
    let uiServer: WsReactiveUiServer;
    let port: number;

    beforeAll(async () => {
        httpServer = createServer();
        uiServer = new WsReactiveUiServer();
        uiServer.attach(httpServer, '/zupa/ws');

        await new Promise<void>((resolve) => {
            httpServer.listen(0, '127.0.0.1', () => {
                port = (httpServer.address() as any).port;
                resolve();
            });
        });
    });

    afterAll(async () => {
        await uiServer.destroy();
        await new Promise<void>((resolve) => {
            httpServer.close(() => resolve());
        });
    });

    it('triggers onClientConnect when a new client connects', async () => {
        const connectHandler = vi.fn();
        const unsub = uiServer.onClientConnect(connectHandler);

        const client = new WebSocket(`ws://127.0.0.1:${port}/zupa/ws?clientId=test-client-1`);

        await new Promise<void>((resolve) => {
            client.on('open', () => resolve());
        });

        expect(connectHandler).toHaveBeenCalledWith('test-client-1');

        client.close();
        unsub();
    });

    it('emits state deltas to the specific client', async () => {
        const client = new WebSocket(`ws://127.0.0.1:${port}/zupa/ws?clientId=test-client-2`);

        await new Promise<void>((resolve) => client.on('open', () => resolve()));

        const messagePromise = new Promise<any>((resolve) => {
            client.on('message', (data) => {
                resolve(JSON.parse(data.toString()));
            });
        });

        uiServer.emitStateDelta('test-client-2', { foo: 'bar' });

        const received = await messagePromise;
        expect(received).toEqual({
            type: 'STATE_DELTA',
            payload: { foo: 'bar' }
        });

        client.close();
    });

    it('receives client events and dispatches them', async () => {
        const eventHandler = vi.fn();
        const unsub = uiServer.onClientEvent(eventHandler);

        const client = new WebSocket(`ws://127.0.0.1:${port}/zupa/ws?clientId=test-client-3`);
        await new Promise<void>((resolve) => client.on('open', () => resolve()));

        client.send(JSON.stringify({
            type: 'USER_MESSAGE',
            payload: { text: 'hello zupa' }
        }));

        // Wait a small tick for the server to process the message
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(eventHandler).toHaveBeenCalledWith('test-client-3', 'USER_MESSAGE', { text: 'hello zupa' });

        client.close();
        unsub();
    });

    it('triggers onClientDisconnect when socket closes', async () => {
        const disconnectHandler = vi.fn();
        const unsub = uiServer.onClientDisconnect(disconnectHandler);

        const client = new WebSocket(`ws://127.0.0.1:${port}/zupa/ws?clientId=test-client-4`);
        await new Promise<void>((resolve) => client.on('open', () => resolve()));

        client.close();

        // Wait a small tick for the server disconnect event
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(disconnectHandler).toHaveBeenCalledWith('test-client-4');
        unsub();
    });
});
