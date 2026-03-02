# ADR 03: Evaluation of Worker Threads and Compute Offloading

## Status
Accepted

## Context
As Zupa evolves towards high-concurrency environments and multi-agent swarms, we evaluated the introduction of **Piscina.js** (a worker thread pool) to offload CPU-intensive tasks. The goal was to protect the Node.js event loop from starvation during heavy operations like prompt rendering, state serialization, or local AI inference.

## Findings

### 1. I/O-Bound Nature of Current Stack
Zupa's current reference implementations rely almost exclusively on external APIs (OpenAI for inference and media) and lightweight memory or SQL fakes. The "wait time" for these external responses is handled optimally by the Node.js event loop without blocking.

### 2. Limited CPU Hotspots
- **Prompt Rendering**: While `nunjucks` is used for rendering, it is strictly applied to the `system_prompt` and high-level templates, not the cumulative message history. The compute cost of this operation is negligible even at moderate scale.
- **State Serialization**: The cost of **V8 Structural Cloning** (required to move data between the main thread and workers) often outweighs the benefit of offloading `JSON.stringify` or checkpoint compression for most standard agent states. Offloading small-to-medium states would result in a net latency regression.

### 3. Future Local-First AI
CPU-bound workloads like local embedding generation (Transformers.js) or local transcription (Whisper.cpp) are valid candidates for worker threads. However, these are not currently part of the core framework requirements and represent specialized adapter concerns.

## Decision
We will **not** integrate Piscina.js or any global worker pool into the Zupa core architecture at this time. 

1. **Pure Orchestration**: The `AgentRuntime` and `GraphEngine` will remain strictly main-thread focused, concentrating on efficient, non-blocking I/O orchestration.
2. **Encapsulated Compute**: If a specific `RuntimeResource` (e.g., a `LocalInferenceProvider`) requires compute offloading, it should manage its own internal worker pool or thread strategy.
3. **Avoid Premature Optimization**: We prioritize architectural simplicity and low-latency event routing over hypothetical scaling benefits that do not align with current I/O-bound workloads.

## Consequences

### Positive
- **Simplicity**: No additional dependency management or complex worker build-path logic in the core framework.
- **Predictable Latency**: Avoids the "hidden cost" of data cloning between threads for tasks that are faster to execute inline.
- **Developer Experience**: Debugging remains straightforward as most logic stays within a single-threaded, easy-to-trace event loop.

### Negative
- **Manual Implementation**: Future developers building local-first adapters will need to implement their own threading guardrails rather than relying on a framework-wide primitive.
