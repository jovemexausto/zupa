import { describe, it, expect, vi } from "vitest";
import { createEventBusLogger } from "../src/bus/logger";
import { EventBus } from "@zupa/core";

describe("EventBusLogger (createEventBusLogger)", () => {
  it("should emit log:<level> events to the bus", () => {
    const emitMock = vi.fn();
    const mockBus = { emit: emitMock } as unknown as EventBus;

    const logger = createEventBusLogger(mockBus);

    logger.info("Hello World");
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "agent",
        name: "log:info",
        payload: { message: "Hello World" },
      }),
    );
  });

  it("should correctly handle object payloads and messages", () => {
    const emitMock = vi.fn();
    const mockBus = { emit: emitMock } as unknown as EventBus;

    const logger = createEventBusLogger(mockBus);

    logger.error({ errCode: 500, detail: "Db down" }, "Failed operation");

    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "agent",
        name: "log:error",
        payload: {
          errCode: 500,
          detail: "Db down",
          message: "Failed operation",
        },
      }),
    );
  });

  it("should merge context when using child()", () => {
    const emitMock = vi.fn();
    const mockBus = { emit: emitMock } as unknown as EventBus;

    const logger = createEventBusLogger(mockBus, { globalConfig: "xyz" });
    const childLogger = logger.child({ requestId: "123" });

    childLogger.debug({ target: "test" }, "Looking up target");

    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "agent",
        name: "log:debug",
        payload: {
          globalConfig: "xyz",
          requestId: "123",
          target: "test",
          message: "Looking up target",
        },
      }),
    );
  });

  it("should handle error edge cases smoothly", () => {
    const emitMock = vi.fn();
    const mockBus = { emit: emitMock } as unknown as EventBus;

    const logger = createEventBusLogger(mockBus);

    logger.error("Just string error");
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "log:error",
        payload: { message: "Just string error" },
      }),
    );
  });
});
