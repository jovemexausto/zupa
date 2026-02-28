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

export async function resolveUiConfig(ui: any): Promise<any> {
  if (ui === false) {
    return { enabled: false };
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
    authToken: ui.authToken,
    corsOrigin: ui.corsOrigin,
  };
}
