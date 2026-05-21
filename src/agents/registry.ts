import type { AgentAdapter, InstallContext } from './types.js';

/**
 * Module-local mutable list. Adapters register themselves at module import time
 * via side-effect imports in ./index.ts. This file does not import any adapter
 * directly — that keeps the registry decoupled from individual adapter modules.
 */
const adapters: AgentAdapter[] = [];

export function registerAdapter(a: AgentAdapter): void {
  adapters.push(a);
}

export async function detectAll(ctx: InstallContext): Promise<AgentAdapter[]> {
  const present: AgentAdapter[] = [];
  for (const a of adapters) {
    if (await a.detect(ctx)) present.push(a);
  }
  return present;
}

export function getAdapter(id: string): AgentAdapter | undefined {
  return adapters.find((a) => a.id === id);
}
