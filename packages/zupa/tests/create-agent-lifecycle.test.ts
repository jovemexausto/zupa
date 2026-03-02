import { describe, expect, it } from "vitest";
import { createAgent } from "../src/index";
import { FakeMessagingTransport, createFakeRuntimeDeps } from "@zupa/testing";

describe("createAgent lifecycle", () => {
  it("can start and close without errors", async () => {
    const deps = createFakeRuntimeDeps();
    const transport = deps.transport as FakeMessagingTransport;

    const agent = createAgent({
      prompt: "hello",
      ui: false,
      providers: {
        transport,
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors,
        checkpointer: deps.checkpointer,
        ledger: deps.ledger,
        domainStore: deps.domainStore,
      },
    });

    await agent.start();
    await transport.emitInbound({ from: "+15550001111", body: "hello" });
    await agent.close();
  });

  it("starts resources in declared order and closes in reverse order", async () => {
    const deps = createFakeRuntimeDeps();
    const events: string[] = [];

    const mark = (name: string, target: any) => {
      target.start = async () => {
        events.push(`start:${name}`);
      };
      target.close = async () => {
        events.push(`close:${name}`);
      };
    };

    mark("file", deps.storage);
    mark("vector", deps.vectors);
    mark("llm", deps.llm);
    mark("stt", deps.stt);
    mark("tts", deps.tts);
    mark("checkpoint", deps.checkpointer);
    mark("ledger", deps.ledger);
    mark("domain", deps.domainStore);
    mark("transport", deps.transport);

    const agent = createAgent({
      prompt: "hello",
      ui: false,
      providers: {
        transport: deps.transport,
        llm: deps.llm,
        stt: deps.stt,
        tts: deps.tts,
        storage: deps.storage,
        vectors: deps.vectors,
        checkpointer: deps.checkpointer,
        ledger: deps.ledger,
        domainStore: deps.domainStore,
      },
    });

    await agent.start();
    await agent.close();

    expect(events).toEqual([
      "start:file",
      "start:vector",
      "start:llm",
      "start:stt",
      "start:tts",
      "start:checkpoint",
      "start:ledger",
      "start:domain",
      "start:transport",
      "close:transport",
      "close:domain",
      "close:ledger",
      "close:checkpoint",
      "close:tts",
      "close:stt",
      "close:llm",
      "close:vector",
      "close:file",
    ]);
  });
});
