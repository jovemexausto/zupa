import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import { LLMProviderPort } from '../../core/ports';


export async function parseCommandArgs<T extends z.ZodType>(rawArgs: string, schema: T, llm: LLMProviderPort): Promise<z.infer<T>> {
  const result = await llm.complete({
    messages: [{ role: 'user', content: rawArgs }],
    systemPrompt: `Extract structured data from the user's input. Return only valid JSON matching the schema. Schema: ${JSON.stringify(zodToJsonSchema(schema as never))}`,
    outputSchema: schema
  });

  return result.structured as z.infer<T>;
}
