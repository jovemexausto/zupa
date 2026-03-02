import {
    type StateSnapshot,
    type Checkpointer,
} from '@zupa/core';

export class FakeCheckpointer implements Checkpointer {
    private readonly checkpoints = new Map<string, StateSnapshot[]>();

    public async start(): Promise<void> { }
    public async close(): Promise<void> { }

    public async putCheckpoint(threadId: string, snapshot: StateSnapshot): Promise<void> {
        const threadCheckpoints = this.checkpoints.get(threadId) || [];
        threadCheckpoints.push(snapshot);
        this.checkpoints.set(threadId, threadCheckpoints);
    }

    public async getCheckpoint(threadId: string): Promise<StateSnapshot | null> {
        const threadCheckpoints = this.checkpoints.get(threadId) || [];
        return threadCheckpoints[threadCheckpoints.length - 1] || null;
    }

    public async getCheckpointById(threadId: string, checkpointId: string): Promise<StateSnapshot | null> {
        const threadCheckpoints = this.checkpoints.get(threadId) || [];
        return threadCheckpoints.find(c => c.checkpointId === checkpointId) || null;
    }

    public async getCheckpointHistory(threadId: string): Promise<StateSnapshot[]> {
        return this.checkpoints.get(threadId) || [];
    }
}
