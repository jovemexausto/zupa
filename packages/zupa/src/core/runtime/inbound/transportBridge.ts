import { InboundMessage, MessagingTransportPort } from "../../ports";

interface BindTransportInboundInput {
  transport: MessagingTransportPort;
  runInboundKernel(inbound: InboundMessage): Promise<void>;
  onError?(error: unknown, inbound: InboundMessage): void;
  maxConcurrent?: number;
  onOverload?(inbound: InboundMessage): Promise<void> | void;
}

export function bindTransportInbound(input: BindTransportInboundInput): () => void {
  if (typeof input.transport.onInbound !== 'function') {
    return () => {
      return;
    };
  }

  let inFlight = 0;
  const maxConcurrent = input.maxConcurrent ?? Number.POSITIVE_INFINITY;

  return input.transport.onInbound(async (inbound) => {
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
      await input.runInboundKernel(inbound);
    } catch (error) {
      input.onError?.(error, inbound);
    } finally {
      inFlight -= 1;
    }
  });
}
