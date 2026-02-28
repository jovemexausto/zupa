import { createServer } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { createAgent } from '../src/api/createAgent';
import { FakeMessagingTransport } from '../src/integrations/transport/fake';
import { createFakeRuntimeDeps } from '../src/testing/fakes';

class AuthAwareTransport extends FakeMessagingTransport {
  private readonly qrHandlers = new Set<(qr: string) => void>();
  private readonly readyHandlers = new Set<() => void>();
  private readonly failureHandlers = new Set<(message: string) => void>();

  public onAuthQr(handler: (qr: string) => void): () => void {
    this.qrHandlers.add(handler);
    return () => this.qrHandlers.delete(handler);
  }

  public onAuthReady(handler: () => void): () => void {
    this.readyHandlers.add(handler);
    return () => this.readyHandlers.delete(handler);
  }

  public onAuthFailure(handler: (message: string) => void): () => void {
    this.failureHandlers.add(handler);
    return () => this.failureHandlers.delete(handler);
  }

  public emitQr(qr: string): void {
    for (const handler of this.qrHandlers) {
      handler(qr);
    }
  }

  public emitReady(): void {
    for (const handler of this.readyHandlers) {
      handler();
    }
  }

  public emitAuthFailure(message: string): void {
    for (const handler of this.failureHandlers) {
      handler(message);
    }
  }
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1');
    server.once('listening', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve free port'));
        return;
      }
      resolve(address.port);
    });
    server.once('error', reject);
  });
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return port;
}

async function readSseUntilContains(response: Response, expected: string, timeoutMs = 2_000): Promise<string> {
  if (!response.body) {
    throw new Error('SSE response has no body');
  }

  const reader = response.body.getReader();
  let fullText = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      if (!chunk.value) {
        continue;
      }
      fullText += new TextDecoder().decode(chunk.value);
      if (fullText.includes(expected)) {
        return fullText;
      }
    }
    return fullText;
  } finally {
    await reader.cancel();
  }
}

describe('built-in ui http server', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length > 0) {
      const close = closers.pop();
      if (close) {
        await close();
      }
    }
  });

  it('serves qr html page and streams events over sse', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = new AuthAwareTransport();
    const port = await getFreePort();

    const agent = createAgent({
      prompt: 'hello',
      providers: {
        transport,
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors,
        database: deps.database,
        telemetry: deps.telemetry
      },
      ui: {
        host: '127.0.0.1',
        port,
        sseHeartbeatMs: 100
      }
    });
    closers.push(() => agent.close());

    await agent.start();
    transport.emitQr('sample-qr');

    const rawQrResponse = await fetch(`http://127.0.0.1:${port}/auth/qr?format=raw`);
    expect(rawQrResponse.status).toBe(200);
    expect(await rawQrResponse.json()).toMatchObject({
      status: 'ok',
      qr: 'sample-qr'
    });

    const imageQrResponse = await fetch(`http://127.0.0.1:${port}/auth/qr`);
    expect(imageQrResponse.status).toBe(200);
    expect(imageQrResponse.headers.get('content-type')).toContain('text/html');
    const imageHtml = await imageQrResponse.text();
    expect(imageHtml).toContain('<img');
    expect(imageHtml).toContain('data:image/png;base64');

    const sseResponse = await fetch(`http://127.0.0.1:${port}/agent/events`);
    expect(sseResponse.status).toBe(200);
    expect(sseResponse.headers.get('content-type')).toContain('text/event-stream');

    transport.emitReady();
    const sseChunk = await readSseUntilContains(sseResponse, 'event: auth:ready');
    expect(sseChunk).toContain('event: auth:ready');
  });

  it('shows online status when already connected without qr', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = new AuthAwareTransport();
    const port = await getFreePort();

    const agent = createAgent({
      prompt: 'hello',
      providers: {
        transport,
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors,
        database: deps.database,
        telemetry: deps.telemetry
      },
      ui: { host: '127.0.0.1', port, sseHeartbeatMs: 100 }
    });
    closers.push(() => agent.close());

    await agent.start();

    transport.emitReady();

    const connectedQrPage = await fetch(`http://127.0.0.1:${port}/auth/qr`);
    expect(connectedQrPage.status).toBe(200);
    expect(connectedQrPage.headers.get('content-type')).toContain('text/html');
    const connectedHtml = await connectedQrPage.text();
    expect(connectedHtml).toContain('already online');

    const missingQrRaw = await fetch(`http://127.0.0.1:${port}/auth/qr?format=raw`);
    expect(missingQrRaw.status).toBe(200);
    expect(await missingQrRaw.json()).toMatchObject({
      status: 'online'
    });
  });

  it('returns expected errors for missing qr and invalid format', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = new AuthAwareTransport();
    const port = await getFreePort();

    const agent = createAgent({
      prompt: 'hello',
      providers: {
        transport,
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors,
        database: deps.database,
        telemetry: deps.telemetry
      },
      ui: { host: '127.0.0.1', port, sseHeartbeatMs: 100 }
    });
    closers.push(() => agent.close());

    await agent.start();

    const missingQrResponse = await fetch(`http://127.0.0.1:${port}/auth/qr?format=raw`);
    expect(missingQrResponse.status).toBe(404);

    const invalidFormatResponse = await fetch(`http://127.0.0.1:${port}/auth/qr?format=invalid`);
    expect(invalidFormatResponse.status).toBe(400);
  });

  it('enforces token auth when configured', async () => {
    const deps = createFakeRuntimeDeps();
    const transport = new AuthAwareTransport();
    const port = await getFreePort();

    const agent = createAgent({
      prompt: 'hello',
      providers: {
        transport,
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors,
        database: deps.database,
        telemetry: deps.telemetry
      },
      ui: {
        host: '127.0.0.1',
        port,
        authToken: 'secret-token',
        sseHeartbeatMs: 100
      }
    });
    closers.push(() => agent.close());

    await agent.start();

    const unauthorized = await fetch(`http://127.0.0.1:${port}/agent/events`);
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`http://127.0.0.1:${port}/agent/events?token=secret-token`);
    expect(authorized.status).toBe(200);
  });
});
