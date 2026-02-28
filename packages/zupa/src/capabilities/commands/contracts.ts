import type { z } from 'zod';
import { AgentContext } from '../../core/domain';


export interface CommandDefinition<TArgs extends z.ZodType = never> {
  description: string;
  args?: TArgs;
  handler: [TArgs] extends [never]
    ? (ctx: AgentContext) => Promise<void>
    : (ctx: AgentContext, args: z.infer<TArgs>) => Promise<void>;
}
