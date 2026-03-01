# Contributing to Zupa ⚡️

Welcome to the dawn of Zupa! We are in the **very early, active stages** of building the foundational framework for resilient, production-grade agentic conversations. 

If you're tired of fragile LLM wrappers and want to help build a true "Standard Library" for autonomous agents, you are in the exact right place. We need your ideas, your code, and your feedback.

---

## 🧭 The North Star
Before diving into the codebase, we highly recommend reading our [Vision & Ideology Manifesto](./docs/product/01-vision.md). Understanding the "Why" behind Zupa's architecture (BSP Engine, Checkpoints, Router Pattern) will make your contributions significantly more impactful.

---

## 🏗 Understanding the Monorepo

Zupa uses **TurboRepo** and **pnpm** to manage a strict **Ports and Adapters** (Hexagonal) architecture. We do this to ensure the core reasoning engine never rots when a vendor API changes.

- **`@zupa/core`**: The absolute primitives. Domain entities, interfaces, and schemas.
- **`@zupa/engine`**: The mathematically pure DAG executor. It knows nothing about LLMs or WhatsApp. It only knows Super-steps.
- **`@zupa/runtime`**: The bridge. It orchestration the "Handshake" (Router Graph) and executes the main Agent Graph.
- **`@zupa/adapters`**: The concrete implementations. This is where `openai`, `wwebjs`, and `sqlite` live, strictly isolated.

---

## 🛠 Local Development Setup

1. **Prerequisites**: Ensure you have [Node.js v20+](https://nodejs.org/) and `pnpm v9+` installed.
2. **Clone & Install**:
   ```bash
   git clone https://github.com/jovemexausto/zupa.git
   cd zupa
   pnpm install
   ```
3. **Build the Matrix**:
   Zupa builds ESM, CJS, and Types concurrently.
   ```bash
   pnpm build
   ```
4. **Run the Tests**:
   We use **Vitest**. Every new feature requires a test.
   ```bash
   pnpm test
   ```

---

## 📐 Golden Rules of Contribution

### 1. Protect the Core Boundaries
Never import from `@zupa/adapters` inside `@zupa/core` or `@zupa/engine`. If you are adding a new LLM provider (e.g., Anthropic, Groq), it MUST go inside `@zupa/adapters/src/+vendors/`.

### 2. Death to `any`
Zupa is a TypeScript-first framework designed for enterprise reliability. Avoid `any` casts like the plague. We rely heavily on `zod` for parsing unknown runtime boundaries.

### 3. Draft an RFC for Big Ideas
Because we are laying the foundational architecture, major changes (like changing how Checkpoints serialize, or altering the Pregel loop) require a quick RFC in the `docs/rfcs/` directory. Create an issue, draft a Markdown file, and let's discuss it before writing 1,000 lines of code.

### 4. Tests are Mandatory
Zupa's primary value proposition is reliability. If a feature is not tested, it does not exist. Use the `createFakeRuntimeDeps()` utilities in `@zupa/testing` to mock heavy transports or LLM responses beautifully.

---

## 📬 How to Submit a PR

1. **Fork the repo** and create your branch from `master`.
2. **Write clear commits** using [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat(adapters): add anthropic provider`).
3. Ensure `pnpm run typecheck` and `pnpm test` pass flawlessly.
4. **Open a Pull Request** with a detailed summary. If it fixes an issue, link it!

Let's build the future of agentic orchestration together. 

*Stay Agentic. Stay Durable.*
