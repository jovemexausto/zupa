import { Logger } from '@zupa/core';
import pino, { Logger as PinoInstance } from 'pino';

export interface PinoLoggerOptions {
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    prettyPrint?: boolean;
    name?: string;
}

export class PinoLogger implements Logger {
    private pino: PinoInstance;

    constructor(options: PinoLoggerOptions = {}) {
        const { level = 'info', prettyPrint = false, name } = options;

        const pinoOptions: pino.LoggerOptions = {
            level
        };

        if (name) {
            pinoOptions.name = name;
        }

        if (prettyPrint) {
            pinoOptions.transport = {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname'
                }
            };
        }

        this.pino = pino(pinoOptions);
    }

    private constructorChild(childInstance: PinoInstance) {
        this.pino = childInstance;
    }

    public trace(obj: Record<string, unknown>, msg?: string): void;
    public trace(msg: string): void;
    public trace(arg1: Record<string, unknown> | string, arg2?: string): void {
        if (typeof arg1 === 'string') {
            this.pino.trace(arg1);
        } else {
            this.pino.trace(arg1, arg2);
        }
    }

    public debug(obj: Record<string, unknown>, msg?: string): void;
    public debug(msg: string): void;
    public debug(arg1: Record<string, unknown> | string, arg2?: string): void {
        if (typeof arg1 === 'string') {
            this.pino.debug(arg1);
        } else {
            this.pino.debug(arg1, arg2);
        }
    }

    public info(obj: Record<string, unknown>, msg?: string): void;
    public info(msg: string): void;
    public info(arg1: Record<string, unknown> | string, arg2?: string): void {
        if (typeof arg1 === 'string') {
            this.pino.info(arg1);
        } else {
            this.pino.info(arg1, arg2);
        }
    }

    public warn(obj: Record<string, unknown>, msg?: string): void;
    public warn(msg: string): void;
    public warn(arg1: Record<string, unknown> | string, arg2?: string): void {
        if (typeof arg1 === 'string') {
            this.pino.warn(arg1);
        } else {
            this.pino.warn(arg1, arg2);
        }
    }

    public error(obj: Record<string, unknown>, msg?: string): void;
    public error(msg: string): void;
    public error(arg1: Record<string, unknown> | string, arg2?: string): void {
        if (typeof arg1 === 'string') {
            this.pino.error(arg1);
        } else {
            this.pino.error(arg1, arg2);
        }
    }

    public fatal(obj: Record<string, unknown>, msg?: string): void;
    public fatal(msg: string): void;
    public fatal(arg1: Record<string, unknown> | string, arg2?: string): void {
        if (typeof arg1 === 'string') {
            this.pino.fatal(arg1);
        } else {
            this.pino.fatal(arg1, arg2);
        }
    }

    public child(bindings: Record<string, unknown>): Logger {
        const childPino = this.pino.child(bindings);
        const childLogger = new PinoLogger({});
        childLogger['pino'] = childPino;
        return childLogger;
    }
}
