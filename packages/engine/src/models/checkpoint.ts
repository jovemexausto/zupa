/**
 * A reducer defines how a specific channel merges new writes into its current state.
 */
export type ChannelReducer<T> = (current: T | undefined, update: T) => T;
