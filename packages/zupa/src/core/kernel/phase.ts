import { z } from 'zod';

import type { KernelPhaseName, RuntimeKernelContext } from '../kernel';

export type AnyStateSchema = z.ZodObject<z.ZodRawShape>;

type KnownSchemaKeys<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : symbol extends K ? never : K]: T[K]
};

type RuntimeStateFor<TSchema extends AnyStateSchema> = Record<string, unknown> & KnownSchemaKeys<z.infer<TSchema>>;

export class PhaseContractError extends Error {
  public readonly phase: KernelPhaseName;
  public readonly stage: 'requires' | 'provides';
  public readonly issues: z.ZodIssue[];

  public constructor(options: { phase: KernelPhaseName; stage: 'requires' | 'provides'; issues: z.ZodIssue[] }) {
    //
    const detail = options.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
      .join('; ');

    super(`[${options.phase}] ${options.stage} validation failed: ${detail}`);
    //
    this.name   = 'PhaseContractError';
    this.phase  = options.phase;
    this.stage  = options.stage;
    this.issues = options.issues;
  }
}

export interface PhaseContractSpec<TRequires extends AnyStateSchema, TProvides extends AnyStateSchema | undefined = undefined> {
  name: KernelPhaseName;
  requires: TRequires;
  provides?: TProvides;
  run(context: RuntimeKernelContext & { state: RuntimeStateFor<TRequires> }): Promise<void>;
}

function validate(
  stage: 'requires' | 'provides',
  phase: KernelPhaseName,
  schema: AnyStateSchema,
  state: Record<string, unknown>
): void {
  const parsed = schema.safeParse(state);
  if (!parsed.success) {
    throw new PhaseContractError({
      phase,
      stage,
      issues: parsed.error.issues
    });
  }
}

// TODO: in prod env we can disable validation, as it won't compile prod bundle on a error state from dev
export function definePhase<TRequires extends AnyStateSchema, TProvides extends AnyStateSchema | undefined = undefined>(
  spec: PhaseContractSpec<TRequires, TProvides>
): (context: RuntimeKernelContext) => Promise<void> {
  return async (context: RuntimeKernelContext): Promise<void> => {
    validate('requires', spec.name, spec.requires, context.state);
    await spec.run(context as RuntimeKernelContext & { state: RuntimeStateFor<TRequires> });
    if (spec.provides !== undefined) {
      validate('provides', spec.name, spec.provides, context.state);
    }
  };
}
