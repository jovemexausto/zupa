# Zupa ⚡️

### The Batteries-Included TypeScript Framework for Resilient Agentic Conversations

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/zupa.svg)](https://www.npmjs.com/package/zupa)

Zupa is a full-stack, transport-agnostic framework designed for building production-grade conversational AI agents. While it is built to run on any messaging platform, it targets **WhatsApp** as its primary first-class citizen to deliver immediate, high-impact value out of the box.

> 🚨 **Early Stage Project**: Zupa is in active, early development. We are building the foundation for the next generation of durable AI agents. We are actively looking for early adopters, feedback, and contributors to help shape the future of the framework!

---

## 🌟 Stop Writing Plumbing. Start Writing Reasoning.

Building a production-ready agent usually means writing fragile boilerplate to handle session persistence, multi-modal audio transformation, and event deduplication. Zupa abstracts all of this into a high-performance runtime so you can focus on what matters: the agent's behavior.

- **Durable by Default**: Every execution step is checkpointed. If your server crashes mid-flight, the agent resumes exactly where it left off. No lost context.
- **Native Multi-modality**: High-performance STT/TTS mirroring is built-in. Speak to your agent, and it speaks back to you.
- **Separation of Concerns**: Built-in identity resolution, isolated session memory, and persistent developer scratchpads (`kv`).
- **Structured Outputs**: Native `zod` integration ensures your LLM outputs strictly what your code expects.

---

## 🚀 Quick Start

```bash
npm install zupa zod
```

### Create your first Agent (Sam, the English Buddy)

```typescript
import { z } from 'zod';
import { createAgent, withReply, WWebJSMessagingTransport } from 'zupa';

// 1. Define your Response Schema
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

// 3. Handle Auth (Terminal QR Code)
agent.on('auth:request', ({ qrString }) => console.log('Scan me:', qrString));
agent.on('auth:ready', () => console.log('Sam is online!'));

await agent.start();
```

---

## 🏗 Dive Deeper

Zupa isn't just a library; it's a completely different paradigm for agentic execution. We've thrown away the traditional "Linear Request/Response" model in favor of a **Pregel-inspired Bulk Synchronous Parallel (BSP)** engine. 

To understand how Zupa achieves perfect time-travel debugging, stateless router handshakes, and dual-memory ledgers, read our [Vision & Ideology Manifesto](./docs/product/01-vision.md).

---

## 🗺 Roadmap

Zupa is evolving rapidly. View the full [ROADMAP.md](./ROADMAP.md) for a detailed breakdown of where we are heading, including Distributed Persistence, Multi-instance QR Management, and Advanced HITL handoffs.

---

## 🤝 Join the Rebellion

We are actively looking for developers who want to push the boundaries of conversational AI. Whether it's adding a new Transport Adapter (Telegram, Slack) or improving the core execution engine, your PRs are deeply welcome.

Read our [Contributing Guidelines](./CONTRIBUTING.md) to get your local environment set up within minutes.

---

## ⚖️ Legal Disclaimer
Zupa is an independent open-source project and is **not** affiliated with, authorized, maintained, sponsored, or endorsed by WhatsApp, Meta, or any of its affiliates or subsidiaries. It provides initial bootstrap velocity via `whatsapp-web.js` but does not use official Meta APIs by default.

*Stay Agentic. Stay Durable.*
