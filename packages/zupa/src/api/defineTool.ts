import type { z } from 'zod';
import { Tool } from '../capabilities/tools/contracts';

export function defineTool<TParameters extends z.ZodTypeAny>(tool: Tool<TParameters>): Tool<TParameters> {
  return tool;
}
