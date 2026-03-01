import { createServer } from "node:net";
import { UI_DEFAULTS } from "@zupa/core";

export async function isPortAvailable(
  port: number,
  host: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export async function getAvailablePort(options: {
  port: number;
  host: string;
  alternativePortRange: [number, number];
}): Promise<number> {
  const { port, host, alternativePortRange } = options;

  if (await isPortAvailable(port, host)) {
    return port;
  }

  const [from, to] = alternativePortRange;
  for (let p = from; p <= to; p++) {
    if (await isPortAvailable(p, host)) {
      return p;
    }
  }

  throw new Error(`No available port found in range ${from}-${to}`);
}

export type RawUiConfig = {
  host?: string;
  port?: number;
  enabled?: boolean;
  authToken?: string;
  corsOrigin?: string | string[];
  sseHeartbeatMs?: number;
};

export async function resolveUiConfig(ui: false | RawUiConfig | undefined): Promise<{
  enabled?: boolean;
  host: string;
  port: number;
  sseHeartbeatMs: number;
  authToken?: string;
  corsOrigin?: string | string[];
}> {
  if (ui === false) {
    return { enabled: false, host: UI_DEFAULTS.HOST, port: UI_DEFAULTS.PORT_CONFIG.port, sseHeartbeatMs: UI_DEFAULTS.SSE_HEARTBEAT_MS };
  }

  const host = ui?.host ?? UI_DEFAULTS.HOST;
  const preferredPort = ui?.port ?? UI_DEFAULTS.PORT_CONFIG.port;

  const port = await getAvailablePort({
    port: preferredPort,
    host,
    alternativePortRange: UI_DEFAULTS.PORT_CONFIG.alternativePortRange,
  });

  if (!ui) {
    return {
      enabled: UI_DEFAULTS.ENABLED,
      host,
      port,
      sseHeartbeatMs: UI_DEFAULTS.SSE_HEARTBEAT_MS,
    };
  }

  return {
    enabled: ui.enabled ?? UI_DEFAULTS.ENABLED,
    host,
    port,
    sseHeartbeatMs: ui.sseHeartbeatMs ?? UI_DEFAULTS.SSE_HEARTBEAT_MS,
    ...(ui.authToken !== undefined && { authToken: ui.authToken }),
    ...(ui.corsOrigin !== undefined && { corsOrigin: ui.corsOrigin }),
  };
}
