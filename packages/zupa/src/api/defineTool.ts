import type { z } from 'zod';
import { type Tool } from '@zupa/core';

export function defineTool<TParameters extends z.ZodTypeAny>(tool: Tool<TParameters>): Tool<TParameters> {
  return tool;
}
