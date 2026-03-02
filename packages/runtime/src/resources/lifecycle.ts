import { RuntimeResourceSet, RuntimeResource, RuntimeResourceContext } from "@zupa/core";


export type AnyResource = RuntimeResource<RuntimeResourceContext> | RuntimeResource<void>;

export function collectLifecycleResources(resources: RuntimeResourceSet): AnyResource[] {
  const ordered: Array<AnyResource | undefined> = [
    resources.storage,
    resources.vectors,
    resources.llm,
    resources.stt,
    resources.tts,
    resources.checkpointer,
    resources.ledger,
    resources.domainStore,
    resources.bus,
    resources.transport
  ];

  const unique = new Set<AnyResource>();
  for (const candidate of ordered) {
    if (candidate) {
      unique.add(candidate as AnyResource);
    }
  }

  return [...unique];
}

export async function startResources(
  resources: AnyResource[],
  context: RuntimeResourceContext
): Promise<void> {
  for (const resource of resources) {
    if (resource.start) {
      await (resource as any).start(context);
    }
  }
}

export async function closeResources(resources: AnyResource[]): Promise<void> {
  for (const resource of [...resources].reverse()) {
    if (resource.close) {
      await resource.close();
    }
  }
}
