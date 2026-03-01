import {
    type StateSnapshot,
    type CheckpointSaver,
    type LedgerEvent,
    type LedgerWriter
} from '@zupa/core';

/**
 * An in-memory, transient checkpoint saver.
 * Useful for stateless or short-lived graph executions (like the Router Graph
 * or test environments) to avoid persisting checkpoints to a durable database.
 * 
 * Implements full StateSnapshot history and LedgerEvent arrays.
 */
export class MemoryCheckpointSaver<TState = Record<string, unknown>> implements CheckpointSaver<TState>, LedgerWriter {
    protected readonly checkpoints = new Map<string, StateSnapshot<TState>[]>();
    protected readonly ledger = new Map<string, LedgerEvent[]>();

    public async putCheckpoint(threadId: string, snapshot: StateSnapshot<TState>): Promise<void> {
        const history = this.checkpoints.get(threadId) || [];
        history.push(snapshot);
        this.checkpoints.set(threadId, history);
    }

    public async getCheckpoint(threadId: string): Promise<StateSnapshot<TState> | null> {
        const history = this.checkpoints.get(threadId) || [];
        return history[history.length - 1] || null;
    }

    public async getCheckpointById(threadId: string, checkpointId: string): Promise<StateSnapshot<TState> | null> {
        const history = this.checkpoints.get(threadId) || [];
        return history.find(c => c.checkpointId === checkpointId) || null;
    }

    public async getCheckpointHistory(threadId: string): Promise<StateSnapshot<TState>[]> {
        return this.checkpoints.get(threadId) || [];
    }

    public async appendLedgerEvent(threadId: string, event: LedgerEvent): Promise<void> {
        const events = this.ledger.get(threadId) || [];
        events.push(event);
        this.ledger.set(threadId, events);
    }
}
