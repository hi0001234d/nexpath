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

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
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

function detectProjectShape(root: string, pkg: PackageJson | null): ProjectShape {
  if (pkg?.hasWorkspaces) return 'monorepo';
  const markers = ['pnpm-workspace.yaml', 'lerna.json', 'turbo.json', 'nx.json'];
  for (const m of markers) {
    try {
      if (existsSync(join(root, m))) return 'monorepo';
    } catch {
      /* ignore */
    }
  }
  return 'single';
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

const CONTEXT_FILES = [
  'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules', '.windsurfrules',
  '.clinerules', join('.cursor', 'rules'), join('.github', 'copilot-instructions.md'),
];
const TEST_DEPS = [
  'jest', 'vitest', 'mocha', 'ava', 'jasmine', 'karma', 'tape', 'uvu',
  '@playwright/test', 'cypress', '@jest/core', 'node-tap',
];
const DEPLOY_FILES = [
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'vercel.json',
  'netlify.toml', 'fly.toml', 'Procfile', 'render.yaml', 'app.yaml',
  'serverless.yml', 'serverless.yaml',
];
const SECURITY_FILES = [
  join('.github', 'dependabot.yml'), join('.github', 'dependabot.yaml'), '.snyk',
  'renovate.json', '.renovaterc', '.renovaterc.json', join('.github', 'renovate.json'),
  '.semgrep.yml', 'semgrep.yml',
];
const ENV_SEP_FILES = [
  '.env.example', '.env.sample', '.env.template', '.env.development', '.env.production',
];
const LOCKFILES = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'npm-shrinkwrap.json',
];
const CI_FILES = [
  '.gitlab-ci.yml', join('.circleci', 'config.yml'), 'azure-pipelines.yml',
  'Jenkinsfile', '.travis.yml', 'bitbucket-pipelines.yml',
];

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
  const projectShape = detectProjectShape(anchoredRoot, pkg);
  const r = anchoredRoot;

  const facts: FactMap = {
    has_version_control:         fact(safe(() => anyExists(r, ['.git'])), 'high', now),
    has_persistent_context_file: fact(safe(() => anyExists(r, CONTEXT_FILES)), 'high', now),
    has_test_runner:             fact(safe(() => detectHasTestRunner(pkg)), 'high', now),
    has_ci_pipeline:             fact(
      safe(() => dirNonEmpty(r, join('.github', 'workflows')) || anyExists(r, CI_FILES)),
      'high',
      now,
    ),
    has_deploy_config:           fact(safe(() => anyExists(r, DEPLOY_FILES)), 'high', now),
    has_security_scanner:        fact(safe(() => anyExists(r, SECURITY_FILES)), 'high', now),
    has_env_separation:          fact(safe(() => anyExists(r, ENV_SEP_FILES)), 'high', now),
    has_lockfile:                fact(safe(() => anyExists(r, LOCKFILES)), 'high', now),
    project_framework:           fact(
      safe(() => (pkg ? resolveFramework(pkg.dependencyNames) : null)),
      'high',
      now,
    ),
  };

  return { facts, anchoredRoot, projectShape };
}
