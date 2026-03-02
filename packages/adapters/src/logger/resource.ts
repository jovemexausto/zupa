import { RuntimeResource, RuntimeResourceContext, Logger } from "@zupa/core";

/**
 * Autonomous RuntimeResource that subscribes to EventBus logs and pipes them to a standard Logger.
 *
 * It allows the framework to have pluggable, decoupled loggers that listen to the
 * system's "log event stream" without being hardcoded into the AgentRuntime.
 */
export class EventLoggerResource implements RuntimeResource<RuntimeResourceContext> {
  constructor(private readonly logger: Logger) {}

  public async start(context: RuntimeResourceContext): Promise<void> {
    context.bus.subscribe("agent:log:*", (event: any) => {
      const level = event.name.split(":")[1];
      const { message, ...payload } = event.payload;

      if (typeof (this.logger as any)[level] === "function") {
        (this.logger as any)[level](payload, message);
      }
    });
  }

  public async close(): Promise<void> {
    // Standard loggers typically don't need async closing, but we satisfy the interface
  }
}
