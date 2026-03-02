# ADR 04: Durable Memory (Checkpoints vs Ledgers)

## Status
Accepted

## Context
A production-grade agent framework requires two distinct types of persistence that serve different technical and business needs:
1. **Execution Reliability**: The ability to resume a complex reasoning graph after a crash or timeout.
2. **Auditability & Compliance**: A permanent, immutable record of every action, cost, and decision made by the agent.

Initially, these were often conflated into a single "database" or "memory" layer, leading to performance bottlenecks when trying to load compact execution state from large audit logs.

## Decision
We have decided to formalize a **Dual-Write Memory** pattern, separating persistence into **Checkpoints** and **Ledgers**.

### 1. Checkpoints (`CheckpointSaver`)
- **Purpose**: System-level reliability.
- **Content**: A serialized snapshot of the entire Graph Engine state (channel values, next tasks, step counter).
- **Lifecycle**: High-frequency, potentially ephemeral. Only the most recent checkpoint (or a short history) is needed for "Resumability."
- **Storage**: Compact, binary-friendly, or JSON blobs.

### 2. Ledgers (`LedgerWriter`)
- **Purpose**: Business-level observability and auditing.
- **Content**: Immutable events such as `tool_call`, `llm_token_usage`, `user_interaction`, and `engine_decision`.
- **Lifecycle**: Append-only, persists forever. Used for analytics, billing, and debugging production regressions.
- **Storage**: Structured rows (e.g., SQL tables) indexed by `sessionId` or `requestId`.

### 3. Integrated Provider
While the interfaces are decoupled (`CheckpointSaver` vs `LedgerWriter`), Zupa provides a unified `DatabaseProvider` interface that implements both. This allows developers to use a single SQLite or Postgres instance for both needs while maintaining clean separation in the code.

## Consequences

### Positive
- **Performance**: The Engine only loads the compact `Checkpoint` to resume, ignoring gigabytes of audit logs.
- **Compliance**: Audit logs (Ledgers) can be easily offloaded to cold storage or analytics warehouses without breaking the runtime.
- **Time-Travel**: By keeping a history of Checkpoints, we can "rewind" an agent to a specific step to test alternative reasoning paths.

### Negative
- **Write Amplification**: Every step of the graph results in at least one checkpoint write and potentially multiple ledger writes.
- **Schema Management**: Requires maintaining both a state-blob table and structured event tables.
