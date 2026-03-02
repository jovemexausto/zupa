import { EventBus, ZupaEvent, InboundMessage } from "@zupa/core";

/**
 * Creates an EventBus reducer that enforces per-user rate limiting for inbound messages.
 *
 * It works by:
 * 1. Listening to 'transport:inbound' events.
 * 2. Maintaining an in-memory sliding window of timestamps per sender identity.
 * 3. If below limit: allows the event to pass.
 * 4. If at/above limit: emits 'transport:inbound:ratelimited' and drops the event (returns null).
 */
export function createInboundUserRateLimiter(
    _bus: EventBus,
    maxPerMinute: number,
) {
    // Map of sender identity (inbound.from) to an array of timestamps
    const userTimestamps = new Map<string, number[]>();

    return (event: ZupaEvent<unknown>): ZupaEvent<unknown> | null => {
        if (event.channel === "transport" && event.name === "inbound") {
            const inbound = event.payload as InboundMessage;
            const senderId = inbound.from;
            const now = Date.now();

            // Get existing timestamps and filter for the last 60 seconds
            let timestamps = userTimestamps.get(senderId) || [];
            timestamps = timestamps.filter((t) => now - t < 60_000);

            // Check if limit is reached
            if (timestamps.length >= maxPerMinute) {
                // Emit rate-limited event for observability and reply handling
                _bus.emit({
                    channel: "transport",
                    name: "inbound:ratelimited",
                    payload: { inbound },
                });

                return null; // Drop the event entirely
            }

            // Add current timestamp and update the map
            timestamps.push(now);
            userTimestamps.set(senderId, timestamps);
        }

        return event;
    };
}
