import { describe, it } from "vitest";
import { type DashboardProvider, type ReactiveUiProvider } from "../src/ports";
import { type JsonValue } from "../src/entities/session";

describe("UI Ports Type Compliance", () => {
    it("verifies DashboardProvider type shapes", () => {
        // This is strictly a compile-time shape validation test
        const mockDashboard: DashboardProvider = {
            emitLog: (level: string, payload: unknown) => {
                // no-op
            }
        };

        // Use to prevent unused variable warning
        void mockDashboard;
    });

    it("verifies ReactiveUiProvider type shapes", () => {
        const mockReactive: ReactiveUiProvider = {
            emitStateDelta: (clientId: string, delta: Partial<Record<string, JsonValue>>) => { },
            emitTokenChunk: (clientId: string, chunk: { id: string; content: string }) => { },
            onClientEvent: (handler) => {
                return () => { }; // return unsubscribe function
            },
            onClientConnect: (handler) => () => { },
            onClientDisconnect: (handler) => () => { }
        };

        void mockReactive;
    });
});
