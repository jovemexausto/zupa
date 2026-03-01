import { describe, expect, it, vi } from "vitest";
import {
    createFakeRuntimeDeps,
    createFakeRuntimeConfig,
    createFakeLLMResponse,
    DEFAULT_INBOUND,
    FakeDatabaseBackend,
    TEST_USER_FROM,
    TEST_USER_ID,
} from "@zupa/testing";
import { AgentRuntime } from "../src/index";
import { type RuntimeState } from "../src/nodes";
import { type StateSnapshot } from "@zupa/core";
import { FakeLLMProvider } from "@zupa/adapters";

describe("Router Pattern & Thread Decoupling", () => {
    it("should resolve identity and session via Router Graph before Agent Graph starts", async () => {
        const deps = createFakeRuntimeDeps();
        const db = deps.database as FakeDatabaseBackend;
        const runtime = new AgentRuntime({
            runtimeConfig: createFakeRuntimeConfig(),
            runtimeResources: deps,
        });

        const llm = deps.llm as FakeLLMProvider;
        llm.setResponses([createFakeLLMResponse({ content: "Router is working!" })]);

        // Track database calls to see if they happen in the expected order
        const findUserSpy = vi.spyOn(db, "findUser");
        const createSessionSpy = vi.spyOn(db, "createSession");

        await runtime.start();
        await runtime.runInbound({
            ...DEFAULT_INBOUND,
            from: TEST_USER_FROM,
            body: "Test router",
            messageId: "router-test-001",
        });

        // 1. Database should have been called to find/create user (Router Phase)
        expect(findUserSpy).toHaveBeenCalled();

        // 2. Database should have been called to resolve session (Router Phase)
        const user = await db.findUser(TEST_USER_ID);
        const session = await db.findActiveSession(user!.id);
        expect(session).toBeTruthy();
        expect(createSessionSpy).toHaveBeenCalledWith(user!.id);

        // 3. The main Agent Graph should have used the sessionId as its threadId
        // We can check this by seeing if a checkpoint exists for the sessionId
        const checkpoint = await db.getCheckpoint(session!.id) as StateSnapshot<RuntimeState> | null;
        expect(checkpoint).toBeTruthy();
        expect(checkpoint!.values.session!.id).toBe(session!.id);

        // 4. Verify that the Router's transient threadId did NOT leave a checkpoint in the database
        // The router's threadId is `router:${requestId}`
        const allCheckpoints = (db as any).checkpoints as Map<string, any>;
        const routerThreadIds = Array.from(allCheckpoints.keys()).filter(id => id.startsWith('router:'));
        expect(routerThreadIds.length).toBe(0); // TransientCheckpointSaver was used!

        await runtime.close();
    });

    it("should fail gracefully if Router cannot resolve user or session", async () => {
        const deps = createFakeRuntimeDeps();
        const db = deps.database as FakeDatabaseBackend;

        // Force database failure for user creation
        vi.spyOn(db, "createUser").mockRejectedValue(new Error("DB Crash"));

        const runtime = new AgentRuntime({
            runtimeConfig: createFakeRuntimeConfig(),
            runtimeResources: deps,
        });

        await runtime.start();

        await expect(runtime.runInbound({
            ...DEFAULT_INBOUND,
            from: TEST_USER_FROM,
            body: "Failure test",
        })).rejects.toThrow("DB Crash");

        await runtime.close();
    });
});
