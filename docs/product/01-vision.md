# Zupa: The Batteries-Included TypeScript Framework for Resilient Agentic Conversations

Zupa is a full-stack conversational framework designed for building production-grade AI agents. While it is built to be **transport-agnostic** (extensible to any messaging platform), it targets **WhatsApp** as its primary first-class citizen to deliver immediate high-impact value for developers.

By abstracting away the complexities of session persistence, multi-modal transformation (STT/TTS), and event-driven orchestration, Zupa allows developers to focus on the **Agent's Reasoning and Value** rather than the plumbing. It is designed to be the "Standard Library" for professional conversational agents, providing the structural opinions, high-performance runtime, and deep observability that enterprise-grade applications demand.

Zupa represents a shift from fragile LLM wrappers to **Durable AI Workflows**. By providing a batteries-included substrate for state management, identity resolution, and modality-aware interaction, Zupa enables developers to build agents that are as reliable as traditional software. Whether it's a high-frequency customer support bot or a complex long-running business assistant, Zupa's mission is to provide the core opinions and primitives necessary for agents to survive and thrive in unpredictable production environments.

> [!IMPORTANT]
> **Legal Disclaimer**: Zupa is an independent open-source project and is **not** affiliated with, authorized, maintained, sponsored, or endorsed by WhatsApp, Meta, or any of its affiliates or subsidiaries. It currently leverages `whatsapp-web.js` as an initial bootstrap to provide immediate velocity for developers, but does not use official Meta APIs by default.

---

## 1. The Execution Model: BSP / Pregel Loop
Zupa's engine is built on the **Bulk Synchronous Parallel (BSP)** model, inspired by LangGraph’s Pregel architecture.

- **Atomic Super-steps**: Execution is partitioned into discrete pulses. Either the whole step completes and commits its state, or it crashes and resumes from the last known good checkpoint.
- **Pure State Channels**: Instead of a "Global State Object" that everything mutates, Zupa uses **Channels**. Nodes take snapshots of channels and return **Writes**.
- **Deterministic Reducers**: Data races are solved by channel-specific **Reducers** (e.g., `append`, `override`, `max`). This ensures that even if three nodes run concurrently, their combined state is predictable.

## 2. Purity of Boundaries: Engine vs. Runtime
We maintain a strict separation between "How to Run" (Engine) and "What to Run" (Runtime).

- **The Engine**: A generic, stateless DAG/Graph executor. It doesn't know about WhatsApp, LLMs, or Databases. It only knows about Super-steps and Checkpoints.
- **The Runtime**: The domain-aware bridge. It translates transport-agnostic events into Graph pulses and manages the **handoff** between stateless routing and stateful agents.
- **Adapters Layer**: Following the **Ports and Adapters** pattern. All external dependencies (LLM Providers, STT/TTS, Databases) must be isolated. No vendor code should ever touch the Engine or Core logic.

## 3. Reliability: Durable by Default
Zupa prioritizes **Resumability** over raw execution speed.

- **Universal Checkpointing**: Every barrier commit in a graph is a persisted checkpoint. If the server crashes mid-tool call, the agent resumes exactly where it left off.
- **Wait-is-a-Checkpoint**: In Zupa, there is no "Pause Table". A "Waiting" state is simply a checkpoint that has no runnable nodes until a specific input channel is updated (`resume`).
- **Idempotency Gates**: The runtime enforces strict exactly-once processing for inbound messages using `messageId` deduplication at the entrypoint.

## 4. The Handshake: The Router Pattern
Zupa decouples conversational identity from execution memory.

- **Conversation Threads != Transport IDs**: We don't use the raw transport ID (e.g. phone number) as the primary execution thread. Why? Because it leads to infinite context bloat.
- **The Handshake**: Every request starts in a stateless **Router Graph**.
  - **Identity Resolution**: Resolve the User.
  - **Session Resolution**: Resolve or Start a time-boxed Session ID.
- **Execution Threads**: The main Agent Graph runs using the `sessionId` as its `threadId`. This ensures that context windows stay clean, manageable, and time-boxed (Idle Timeouts).

## 5. Memory Duality: Checkpoints vs. Ledgers
We recognize that execution state and interaction history have different life cycles.

- **Checkpoints (Execution State)**: Fast, bounded, and potentially "forgetful" snapshots of the working memory. They are optimized for the LLM's context window.
- **Ledgers (Audit History)**: Infinite, relational, and immutable historical records of every message sent/received. 
- **The Dual-Write Pattern**: A single transactional commit updates the "Work State" (Checkpoint) and the "Audit Trail" (Ledger) simultaneously.

## 6. Interaction Philosophy: Empathy & Modality
Agents should communicate like helpful collaborators, not just text-completion wrappers.

- **Modality Mirroring**: By default, the agent responds in the same format it was addressed (If you talk to it via Voice, it replies with Voice).
- **Dynamic Adaptability**: The agent is empowered to "choose" its modality based on intent (e.g. sending an audio if the user asks for a pronunciation).
- **Graceful Handover**: The engine is built for Human-In-The-Loop (HITL) scenarios where agents can "wait" for a human expert to approve or take over the turn.

## 7. Scaling Vision: From Local to Cloud
Zupa scales from a single NodeJS process to a distributed swarm.

- **Transient Handshakes**: Lightweight operations (like Routing) use in-memory `MemoryCheckpointSaver` adapters.
- **Shared State**: Production instances use a centralized `PersistenceProvider` (Redis, PostgreSQL) so any replica can resume any thread.
- **Centralized Orchestration**: A single Management UI/API monitors all replicas, even if they are spread across different geographical nodes.

---
*Stay Agentic. Stay Durable.*
