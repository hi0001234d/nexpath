/**
 * Dev-environment probe (Channel Y, B1) — zero LLM, zero network, pure-local.
 *
 * `probeMachine()` reads machine-scoped env/platform facts (once per CLI start).
 * `probeProject(root)` anchors at the repo root and reads project-scoped facts
 * (per session, bounded checks, well under ~10ms).
 *
 * Robustness invariants:
 *  - S9 per-fact isolation: every detector runs inside `safe()`; a throwing read
 *    yields UNKNOWN (`null`), NEVER a confident `false`, and the probe continues.
 *  - S3 safe-parse: package.json is read size-capped and JSON-parsed defensively
 *    (a missing / oversize / malformed file → no crash, framework UNKNOWN).
 *  - S2 anchoring: the project probe walks up to the enclosing repo root so a run
 *    inside `packages/app/` does not falsely report "no version control".
 */

import { existsSync, readFileSync, statSync, readdirSync, opendirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import {
  type EnvFact,
  type FactValue,
  type FactConfidence,
  type FactMap,
  type ProjectProbeResult,
  type ProjectShape,
} from './types.js';
import { resolveFramework } from './framework-fingerprints.js';

/** Largest package.json the probe will parse (S3). Bigger → treated as absent. */
const MAX_PACKAGE_JSON_BYTES = 1024 * 1024; // 1 MB
/** Max ancestor levels the anchor walk-up will climb (S2). */
const MAX_ANCHOR_LEVELS = 12;
/**
 * Hard ceiling on entries read from the anchored root in one probe. Real project
 * roots have far fewer; this only bounds a pathological directory (e.g. a root
 * with a huge file count) so the single readdir can never stall the host. ~1k
 * entries costs ~1–2ms — well inside the <10ms budget — and stays finite.
 */
const MAX_ROOT_ENTRIES = 1024;

/** Build a Tier-C fact. B1 emits only capability tier; Tier-P is a later phase. */
function fact(value: FactValue, confidence: FactConfidence, detectedAt: number): EnvFact {
  return { value, tier: 'C', confidence, detectedAt };
}

/** Run a detector with per-fact isolation: any throw → UNKNOWN (never false). */
function safe(fn: () => FactValue): FactValue {
  try {
    return fn();
  } catch {
    return null;
  }
}

function envFlag(...names: string[]): boolean {
  return names.some((n) => {
    const v = process.env[n];
    return v !== undefined && v !== '' && v !== 'false' && v !== '0';
  });
}

// ── Machine probe ────────────────────────────────────────────────────────────

function detectIsWsl(): boolean {
  if (process.platform !== 'win32' && process.platform !== 'linux') return false;
  if (envFlag('WSL_DISTRO_NAME', 'WSL_INTEROP')) return true;
  if (process.platform === 'linux') {
    try {
      const v = readFileSync('/proc/version', 'utf8').toLowerCase();
      return v.includes('microsoft') || v.includes('wsl');
    } catch {
      return false;
    }
  }
  return false;
}

function detectShellType(): FactValue {
  const shell = process.env.SHELL;
  if (shell && shell.trim()) return basename(shell.trim());
  // Windows rarely sets SHELL — best-effort, hence LOW confidence.
  if (process.env.PSModulePath) return 'powershell';
  if (process.env.ComSpec) return basename(process.env.ComSpec);
  return null;
}

/**
 * Probe machine-scoped facts (7 keys). Cached by the caller in the config table.
 */
export function probeMachine(now: number = Date.now()): FactMap {
  return {
    os_platform:            fact(safe(() => process.platform), 'high', now),
    is_wsl:                 fact(safe(detectIsWsl), 'high', now),
    is_devcontainer_docker: fact(
      safe(() => envFlag('REMOTE_CONTAINERS', 'DEVCONTAINER') || existsSync('/.dockerenv')),
      'high',
      now,
    ),
    is_cloud_dev:           fact(
      safe(() => envFlag('CODESPACES', 'GITPOD_WORKSPACE_ID', 'CLOUD_SHELL', 'GOOGLE_CLOUD_SHELL', 'STACKBLITZ_ENV')),
      'high',
      now,
    ),
    is_ci_context:          fact(
      safe(() => envFlag('CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'CIRCLECI', 'TRAVIS', 'JENKINS_URL', 'BUILDKITE', 'TEAMCITY_VERSION', 'TF_BUILD')),
      'high',
      now,
    ),
    shell_type:             fact(safe(detectShellType), 'low', now),
    terminal_type:          fact(safe(() => process.env.TERM_PROGRAM ?? process.env.TERM ?? null), 'low', now),
  };
}

// ── Project probe ────────────────────────────────────────────────────────────

interface PackageJson {
  dependencyNames: string[];
  scripts: Record<string, string>;
  hasWorkspaces: boolean;
}

/** Read + parse package.json defensively (S3): missing/oversize/malformed → null. */
function readPackageJsonSafe(root: string): PackageJson | null {
  const path = join(root, 'package.json');
  try {
    if (!existsSync(path)) return null;
    if (statSync(path).size > MAX_PACKAGE_JSON_BYTES) return null;
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const deps = (raw.dependencies ?? {}) as Record<string, unknown>;
    const dev = (raw.devDependencies ?? {}) as Record<string, unknown>;
    return {
      dependencyNames: [...Object.keys(deps), ...Object.keys(dev)],
      scripts: (raw.scripts ?? {}) as Record<string, string>,
      hasWorkspaces: raw.workspaces !== undefined,
    };
  } catch {
    return null;
  }
}

/** Walk up from `start` to the enclosing repo root (first ancestor with .git/). */
function anchorRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < MAX_ANCHOR_LEVELS; i++) {
    try {
      if (existsSync(join(dir, '.git'))) return dir;
    } catch {
      /* keep climbing */
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return start; // no .git found — fall back to the input root
}

function detectProjectShape(entries: Set<string>, pkg: PackageJson | null): ProjectShape {
  if (pkg?.hasWorkspaces) return 'monorepo';
  return rootHasAny(entries, SHAPE_MARKERS_ROOT) ? 'monorepo' : 'single';
}

/**
 * List the anchored root's direct entries ONCE (lowercased) so root-level marker
 * checks are case-insensitive set lookups rather than one `existsSync` each —
 * keeping the project probe within its bounded check budget. Read failure → {}.
 */
function readRootEntries(root: string): Set<string> {
  const set = new Set<string>();
  let dir: ReturnType<typeof opendirSync> | undefined;
  try {
    // Stream entries (opendir) rather than readdir-all, so MAX_ROOT_ENTRIES is a
    // genuine hard stop even on a pathologically large directory.
    dir = opendirSync(root);
    let count = 0;
    for (let ent = dir.readSync(); ent !== null && count < MAX_ROOT_ENTRIES; ent = dir.readSync()) {
      set.add(ent.name.toLowerCase());
      count++;
    }
  } catch {
    /* unreadable root → empty set (every has_* falls back to false) */
  } finally {
    try {
      dir?.closeSync();
    } catch {
      /* ignore */
    }
  }
  return set;
}

/** Case-insensitive: true if any root-level marker name is among the entries. */
function rootHasAny(entries: Set<string>, names: readonly string[]): boolean {
  return names.some((n) => entries.has(n));
}

/** True if any of the given relative paths exists under root. */
function anyExists(root: string, names: readonly string[]): boolean {
  return names.some((n) => {
    try {
      return existsSync(join(root, n));
    } catch {
      return false;
    }
  });
}

/** True if a directory exists under root and is non-empty. */
function dirNonEmpty(root: string, rel: string): boolean {
  try {
    const p = join(root, rel);
    return existsSync(p) && statSync(p).isDirectory() && readdirSync(p).length > 0;
  } catch {
    return false;
  }
}

// Root-level markers are matched case-insensitively against the single readdir
// of the anchored root (entries are lowercased, so keep these lowercase too).
// Markers nested below the root keep a targeted existsSync each.
const CONTEXT_FILES_ROOT = [
  'claude.md', 'agents.md', 'gemini.md', '.cursorrules', '.windsurfrules', '.clinerules',
];
const CONTEXT_FILES_NESTED = [join('.cursor', 'rules'), join('.github', 'copilot-instructions.md')];
const TEST_DEPS = [
  'jest', 'vitest', 'mocha', 'ava', 'jasmine', 'karma', 'tape', 'uvu',
  '@playwright/test', 'cypress', '@jest/core', 'node-tap',
];
const DEPLOY_FILES_ROOT = [
  'dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'vercel.json',
  'netlify.toml', 'fly.toml', 'procfile', 'render.yaml', 'app.yaml',
  'serverless.yml', 'serverless.yaml',
];
const SECURITY_FILES_ROOT = [
  '.snyk', 'renovate.json', '.renovaterc', '.renovaterc.json', '.semgrep.yml', 'semgrep.yml',
];
const SECURITY_FILES_NESTED = [
  join('.github', 'dependabot.yml'), join('.github', 'dependabot.yaml'), join('.github', 'renovate.json'),
];
const ENV_SEP_FILES_ROOT = [
  '.env.example', '.env.sample', '.env.template', '.env.development', '.env.production',
];
const LOCKFILES_ROOT = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'npm-shrinkwrap.json',
];
const CI_FILES_ROOT = [
  '.gitlab-ci.yml', 'azure-pipelines.yml', 'jenkinsfile', '.travis.yml', 'bitbucket-pipelines.yml',
];
const CI_FILES_NESTED = [join('.circleci', 'config.yml')];
const SHAPE_MARKERS_ROOT = ['pnpm-workspace.yaml', 'lerna.json', 'turbo.json', 'nx.json'];

function detectHasTestRunner(pkg: PackageJson | null): boolean {
  if (!pkg) return false;
  if (pkg.dependencyNames.some((d) => TEST_DEPS.includes(d))) return true;
  const test = pkg.scripts.test;
  // npm's default placeholder is not a real runner.
  return typeof test === 'string' && test.trim() !== '' && !test.includes('no test specified');
}

/**
 * Probe project-scoped facts (9 keys) against the anchored repo root.
 * Returns the facts plus the anchoring metadata used (S2).
 */
export function probeProject(inputRoot: string, now: number = Date.now()): ProjectProbeResult {
  const anchoredRoot = anchorRepoRoot(inputRoot);
  const pkg = readPackageJsonSafe(anchoredRoot);
  const entries = readRootEntries(anchoredRoot); // single readdir of the anchored root
  const projectShape = detectProjectShape(entries, pkg);
  const r = anchoredRoot;

  const facts: FactMap = {
    has_version_control:         fact(safe(() => entries.has('.git')), 'high', now),
    has_persistent_context_file: fact(
      safe(() => rootHasAny(entries, CONTEXT_FILES_ROOT) || anyExists(r, CONTEXT_FILES_NESTED)),
      'high',
      now,
    ),
    has_test_runner:             fact(safe(() => detectHasTestRunner(pkg)), 'high', now),
    has_ci_pipeline:             fact(
      safe(() =>
        dirNonEmpty(r, join('.github', 'workflows')) ||
        rootHasAny(entries, CI_FILES_ROOT) ||
        anyExists(r, CI_FILES_NESTED),
      ),
      'high',
      now,
    ),
    has_deploy_config:           fact(safe(() => rootHasAny(entries, DEPLOY_FILES_ROOT)), 'high', now),
    has_security_scanner:        fact(
      safe(() => rootHasAny(entries, SECURITY_FILES_ROOT) || anyExists(r, SECURITY_FILES_NESTED)),
      'high',
      now,
    ),
    has_env_separation:          fact(safe(() => rootHasAny(entries, ENV_SEP_FILES_ROOT)), 'high', now),
    has_lockfile:                fact(safe(() => rootHasAny(entries, LOCKFILES_ROOT)), 'high', now),
    project_framework:           fact(
      safe(() => (pkg ? resolveFramework(pkg.dependencyNames) : null)),
      'high',
      now,
    ),
  };

  return { facts, anchoredRoot, projectShape };
}
