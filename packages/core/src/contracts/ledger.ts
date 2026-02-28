export interface LedgerEvent {
    topic: string;
    key: string;
    data: Record<string, unknown>;
}

export interface LedgerWriter {
    appendLedgerEvent(sessionId: string, event: LedgerEvent): Promise<void>;
}
