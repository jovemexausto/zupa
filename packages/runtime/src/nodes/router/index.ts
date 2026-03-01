import { type EngineGraphSpec } from '@zupa/engine';
import {
    type RouterState,
    type RuntimeEngineContext,
    type User,
    type Session,
    type InboundMessage
} from '@zupa/core';
import { identityResolutionNode } from './identityResolution';
import { sessionResolutionNode } from './sessionResolution';

/**
 * Build the stateless Router Graph specification.
 */
export function buildRouterGraphSpec<T = unknown>(): EngineGraphSpec<RouterState, RuntimeEngineContext<T>> {
    return {
        channels: {
            user: (current: User | undefined, update: User | undefined) => update ?? current,
            session: (current: Session | undefined, update: Session | undefined) => update ?? current,
            inbound: (current: InboundMessage | undefined, update: InboundMessage | undefined) => update ?? current
        },
        nodes: {
            identity_resolution: identityResolutionNode<T>(),
            session_resolution: sessionResolutionNode<T>()
        }
    };
}
