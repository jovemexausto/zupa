# Zupa Roadmap

This document outlines the journey of Zupa, from a research prototype to a production-grade, batteries-included framework for resilient agentic conversations.

---

## 🏗 Phase 1: Foundation (Current Status: ✅ Stable)
The primary goal was to establish a resilient, deterministic orchestration engine and a transport-agnostic runtime.

### **Core Execution Engine**
- [x] **Pregel-inspired Super-step Executor**: Atomic, resilient state transitions based on the BSP (Bulk Synchronous Parallel) model.
- [x] **Durable-by-Default Checkpointing**: Every state change is persisted. A crash mid-execution allows for seamless resumption.
- [x] **Deterministic State Channels**: Reducer-based state management to eliminate data races in parallel node execution.
- [x] **The Router Pattern**: Stateless "Handshake" phase for identity resolution and session lifecycle management, decoupling physical transport from logical threads.

### **Adapters & Multi-modality**
- [x] **Ports & Adapters Architecture**: Strict boundary between core logic and external providers (LLM, STT, TTS, DB).
- [x] **Native Multi-modality**: First-class support for Voice (STT/TTS) with automatic "Mirroring" behavior.
- [x] **Working Memory Duality**: Checkpoints for execution context vs. Ledgers for infinite audit history.
- [x] **Initial Vendor Support**: OpenAI (LLM, STT, TTS), WhatsApp (via `whatsapp-web.js`), and SQLite persistence.

---

## 🚀 Phase 2: Production Readiness (Current Status: 🚧 In Progress)
Hardening the framework for enterprise deployments and high-concurrency environments.

### **Reliability & Resilience**
- [x] **Universal Timeouts & Bounded Retries**: Consistent retry logic across all provider calls.
- [x] **Inbound Deduplication Gate**: Native exactly-once processing for incoming messages.
- [x] **Session Idle Timeouts**: Automatic finalization of "zombie" sessions to keep context windows clean.
- [ ] **Error Taxonomy**: Distinct handling for Transient vs. Terminal errors with provider-specific circuit breakers.
- [ ] **Standardized SLA Measurement**: Tools and metrics to measure and report on latency and reliability.

### **Developer Experience (DX) & Tools**
- [x] **Monorepo Architecture**: Clean separation of `core`, `engine`, `runtime`, and `adapters`.
- [x] **Zod-Native Schema Validation**: Type-safe tool definitions and structured output handling.
- [ ] **Plumbed Correlation IDs**: Unified `requestId` tracking across all logs, telemetry, and ledger events.
- [ ] **Audit Ledger V1**: Immutable, queryable records of every tool invocation and graph decision.
- [ ] **Cli/TUI Dashboard**: Real-time monitoring of active sessions and agent performance.

---

## 🌐 Phase 3: Zupa Cloud & Scale (Current Status: 📅 Planned)
Distributing the engine and managing fleets of agents across multiple instances.

### **Horizontal Scalability**
- [ ] **Distributed Persistence**: Moving from local SQLite to Redis/PostgreSQL for multi-instance coordination.
- [ ] **Multi-Instance QR Management**: A centralized UI/API to manage WhatsApp authentication sessions across a cluster of replicas.
- [ ] **Zupa Manager**: Single management pane to monitor across different geographical nodes.
- [ ] **Fault-Tolerant Recovery**: Automatic failover of conversational threads between cluster members.

### **Advanced Orchestration**
- [ ] **Multi-Flow Subgraphing**: Ability for agents to delegate complex sub-tasks to specialized sub-graphs.
- [ ] **Human-in-the-Loop (HITL) Advanced**: First-class "Handoff" nodes with bi-directional proxying between humans and agents.
- [ ] **Campaign Management**: Outbound scheduling and automated fan-out for large-scale conversational campaigns.

---

## 🌟 Vision
Zupa aims to be the **Next.js for Agentic Conversations**. 

We believe that agents should be as reliable as a database and as empathetic as a collaborator. By providing the structural opinions and primitives for **resiliency** and **modality**, we empower developers to build the next generation of conversational AI.

*Join us in building the most resilient agentic framework on the planet.*
