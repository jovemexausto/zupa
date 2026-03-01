# Zupa ⚡️

### The Batteries-Included TypeScript Framework for Resilient Agentic Conversations.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/zupa.svg)](https://www.npmjs.com/package/zupa)

Zupa is a full-stack conversational framework designed for building production-grade AI agents. While it is built to be **transport-agnostic**, it targets **WhatsApp** as its primary first-class citizen to deliver immediate, high-impact value for developers.

Built on the **Bulk Synchronous Parallel (BSP)** model (inspired by LangGraph’s Pregel), Zupa ensures your agents aren't just toys—they are **Durable AI Workflows** that can survive crashes, maintain infinite audit trails, and handle multi-modal interactions (Voice/Text) out of the box.

---

## 🌟 Why Zupa?

- **Durable by Default**: Every step is checkpointed. If your server crashes mid-tool-call, Sam resumes exactly where he left off.
- **The Router Pattern**: Automatically decouples transport IDs from session memory. Isolated, time-boxed conversations without context-window bloat.
- **Native Multi-modality**: High-performance STT/TTS mirroring. Speak to your agent, and it speaks back.
- **Batteries Included**: Built-in session management, identity resolution, working memory, and persistent scratchpads (`kv`).
- **Standard Library of Agents**: Stop writing plumbing. Start writing reasoning.

---

## 🚀 Quick Start

```bash
npm install zupa zod
```

### Create your first Agent (Sam, the English Buddy)

```typescript
import { z } from 'zod';
import { createAgent, withReply, WWebJSMessagingTransport } from 'zupa';

// 1. Define your Response Schema (Structured Output)
const SamReplySchema = withReply({
  correction: z.string().nullable(),
  vocabularyIntroduced: z.array(z.string()),
});

// 2. Build the Agent
const agent = createAgent({
  prompt: "You are Sam, a friendly English tutor. Help {{ user.displayName }} practice.",
  outputSchema: SamReplySchema,
  providers: {
    transport: new WWebJSMessagingTransport() // WhatsApp ready!
  }
});

// 3. Handle Auth (QR Code)
agent.on('auth:request', ({ qrString }) => console.log('Scan me:', qrString));
agent.on('auth:ready', () => console.log('Sam is online!'));

await agent.start();
```

---

## 🏗 Key Architectural Pillars

### 1. The BSP / Pregel Loop
Zupa executes graphs in atomic **Super-steps**. Nodes take snapshots of **Channels** and return **Writes**. This eliminates data races and provides perfect time-travel debugging.

### 2. Router Handshake
Before the main agent loop, Zupa runs a stateless **Router Graph**. It resolves the User identity and time-boxed Session ID before loading the execution memory. This prevents "infinite thread syndrome."

### 3. Memory Duality
- **Checkpoints**: High-performance snapshots for the LLM's context window.
- **Ledgers**: Immutable relational history of every message, tool call, and decision.

---

## 🗺 Roadmap

Zupa is rapidly evolving. Here is our path to v1.0:

- [x] **Phase 1: Foundation**: Pregel Engine, Durable Checkpointing, Voice Mirroring (STT/TTS).
- [ ] **Phase 2: Production Readiness**: Error Taxonomy, Circuit Breakers, and Correlation ID Plumbung.
- [ ] **Phase 3: Zupa Cloud**: Distributed Redis/PG Persistence, Multi-instance QR Management, Human-in-the-loop (HITL) Handoffs.

Check out the full [ROADMAP.md](./ROADMAP.md) for details.

---

## ⚖️ Legal Disclaimer
Zupa is an independent open-source project and is **not** affiliated with, authorized, maintained, sponsored, or endorsed by WhatsApp, Meta, or any of its affiliates or subsidiaries. It provides initial bootstrap velocity via `whatsapp-web.js` but does not use official Meta APIs by default.

---

## 🤝 Contributing
We love contributors! Zupa is built on a modern monorepo (Turbo) with a strict "Ports and Adapters" architecture. Read our [Ideology Guide](./docs/architecture/ideology.md) to get started.

*Stay Agentic. Stay Durable.*
