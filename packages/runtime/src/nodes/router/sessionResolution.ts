import { defineNode, type PregelNode } from '@zupa/engine';
import {
    type RuntimeEngineContext,
    type RouterState
} from '@zupa/core';

/**
 * session_resolution
 * 
 * Attaches the interaction to an active session.
 * Handles idle timeout auto-finalization and new session creation.
 */
export const sessionResolutionNode = <T>(): PregelNode<RouterState, RuntimeEngineContext<T>> =>
    defineNode<RouterState, RuntimeEngineContext<T>>(async (context) => {
        const { resources, config, state } = context;
        const { database, logger } = resources;
        const user = state.user;

        if (!user) {
            throw new Error("Logic Error: session_resolution executed without a resolved user");
        }

        let session = await database.findActiveSession(user.id);

        if (session && config.sessionIdleTimeoutMinutes) {
            const idleMinutes = (Date.now() - session.lastActiveAt.getTime()) / 60000;
            if (idleMinutes >= config.sessionIdleTimeoutMinutes) {
                logger.info({ sessionId: session.id, idleMinutes }, "Auto-finalizing idle session");
                await database.endSession(
                    session.id,
                    "Session automatically finalized due to inactivity limit reached."
                );
                session = null;
            }
        }

        if (!session) {
            logger.info({ userId: user.id }, "Creating new session");
            session = await database.createSession(user.id);
        }

        await database.touchSession(session.id);

        return {
            stateDiff: { session },
            nextTasks: [] // End of Router Graph
        };
    });
