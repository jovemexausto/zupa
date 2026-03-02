import { EventBus, ZupaEvent, InboundMessage } from "@zupa/core";

/**
 * Creates an EventBus reducer that enforces max concurrency for inbound messages.
 * 
 * It works by:
 * 1. Listening to 'transport:inbound' events.
 * 2. If below limit: increments counter and allows the event to pass.
 * 3. If at/above limit: emits 'transport:inbound:overload' and drops the event (returns null).
 * 4. Subscribes to 'runtime:inbound:processed' and 'runtime:inbound:failed' to decrement counter.
 */
export function createInboundConcurrencyLimiter(
    bus: EventBus,
    maxConcurrent: number
) {
    let inFlight = 0;

    // Decrement counter when processing finishes
    bus.subscribe("runtime:inbound:processed", () => {
        inFlight = Math.max(0, inFlight - 1);
    });

    bus.subscribe("runtime:inbound:failed", () => {
        inFlight = Math.max(0, inFlight - 1);
    });

    return (event: ZupaEvent<unknown>): ZupaEvent<unknown> | null => {
        if (event.channel === "transport" && event.name === "inbound") {
            if (inFlight >= maxConcurrent) {
                // Emit overload event for observability/reply
                bus.emit({
                    channel: "transport",
                    name: "inbound:overload",
                    payload: { inbound: event.payload as InboundMessage },
                });

                return null; // Drop the event entirely
            }

            inFlight++;
        }

        return event;
    };
}
