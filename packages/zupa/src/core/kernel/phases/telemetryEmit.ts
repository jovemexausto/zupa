import { z } from 'zod';

import { definePhase } from '../phase';
import {
  FinalStateSchema,
  PersistenceStateSchema,
  TelemetrySummaryStateSchema
} from './stateSchemas';

/**
 * telemetry_emit
 *
 * Purpose:
 * - Emit final telemetry summary marker for pipeline completion.
 *
 * Contract:
 * - requires: `state.final`, `state.persistence`
 * - provides: `state.telemetrySummary`
 *
 * Placeholder behavior:
 * - Writes `{ emitted: true }` marker only.
 * - No external telemetry sink emission yet.
 */
export const telemetryEmitPhase = definePhase({
  name: 'telemetry_emit',
  requires: z.object({
    final: FinalStateSchema,
    persistence: PersistenceStateSchema
  }),
  provides: z.object({ telemetrySummary: TelemetrySummaryStateSchema }),
  async run(context) {
    for (const [phase, durationMs] of Object.entries(context.telemetry.phaseDurationsMs)) {
      context.resources.telemetry.emit({
        requestId: context.meta.requestId,
        phase,
        durationMs: durationMs ?? 0,
        result: 'ok',
        metadata: {
          language: context.config.language
        }
      });
    }

    context.resources.telemetry.emit({
      requestId: context.meta.requestId,
      phase: 'pipeline_complete',
      durationMs: Date.now() - context.meta.startedAt.getTime(),
      result: 'ok',
      metadata: {
        phases: Object.keys(context.telemetry.phaseDurationsMs).length
      }
    });

    context.state.telemetrySummary = { emitted: true };
  }
});
