# RFC: Adapter Archetypes & Typesafe Persistence Topology

**Date:** 2026-03-02
**Status:** PROPOSED

## 1. Introduction
Zupa relies on a strict interpretation of the **Hexagonal (Ports and Adapters)** architecture. However, all ports are currently treated equally under a "flat" structure. As the framework matures, a crucial distinction has emerged between **Plugin Adapters** (which provide external capabilities) and **Internal Adapters** (which represent core system infrastructure). 

Furthermore, the recent decoupling of persistence into Checkpointer, Ledger, and DomainStore mandates a clean strategy for managing shared database infrastructure without losing architectural purity or type safety.

This RFC proposes:
1.  Formalizing the categorization between Plugin and Internal Adapters.
2.  Defining "Unified" vs. "Distributed" persistence topologies.
3.  Establishing a first-class, typesafe configuration pattern for the persistence layer.
4.  Formalizing lifecycle-driven migrations for framework-managed data.

## 2. Formalizing Adapter Archetypes

### A. Plugin Adapters (Services)
Plugin Adapters represent the framework’s integration with the outside world. They are user-centric, high-volatility "perception and action" layers.
*   **Examples:** `LLMProvider`, `MessagingTransport`, `STTProvider`.
*   **Codebase Impact:** These are loosely coupled, externally stateless, and heavily customized by developers via `createAgent(config)`. 

### B. Internal Adapters (Infrastructure)
Internal Adapters are the infrastructure glue required for the engine's correctness. They are system-centric, low-volatility components deep within the execution engine.
*   **Examples:** `EventBus`, `Checkpointer`, `Ledger`, `ReactiveUiProvider`.
*   **Codebase Impact:** These require property-based testing and strict interface versioning. They often share the same underlying technical infrastructure (e.g., a single SQL database).

**Note on DomainStore:** It acts as a hybrid—swappable like a plugin, but relied upon structurally by internal nodes (e.g., Identity/Session resolution).

## 3. Persistence Topologies: Unified vs. Distributed
With the removal of the monolithic `DatabaseProvider`, users now configure three persistence ports. Zupa must formally support two topologies to avoid connection pool exhaustion and reduce boilerplate:

### The "Unified" Topology (Batteries Included)
For 90% of local or traditional SQL deployments, a single database is optimal. 
*   **Pattern:** **Interface Composition**. A single class implements all three interfaces.
*   **Example:** `class SqlitePersistenceProvider implements Checkpointer, Ledger, DomainStore`. The user instantiates one object and shares it across the three ports.

### The "Distributed" Topology (High Scale)
For high-scale or specialized compliance environments, data can be physically isolated.
*   **Pattern:** Separate adapter instances. 
*   **Example:** Redis for `Checkpointer` (ephemeral state), ClickHouse for `Ledger` (immutable audits), Postgres for `DomainStore` (relational entities).

## 4. First-Class Typesafe Configuration
To prevent "half-persisted" states (e.g., configuring a DomainStore but forgetting a Checkpointer), we must enforce the persistence topology at the TypeScript compiler level within the `providers` configuration.

Instead of independent optional slots in the configuration, we introduce a strict `persistence` union type:

```typescript
// @zupa/core/src/ports/unified-persistence.ts
export type UnifiedPersistence = Checkpointer & Ledger & DomainStore;

// @zupa/zupa/src/api/createAgent.ts (or equivalent config types)
export type PersistenceConfig = 
  | UnifiedPersistence 
  | { checkpointer: Checkpointer; ledger: Ledger; domainStore: DomainStore };

export interface AgentProvidersConfig {
  persistence?: PersistenceConfig; // Source of truth
  llm?: LLMProvider;
  transport?: MessagingTransport;
  // ... other services
}
```

This structural union forces the developer to explicitly choose: either provide one cohesive object that implements all three interfaces, or provide the complete distributed triad.

## 5. Lifecycle-Driven Migrations
Zupa is designed for standalone, durable agents. Relying on external CLI tools for SQL migrations breaks this "batteries-included" DX.

As Internal Adapters inherit from `RuntimeResource`, persistence adapters **MUST** leverage the `start(ctx)` lifecycle hook to self-manage their schemas.

```typescript
export class PostgresUnifiedPersistence implements UnifiedPersistence, RuntimeResource {
  async start(ctx: RuntimeResourceContext) {
    ctx.logger.info("Initializing unified schemas...");
    // 1. Check if tables exist
    // 2. Perform delta migrations
    // 3. Ensure indices 
  }
}
```
This guarantees the data layer is ready to receive executing Pregel step data before the first turn begins.

## 6. Implementation Details (Codebase Changes)
To implement this Typesafe Persistence Topology, the following concrete repository changes are required:

### 1. `@zupa/core`: Define `UnifiedPersistence`
Create `packages/core/src/ports/unified-persistence.ts` and export it in `index.ts`.
```typescript
import type { Checkpointer } from './checkpointer';
import type { Ledger } from './ledger';
import type { DomainStore } from './domain-store';

export type UnifiedPersistence = Checkpointer & Ledger & DomainStore;
```

### 2. `@zupa/zupa`: Update `AgentProvidersConfig`
Modify `packages/zupa/src/api/createAgent.ts` to enforce the new `persistence` type, removing the individual optional slots for `checkpointer`, `ledger`, and `domainStore` from the public API boundary.

```typescript
export type PersistenceConfig = 
  | UnifiedPersistence 
  | { checkpointer: Checkpointer; ledger: Ledger; domainStore: DomainStore };

export type AgentProvidersConfig = Partial<Omit<RuntimeResourceSet, 'transport' | 'checkpointer' | 'ledger' | 'domainStore'>> & {
  transport?: MessagingTransport<unknown>;
  persistence?: PersistenceConfig;
};
```

### 3. `@zupa/zupa`: Unpack Persistence in `applyDefaultProviders`
Update the `applyDefaultProviders` function in `packages/zupa/src/api/createAgent.ts` to map the unified `persistence` property to the internal `RuntimeResourceSet` triad.

```typescript
function applyDefaultProviders(resources: AgentProvidersConfig): RuntimeResourceSet {
  const defaults = createLocalResources();
  
  // Resolve persistence topology
  let checkpointer = defaults.checkpointer;
  let ledger = defaults.ledger;
  let domainStore = defaults.domainStore;

  if (resources.persistence) {
    if ('checkpointer' in resources.persistence) {
      // Distributed Triad
      checkpointer = resources.persistence.checkpointer;
      ledger = resources.persistence.ledger;
      domainStore = resources.persistence.domainStore;
    } else {
      // Unified Implementation
      const unified = resources.persistence as UnifiedPersistence;
      checkpointer = unified;
      ledger = unified;
      domainStore = unified;
    }
  }

  return {
    // ...other providers (llm, bus, transport, etc.)
    checkpointer,
    ledger,
    domainStore,
  };
}
```

### 4. `@zupa/adapters`: Expand Unified Tooling
While we currently have decoupled `FakeCheckpointer`, `FakeLedger`, and `FakeDomainStore`, local development and standard SQL rollouts would greatly benefit from unified variants (e.g., `FakeUnifiedPersistence`, `SqliteUnifiedPersistence`). This ensures the "batteries-included" DX matches the newly enforced typesafe `persistence` config.
