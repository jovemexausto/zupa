import { EventBus, Logger } from "@zupa/core";

/**
 * Creates a lightweight logger that emits events to the provided EventBus.
 * Event names follow the pattern 'log:<level>' (e.g., 'log:info').
 * 
 * This satisfies the "only events" philosophy while keeping Node DX clean.
 */
export function createEventBusLogger(bus: EventBus, context: Record<string, any> = {}): Logger {
    const emit = (level: string, arg1: any, arg2?: string) => {
        const isObj = typeof arg1 === "object" && arg1 !== null;
        const message = isObj ? arg2 : arg1;
        const payload = isObj ? arg1 : {};

        bus?.emit({
            channel: "agent",
            name: `log:${level}`,
            payload: {
                ...context,
                ...payload,
                message,
            },
        });
    };
    return {
        trace: (a1, a2) => emit("trace", a1, a2),
        debug: (a1, a2) => emit("debug", a1, a2),
        info: (a1, a2) => emit("info", a1, a2),
        warn: (a1, a2) => emit("warn", a1, a2),
        error: (a1, a2) => {
            const payload = typeof a1 === "object" ? a1 : {};
            const message = typeof a1 === "string" ? a1 : (a2 || "");
            emit("error", payload, message);
        },
        fatal: (a1, a2) => emit("fatal", a1, a2),
        child: (bindings) => createEventBusLogger(bus, { ...context, ...bindings }),
    } as Logger;
}
