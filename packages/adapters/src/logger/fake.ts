import { Logger } from '@zupa/core';

export class FakeLogger implements Logger {
    public logs: Array<{ level: string; obj?: Record<string, unknown>; msg?: string }> = [];

    private log(level: string, arg1: Record<string, unknown> | string, arg2?: string): void {
        const msgProp = arg2 !== undefined ? { msg: arg2 } : {};
        if (typeof arg1 === 'string') {
            this.logs.push({ level, msg: arg1 });
        } else {
            this.logs.push({ level, obj: arg1, ...msgProp });
        }
    }

    public trace(obj: Record<string, unknown>, msg?: string): void;
    public trace(msg: string): void;
    public trace(arg1: Record<string, unknown> | string, arg2?: string): void {
        this.log('trace', arg1, arg2);
    }

    public debug(obj: Record<string, unknown>, msg?: string): void;
    public debug(msg: string): void;
    public debug(arg1: Record<string, unknown> | string, arg2?: string): void {
        this.log('debug', arg1, arg2);
    }

    public info(obj: Record<string, unknown>, msg?: string): void;
    public info(msg: string): void;
    public info(arg1: Record<string, unknown> | string, arg2?: string): void {
        this.log('info', arg1, arg2);
    }

    public warn(obj: Record<string, unknown>, msg?: string): void;
    public warn(msg: string): void;
    public warn(arg1: Record<string, unknown> | string, arg2?: string): void {
        this.log('warn', arg1, arg2);
    }

    public error(obj: Record<string, unknown>, msg?: string): void;
    public error(msg: string): void;
    public error(arg1: Record<string, unknown> | string, arg2?: string): void {
        this.log('error', arg1, arg2);
    }

    public fatal(obj: Record<string, unknown>, msg?: string): void;
    public fatal(msg: string): void;
    public fatal(arg1: Record<string, unknown> | string, arg2?: string): void {
        this.log('fatal', arg1, arg2);
    }

    public child(bindings: Record<string, unknown>): Logger {
        return this; // For testing, just return self
    }
}
