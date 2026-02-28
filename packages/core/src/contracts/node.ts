import { LedgerEvent } from './ledger';

export interface NodeResponse {
    next?: string;
}

export interface NodeResult<TStateDiff = unknown> {
    stateDiff: TStateDiff;
    ledgerEvents?: LedgerEvent[];
    nextTasks?: string[];
}

export interface NodeHandler<TState = Record<string, unknown>, TContext = Record<string, unknown>> {
    (state: TState, context: TContext): Promise<NodeResult<Partial<TState>> | NodeResponse | void>;
}
