import { UI_DEFAULTS } from "@zupa/core";
import { getPort } from "get-port-please";

export async function resolveUiConfig(ui: any): Promise<any> {
  if (ui === false) {
    return { enabled: false };
  } else if (!ui) {
    const port = await getPort(UI_DEFAULTS.PORT_CONFIG);
    return {
      enabled: UI_DEFAULTS.ENABLED,
      host: UI_DEFAULTS.HOST,
      port,
      sseHeartbeatMs: UI_DEFAULTS.SSE_HEARTBEAT_MS,
    };
  } else {
    const port = ui.port ? ui.port : await getPort(UI_DEFAULTS.PORT_CONFIG);
    return {
      enabled: ui.enabled ?? UI_DEFAULTS.ENABLED,
      host: ui.host ?? UI_DEFAULTS.HOST,
      port,
      sseHeartbeatMs: ui.sseHeartbeatMs ?? UI_DEFAULTS.SSE_HEARTBEAT_MS,
      authToken: ui.authToken,
      corsOrigin: ui.corsOrigin,
    };
  }
}
