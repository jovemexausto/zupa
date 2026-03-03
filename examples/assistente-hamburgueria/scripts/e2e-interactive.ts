import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  FakeLLMProvider,
  FakeMessagingTransport,
  FakeSTTProvider,
  FakeTTSProvider,
  WWebJSMessagingTransport,
  type WWebJSAuthPayload,
} from "zupa";
import { createHamburgueriaAgent } from "../src/agent";
import { generateAsciiQR } from "../src/qr";

const mode = process.env.ZUPA_E2E_MODE === "real" ? "real" : "fake";
const timeoutMs = Number(process.env.ZUPA_E2E_TIMEOUT_MS || 20_000);
const artifactsDir = join(process.cwd(), "artifacts");
mkdirSync(artifactsDir, { recursive: true });
const artifactPath = join(artifactsDir, `e2e-${mode}-${Date.now()}.log`);

const traceLines: string[] = [];
const trace = (line: string) => {
  const stamped = `${new Date().toISOString()} ${line}`;
  traceLines.push(stamped);
  console.log(stamped);
};

const flushTrace = () => writeFileSync(artifactPath, `${traceLines.join("\n")}\n`, "utf8");

async function runFakeMode() {
  const transport = new FakeMessagingTransport();
  const llm = new FakeLLMProvider([
    {
      content: "Fala fera! To pronto pra montar seu pedido no capricho.",
      structured: {
        reply: "Fala fera! To pronto pra montar seu pedido no capricho.",
        modality: null,
        sessionEnded: false,
        orderConfirmed: false,
      },
      toolCalls: [],
      tokensUsed: { promptTokens: 12, completionTokens: 9 },
      model: "fake-model",
      latencyMs: 8,
    },
  ]);

  const agent = createHamburgueriaAgent({
    providers: {
      transport,
      llm,
      stt: new FakeSTTProvider(),
      tts: new FakeTTSProvider(),
    },
  });

  const unsubRuntime = agent.bus.subscribe("runtime:*", (event) => {
    trace(`[event] runtime:${event.name} ${JSON.stringify(event.payload)}`);
  });
  const unsubTransport = agent.bus.subscribe("transport:outbound", (event) => {
    trace(`[event] transport:outbound ${JSON.stringify(event.payload)}`);
  });

  await agent.start();
  const startedAt = Date.now();
  trace("[fake] agent started");

  await transport.emitInbound({
    from: "5511999999999@c.us",
    body: "oi bobby",
    messageId: "e2e-fake-inbound-1",
  });

  while (Date.now() - startedAt < timeoutMs) {
    const sent = transport.getSentMessages();
    if (sent.some((message) => message.text?.includes("Fala fera!"))) {
      trace(`[assert] outbound reply received in ${Date.now() - startedAt}ms`);
      unsubRuntime();
      unsubTransport();
      await agent.close();
      flushTrace();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  unsubRuntime();
  unsubTransport();
  await agent.close();
  flushTrace();
  throw new Error(`No outbound reply within timeout (${timeoutMs}ms)`);
}

async function runRealMode() {
  const transport = new WWebJSMessagingTransport();
  const agent = createHamburgueriaAgent({
    providers: {
      transport,
    },
  });

  agent.on<WWebJSAuthPayload>("auth:request", async (payload) => {
    const qr = await generateAsciiQR(payload.qrString);
    console.log(qr);
    trace("[real] QR emitted. Scan it in WhatsApp.");
  });
  agent.on("auth:ready", () => {
    trace("[real] auth ready");
    trace("[real] send a WhatsApp message to the bot and observe lifecycle logs below");
  });

  const unsubRuntime = agent.bus.subscribe("runtime:*", (event) => {
    trace(`[event] runtime:${event.name} ${JSON.stringify(event.payload)}`);
  });
  const unsubTransport = agent.bus.subscribe("transport:outbound", (event) => {
    trace(`[event] transport:outbound ${JSON.stringify(event.payload)}`);
  });

  await agent.start();
  trace("[real] agent started");

  await new Promise((resolve) => setTimeout(resolve, timeoutMs));

  unsubRuntime();
  unsubTransport();
  await agent.close();
  flushTrace();
  trace(`[real] finished observation window (${timeoutMs}ms)`);
}

(async () => {
  try {
    trace(`[start] mode=${mode} timeoutMs=${timeoutMs}`);
    if (mode === "real") {
      await runRealMode();
    } else {
      await runFakeMode();
    }
    process.exit(0);
  } catch (error) {
    trace(`[error] ${error instanceof Error ? error.message : String(error)}`);
    flushTrace();
    process.exit(1);
  }
})();
