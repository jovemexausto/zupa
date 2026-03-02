import { RuntimeResource } from "../lifecycle";
import { StateSnapshot, CheckpointSaver } from "../contracts/checkpoint";

/**
 * Checkpointer handles the high-frequency state snapshots of the Graph Engine.
 * It is optimized for sub-millisecond super-step state persistence.
 */
export interface Checkpointer<TState = Record<string, unknown>>
  extends RuntimeResource,
    CheckpointSaver<TState> {
  // Checkpointer is a specialization of CheckpointSaver that satisfies our resource lifecycle
}

export { StateSnapshot, CheckpointSaver };
