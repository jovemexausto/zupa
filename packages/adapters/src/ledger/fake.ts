import { type Ledger, type LedgerEvent } from "@zupa/core";

export class FakeLedger implements Ledger {
  private readonly events = new Map<string, LedgerEvent[]>();

  public async start(): Promise<void> {}
  public async close(): Promise<void> {}

  public async appendLedgerEvent(sessionId: string, event: LedgerEvent): Promise<void> {
    const sessionEvents = this.events.get(sessionId) || [];
    sessionEvents.push(event);
    this.events.set(sessionId, sessionEvents);
  }
}
