import express, { Express } from "express";
import { Server } from "http";
import { RuntimeResourceContext, DashboardProvider, EventBus } from "@zupa/core";
import { createZupaApi, ZupaApiState } from "./middleware";
import { SseDashboardBroadcaster } from "./sse-broadcaster";

export interface ZupaApiResourceOptions {
  host?: string;
  port: number;
  authToken?: string;
}

/**
 * Autonomous RuntimeResource that hosts the Zupa REST API and SSE Dashboard.
 *
 * It decouples UI concerns from the AgentRuntime by:
 * 1. Subscribing natively to the EventBus for auth/state changes.
 * 2. Hosting its own HTTP/Express server.
 * 3. Providing the SSE stream for real-time observability.
 */
export class ZupaApiResource implements DashboardProvider {
  private app: Express;
  private server: Server | null = null;
  private broadcaster: SseDashboardBroadcaster | null = null;
  private state: ZupaApiState;

  constructor(private readonly options: ZupaApiResourceOptions) {
    this.app = express();
    this.state = {
      agentId: "default",
      latestAuthQr: null,
      isOnline: false,
    };
  }

  public async start(context: RuntimeResourceContext): Promise<void> {
    const { bus, logger } = context;

    // 1. Initialize State Persistence via EventBus Subscriptions
    bus.subscribe("transport:auth:request", (event) => {
      const payload = event.payload as any;
      this.state.latestAuthQr = {
        qr: typeof payload === "string" ? payload : payload.qrString || JSON.stringify(payload),
        updatedAt: new Date().toISOString(),
      };
      this.state.isOnline = false;
    });

    bus.subscribe("transport:auth:ready", () => {
      this.state.isOnline = true;
      this.state.latestAuthQr = null;
    });

    // 2. Setup SSE Broadcaster
    this.broadcaster = new SseDashboardBroadcaster(bus);

    // 3. Setup Express Router
    const apiRouter = createZupaApi({
      authToken: this.options.authToken,
      state: this.state,
    });

    this.app.use(apiRouter);
    this.app.get("/agent/events", (req, res) => this.broadcaster!.handleConnection(req, res));

    // 4. Start HTTP Server
    const host = this.options.host || "0.0.0.0";
    await new Promise<void>((resolve, reject) => {
      this.server = this.app.listen(this.options.port, host, () => {
        logger.info({ url: `http://${host}:${this.options.port}` }, "Zupa API started.");
        resolve();
      });
      this.server.on("error", reject);
    });
  }

  public async close(): Promise<void> {
    if (this.broadcaster) {
      await this.broadcaster.close();
    }

    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.server = null;
    }
  }

  /** DashboardProvider Implementation */
  public emitLog(level: string, payload: unknown): void {
    this.broadcaster?.emitLog(level, payload);
  }

  /** @deprecated Handled autonomously in start() */
  public attachToBus(_bus: EventBus): void {
    // Broadcaster is already attached in start()
  }
}
