import { type RuntimeResource } from "../lifecycle";
import { type EventBus } from "./event-bus";

/**
 * DashboardProvider — A simple, unidirectional, fire-and-forget port.
 * Responsible for broadcasting system-level events and logs to the built-in UI dashboard.
 */
export interface DashboardProvider extends RuntimeResource {
    /**
     * Emits a typed log to the dashboard.
     * @param level The log level or event type (e.g. "LOG", "NODE_TRANSITION", "ERROR")
     * @param payload Any JSON-serializable data relevant to the event
     */
    emitLog(level: string, payload: unknown): void;

    /**
     * Connects the dashboard to a centralized event bus for automatic streaming.
     */
    attachToBus(bus: EventBus): void;
}
