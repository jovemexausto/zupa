import path from "node:path";
import { existsSync } from "node:fs";
import WhatsAppWeb, {
  type Client as WhatsAppClient,
  type ClientOptions,
} from "whatsapp-web.js";
import { type InboundMessage, type MessagingTransport } from "@zupa/core";

const { Client, LocalAuth, MessageMedia } = WhatsAppWeb;

function toChatId(number: string): string {
  if (number.includes("@")) return number;
  const digitsOnly = number.replace(/\D/g, "");
  return `${digitsOnly}@c.us`;
}

function resolveBrowserExecutablePath(): string | undefined {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (envPath) return envPath;

  const windowsCandidates = [
    process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
    process.env.PROGRAMFILES &&
      path.join(
        process.env.PROGRAMFILES,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
    process.env["PROGRAMFILES(X86)"] &&
      path.join(
        process.env["PROGRAMFILES(X86)"],
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
    process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        "Chromium",
        "Application",
        "chrome.exe",
      ),
    process.env.PROGRAMFILES &&
      path.join(
        process.env.PROGRAMFILES,
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe",
      ),
    process.env["PROGRAMFILES(X86)"] &&
      path.join(
        process.env["PROGRAMFILES(X86)"],
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe",
      ),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const macCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];

  const linuxCandidates = [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
  ];

  const candidates =
    process.platform === "win32"
      ? windowsCandidates
      : process.platform === "darwin"
        ? macCandidates
        : linuxCandidates;
  return candidates.find((candidate) => existsSync(candidate));
}

function buildDefaultClientOptions(options?: ClientOptions): ClientOptions {
  if (options?.authStrategy) return options;

  return {
    ...options,
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: resolveBrowserExecutablePath(),
      ...(options?.puppeteer ?? {}),
    },
    authStrategy:
      options?.authStrategy ?? new LocalAuth({ dataPath: ".wwebjs_auth" }),
  };
}

export class WWebJSMessagingTransport implements MessagingTransport {
  private readonly client: WhatsAppClient;
  private readonly inboundHandlers = new Set<
    (message: InboundMessage) => Promise<void>
  >();
  private inboundListener: ((message: any) => void) | null = null;
  private startPromise: Promise<void> | null = null;

  public constructor(options?: ClientOptions) {
    this.client = new Client(buildDefaultClientOptions(options));
  }

  public async start(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = new Promise<void>((resolve, reject) => {
        this.client.once("ready", () => resolve());
        this.client.once("auth_failure", (message: string) =>
          reject(new Error(message)),
        );
        this.client.initialize().catch(reject);
      });
    }
    await this.startPromise;
  }

  public async close(): Promise<void> {
    if (this.inboundListener) {
      this.client.removeListener("message", this.inboundListener);
      this.inboundListener = null;
    }
    this.inboundHandlers.clear();
    await this.client.destroy();
    this.startPromise = null;
  }

  public onInbound(
    handler: (message: InboundMessage) => Promise<void>,
  ): () => void {
    this.inboundHandlers.add(handler);
    this.ensureInboundListener();

    return () => {
      this.inboundHandlers.delete(handler);
      if (this.inboundHandlers.size === 0 && this.inboundListener) {
        this.client.removeListener("message", this.inboundListener);
        this.inboundListener = null;
      }
    };
  }

  public onAuthQr(handler: (qr: string) => void): () => void {
    this.client.on("qr", handler);
    return () => {
      this.client.removeListener("qr", handler);
    };
  }

  public onAuthReady(handler: () => void): () => void {
    this.client.on("ready", handler);
    return () => {
      this.client.removeListener("ready", handler);
    };
  }

  public onAuthFailure(handler: (message: string) => void): () => void {
    this.client.on("auth_failure", handler);
    return () => {
      this.client.removeListener("auth_failure", handler);
    };
  }

  public async sendText(to: string, text: string): Promise<void> {
    await this.client.sendMessage(toChatId(to), text);
  }

  public async sendVoice(
    to: string,
    media: { buffer: Buffer; mimetype: string },
  ): Promise<void> {
    const messageMedia = new MessageMedia(
      media.mimetype,
      media.buffer.toString("base64"),
      "voice.ogg",
    );
    await this.client.sendMessage(toChatId(to), messageMedia, {
      sendAudioAsVoice: true,
    });
  }

  public async sendMedia(
    to: string,
    media: { buffer: Buffer; mimetype: string; filename?: string },
    caption?: string,
  ): Promise<void> {
    const messageMedia = new MessageMedia(
      media.mimetype,
      media.buffer.toString("base64"),
      media.filename || "media.bin",
    );
    await this.client.sendMessage(
      toChatId(to),
      messageMedia,
      caption ? { caption } : undefined,
    );
  }

  public async sendTyping(to: string, durationMs: number): Promise<void> {
    const chat = await this.client.getChatById(toChatId(to));
    await chat.sendStateTyping();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    await chat.clearState();
  }

  private ensureInboundListener(): void {
    if (this.inboundListener) return;

    this.inboundListener = (message: any) => {
      const inbound: InboundMessage = {
        messageId: message.id._serialized,
        from: message.from,
        body: message.body,
        hasMedia: message.hasMedia,
        type: message.type,
        downloadMedia: async () => {
          const media = await message.downloadMedia();
          if (!media) return undefined;
          return {
            data: Buffer.from(media.data, "base64"),
            mimetype: media.mimetype,
            filename: media.filename ?? null,
          };
        },
      };

      for (const handler of this.inboundHandlers) {
        handler(inbound).catch(() => {});
      }
    };

    this.client.on("message", this.inboundListener);
  }
}

export function createWWebJSTransport(
  options?: ClientOptions,
): WWebJSMessagingTransport {
  return new WWebJSMessagingTransport(options);
}
