# Architecture Decision Record: Thread and Session Decoupling (The Router Pattern)

## Context
When building agentic workflows on top of Zupa, we faced a core architectural dilemma regarding conversational memory and identity resolution: **How do we identify the user and their session natively within an execution graph, when the graph itself requires a `threadId` simply to load its memory?**

Initially, Zupa's `AgentRuntime` performed identity and session resolution *before* invoking the execution engine. It then used the database `sessionId` as the executor's `threadId`.

### The Problem
This tight coupling caused several critical issues:
1. **Broken Telemetry**: Because identity and session logic lived in the `AgentRuntime` wrapper, they bypassed the Engine's first-class node telemetry. We lost observability into how long auth or session-timeouts were taking at the graph level.
2. **Coupled Semantics**: Thread (an execution boundary for the checkpointer) and Session (a time-boxed metadata grouping of interaction) were forced to be the exact same entity.

To achieve our architectural goal of letting external `threadIds` pass through the transport layer (similar to LangGraph semantics), we needed to decouple them.

## Considered Approaches

1. **Transport-Derived threadId**: Give the `CheckpointSaver` the raw transport ID (e.g., `whatsapp:+1234`).
   - *Rejected*: Creates a single infinite checkpoint for a user across their entire lifetime. Breaks the concept of time-boxed contexts (Idle Timeouts).

2. **Mid-Flight State Merging**: Start the graph with an ephemeral ID, resolve the session natively, and then manually query the database to merge previous LLM messages into the current graph state mid-execution.
   - *Rejected*: Defeats the purpose and native elegance of `CheckpointSaver`. We'd be re-inventing memory loading using dirty queries instead of the battle-tested Checkpoint store.

3. **Two-Phase Invocation (The Router Pattern)**: Split the system into a fast, stateless **Router Graph** and the main **Agent Graph**. The Router Graph executes purely to resolve Identity and Session, outputting a `sessionId`. `AgentRuntime` then invokes the Agent Graph, feeding the `sessionId` as the precise `threadId` for the checkpoint loader.

4. **ThreadAlias Mapping Layer**: Build a fast cache/gateway wrapping `AgentRuntime` that maps `transportAlias` -> `threadId`.
   - *Rejected*: Better performance, but fails our primary goal: First-class telemetry for identity and authentication. The logic remains locked in procedural code outside the engine.

## Decision
**We chose Approach 3: Two-Phase Invocation (The Router Pattern).**

Why?
1. **Purity of State**: The native Engine `CheckpointSaver` remains untouched and elegant. It receives exactly the `threadId` it needs to load isolated, time-boxed memory.
2. **First-Class Observability**: Identity resolution and idle timeouts become proper Engine nodes inside the Router Graph. They emit standard telemetry events (`nodeDurationsMs`).
3. **Conversational Auth**: Treating the Router as a legitimate execution graph opens the door for conversational authentication algorithms. The Router could theoretically interact with the user (e.g., asking for a 2FA code) *before* transitioning them to the stateful Agent Graph.
4. **No External Infrastructure**: It achieves complete decoupling without requiring external caching layers (Redis, etc.) just to map aliases. 
5. **Acceptable Overhead**: For an early framework focused on developer experience and pure graphs, orchestrating a lightweight, stateless Router Graph adds negligible NodeJS execution overhead compared to the power it unlocks.

## Consequences
- `AgentRuntime` now becomes a pure orchestrator of Graphs, rather than a monolithic domain service mixing database queries and engine invocations.
- We formally define **Session** as a purely chronological business-logic grouping, whereas **Thread** is the physical execution scope the `CheckpointSaver` operates on. Through the Router Pattern, they can map 1:1, or 1:N depending on the user's workflow.

---
*Date: 2026-02-28*
*Status: Implemented*