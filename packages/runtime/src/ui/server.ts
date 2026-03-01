import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import QRCode from "qrcode";

interface RuntimeUiServerOptions {
  host: string;
  port: number;
  authToken?: string | undefined;
  corsOrigin?: string | string[] | undefined;
  sseHeartbeatMs: number;
}

interface SseClient {
  id: string;
  response: ServerResponse<IncomingMessage>;
}

interface LatestQrState {
  qr: string;
  updatedAt: string;
}

/**
 * @deprecated Use `@zupa/api` middleware and SSE broadcaster instead.
 * Maintaining backward compatibility for existing deployments.
 * TODO: maybe streamlining an internal emit / event api
 * used for telemetry and dashboard events.
 * The idea is to have a external store (reducer) that decides where each event go.
 * This way with stick with a slick api and can put sse endpoioins on the express middleware.
 */
export class RuntimeUiServer {
  public readonly options: RuntimeUiServerOptions;
  private readonly clients = new Map<string, SseClient>();
  private readonly heartbeatMs: number;
  private latestQr: LatestQrState | null = null;
  private isOnline = false;
  private server: ReturnType<typeof createServer> | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  public constructor(options: RuntimeUiServerOptions) {
    this.options = options;
    this.heartbeatMs = options.sseHeartbeatMs;
  }

  public async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.options.port, this.options.host, () => {
        this.server?.removeListener("error", reject);
        resolve();
      });
    });

    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients.values()) {
        client.response.write(": heartbeat\n\n");
      }
    }, this.heartbeatMs);
    this.heartbeatTimer.unref();
  }

  public async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const client of this.clients.values()) {
      client.response.end();
    }
    this.clients.clear();

    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  public setLatestQr(qr: string): void {
    this.isOnline = false;
    this.latestQr = {
      qr,
      updatedAt: new Date().toISOString(),
    };
  }

  public setOnlineStatus(isOnline: boolean): void {
    this.isOnline = isOnline;
    if (isOnline) {
      this.latestQr = null;
    }
  }

  public publish(type: string, payload: unknown): void {
    const serialized = `event: ${type}\ndata: ${JSON.stringify({
      type,
      ts: new Date().toISOString(),
      payload,
    })}\n\n`;
    for (const client of this.clients.values()) {
      client.response.write(serialized);
    }
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>,
  ): Promise<void> {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`,
    );

    if (request.method !== "GET") {
      this.writeJson(response, 405, {
        status: "error",
        message: "Method not allowed",
      });
      return;
    }

    if (!this.isAuthorized(request, url)) {
      this.writeJson(response, 401, {
        status: "error",
        message: "Unauthorized",
      });
      return;
    }

    if (url.pathname === "/auth/qr") {
      await this.handleAuthQr(url, response);
      return;
    }

    if (url.pathname === "/agent/events") {
      this.handleAgentEvents(response);
      return;
    }

    this.writeJson(response, 404, { status: "error", message: "Not found" });
  }

  private async handleAuthQr(
    url: URL,
    response: ServerResponse<IncomingMessage>,
  ): Promise<void> {
    const format = (url.searchParams.get("format") ?? "image").toLowerCase();
    if (format !== "image" && format !== "raw") {
      this.writeJson(response, 400, {
        status: "error",
        message: "Invalid format. Expected image|raw.",
      });
      return;
    }
    if (!this.latestQr) {
      if (this.isOnline) {
        if (format === "raw") {
          this.writeJson(response, 200, {
            status: "online",
            message: "Agent is already online",
          });
          return;
        }
        this.writeHtml(
          response,
          200,
          this.renderStatusPage({
            title: "Agent Online",
            message:
              "Agent is already online. No QR code is required right now.",
          }),
        );
        return;
      }

      this.writeJson(response, 404, {
        status: "error",
        message: "QR payload not available yet",
      });
      return;
    }

    if (format === "raw") {
      this.writeJson(response, 200, {
        status: "ok",
        format: "raw",
        qr: this.latestQr.qr,
        updatedAt: this.latestQr.updatedAt,
      });
      return;
    }

    const dataUrl = await QRCode.toDataURL(this.latestQr.qr);
    this.writeHtml(
      response,
      200,
      this.renderQrPage({
        dataUrl,
        updatedAt: this.latestQr.updatedAt,
      }),
    );
  }

  private handleAgentEvents(response: ServerResponse<IncomingMessage>): void {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    this.applyCors(response);

    const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.clients.set(clientId, { id: clientId, response });
    response.write('event: connected\ndata: {"status":"ok"}\n\n');

    response.on("close", () => {
      this.clients.delete(clientId);
    });
  }

  private isAuthorized(request: IncomingMessage, url: URL): boolean {
    const token = this.options.authToken?.trim();
    if (!token) {
      return true;
    }

    const queryToken = url.searchParams.get("token");
    if (queryToken && queryToken === token) {
      return true;
    }

    const authorization = request.headers.authorization?.trim();
    if (!authorization) {
      return false;
    }

    if (!authorization.startsWith("Bearer ")) {
      return false;
    }

    return authorization.slice("Bearer ".length) === token;
  }

  private writeJson(
    response: ServerResponse<IncomingMessage>,
    statusCode: number,
    body: Record<string, unknown>,
  ): void {
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    this.applyCors(response);
    response.end(JSON.stringify(body));
  }

  private writeHtml(
    response: ServerResponse<IncomingMessage>,
    statusCode: number,
    html: string,
  ): void {
    response.statusCode = statusCode;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    this.applyCors(response);
    response.end(html);
  }

  private renderQrPage(input: { dataUrl: string; updatedAt: string }): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scan QR</title>
  <style>
    body { font-family: sans-serif; background: #0b0d10; color: #e8edf2; margin: 0; min-height: 100vh; display: grid; place-items: center; }
    main { text-align: center; padding: 24px; border: 1px solid #2a2f37; border-radius: 12px; background: #131922; }
    img { width: min(360px, 80vw); height: auto; background: #fff; padding: 12px; border-radius: 10px; }
    p { color: #b8c0cc; }
    code { color: #8dd3ff; }
  </style>
</head>
<body>
  <main>
    <h1>Scan to Connect</h1>
    <p>Open WhatsApp on your phone and scan this QR code.</p>
    <img src="${input.dataUrl}" alt="WhatsApp auth QR code" />
    <p>Updated at <code>${input.updatedAt}</code></p>
  </main>
</body>
</html>`;
  }

  private renderStatusPage(input: { title: string; message: string }): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${input.title}</title>
  <style>
    body { font-family: sans-serif; background: #0b0d10; color: #e8edf2; margin: 0; min-height: 100vh; display: grid; place-items: center; }
    main { text-align: center; padding: 24px; border: 1px solid #2a2f37; border-radius: 12px; background: #131922; max-width: 520px; }
    p { color: #b8c0cc; }
  </style>
</head>
<body>
  <main>
    <h1>${input.title}</h1>
    <p>${input.message}</p>
  </main>
</body>
</html>`;
  }

  private applyCors(response: ServerResponse<IncomingMessage>): void {
    const { corsOrigin } = this.options;
    if (!corsOrigin) {
      return;
    }

    if (Array.isArray(corsOrigin)) {
      response.setHeader("Access-Control-Allow-Origin", corsOrigin.join(","));
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", corsOrigin);
  }
}
