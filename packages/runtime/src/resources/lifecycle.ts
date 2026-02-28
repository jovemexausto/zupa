import { RuntimeEngineResources, RuntimeResource } from "@zupa/core";


export function collectLifecycleResources(resources: RuntimeEngineResources): RuntimeResource[] {
  const ordered: Array<RuntimeResource | undefined> = [
    resources.database,
    resources.storage,
    resources.vectors,
    resources.llm,
    resources.stt,
    resources.tts,
    resources.telemetry,
    resources.transport
  ];

  const unique = new Set<RuntimeResource>();
  for (const candidate of ordered) {
    if (candidate) {
      unique.add(candidate);
    }
  }

  return [...unique];
}

export async function startResources(resources: RuntimeResource[]): Promise<void> {
  for (const resource of resources) {
    await resource.start?.();
  }
}

export async function closeResources(resources: RuntimeResource[]): Promise<void> {
  for (const resource of [...resources].reverse()) {
    await resource.close?.();
  }
}
