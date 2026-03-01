import { describe, expect, it, vi } from "vitest";
import { resolveInboundContent } from "../src/index";
import { DEFAULT_INBOUND, createFakeRuntimeConfig } from "@zupa/testing";
import { type STTProvider, type AgentLanguage } from "@zupa/core";

describe("content resolution capability slice", () => {
  it("keeps text messages as text modality", async () => {
    const stt = {
      transcribe: vi.fn(async () => ({
        transcript: "should-not-run",
        confidence: 1,
        latencyMs: 1,
      })),
    };

    const config = createFakeRuntimeConfig();
    const resolved = await resolveInboundContent({
      message: DEFAULT_INBOUND,
      sttProvider: stt as STTProvider,
      config: {
        agentLanguage: config.language,
      },
    });

    expect(resolved).toEqual({
      contentText: DEFAULT_INBOUND.body,
      inputModality: "text",
    });
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it("uses STT for voice messages and passes language hint", async () => {
    const transcribe = vi.fn(async () => ({
      transcript: "bom dia",
      confidence: 1,
      latencyMs: 10,
    }));

    const resolved = await resolveInboundContent({
      message: {
        ...DEFAULT_INBOUND,
        body: "",
        hasMedia: true,
        type: "ptt",
        downloadMedia: async () => ({
          data: Buffer.from("voice"),
          mimetype: "audio/ogg",
          filename: null,
        }),
      },
      sttProvider: {
        transcribe,
      } as STTProvider,
      config: {
        agentLanguage: "pt" as AgentLanguage,
      },
    });

    expect(resolved).toEqual({
      contentText: "bom dia",
      inputModality: "voice",
    });
    expect(transcribe).toHaveBeenCalledTimes(1);
    const calls = transcribe.mock.calls as unknown as Array<
      [{ language: string }]
    >;
    expect(calls[0]?.[0]).toMatchObject({ language: "pt" });
  });

  it("falls back to text body when STT call exceeds timeout", async () => {
    const resolved = await resolveInboundContent({
      message: {
        ...DEFAULT_INBOUND,
        body: "fallback body",
        hasMedia: true,
        type: "ptt",
        downloadMedia: async () => ({
          data: Buffer.from("voice"),
          mimetype: "audio/ogg",
          filename: null,
        }),
      },
      sttProvider: {
        transcribe: async () => {
          await new Promise(() => {
            return;
          });
          return { transcript: "never", confidence: 1, latencyMs: 1 };
        },
      } as STTProvider,
      config: {
        agentLanguage: "pt" as AgentLanguage,
        sttTimeoutMs: 20,
      },
    });

    expect(resolved).toEqual({
      contentText: "fallback body",
      inputModality: "text",
    });
  });

  it("retries STT on transient failure and succeeds on second attempt", async () => {
    let calls = 0;
    const resolved = await resolveInboundContent({
      message: {
        ...DEFAULT_INBOUND,
        body: "",
        hasMedia: true,
        type: "ptt",
        downloadMedia: async () => ({
          data: Buffer.from("voice"),
          mimetype: "audio/ogg",
          filename: null,
        }),
      },
      sttProvider: {
        transcribe: async () => {
          calls += 1;
          if (calls === 1) {
            throw new Error("temporary stt outage");
          }
          return { transcript: "retry success", confidence: 1, latencyMs: 1 };
        },
      } as STTProvider,
      config: {
        agentLanguage: "pt" as AgentLanguage,
        sttTimeoutMs: 2000,
        maxIdempotentRetries: 2,
        retryBaseDelayMs: 1,
        retryJitterMs: 0,
      },
    });

    expect(calls).toBe(2);
    expect(resolved).toEqual({
      contentText: "retry success",
      inputModality: "voice",
    });
  });
});
