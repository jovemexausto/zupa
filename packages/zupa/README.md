# zupa

**The TypeScript framework for WhatsApp AI agents.**

> Define your agent once. Zupa runs it.

[![npm](https://img.shields.io/npm/v/zupa?color=b8f000&style=flat-square)](https://www.npmjs.com/package/zupa)
[![license](https://img.shields.io/badge/license-MIT-b8f000?style=flat-square)](./LICENSE)
[![build](https://img.shields.io/github/actions/workflow/status/zupa-dev/zupa/ci.yml?style=flat-square)](https://github.com/zupa-dev/zupa/actions)
[![discord](https://img.shields.io/discord/1234567890?color=b8f000&label=discord&style=flat-square)](https://discord.gg/zupa)

---

Most WhatsApp bot frameworks give you a message event and wish you luck. You end up writing your own session management, your own memory system, your own tool loop, your own voice handling — then gluing it all together with duct tape and vibes.

Zupa is what you'd build if you took that seriously.

It's a runtime for conversational agents. You write the intent — the prompt, the tools, the hooks. Zupa runs a deterministic engine pipeline that turns inbound messages into durable, observable outcomes. Sessions, memory, tool dispatch, voice, commands, scheduling — all handled. Swap any piece without touching your logic.

Built in Brazil. Runs anywhere.

---

## Install

```bash
npm install zupa
```

Requires Node 18+. Bring your own API key.

---

## The shortest agent that actually works

```ts
import { createAgent } from "zupa";

const agent = createAgent({
  prompt: "You are a practical, friendly assistant.",
});

agent.on("auth:qr", () =>
  console.log("Open http://127.0.0.1:5557/auth/qr to fetch QR payload"),
);
await agent.start();
```

That's it. Start the agent, fetch the QR payload endpoint, scan with WhatsApp, and start talking to your agent.

Zupa ships with working defaults for everything — SQLite database, local file storage, OpenAI LLM, Whisper STT, OpenAI TTS. Nothing to configure until you want to change something.

---

## A real agent

```ts
import { createAgent, defineTool } from "zupa";
import { z } from "zod";

const agent = createAgent({
  prompt: `
    You are Sam, an English tutor.
    The student's recurring mistakes: {{ mistakes }}
    Correction count this session: {{ corrections }}
  `,

  outputSchema: z.object({
    reply: z.string(),
    correction: z.string().nullable(),
    sessionEnd: z.boolean(),
  }),

  tools: [
    defineTool({
      name: "send_vocab_card",
      description: "Send a vocabulary card for a word",
      parameters: z.object({ word: z.string(), definition: z.string() }),
      before: async (params, ctx) => {
        await ctx.resources.transport.sendText(
          ctx.replyTarget,
          "📚 vocab card incoming...",
        );
      },
      handler: async (params, ctx) => {
        const card = await buildVocabCard(params);
        await ctx.resources.transport.sendMedia(ctx.replyTarget, card);
        return "Card sent.";
      },
    }),
  ],

  context: async (user, session) => ({
    mistakes: await getRecurringMistakes(user.id),
    corrections: (await session.kv.get<number>("corrections")) ?? 0,
  }),

  onResponse: async (structured, ctx) => {
    if (structured.correction) {
      const n = (await ctx.session.kv.get<number>("corrections")) ?? 0;
      await ctx.session.kv.set("corrections", n + 1);
    }
    if (structured.sessionEnd) {
      await ctx.endSession();
    }
  },

  commands: {
    reset: {
      description: "Start a fresh session",
      handler: async (ctx) => {
        await ctx.endSession();
        await ctx.resources.transport.sendText(
          ctx.replyTarget,
          "Starting fresh! 👋",
        );
      },
    },
    remind: {
      description: "Set a reminder — /remind practice in 2h",
      args: z.object({
        message: z.string(),
        delay: z.string(),
      }),
      handler: async (ctx, args) => {
        await ctx.resources.database.scheduleMessage({
          to: ctx.replyTarget,
          text: `⏰ ${args.message}`,
          sendAt: parseDelay(args.delay),
        });
        await ctx.resources.transport.sendText(
          ctx.replyTarget,
          `Reminder set for ${args.delay} ✓`,
        );
      },
    },
  },

  providers: {
    transport: integrations.transport.wwebjs(),
    llm: integrations.llm.openai({ model: "gpt-4o" }),
    database: integrations.database.postgres({ url: process.env.DATABASE_URL }),
  },
});

agent.on("auth:ready", () => console.log("Agent online"));
await agent.start();
```

---

## How it works

Every inbound message moves through a deterministic engine pipeline. No magic. No hidden control flow. You can see exactly where you are at any point.

```
01  access_policy        decide if this sender is allowed
02  session_attach       load or create user + session
03  command_dispatch     intercept /slash commands before LLM
04  content_resolution   normalize text and voice to content
05  context_assembly     call your context() hook
06  prompt_build         assemble the final model input
07  agentic_loop         LLM ↔ tools ↔ LLM until done
08  response_finalize    extract reply, handle TTS
09  persistence_hooks    write messages, session state, KV
10  telemetry_emit       emit runtime events
```

`context.inbound` is immutable. `context.state` is the mutable workspace nodes write to. You hook into the pipeline at the points Zupa exposes — `context()`, `onResponse()`, tool `before`/`after` hooks, and commands. You never touch the rest.

---

## Runtime Knobs

`createAgent` also supports additive runtime controls without changing the zero-config path:

- `maxToolIterations`
- `maxWorkingMemory`
- `maxEpisodicMemory`
- `semanticSearchLimit`
- `rateLimitPerUserPerMinute`
- `ttsVoice`
- `welcomeMessage`
- `fallbackReply`

---

## Providers

Every runtime resource has a default. Override only what you need.

```ts
createAgent({
  prompt: "...",
  providers: {
    // only specify what you're intentionally changing
    transport: integrations.transport.wwebjs(),
    database: integrations.database.postgres({ url: process.env.DATABASE_URL }),
  },
});
```

| Resource    | Default                       | Alternatives                                    |
| ----------- | ----------------------------- | ----------------------------------------------- |
| `transport` | `wwebjs()`                    | `telegram()`, `whatsappBusiness()`, `fake()`    |
| `llm`       | `openai({ model: 'gpt-4o' })` | any LiteLLM-compatible endpoint                 |
| `stt`       | `whisper()`                   | `whisperLocal()`, `deepgram()`                  |
| `tts`       | `openai()`                    | `elevenlabs()`, `coqui()`                       |
| `database`  | `sqlite()`                    | `postgres()`                                    |
| `storage`   | `local()`                     | `s3({ bucket, region })`                        |
| `vectors`   | `noop()`                      | `chroma()`, `pinecone()`                        |
| `telemetry` | console logger                | `{ emit: (event) => yourObservability(event) }` |

All providers are imported from `zupa/integrations`:

```ts
import { integrations } from "zupa";

const { transport, llm, database } = integrations;
```

---

## Transports

The transport owns auth, receiving, and sending. Everything else in your agent is transport-agnostic.

### wwebjs (default)

WhatsApp Web automation via Puppeteer. Requires a dedicated number — don't run it on your personal phone.

```ts
integrations.transport.wwebjs({
  authStrategy: "local", // persists session to .wwebjs_auth/
  dataPath: ".wwebjs_auth",
});
```

On first run (or after disconnect), Zupa starts an in-process HTTP auth server (enabled by default). Use `GET /auth/qr` to read the current QR payload and `GET /agent/events` for SSE auth/runtime updates. Session is persisted — you won't need to scan again unless you explicitly disconnect.

### Telegram _(coming soon)_

```ts
integrations.transport.telegram({
  token: process.env.TELEGRAM_BOT_TOKEN,
});
```

No QR, no dedicated SIM. Token auth, instant setup.

### WhatsApp Business API _(coming soon)_

```ts
integrations.transport.whatsappBusiness({
  token: process.env.WA_TOKEN,
  phoneId: process.env.WA_PHONE_ID,
  webhookPath: "/webhooks/whatsapp",
});
```

Official Meta Cloud API. Production-grade, requires business verification.

### Swap in one line

```ts
// local development
providers: {
  transport: integrations.transport.wwebjs();
}

// move to Telegram — everything else unchanged
providers: {
  transport: integrations.transport.telegram({ token });
}
```

---

## Memory

Zupa assembles memory from three tiers before every LLM call. You get this automatically — no configuration needed to start.

**Tier 1 — Working memory.** The last N messages of the current session (default: 15). Passed as conversation history to the LLM.

**Tier 2 — Episodic memory.** The last N session summaries (default: 5). Injected into the system prompt. Generated by the LLM automatically when a session ends.

**Tier 3 — Semantic memory.** Key facts as vector embeddings, retrieved by similarity search. Disabled by default. Enable by passing a non-noop `vectors` provider, then write facts from `onResponse`:

```ts
onResponse: async (structured, ctx) => {
  if (structured.importantFact) {
    await ctx.rememberFact(structured.importantFact);
    // stored as embedding, retrieved by similarity on future messages
  }
};
```

Sessions end when you call `ctx.endSession()` or after `SESSION_IDLE_TIMEOUT` minutes of inactivity. Summary generation is automatic.

---

## Session KV

A typed key-value store scoped to the current session. Lives exactly as long as the session. Persisted to the database on every write. Snapshotted into the episodic summary when the session ends.

```ts
// in context() — inject into prompt
context: async (user, session) => ({
  corrections: await session.kv.get<number>('corrections') ?? 0,
}),

// in onResponse — update after each turn
onResponse: async (structured, ctx) => {
  const n = await ctx.session.kv.get<number>('corrections') ?? 0
  await ctx.session.kv.set('corrections', n + 1)
},

// in a tool after hook — track state without a DB query
after: async (params, result, ctx) => {
  const calls = await ctx.session.kv.get<number>('toolCalls') ?? 0
  await ctx.session.kv.set('toolCalls', calls + 1)
}
```

The KV is available everywhere `ctx` is: `onResponse`, `context()`, command handlers, and tool hooks.

---

## Tools

Declare tools with `defineTool` for full TypeScript inference between your Zod schema and the `params` argument in all three hooks.

```ts
const searchKnowledgeBase = defineTool({
  name: "search_kb",
  description: "Search the knowledge base for relevant information",
  parameters: z.object({ query: z.string() }),

  // runs before handler — send status, validate, or abort
  before: async (params, ctx) => {
    await ctx.resources.transport.sendText(ctx.replyTarget, "🔍 searching...");
    // return modified params to change what handler receives
    // throw to abort — error message is fed to LLM as tool result
  },

  handler: async (params, ctx) => {
    const results = await vectorSearch(params.query);
    return JSON.stringify(results); // string fed back to LLM
  },

  // runs after handler — transform result, log analytics
  after: async (params, result, ctx) => {
    await logToolCall({ tool: "search_kb", userId: ctx.user.id });
    // return a new string to change what LLM sees
    // return void to pass through the original result
  },
});
```

### Abort with a graceful message

If `before` throws, the error message becomes the tool result the LLM sees. The LLM handles it naturally — no crash, no unhandled rejection.

```ts
before: async (params, ctx) => {
  const calls = (await ctx.session.kv.get<number>("searches")) ?? 0;
  if (calls >= 5) {
    throw new Error(
      "Search limit reached for this session. Tell the user you've done extensive research and summarize what you found.",
    );
  }
};
```

---

## Commands

Slash commands are intercepted in node `03` — before the LLM sees anything. They never consume tokens.

```ts
commands: {
  // disable a built-in
  usage: false,

  // override a built-in
  reset: {
    description: 'Clear session and start fresh',
    handler: async (ctx) => {
      await ctx.endSession()
      await ctx.resources.transport.sendText(ctx.replyTarget, 'Starting fresh 🔄')
    },
  },

  // custom command with natural-language argument parsing
  remind: {
    description: 'Set a reminder. Example: /remind call doctor in 2h',
    args: z.object({
      message: z.string().describe('what to be reminded about'),
      delay:   z.string().describe('when, e.g. 30m, 2h, tomorrow'),
    }),
    handler: async (ctx, args) => {
      // args.message and args.delay are typed — no manual parsing
      await scheduleReminder(ctx, args)
    },
  },
}
```

**Built-in commands** (all overridable, all disableable):

| Command  | Description                                   |
| -------- | --------------------------------------------- |
| `/help`  | Auto-generated from all command descriptions  |
| `/reset` | Ends current session, starts fresh            |
| `/usage` | Token usage + estimated cost for this session |

When a command has an `args` schema, Zupa makes a small LLM call to parse the natural language argument string into the schema. `/remind call doctor in 2h` → `{ message: "call doctor", delay: "2h" }`. No regex, no positional argument system.

---

## Built-in Auth HTTP API

Every Zupa agent ships with an in-process auth/event HTTP server (no separate process).

Default bind:

- `host`: `127.0.0.1`
- `port`: `5557`

Endpoints:

- `GET /auth/qr`
- default format: image payload (`{ status, format: "image", mimeType, dataUrl, updatedAt }`)
- optional `?format=raw` for `{ status, format: "raw", qr, updatedAt }`
- returns `404` if no QR is available yet
- `GET /agent/events`
- SSE stream (`text/event-stream`) with broad runtime/auth events (`auth:*`, inbound lifecycle, overload/error)
- payload envelope: `{ type, ts, payload }`

Configure it:

```ts
createAgent({
  prompt: "...",
  ui: {
    host: "127.0.0.1",
    port: 5557,
    authToken: process.env.ZUPA_UI_TOKEN,
    sseHeartbeatMs: 15000,
  },
});
```

Security policy:

- loopback hosts (`127.0.0.1`, `localhost`, `::1`) can run without token
- non-loopback hosts require `ui.authToken`
- when token is set, endpoints require `Authorization: Bearer <token>` (or `?token=` for browser EventSource)

Disable it if you don't need it:

```ts
createAgent({ prompt: "...", ui: false });
```

---

## Structured output

Declare a Zod schema and the LLM returns a typed, validated instance. TypeScript enforces that the schema includes `reply: string` at compile time — no runtime surprises.

```ts
const agent = createAgent({
  outputSchema: z.object({
    reply: z.string(), // required — Zupa reads this
    correction: z.string().nullable(),
    topic: z.string(),
    sessionEnd: z.boolean(),
  }),

  onResponse: async (structured, ctx) => {
    // structured is fully typed — InferZod<typeof outputSchema>
    // no casting, no JSON.parse, no assertions
    if (structured.sessionEnd) await ctx.endSession();
    await updateUserTopics(ctx.user.id, structured.topic);
  },
});
```

Without a schema, `onResponse` receives `{ reply: string }`.

---

## Testing

Use fake providers for deterministic tests that don't touch the network:

```ts
import { createAgent, integrations } from "zupa";
import { createFakeRuntimeDeps } from "zupa/testing";

const fakes = createFakeRuntimeDeps();

const agent = createAgent({
  prompt: "You are a helpful assistant.",
  providers: {
    transport: fakes.transport,
    llm: integrations.llm.fake({ reply: "Hello! How can I help?" }),
    database: fakes.database,
    storage: fakes.storage,
  },
});

await agent.start();

// send a message
await fakes.transport.simulateInbound({
  from: "+5521999990001",
  text: "Hello",
});

// assert the reply
const sent = fakes.transport.getSentMessages();
expect(sent[0].text).toBe("Hello! How can I help?");

await agent.close();
```

`createFakeRuntimeDeps()` gives you in-memory implementations of every backend. No SQLite file, no temp directories, no cleanup. Fast, parallel-safe, zero flakiness.

---

## Telemetry

Every engine node emits a structured event. Plug in anything:

```ts
providers: {
  telemetry: {
    emit: (event) => {
      // event.node, event.duration, event.agentId, event.sessionId, ...
      datadog.increment(`zupa.node.${event.node}`, event.duration);
    };
  }
}
```

Or use the built-in console emitter (default) which logs node completions and slow nodes automatically.

---

## Lifecycle

```ts
const agent = createAgent({ ... })

// auth events (transport-specific)
agent.on('auth:qr',        (qr) => console.log('Scan:', qr))
agent.on('auth:ready',     ()   => console.log('Connected'))
agent.on('auth:failure',   (err) => console.error('Auth failed:', err))

// runtime events
agent.on('message',        (msg) => console.log('Inbound:', msg.from))
agent.on('error',          (err) => console.error('Runtime error:', err))

await agent.start()    // starts providers in declared order, binds inbound handler
await agent.close()    // unbinds handlers, closes providers in reverse order
```

Providers start and close in a deterministic order. `close()` is graceful — in-flight messages complete before shutdown.

---

## Architecture

```
packages/zupa/src/
├── api/
│   ├── createAgent.ts       composition root — validates config, assembles runtime
│   └── defineTool.ts        typed tool factory
├── core/
│   ├── engine/
│   │   ├── nodes/          one file per engine node (01-10)
│   │   ├── context.ts       EngineContext type — inbound + mutable state
│   │   └── runner.ts        node executor with contract checks
│   └── runtime/
│       ├── lifecycle.ts     start/close orchestration
│       └── bridges.ts       inbound + auth event bridges
├── capabilities/
│   ├── chat.ts              agentic loop implementation
│   ├── commands.ts          command registry + dispatch
│   ├── memory.ts            3-tier memory assembly
│   ├── session.ts           session KV + lifecycle
│   └── tools.ts             tool dispatch + before/after hooks
├── integrations/
│   ├── transport/           wwebjs, telegram, fake
│   ├── llm/                 openai, fake
│   ├── stt/                 whisper, deepgram, fake
│   ├── tts/                 openai, elevenlabs, fake
│   ├── database/            sqlite, postgres, fake
│   ├── storage/             local, s3, fake
│   └── vectors/             chroma, pinecone, noop
    └── ui/
        └── server.ts        in-process auth HTTP + SSE server
```

---

## Contributing

```bash
git clone https://github.com/zupa-dev/zupa
cd zupa
npm install
npm test
```

The codebase is organized around the engine nodes. If you're adding a feature, it almost always belongs in one of the `capabilities/` files or a new node. If it's a new provider, add it to `integrations/` and export it from the factory in `api/integrations.ts`.

Tests live next to the source files. Use `createFakeRuntimeDeps()` — don't write tests that require real API keys or network access.

PRs welcome. Issues welcome. Opinions about the architecture very welcome.

---

## Roadmap

- [ ] `integrations.transport.telegram()`
- [ ] `integrations.transport.whatsappBusiness()`
- [ ] `integrations.vectors.pgvector()`
- [ ] Multi-agent orchestration (one runtime, multiple agents)
- [ ] Agent-to-agent messaging
- [ ] Browser-based prompt/schema editor in the UI
- [ ] `zupa deploy` CLI for one-command cloud deployment

---

## License

MIT © [Zupa Contributors](https://github.com/zupa-dev/zupa/graphs/contributors)

---

<p align="center">
  Made in Brazil 🇧🇷 · <a href="https://zupa.dev">zupa.dev</a> · <a href="https://discord.gg/zupa">Discord</a>
</p>
