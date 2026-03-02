# ADR 07: Decoupled Persistence Ports

## Status
Accepted

## Context
Previously, Zupa relied on a monolithic `DatabaseProvider` interface that conflated three distinct persistence responsibilities:
1. **Engine State Persistence**: Saving/restoring the high-frequency "super-step" state snapshots (Checkpoints).
2. **Audit Trails**: Storing an immutable, append-only stream of system events (Ledger).
3. **Product Domain Entities**: Managing Users, Sessions, and Messages (Domain Store).

This "God Port" approach made it difficult to scale horizontally (e.g., using Redis for fast checkpoints while using PostgreSQL for durable domain data) and forced all database adapters to implement logic that might not be relevant to their specific backend.

## Decision
We have performed a hard decoupling of the persistence layer, removing the `DatabaseProvider` entirely and replacing it with three specialized Ports in `@zupa/core`:

### 1. The Triad of Ports
- **`Checkpointer`**: Responsible for storing and retrieving engine execution snapshots. Optimized for high-frequency writes and indexed by `threadId`.
- **`Ledger`**: Responsible for append-only audit logs. Designed for observability and session reconstruction.
- **`DomainStore`**: Responsible for the "Source of Truth" regarding product entities (Users, Sessions, Messages) and event deduplication (`claimInboundEvent`).

### 2. Infrastructure Specialization
Adapters in `@zupa/adapters` are now organized by domain sub-directories (`checkpoint/`, `ledger/`, `domain-store/`) rather than a single `database/` catch-all. This allows for mixing and matching different vendors for different persistence needs.

### 3. Runtime Enforcement
The `@zupa/runtime` and `@zupa/engine` now explicitly depend on these three specific slots. Fallback logic for the legacy `database` property has been purged to ensure architectural strictness.

## Consequences

### Positive
- **Architectural Purity**: Each port has a single, well-defined responsibility aligned with Hexagonal principles.
- **Horizontal Scalability**: Developers can now choose the best storage engine for each tier (e.g., Memory/Redis for checkpoints, specialized Logging for Ledgers, RDBMS for Domain Store).
- **Vendor Agnosticism**: Simplifies implementation for new adapter authors as they only need to implement the specific interface they care about.

### Negative
- **Breaking Change**: All existing adapters and high-level configurations that relied on `database` semantics required updating.
- **Configuration Surface**: Initial configuration in `createAgent` requires providing three resources instead of one, though this is mitigated by `createLocalResources()` providing specialized fakes.
