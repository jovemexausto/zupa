# RFC: Decoupling Persistence (State vs. Ledger vs. Domain)

## 1. Introduction
Historically, Zupa has used a monolithic `DatabaseProvider` interface to handle three fundamentally different types of data:
1. **Engine State** (Checkpoints): High-frequency snapshots of the graph execution.
2. **Audit History** (Ledgers): Immutable event streams of system and agent actions.
3. **Domain Entities** (Users, Sessions, Messages): Relational data that powers the product logic.

This RFC proposes **completely removing** the `DatabaseProvider` interface and all "database" semantics in favor of three specialized, independent ports. This is a breaking change designed to enforce architectural boundaries and enable specialized horizontal scaling.

## 2. Goals
- **Architectural Purity**: Match I/O patterns to their specific needs.
- **Horizontal Scalability**: Enable the use of specialized storage engines for execution state (e.g., Redis) separately from relational data (e.g., Postgres) and archive data (e.g., S3).
- **Enforced Decoupling**: Prevent the cross-contamination of domain logic with engine state by removing the shared "database" facade.

## 3. Proposed Changes

### A. Interface Replacement (`@zupa/core`)
The monolithic `DatabaseProvider` is removed. It is replaced by three atomic ports:

```ts
/** 1. The Engine's Gearbox: High-frequency execution state */
export interface Checkpointer<TState = Record<string, unknown>> extends RuntimeResource {
    putCheckpoint(threadId: string, snapshot: StateSnapshot<TState>): Promise<void>;
    getCheckpoint(threadId: string): Promise<StateSnapshot<TState> | null>;
}

/** 2. The System's Black Box: Immutable audit history */
export interface Ledger extends RuntimeResource {
    appendLedgerEvent(threadId: string, event: LedgerEvent): Promise<void>;
}

/** 3. The Product's Brain: Relational domain data */
export interface DomainStore extends RuntimeResource {
    findUser(externalUserId: string): Promise<User | null>;
    createUser(data: { externalUserId: string; displayName: string; }): Promise<User>;
    // ... other entity methods
}
```

### B. Specialized Adapter Modules (`@zupa/adapters`)
Adapters are moved out of the `database/` catch-all directory into specialized domains:
- `packages/adapters/src/checkpoint/`: Memory, Redis, etc.
- `packages/adapters/src/ledger/`: Console, Postgres, Clickhouse, etc.
- `packages/adapters/src/domain-store/`: In-memory fakes, Postgres, SQLite, etc.

### C. Runtime Orchestration (`@zupa/runtime`)
The `AgentRuntime` no longer accepts a `database` resource. It requires (or defaults) specific slots:
- **Engine** consumes `checkpointer`.
- **Audit logic** consumes `ledger`.
- **Identity/Session Nodes** consume `domainStore`.

## 4. Why this matters for "Zupa Cloud"
- **Local VPS**: Specialized fakes or single-file implementations (e.g., SQLite) can still be used for all three, but through explicit wiring or high-level factories.
- **Zupa Cloud / Kubernetes**: 
  - **Checkpointer**: Redis (Sub-millisecond latency for super-steps).
  - **Ledger**: S3 or Google Cloud Logging (Cheap, infinite storage).
  - **DomainStore**: Managed Postgres (Reliable relational data).

## 5. Implementation Phases

### Phase 1: Core Clean-up
- DELETE `DatabaseProvider` from `@zupa/core`.
- Update `RuntimeResourceSet` to remove the `database` key.

### Phase 2: Adapter Realignment
- Move `FakeDatabaseBackend` logic into `FakeLedger` and `FakeDomainStore`.
- Create specialized directories in `packages/adapters/src/ledger` and `packages/adapters/src/domain-store`.

### Phase 3: Runtime & Engine Purge
- Remove `database` logic from `AgentRuntime`, `EngineExecutor`, and `createAgent`.
- Update all internal nodes to use `domainStore` instead of `database`.

## 6. Verification
- Monorepo build must succeed with zero references to `DatabaseProvider`.
- Automated tests for `AgentRuntime` updated to provide the new triad of providers.
