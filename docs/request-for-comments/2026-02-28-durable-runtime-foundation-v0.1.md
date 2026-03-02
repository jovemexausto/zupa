# RFC: Durable Runtime Foundation for Long-Running Orchestration (v0.1 - Streamlined)

- **Date:** 2026-02-28
- **Status:** Research Draft (Pregel-Streamlined)
- **Target:** Zupa v1.x kernel + orchestration foundation track
- **Normative source for:** durability, checkpointing, wait/resume, and outbox semantics
- **Related umbrella RFC:** `docs/rfcs/2026-02-28-unified-multiflow-hitl-v0.2.md`
- **Related lifecycle RFC:** `docs/rfcs/2026-02-28-response-lifecycle-policy-hooks-v0.1.md`
- **Related scheduling RFC:** `docs/rfcs/2026-02-28-scheduled-flows-autonomous-v0.1.md`
- **External references (normative inspiration):**
  - LangGraph PregelLoop architecture
  - Bulk Synchronous Parallel (BSP) model

## 1. Problem Statement

Zupa now has design-approved RFCs for:
- multi-flow generators,
- HITL interrupts (including proxy mode),
- policy lifecycle hooks,
- scheduled flows with campaign fan-out.

These features require long-lived, resumable execution semantics. Current runtime is deterministic per turn, but it is not yet a complete durable orchestration substrate for pause/resume across restarts, timeout-driven resumes, and exactly-once outbound side effects.

Without a durability foundation, feature implementations risk:
- duplicate side effects under retries/restarts,
- non-replayable flow/HITL transitions,
- fragile timeout and resume behavior,
- scheduler and HITL race-condition drift.

This RFC defines the base architecture that must exist before implementing higher-level features, taking deep architectural inspiration from LangGraph's Pregel execution runtime.

## 2. Current Baseline and Readiness Assessment

### 2.1 Strengths in current codebase

1. Deterministic node pipeline is established (`access_policy` -> `telemetry_emit`).
2. Inbound dedup baseline exists via `claimInboundEvent(...)`.
3. Runtime has bounded ingress concurrency and overload shedding.
4. LLM/STT/TTS/tool operations already have timeout + bounded retry primitives.
5. Phase contracts (`requires/provides`) enforce internal state invariants.

Code grounding:
- `packages/zupa/src/core/kernel/context.ts`
- `packages/zupa/src/core/kernel/nodes/sessionAttach.ts`
- `packages/zupa/src/core/runtime/inbound/transportBridge.ts`
- `packages/zupa/src/core/utils/timeout.ts`
- `packages/zupa/src/core/utils/retry.ts`
- `packages/zupa/src/core/kernel/node.ts`

### 2.2 Gaps against RFC feature set

1. Outbound send occurs before durable persistence completion (send-first model).
2. Phase mutations are by-reference on a shared `context.state`, creating data races and losing diff auditability.
3. The `agenticLoop` mixes LLM and Tool Execution into a single synchronous turn. A crash in a tool loses the entire LLM generation context.
4. No flow checkpoint store or resumable frame model exists yet.
5. Local default integrations still use fake in-memory database.

## 3. Goals and Non-Goals

### Goals

1. Adopt a super-step / checkpoint execution model for bulletproof durability.
2. Define durability contracts required by multiflow/HITL/scheduled features.
3. Guarantee replayable and auditable state transitions.
4. Guarantee bounded, deterministic timeout and retry behavior.
5. Eliminate the need for disparate parallel tracking tables (like a separate `WaitRegistry`).

### Non-Goals

1. No generic middleware/plugin chain as primary extension mechanism.
2. No mandatory external workflow engine dependency; we build the BSP/Pregel primitives natively into Zupa's kernel.

## 4. Architectural Decision (Locked)

Zupa will transition its kernel from a linear pipeline to a **Bulk Synchronous Parallel (BSP) / Pregel-inspired executor loop**. This means state is managed in channels, execution is grouped into atomic super-steps, and checkpoints are the universal source of truth for both pauses (waits) and failures.

## 5. Durable Runtime Model (Pregel-Inspired)

To achieve true resumable orchestration, Zupa's kernel concepts evolve as follows:

### 5.1 Super-step Execution
Each interaction is processed as a sequence of **super-steps**:
- **Plan Phase:** Nodes/nodes that have new data in their input channels are scheduled for execution.
- **Execution:** Nodes run (potentially concurrently if independent) and produce pure state diffs ("writes"). They do *not* mutate shared state directly.
- **Barrier Commit:** Execution pauses until all scheduled nodes finish. Their writes are applied to state channels via reducers deterministically. A checkpoint is then saved to the database.
- **Repeat:** The loop continues until no nodes are runnable (e.g., waiting for external input or end of flow).

### 5.2 State Channels & Reducers
Instead of a single mutable `context.state`, runtime state is partitioned into **Channels** (e.g., `messages`, `toolResults`, `intents`, `flowFrame`).
Each channel defines a **Reducer** (e.g., `append`, `override`). Nodes take a read-only snapshot of channels and return pure payloads. Reducers resolve data races naturally.

### 5.3 Checkpoints (The Universal Source of Truth)
A checkpoint is an immutable, versioned snapshot of all channels at a barrier commit.
Snapshots MUST include:
- `versions_seen`: Tracking which inputs each node has already processed.
- `state_values`: The reduced value of all channels.
- `pending_tasks`: Which nodes/nodes to run on the next super-step (e.g., which tool to invoke next).

### 5.4 Wait/Interrupt Model (Checkpoints as Waits)
**There is no dedicated `WaitRegistry` database table or schema.**
A wait is simply the state of a checkpoint resulting from a `GraphInterrupt` or an early exit waiting on a specific input channel (e.g., `hitl_resolution`).
- **Timeouts** are handled by a background sweeper that identifies paused checkpoints containing timeout deadlines, and simply injects a `TimeoutCommand` as a state update, resuming the loop.
- **HITL/Proxy** inputs trigger `resume(threadId, payload)` by loading the paused checkpoint, appending the payload to the input channel, and executing the next super-step.

### 5.5 Outbox Model (State Channel)
Outbound communication is modeled as an `intents` state channel.
- Nodes (like `responseFinalize`) return writes: `{ intents: [{ type: 'send_text', payload: ... }] }`.
- The barrier commit saves this to the checkpoint.
- A background or post-commit **Dispatcher worker** reads intents from the checkpoint, sends them via transport, and updates the checkpoint status, keeping I/O strictly decoupled from the deterministic state transition.

### 5.6 Working Memory IS the Checkpoint (Dual-Write Ledger)
Zupa currently queries the DB (`getRecentMessages` with `LIMIT 20`) on every turn to bootstrap the LLM's working memory (`packages/zupa/src/core/kernel/nodes/contextAssembly.ts`). **In a Durable Checkpoint model, this is an anti-pattern.** The Checkpoint MUST be the authoritative source of execution state.

1. **Working Memory as a Channel:** The "Working Memory" is simply a state channel (e.g., `messages`) inside the Checkpoint. The engine does not query the DB; it reads the channel.
2. **Preventing Overflow:** To prevent the `messages` channel from overflowing the LLM context (and bloating the Checkpoint blob), its Reducer is strictly bounded (e.g., a rolling window that keeps only the last N messages).
3. **The Dual-Write Ledger (Full History):** While the Checkpoint deliberately forgets old messages, the application UI and analytics still need the full history. We solve this via the **Dual-Write Ledger**. Nodes that generate new messages return a pure `ledgerEvents` payload alongside their channel writes.
4. **The Barrier Commit:** The Checkpointer transactionally saves the small, bounded Checkpoint blob *and* executes the SQL/relational `ledgerEvents` (e.g., `INSERT INTO messages`). This guarantees the query-rich backend retains infinite history, while the orchestration engine maintains strict, bounded, and authoritative execution state without mid-turn DB reads.
5. **Sub-flow Isolation:** When Zupa introduces multi-flow sub-graphing (as per the multiflow RFC), a sub-flow's checkpoint can natively inherit a pure copy of its parent's working memory channel. It can iterate locally (e.g., a massive internal tree-of-thought search) managing its own channel bounds, and only flush the final result back to the parent and the Dual-Write Ledger when returning.

## 6. Proposed Foundation Contracts (Pregel-aligned)

### 6.1 CheckpointSaver (DurableStore)

```ts
interface StateSnapshot {
  values: Record<string, unknown>; // current state channels
  metadata: {
    source: string;
    step: number;
    writes: Record<string, unknown>; // node diff outputs
  };
  createdAt: Date;
  nextTasks: string[]; // nodes ready to run
}

interface CheckpointSaver {
  put(threadId: string, checkpoint: StateSnapshot): Promise<void>;
  get(threadId: string): Promise<StateSnapshot | null>;
  getHistory(threadId: string): Promise<StateSnapshot[]>;
}
```

### 6.2 Phase Contract Evolution
Nodes will evolve from mutating `context.state` to returning `Partial<RuntimeStateDiff>`:
```ts
interface PhaseContractSpec<TRequires, TProvides> {
  name: string;
  run(snapshot: SnapshotFor<TRequires>): Promise<Partial<TProvides>>;
}
```

### 6.3 Kernel Executor
```ts
interface KernelExecutor {
  invoke(threadId: string, input: unknown): Promise<StateSnapshot>;
  resume(threadId: string, payload: unknown): Promise<StateSnapshot>;
}
```

## 7. Execution Order (Super-step Unrolling)

Currently, the `KERNEL_PHASE_ORDER` is a static linear list. Under the new model, this is unrolled into distinct super-steps:

1. input dedup claim (`inbound.id`).
2. **Super-step 1:** Evaluate command gate, access policies. Barrier Commit.
3. **Super-step 2:** Run `agenticLoop` Phase 1 (LLM Inference). Barrier Commit.
4. **Super-step 3..N:** If LLM returns tool calls, run tools as separate sub-nodes/tasks. Barrier Commit per tool completion. This ensures that if a tool crashes, the LLM prompt does not need to be regenerated.
5. **Super-step N+1:** Re-run LLM with tool outputs. Barrier Commit.
6. **Super-step N+2:** Generate response intents (`responseFinalize`). Barrier Commit.
7. **Post-Commit Dispatch:** Outbox worker picks up intents and executes external I/O (TTS, send).

Important:
- `onResponse` side effects attach to the post-commit dispatcher.
- `reply` remains required-by-default in structured mode.

## 8. Reliability and Exactly-Once Guarantees

1. Duplicate inbound keys MUST not produce new input events for the channels.
2. Outbox intents MUST have idempotency keys derived from the super-step.
3. Recovery after crash MUST simply resume `invoke()` from the last committed checkpoint.
4. Timeout resumes MUST be deterministic channel injections.

## 9. Security and Audit Requirements

1. Checkpoints inherently provide perfect auditability (state values + writes metadata).
2. Privileged HITL actions MUST pass resolver checks before injecting their payload into a paused checkpoint.
3. Scheduler tool scope enforcement MUST remain server-side.

## 10. External Workflow Engine Assessment (`useworkflow.dev`)

### 10.1 Posture Shift
By adopting the BSP/Pregel executor pattern internally, Zupa no longer strictly *needs* an external workflow engine to achieve its goals. 
The internal semantic primitives (Checkpoints, Channels, Super-steps) are far more robust than polling a custom `WaitRegistry`.

### 10.2 Future Integration
We will focus purely on Native Zupa checkpoints. If an external system like `useworkflow` or `Temporal` is desired later, it can implement the `CheckpointSaver` and `KernelExecutor` interfaces.

## 11. Rollout Plan

### Phase A — State & Checkpoint Primitives
MUST deliver:
- Pure node refactoring (`context.state` mutability removed).
- `CheckpointSaver` interfaces and database tables.
- Channel and Reducer definitions for core arrays (e.g. `messages`, `intents`).

### Phase B — Subgraphing the Agentic Loop
MUST deliver:
- Unrolling `agenticLoop.ts` into discrete Tool execution super-steps.
- Introducing `GraphInterrupt` throw/catch loop mechanics.
- The `resume(threadId, payload)` API surface.

### Phase C — Outbox Isolation Hookup
MUST deliver:
- `responseFinalize` refactored to emit intents.
- Outbox post-commit dispatcher worker.

## 12. Validation Matrix

### 12.1 Durability correctness
- crash during tool execution resumes exactly before the tool, preserving LLM output.
- restart resumes from last committed checkpoint seamlessly.

### 12.2 Reliability
- duplicate inbound ids do not double-advance checkpoint state.
- outbox intents are skipped if already dispatched during a previous half-crash.

## Sync Contract (Cross-RFC Alignment)

This RFC, `docs/rfcs/2026-02-28-unified-multiflow-hitl-v0.2.md`,
`docs/rfcs/2026-02-28-response-lifecycle-policy-hooks-v0.1.md`, and
`docs/rfcs/2026-02-28-scheduled-flows-autonomous-v0.1.md` MUST remain aligned on:
1. wait = paused checkpoint.
2. outbox = state channel + background dispatcher.
3. tools = discrete execution nodes.
