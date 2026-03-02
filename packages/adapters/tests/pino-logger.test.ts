import { describe, it, expect, vi } from "vitest";
import { PinoLogger } from "../src/logger/pino";

describe("PinoLogger", () => {
  it("should instantiate without throwing", () => {
    expect(() => {
      new PinoLogger({ name: "test-logger", level: "info" });
    }).not.toThrow();
  });

  it("should provide child logger instances with merged contexts", () => {
    const rootLogger = new PinoLogger({ name: "root", level: "info" });
    const childLogger = rootLogger.child({ feature: "auth" });

    expect(childLogger).toBeInstanceOf(PinoLogger);
    // The underlying pino holds the bindings.
    // We ensure that we can call methods securely.
    expect(() => {
      childLogger.info("Auth successful");
    }).not.toThrow();
  });

  it("should expose all standard log levels", () => {
    const logger = new PinoLogger({ level: "trace" });

    // We can't easily spy on pino's internal stdout here without mocking streams,
    // but we can verify the public API signature matches and executes.
    expect(() => {
      logger.trace("trace msg");
      logger.debug({ x: 1 }, "debug msg");
      logger.info("info msg");
      logger.warn({ warning: true });
      logger.error({ err: new Error("err") }, "error msg");
      logger.fatal("fatal msg");
    }).not.toThrow();
  });

  it("handles string vs object overloads gracefully", () => {
    const logger = new PinoLogger({ level: "info" });

    expect(() => logger.info("string only")).not.toThrow();
    expect(() => logger.info({ someKey: "value" })).not.toThrow();
    expect(() => logger.info({ someKey: "value" }, "message with context")).not.toThrow();
  });
});
