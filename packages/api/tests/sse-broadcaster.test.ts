import { describe, it, expect, vi } from 'vitest';
import { SseDashboardBroadcaster } from '../src/sse-broadcaster';
import { Response } from 'express';

describe('SseDashboardBroadcaster', () => {
    it('sends connected event on handleConnection', () => {
        const broadcaster = new SseDashboardBroadcaster();

        const mockWrite = vi.fn();
        const mockOn = vi.fn();
        const mockSetHeader = vi.fn();

        const mockRes = {
            statusCode: 0,
            setHeader: mockSetHeader,
            write: mockWrite,
            on: mockOn,
        } as unknown as Response;

        broadcaster.handleConnection(null, mockRes);

        expect(mockRes.statusCode).toBe(200);
        expect(mockSetHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
        expect(mockWrite).toHaveBeenCalledWith('event: connected\ndata: {"status":"ok"}\n\n');
        expect(mockOn).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('broadcasts logs to connected clients', () => {
        const broadcaster = new SseDashboardBroadcaster();

        const mockWrite1 = vi.fn();
        const mockRes1 = {
            setHeader: vi.fn(),
            write: mockWrite1,
            on: vi.fn(),
        } as unknown as Response;

        const mockWrite2 = vi.fn();
        const mockRes2 = {
            setHeader: vi.fn(),
            write: mockWrite2,
            on: vi.fn(),
        } as unknown as Response;

        // Connect two clients
        broadcaster.handleConnection(null, mockRes1);
        broadcaster.handleConnection(null, mockRes2);

        // Clear the initial "connected" writes
        mockWrite1.mockClear();
        mockWrite2.mockClear();

        // Emit a log
        broadcaster.emitLog('info', { message: 'hello world' });

        const expectedPayload = 'data: {"level":"info","payload":{"message":"hello world"}}\n\n';
        expect(mockWrite1).toHaveBeenCalledWith(expectedPayload);
        expect(mockWrite2).toHaveBeenCalledWith(expectedPayload);
    });

    it('removes clients on disconnect', () => {
        const broadcaster = new SseDashboardBroadcaster();

        let closeCallback: Function | undefined;
        const mockOn = vi.fn((event, cb) => {
            if (event === 'close') closeCallback = cb;
        });

        const mockWrite = vi.fn();
        const mockRes = {
            setHeader: vi.fn(),
            write: mockWrite,
            on: mockOn,
        } as unknown as Response;

        broadcaster.handleConnection(null, mockRes);

        // Ensure client is connected by emitting a log
        mockWrite.mockClear();
        broadcaster.emitLog('info', 'test1');
        expect(mockWrite).toHaveBeenCalled();

        // Simulate disconnect
        mockWrite.mockClear();
        expect(closeCallback).toBeDefined();
        closeCallback?.();

        // Emit another log, should not write to disconnected client
        broadcaster.emitLog('info', 'test2');
        expect(mockWrite).not.toHaveBeenCalled();
    });
});
