# ● Zupa

### The Batteries-Included TypeScript Framework for Resilient Agentic Conversations

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/zupa.svg)](https://www.npmjs.com/package/zupa)

Zupa is a full-stack, transport-agnostic framework designed for building production-grade conversational AI agents. While it is built to run on any messaging platform, it targets **WhatsApp** as its primary first-class citizen to deliver immediate, high-impact value out of the box.

> 🚨 **Early Stage Project**: Zupa is in active, early development. We are building the foundation for the next generation of durable AI agents. We are actively looking for early adopters, feedback, and contributors to help shape the future of the framework!

---

## Stop Writing Plumbing. Start Writing Reasoning.

Building a toy chatbot is easy. Building a production-grade, multi-modal autonomous agent that survives server crashes, handles complex human handovers, and scales horizontally is incredibly hard.

**The hardest problem in autonomous AI is no longer the execution graph; it is the chaotic, stateful orchestration required to connect that graph to the real world.**

While modern graph execution engines (like LangGraph) have solved the mathematical problem of *how* complex reasoning loops execute, they largely abandon the developer at the product layer. How do you handle real-time voice notes? How do you map a phone number to a session without blowing up the context window? How do you persist memory across deployments?

Zupa is the answer. A full-stack **"batteries-included" orchestrator** that wraps a mathematically robust execution engine inside an opinionated product framework so you can focus on what matters: the agent's actual behavior.

---

## Quick Start

```bash
npm install zupa zod
```

### Create your first Agent (Sam, the English Buddy)

```typescript
import { z } from "zod";
import { createAgent, withReply, WWebJSMessagingTransport } from "zupa";

// 1. Define your Response Schema
const SamReplySchema = withReply({
  correction: z.string().nullable(),
  vocabularyIntroduced: z.array(z.string()),
});

// 2. Define a Custom Tool
const sendPronunciationClip = {
  name: "sendPronunciationClip",
  description: "Send a realistic audio pronunciation for a difficult word",
  schema: z.object({
    word: z.string().describe('The vocabulary word (e.g. "thorough")'),
    languageCode: z.string().describe('The language code (e.g. "en-US")'),
  }),
  handler: async (args, ctx) => {
    const audioUrl = await tts.synthesize(args.word, args.languageCode);
    await ctx.reply({ media: audioUrl, modality: "voice" });
  },
};

// 3. Build the Agent
const agent = createAgent({
  // Native Nunjucks templating
  prompt: `
    You are Sam, a friendly English tutor chatting with {{ user.displayName }}.
    {% if vocabularyHistory.length %}
    Words already introduced: {{ vocabularyHistory | join(', ') }}
    {% endif %}
  `,
  outputSchema: SamReplySchema,

  // Feature 1: Dynamic Context (RAG/DB lookups per message)
  context: async (ctx) => ({
    vocabularyHistory: await db.getVocabulary(ctx.session.id),
  }),

  // Feature 2: Tool Calling
  tools: [sendPronunciationClip],

  // Feature 3: Transactional Hooks (Dual memory architecture)
  onResponse: async (response, ctx) => {
    if (response.vocabularyIntroduced.length > 0) {
      await db.saveVocabulary(ctx.session.id, response.vocabularyIntroduced);
    }
    if (response.sessionEnded) {
      await ctx.endSession();
    }
  },

  // Feature 4: Commands (e.g., WhatsApp /stats)
  commands: {
    stats: {
      description: "Check progress",
      handler: async (ctx) => {
        await ctx.reply("📈 You've learned 14 new words this week!");
      },
    },
  },

  // Feature 5: Native Modality Mirroring
  // 'auto' manages STT/TTS dynamically. It defaults to mirroring the user (Audio -> Audio),
  // but allows the agent's reasoning to actively choose an output format when necessary.
  modality: "auto",
  providers: {
    transport: new WWebJSMessagingTransport(), // WhatsApp ready!
  },
});

// 4. Handle Auth (Terminal QR Code)
agent.on("auth:request", ({ qrString }) => console.log("Scan me:", qrString));
agent.on("auth:ready", () => console.log("Sam is online!"));

await agent.start();
```

---

## Architecture

Zupa is not just a library; it is a production engineering framework with strong opinions.

### Purity of Boundaries (Ports & Adapters)
LLM providers deprecate models. Messaging platforms change APIs overnight. Zupa isolates every external dependency behind a strict Port so that your agent's reasoning code never rots when a vendor does.

- **The Engine**: A mathematically pure DAG executor. It has zero knowledge of transport protocols, LLM providers, or database schemas. It only orchestrates atomic super-steps and checkpoints.
- **The Runtime**: The domain-aware bridge. It translates real-world inputs (WhatsApp messages, audio blobs) into structured Graph inputs and manages the lifecycle of the agent.
- **The Adapters**: All external implementations (OpenAI, Groq, WhatsApp-Web.js, Postgres) are strictly isolated behind Ports. Swap an LLM provider or switch from WhatsApp to Slack without touching a single line of your agent reasoning code.

### The Router Pattern (Identity in the AI Era)
A persistent problem in conversational agents is "Infinite Thread Syndrome." Mapping a user's phone number directly to a single LLM memory thread means the context window inevitably explodes, latency spikes, and costs skyrocket.

Zupa solves this natively with **The Handshake Router Graph**: before the main agent runs, a lightning-fast, stateless graph resolves *Who* the user is and *Which* time-boxed session they belong to. The main agent then executes using this specific `sessionId` as its physical `threadId`, permanently decoupling the physical transport layer from the active conversational working memory.

### Memory Duality (Checkpoints vs. Ledgers)
Working memory and historical audit trails serve opposing purposes. Zupa handles both via the **Dual-Write Pattern**.

- **Checkpoints (Execution State)**: Fast, compact, intentionally "forgetful." They hold only what the LLM needs *right now* to make the next decision. Pluggable into fast KVs like Redis.
- **Ledgers (Audit History)**: Immutable, relational, infinite. Every tool call, token usage metric, modality shift, and decision is recorded here for analytics, compliance, and UI rendering. Pluggable into robust SQL databases.

### Empathy as a Technical Primitive (Native Modality)
Voice is not an afterthought in Zupa; it is a first-class citizen. By setting `modality: 'auto'`, an agent replies in the exact same format it receives — the framework seamlessly handles the STT/TTS transcoding pipeline. Agents can also break the mirror when contextually optimal (e.g., sending a voice clip to correct a mispronunciation even if the user texted).

### Resilient Execution (The BSP Foundation)
Under the hood, Zupa uses a discrete **Pregel-inspired Bulk Synchronous Parallel (BSP)** engine. If the server crashes mid-reasoning, the engine loads the last checkpoint and resumes exactly where it left off. State is separated into pure, immutable **Channels** with deterministic Reducers — no "Global God Object" that silently mutates.

---

## Roadmap

Zupa is evolving rapidly. View the full [ROADMAP.md](./ROADMAP.md) for a detailed breakdown, including Distributed Persistence, Multi-instance QR Management, and Advanced HITL handoffs.

---

## Join the Rebellion

We are actively looking for developers who want to push the boundaries of conversational AI. Whether it's adding a new Transport Adapter (Telegram, Slack) or improving the core execution engine, your PRs are deeply welcome.

Read our [Contributing Guidelines](./CONTRIBUTING.md) to get your local environment set up within minutes.

---

## Legal Disclaimer

Zupa is an independent open-source project and is **not** affiliated with, authorized, maintained, sponsored, or endorsed by WhatsApp, Meta, or any of its affiliates or subsidiaries. It provides initial bootstrap velocity via `whatsapp-web.js` but does not use official Meta APIs by default.

_Where agents meet the real world._
