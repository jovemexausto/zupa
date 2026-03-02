import path from "node:path";
import { existsSync } from "node:fs";
import WhatsAppWeb, { type Client as WhatsAppClient, type ClientOptions } from "whatsapp-web.js";
import {
  type InboundMessage,
  type MessagingTransport,
  type EventBus,
  type RuntimeResourceContext,
} from "@zupa/core";

/**
 * Auth payload emitted by WWebJSMessagingTransport during the QR-code authentication flow.
 */
export interface WWebJSAuthPayload {
  type: "qr";
  /** The raw QR code string — pass this to a QR library such as `qrcode-terminal`. */
  qrString: string;
}

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
      path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.PROGRAMFILES &&
      path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "Chromium", "Application", "chrome.exe"),
    process.env.PROGRAMFILES &&
      path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
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
    authStrategy: options?.authStrategy ?? new LocalAuth({ dataPath: ".wwebjs_auth" }),
  };
}

export class WWebJSMessagingTransport implements MessagingTransport<WWebJSAuthPayload> {
  private readonly client: WhatsAppClient;
  private bus: EventBus | null = null;
  private startPromise: Promise<void> | null = null;

  public constructor(options?: ClientOptions) {
    this.client = new Client(buildDefaultClientOptions(options));
  }

  public async start(context: RuntimeResourceContext): Promise<void> {
    this.bus = context.bus;
    this.setupInternalEvents();
    if (!this.startPromise) {
      this.startPromise = new Promise<void>((resolve, reject) => {
        this.client.once("ready", () => resolve());
        this.client.once("auth_failure", (message: string) => reject(new Error(message)));
        this.client.initialize().catch(reject);
      });
    }
    await this.startPromise;
  }

  public async close(): Promise<void> {
    await this.client.destroy();
    this.startPromise = null;
  }

  private setupInternalEvents(): void {
    this.client.on("qr", (qr: string) => {
      this.bus?.emit<WWebJSAuthPayload>({
        channel: "transport",
        name: "auth:request",
        payload: { type: "qr", qrString: qr },
      });
    });

    this.client.on("ready", () => {
      this.bus?.emit({
        channel: "transport",
        name: "auth:ready",
        payload: undefined,
      });
    });

    this.client.on("auth_failure", (message: string) => {
      this.bus?.emit<string>({
        channel: "transport",
        name: "auth:failure",
        payload: message,
      });
    });

    this.client.on("message", (message: any) => {
      const inbound: InboundMessage = {
        messageId: message.id._serialized,
        from: message.from,
        body: message.body,
        hasMedia: message.hasMedia,
        type: message.type,
        source: "transport",
        senderProfile: {
          displayName: (message as any)._data?.notifyName || (message as any).pushname,
        },
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

      this.bus?.emit<InboundMessage>({
        channel: "transport",
        name: "inbound",
        payload: inbound,
      });
    });
  }

  public async sendText(to: string, text: string): Promise<void> {
    await this.client.sendMessage(toChatId(to), text);
  }

  public async sendVoice(to: string, media: { buffer: Buffer; mimetype: string }): Promise<void> {
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
    await this.client.sendMessage(toChatId(to), messageMedia, caption ? { caption } : undefined);
  }

  public async sendTyping(to: string, durationMs: number): Promise<void> {
    const chat = await this.client.getChatById(toChatId(to));
    await chat.sendStateTyping();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    await chat.clearState();
  }
}

export function createWWebJSTransport(options?: ClientOptions): WWebJSMessagingTransport {
  return new WWebJSMessagingTransport(options);
}
