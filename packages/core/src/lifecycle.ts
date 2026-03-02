import type { EventBus } from "./ports/event-bus";
import type { Logger } from "./ports/logger";

/**
 * Common infrastructure provided to resources during the start phase.
 */
export interface RuntimeResourceContext {
  bus: EventBus;
  logger: Logger;
}

/**
 * Base interface for all framework components with a lifecycle.
 */
export interface RuntimeResource<T = RuntimeResourceContext> {
  /**
   * Called when the resource should initialize.
   * Receives framework infrastructure (Bus, Logger) as context.
   */
  start?(context: T): Promise<void>;

  /**
   * Called when the resource should shut down and release resources.
   */
  close?(): Promise<void>;
}
