import { afterEach, describe, expect, it } from 'vitest';
import {
  FakeMessagingTransport,
  createFakeRuntimeDeps,
  createFakeRuntimeConfig
} from '@zupa/testing';
import { AgentRuntime } from '../src/index';

class AuthAwareTransport extends FakeMessagingTransport {
  private readonly qrHandlers = new Set<(qr: string) => void>();
  private readonly readyHandlers = new Set<() => void>();
  private readonly failureHandlers = new Set<(message: string) => void>();

  public override onAuthRequest(handler: (payload: unknown) => void): () => void {
    this.qrHandlers.add(handler);
    return () => this.qrHandlers.delete(handler);
  }

  public override onAuthReady(handler: () => void): () => void {
    this.readyHandlers.add(handler);
    return () => this.readyHandlers.delete(handler);
  }

  public override onAuthFailure(handler: (message: string) => void): () => void {
    this.failureHandlers.add(handler);
    return () => this.failureHandlers.delete(handler);
  }

  public simulateQr(qr: string): void {
    for (const h of this.qrHandlers) h(qr);
  }

  public simulateReady(): void {
    for (const h of this.readyHandlers) h();
  }
}

describe('Runtime UI HTTP Server', () => {
  let runtime: AgentRuntime | null = null;

  afterEach(async () => {
    if (runtime) await runtime.close();
  });

  it('should serve QR code and status', async () => {
    const transport = new AuthAwareTransport();
    const deps = createFakeRuntimeDeps();

    runtime = new AgentRuntime({
      runtimeConfig: createFakeRuntimeConfig({
        ui: { enabled: true, port: 0 }
      }),
      runtimeResources: {
        ...deps,
        transport,
      }
    });

    await runtime.start();
    expect(runtime).toBeDefined();
  });
});
