import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import type { Client as WhatsAppClient, ClientOptions } from 'whatsapp-web.js';
import WhatsAppWeb from 'whatsapp-web.js';

import type { InboundMessage, MessagingTransportPort } from '../../core/ports';

type InboundHandler = (message: InboundMessage) => Promise<void>;
const { Client, LocalAuth, MessageMedia } = WhatsAppWeb;

function toChatId(number: string): string {
  if (number.includes('@')) {
    return number;
  }

  const digitsOnly = number.replace(/\D/g, '');
  return `${digitsOnly}@c.us`;
}

function buildDefaultClientOptions(options?: ClientOptions): ClientOptions {
  if (options?.authStrategy) {
    return options;
  }

  return {
    ...options,
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: resolveBrowserExecutablePath(),
      ...(options?.puppeteer ?? {})
    },
    authStrategy: options?.authStrategy ?? new LocalAuth({ dataPath: '.wwebjs_auth' })
  };
}

export class WWebJSMessagingTransport implements MessagingTransportPort {
  private readonly client: WhatsAppClient;
  private readonly inboundHandlers = new Set<InboundHandler>();
  private inboundListener: ((message: WhatsAppWeb.Message) => void) | null = null;
  private startPromise: Promise<void> | null = null;

  public constructor(options?: ClientOptions) {
    this.client = new Client(buildDefaultClientOptions(options));
  }

  public async start(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = new Promise<void>((resolve, reject) => {
        this.client.once('ready', () => resolve());
        this.client.once('auth_failure', (message) => reject(new Error(message)));
        this.client.initialize().catch(reject);
      });
    }

    await this.startPromise;
  }

  public async close(): Promise<void> {
    if (this.inboundListener) {
      this.client.removeListener('message', this.inboundListener);
      this.inboundListener = null;
    }
    this.inboundHandlers.clear();
    await this.client.destroy();
    this.startPromise = null;
  }

  public onInbound(handler: (message: InboundMessage) => Promise<void>): () => void {
    this.inboundHandlers.add(handler);
    this.ensureInboundListener();

    return () => {
      this.inboundHandlers.delete(handler);
      if (this.inboundHandlers.size === 0 && this.inboundListener) {
        this.client.removeListener('message', this.inboundListener);
        this.inboundListener = null;
      }
    };
  }

  public onAuthQr(handler: (qr: string) => void): () => void {
    this.client.on('qr', handler);
    return () => {
      this.client.removeListener('qr', handler);
    };
  }

  public onAuthReady(handler: () => void): () => void {
    this.client.on('ready', handler);
    return () => {
      this.client.removeListener('ready', handler);
    };
  }

  public onAuthFailure(handler: (message: string) => void): () => void {
    this.client.on('auth_failure', handler);
    return () => {
      this.client.removeListener('auth_failure', handler);
    };
  }

  public async sendText(to: string, text: string): Promise<void> {
    await this.client.sendMessage(toChatId(to), text);
  }

  public async sendVoice(to: string, audioPath: string): Promise<void> {
    const audioBytes = await readFile(audioPath);
    const base64Data = audioBytes.toString('base64');
    const media = new MessageMedia('audio/ogg; codecs=opus', base64Data, path.basename(audioPath));
    await this.client.sendMessage(toChatId(to), media, { sendAudioAsVoice: true });
  }

  public async sendMedia(to: string, mediaPath: string, caption?: string): Promise<void> {
    const mediaBytes = await readFile(mediaPath);
    const media = new MessageMedia('application/octet-stream', mediaBytes.toString('base64'), path.basename(mediaPath));
    await this.client.sendMessage(toChatId(to), media, caption ? { caption } : undefined);
  }

  public async sendTyping(to: string, durationMs: number): Promise<void> {
    const chat = await this.client.getChatById(toChatId(to));
    await chat.sendStateTyping();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    await chat.clearState();
  }

  private ensureInboundListener(): void {
    if (this.inboundListener) {
      return;
    }

    this.inboundListener = (message) => {
      const rawId = (message as { id?: unknown }).id;
      const messageId =
        typeof rawId === 'string'
          ? rawId
          : (rawId && typeof rawId === 'object' && '_serialized' in rawId && typeof (rawId as { _serialized?: unknown })._serialized === 'string')
            ? (rawId as { _serialized: string })._serialized
            : undefined;

      const inbound: InboundMessage = {
        from: message.from,
        body: message.body,
        fromMe: message.fromMe,
        hasMedia: message.hasMedia,
        type: message.type,
        downloadMedia: async () => {
          const media = await message.downloadMedia();
          if (!media) {
            return undefined;
          }

          return {
            data: media.data,
            mimetype: media.mimetype,
            filename: media.filename ?? null
          };
        }
      };
      if (messageId !== undefined) {
        inbound.id = messageId;
      }

      for (const handler of this.inboundHandlers) {
        handler(inbound).catch(() => {
          return;
        });
      }
    };

    this.client.on('message', this.inboundListener);
  }
}

export function createWWebJSTransport(options?: ClientOptions): WWebJSMessagingTransport {
  return new WWebJSMessagingTransport(options);
}

function resolveBrowserExecutablePath(): string | undefined {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (envPath) {
    return envPath;
  }

  const windowsCandidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] &&
      path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Chromium', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] &&
      path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ].filter((candidate): candidate is string => Boolean(candidate));

  const macCandidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];

  const linuxCandidates = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium'
  ];

  const candidates =
    process.platform === 'win32'
      ? windowsCandidates
      : process.platform === 'darwin'
        ? macCandidates
        : linuxCandidates;

  return candidates.find((candidate) => existsSync(candidate));
}
