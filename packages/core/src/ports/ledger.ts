import { RuntimeResource } from "../lifecycle";
import { LedgerEvent, LedgerWriter } from "../contracts/ledger";

/**
 * Ledger handles the immutable audit history of the system.
 * It is an append-only stream of events for compliance and observability.
 */
export interface Ledger extends LedgerWriter, RuntimeResource {
    // Ledger is a specialization of LedgerWriter that satisfies our resource lifecycle
}

export { LedgerEvent, LedgerWriter };
