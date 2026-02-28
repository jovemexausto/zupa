/**
 * Structured logger interface for the Zupa framework.
 *
 * All log methods accept a structured context object as the first argument
 * followed by a human-readable message string — matching Pino's API signature.
 * This lets adapters emit JSON-structured logs out of the box.
 */
export interface Logger {
    trace(obj: Record<string, unknown>, msg?: string): void;
    trace(msg: string): void;
    debug(obj: Record<string, unknown>, msg?: string): void;
    debug(msg: string): void;
    info(obj: Record<string, unknown>, msg?: string): void;
    info(msg: string): void;
    warn(obj: Record<string, unknown>, msg?: string): void;
    warn(msg: string): void;
    error(obj: Record<string, unknown>, msg?: string): void;
    error(msg: string): void;
    fatal(obj: Record<string, unknown>, msg?: string): void;
    fatal(msg: string): void;

    /** Create a child logger with additional bound context fields. */
    child(bindings: Record<string, unknown>): Logger;
}
