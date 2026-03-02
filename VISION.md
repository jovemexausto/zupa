# Zupa Manifesto (LLM Reference)

## What is Zupa?
Zupa is a **full-stack, batteries-included TypeScript framework** for building production-grade conversational AI agents. It is transport-agnostic but ships WhatsApp (via `whatsapp-web.js`) as its primary first-class transport.

The core thesis: modern execution engines (LangGraph/Pregel) solve how to run reasoning graphs, but they abandon developers at the product layer (transports, sessions, memory, modality). Zupa fills that gap — and because it is a self-contained Node.js process with zero managed-service dependencies, **it deploys anywhere**: a $5 VPS, a Docker container, a Raspberry Pi, or a serverless edge function.

## Package Architecture
- **`@zupa/core`** (Apache-2.0): Pure domain primitives, Zod schemas, port interfaces. No frameworks. No I/O.
- **`@zupa/engine`** (Apache-2.0): Mathematically pure BSP/Pregel DAG executor. Knows nothing about LLMs or transports.
- **`@zupa/runtime`** (Apache-2.0): Domain-aware orchestrator. Translates real-world inputs to graph state, manages the Router Handshake and Agent lifecycle.
- **`@zupa/adapters`** (MIT): Concrete vendor implementations (OpenAI, wwebjs, SQLite). All isolated behind Ports.
- **`zupa`** (MIT): Public entry point. Exposes `createAgent()` and re-exports the adapter integrations.
- **`@zupa/testing`** (MIT): Vitest-friendly fakes and test utilities (`createFakeRuntimeDeps()`).

## Key Architectural Patterns

### 1. Ports & Adapters (Hexagonal)
Engine, Runtime, and Core are vendor-free. Adapters live in `+vendors/` folders, strictly behind port interfaces. Never import from `@zupa/adapters` inside `@zupa/core` or `@zupa/engine`.

### 2. The Router Handshake
Before the main agent graph runs, a stateless Router Graph resolves identity: Who is the user? Which session do they belong to? The resolved `sessionId` becomes the `threadId` for the heavy agent graph. This prevents "Infinite Thread Syndrome."

### 3. Dual-Write Memory
- **Checkpoints**: Fast, compact execution state (what the LLM sees right now). Ephemeral per session.
- **Ledgers**: Immutable audit trail of every tool call, token count, and decision. Persists forever.

### 4. Native Modality
`modality: 'auto'` mirrors user's input format by default (text → text, voice → voice). STT/TTS transcoding is handled transparently by the Runtime.

### 5. BSP Execution
Execution happens in discrete, checkpointed super-steps. Server crash mid-reasoning? On restart the engine loads the last checkpoint and resumes exactly where it left off.

### 6. Deploy Anywhere
Zupa has zero infrastructure opinions. The runtime is a single Node.js process. Checkpoints default to local SQLite. There is no mandatory cloud service, no proprietary queue, no container orchestrator requirement. This means a Zupa agent runs identically on:
- A $5 DigitalOcean droplet
- A Docker container in any cloud
- A Raspberry Pi behind a home router
- A serverless/edge function (with external checkpoint storage)
- Any PaaS (Railway, Render, Fly.io)

This is a core, non-negotiable value proposition: **your agent is yours to deploy wherever you want.**

## Core API Surface
```typescript
import { createAgent, withReply, WWebJSMessagingTransport } from "zupa";

const agent = createAgent({
  prompt: string,         // Nunjucks template
  outputSchema,           // withReply(zodObject)
  context?,               // async (ctx) => Record<string, unknown>
  tools?,                 // ToolDefinition[]
  commands?,              // Record<string, CommandDefinition>
  onResponse?,            // async (response, ctx) => void
  modality?,              // 'text' | 'voice' | 'auto'
  providers: { transport }
});

agent.on("auth:request", ({ qrString }) => ...);
agent.on("auth:ready", () => ...);
await agent.start();
```

## Testing Convention
Use `createFakeRuntimeDeps()` from `@zupa/testing` to mock transports and LLM providers. All tests run with Vitest.
