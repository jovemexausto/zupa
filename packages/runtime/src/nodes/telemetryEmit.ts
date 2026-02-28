import { defineNode } from '@zupa/engine';
import { type RuntimeKernelContext } from '@zupa/core';
import { type RuntimeState } from './index';

/**
 * telemetry_emit
 */
export const telemetryEmitNode = defineNode<RuntimeState, RuntimeKernelContext>(async (context) => {
  const { resources, telemetry, meta } = context;

  // Emit individual node durations
  for (const [node, durationMs] of Object.entries(telemetry.nodeDurationsMs)) {
    if (durationMs !== undefined) {
      resources.telemetry.emit({
        requestId: meta.requestId,
        node,
        durationMs,
        result: 'ok',
        timestamp: new Date()
      });
    }
  }

  return {
    stateDiff: {},
    nextTasks: [] // end of graph
  };
});
