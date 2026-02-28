import { RuntimeResource } from "../lifecycle";

// TODO: Right now telemetry events are collected in a buffer and bulk-emitted 
//       (in a loop) from a later engine node.
//
// GOAL: Move to truly async Telemetry Sinks that:
//       - manage their own internal queue
//       - expose a non-blocking emit() method
//       - each event carries a monotonic timestamp (or sequence ID)
//         → this allows preserving strict emission order even when sinks drain 
//           concurrently or at different speeds.
export interface TelemetrySinkPort extends RuntimeResource {
  emit(event: {
    requestId: string;
    node: string;
    durationMs: number;
    result: 'ok' | 'error';
    errorCode?: string;
    // TODO: shouldn't it be monotonic?
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }): void;
}
