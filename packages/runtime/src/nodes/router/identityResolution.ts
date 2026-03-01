import { defineNode, type PregelNode } from '@zupa/engine';
import {
    type RuntimeEngineContext,
    type RouterState,
    normalizeExternalUserId
} from '@zupa/core';

/**
 * identity_resolution
 * 
 * Resolves the persistent User entity from the inbound message.
 * If the user does not exist, it is created.
 */
export const identityResolutionNode = <T>(): PregelNode<RouterState, RuntimeEngineContext<T>> =>
    defineNode<RouterState, RuntimeEngineContext<T>>(async (context) => {
        const { inbound, resources } = context;
        const { database, logger } = resources;

        const inboundFrom = inbound.from;
        const externalUserId = normalizeExternalUserId(inboundFrom);

        let user = await database.findUser(externalUserId);
        if (!user) {
            logger.info({ externalUserId }, "Creating new user");
            user = await database.createUser({
                externalUserId,
                displayName: inboundFrom.split(':')[0] || 'Unknown User'
            });
        }

        return {
            stateDiff: { user },
            nextTasks: ['session_resolution']
        };
    });
