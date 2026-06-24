/**
 * Dev-environment probe — fact model.
 *
 * The probe reads the local machine + project to derive a closed allowlist of
 * environment facts. Each fact is a small record carrying its value, a trust
 * tier, a confidence, and when it was detected. Facts are pure-local: they are
 * stored on the machine only and never transmitted anywhere.
 */

/**
 * A fact value. `null` means UNKNOWN — the probe could not determine it (a read
 * failed, the source was absent or unparseable). A boolean fact is NEVER set to
 * `false` on failure (that would be a confident negative); failure → `null`.
 */
export type FactValue = string | boolean | null;

/**
 * Trust tier of a fact:
 *  - 'C' (capability) — the environment HAS the thing (a config/file/marker is
 *    present). Grounds capability-aware wording only.
 *  - 'P' (practice)   — the user actually DOES the thing, corroborated by
 *    behavioural evidence. This layer emits only 'C'.
 */
export type FactTier = 'C' | 'P';

/**
 * Detection confidence. Some signals are inherently weak on some platforms
 * (e.g. shell/terminal on Windows, where the env vars are usually unset).
 */
export type FactConfidence = 'high' | 'low';

/** A single probed environment fact. */
export interface EnvFact {
  value: FactValue;
  tier: FactTier;
  confidence: FactConfidence;
  detectedAt: number;
}

/** A keyed bag of facts, as stored (`env_facts` JSON) and displayed. */
export type FactMap = Record<string, EnvFact>;

/**
 * The 7 machine-fact keys (closed allowlist). Probed once per CLI startup and
 * cached in the config table (machine-scoped, not project-scoped).
 */
export const MACHINE_FACT_KEYS = [
  'os_platform',
  'is_wsl',
  'is_devcontainer_docker',
  'is_cloud_dev',
  'is_ci_context',
  'shell_type',
  'terminal_type',
] as const;
export type MachineFactKey = (typeof MACHINE_FACT_KEYS)[number];

/**
 * The 9 project-fact keys (closed allowlist). Probed per session against the
 * anchored repo root. `project_framework` is the single OPEN-NOMINAL value axis
 * (see framework-fingerprints) — its value is read/normalized, not enum-bound.
 */
export const PROJECT_FACT_KEYS = [
  'has_version_control',
  'has_persistent_context_file',
  'has_test_runner',
  'has_ci_pipeline',
  'has_deploy_config',
  'has_security_scanner',
  'has_env_separation',
  'has_lockfile',
  'project_framework',
] as const;
export type ProjectFactKey = (typeof PROJECT_FACT_KEYS)[number];

/** Project shape, detected first so the project probe anchors at the repo root. */
export type ProjectShape = 'single' | 'monorepo';

/** Result of the project probe: the 9 facts plus the anchoring metadata used. */
export interface ProjectProbeResult {
  facts: FactMap;
  /** The repo root the probe anchored on (may be an ancestor of the input root). */
  anchoredRoot: string;
  /** Whether the anchored root looks like a monorepo/workspaces root. */
  projectShape: ProjectShape;
}
