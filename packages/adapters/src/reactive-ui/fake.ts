import {
  type ReactiveUiProvider,
  type JsonValue,
  type RuntimeResourceContext,
  type OutboundMessage,
} from "@zupa/core";

export class FakeReactiveUiProvider implements ReactiveUiProvider {
  public emittedChunks: Array<{ clientId: string; chunk: { id: string; content: string } }> = [];
  public emittedDeltas: Array<{ clientId: string; delta: Partial<Record<string, JsonValue>> }> = [];
  public emittedSideMessages: Array<{ clientId: string; message: OutboundMessage }> = [];
  private context: RuntimeResourceContext | null = null;

  public emitStateDelta(clientId: string, delta: Partial<Record<string, JsonValue>>): void {
    this.emittedDeltas.push({ clientId, delta });
  }

  public emitTokenChunk(clientId: string, chunk: { id: string; content: string }): void {
    this.emittedChunks.push({ clientId, chunk });
  }

  public emitSideMessage(clientId: string, message: OutboundMessage): void {
    this.emittedSideMessages.push({ clientId, message });
  }

  /** Helper for testing: simulates an inbound event from the UI */
  public simulateInboundEvent(clientId: string, payload: any): void {
    this.context?.bus.emit({
      channel: "transport",
      name: "inbound",
      payload: {
        ...payload,
        source: "ui_channel",
        clientId,
      },
    });
  }

  public async start(context: RuntimeResourceContext): Promise<void> {
    this.context = context;
  }
  public async close(): Promise<void> { }
}
