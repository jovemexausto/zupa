# ADR 06: Hexagonal Monorepo Architecture

## Status
Accepted

## Context
As a "Batteries-Included" framework, Zupa must support multiple vendors (OpenAI, SQLite, WhatsApp, etc.) without coupling the core logic to any single one. We also need to distribute the framework in a way that allows users to use only the pieces they need.

## Decision
We use a **Hexagonal Architecture (Ports & Adapters)** mapped across a **pnpm monorepo**.

### 1. Package Responsibilities
- **`@zupa/core`**: The "Domain" layer. Contains interfaces (Ports), Entities (User, Session), and Schemas. **Zero dependencies on I/O or other Zupa packages.**
- **`@zupa/engine`**: The "Execution" layer. A pure BSP/Pregel graph executor. Depends only on `@zupa/core`.
- **`@zupa/runtime`**: The "Orchestration" layer. Binds graphs to transports, manages sessions, and implements the "Event Machine." Depends on `core` and `engine`.
- **`@zupa/adapters`**: The "Infrastructure" layer. Contains concrete implementations of Ports (e.g., `OpenAILLM`, `SQLiteDatabase`). Handles all external I/O.
- **`zupa`**: The "Public Facade." It is the entry point for end-users, providing `createAgent()` and re-exporting the runtime with pre-configured defaults.

### 2. Dependency Rules
1. **Core upwards**: Nothing inside `@zupa/core` may import from other packages.
2. **Adapters isolated**: No core logic should ever import from `@zupa/adapters`. Adapters are injected at runtime via dependency injection.
3. **Circular cleanup**: No circular dependencies are allowed between `engine`, `runtime`, and `core`.

## Consequences

### Positive
- **Testability**: The core and engine can be tested with 100% pure fakes from `@zupa/testing`.
- **Swappability**: Replacing the database or transport involves changing one line in the `createAgent` config.
- **Minimal Footprint**: Users who only want the Graph Engine don't need to pull in WhatsApp or Express dependencies.

### Negative
- **Boilerplate**: Adding a new feature often requires touching multiple packages (defining the Port in `core`, implementing in `adapters`, and wiring in `runtime`).
- **Build Complexity**: Requires a robust monorepo tool (Turbo) to manage build order and caching.
