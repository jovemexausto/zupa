import { InboundMessage, MessagingTransport } from "@zupa/core";

interface BindTransportInboundInput {
  transport: MessagingTransport;
  runInboundEngine(inbound: InboundMessage): Promise<void>;
  onError?(error: unknown, inbound: InboundMessage): void;
  maxConcurrent?: number;
  onOverload?(inbound: InboundMessage): Promise<void> | void;
}

export interface TransportInboundBinding {
  /** Stop listening for inbound messages and release the handler. */
  stop: () => void;
  /** Number of requests currently being processed. */
  readonly inFlightCount: number;
}

export function bindTransportInbound(input: BindTransportInboundInput): TransportInboundBinding {
  if (typeof input.transport.onInbound !== 'function') {
    return {
      stop: () => { return; },
      get inFlightCount() { return 0; }
    };
  }

  let inFlight = 0;
  const maxConcurrent = input.maxConcurrent ?? Number.POSITIVE_INFINITY;

  const stop = input.transport.onInbound(async (inbound) => {
    if (inFlight >= maxConcurrent) {
      try {
        await input.onOverload?.(inbound);
      } catch (error) {
        input.onError?.(error, inbound);
      }
      return;
    }

    inFlight += 1;
    try {
      await input.runInboundEngine(inbound);
    } catch (error) {
      input.onError?.(error, inbound);
    } finally {
      inFlight -= 1;
    }
  });

  return {
    stop,
    get inFlightCount() { return inFlight; }
  };
}
