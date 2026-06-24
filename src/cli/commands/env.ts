/**
 * `nexpath env` — dev-environment probe transparency + control.
 *
 * With no flag: probe the machine + current project, persist the facts locally
 * (consent permitting), and print every fact with its value, trust tier,
 * confidence, and when it was detected. With `--clear`: purge stored facts
 * (all, or a single project with `--project`).
 *
 * The probe is pure-local — zero LLM, zero network. Facts never leave the
 * machine.
 */

import { resolve } from 'node:path';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { probeMachine, probeProject } from '../../env/env-probe.js';
import type { EnvFact, FactMap } from '../../env/types.js';
import {
  isEnvProbeEnabled,
  setMachineFacts,
  setProjectEnvFacts,
  clearProjectEnvFacts,
  purgeAllEnvFacts,
  ENV_PROBE_ENABLED_KEY,
} from '../../store/env-facts.js';

export interface EnvCommandOptions {
  clear?: boolean;
  project?: string;
  db?: string;
}

function formatValue(value: EnvFact['value']): string {
  if (value === null) return 'unknown';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return value;
}

function printFacts(title: string, facts: FactMap): void {
  console.log(`\n${title}`);
  for (const [key, fact] of Object.entries(facts)) {
    const when = fact.detectedAt ? new Date(fact.detectedAt).toISOString() : '—';
    console.log(
      `  ${key.padEnd(28)} ${formatValue(fact.value).padEnd(14)} tier=${fact.tier}  conf=${fact.confidence}  @ ${when}`,
    );
  }
}

export async function envAction(opts: EnvCommandOptions = {}): Promise<void> {
  const store = await openStore(opts.db ?? DEFAULT_DB_PATH);
  try {
    if (opts.clear) {
      if (opts.project) {
        const root = resolve(opts.project);
        clearProjectEnvFacts(store, root);
        console.log(`Cleared stored dev-env facts for ${root}.`);
      } else {
        purgeAllEnvFacts(store);
        console.log('Cleared all stored dev-env facts (machine + every project).');
      }
      return;
    }

    if (!isEnvProbeEnabled(store.db)) {
      console.log('Dev-env probe is disabled — no facts are probed or stored.');
      console.log(`Re-enable with: nexpath config set ${ENV_PROBE_ENABLED_KEY} true`);
      return;
    }

    const now = Date.now();
    const projectRoot = resolve(opts.project ?? process.cwd());
    const machine = probeMachine(now);
    const { facts: project, anchoredRoot, projectShape } = probeProject(projectRoot, now);

    // Persist locally (machine facts always; project facts only for a registered
    // project — setProjectEnvFacts no-ops otherwise). Display reflects the probe.
    setMachineFacts(store, machine, now);
    setProjectEnvFacts(store, anchoredRoot, project, now);

    console.log('Dev-environment facts (local-only; never transmitted):');
    printFacts('Machine', machine);
    printFacts(`Project — ${projectShape} @ ${anchoredRoot}`, project);
    console.log(`\nDisable anytime: nexpath config set ${ENV_PROBE_ENABLED_KEY} false`);
  } finally {
    closeStore(store);
  }
}
