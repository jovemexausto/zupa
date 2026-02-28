import { RuntimeResource } from '../lifecycle';
import { SessionState } from '../entities/session';

export interface StateProvider extends RuntimeResource {
    attach(sessionId: string): SessionState;
}
