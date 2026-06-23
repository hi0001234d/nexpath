import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeMachine, probeProject } from './env-probe.js';
import { MACHINE_FACT_KEYS, PROJECT_FACT_KEYS } from './types.js';

const NOW = 1_700_000_000_000;

// ── Machine probe ──────────────────────────────────────────────────────────

describe('probeMachine', () => {
  // Snapshot + restore the env vars these tests mutate.
  const TOUCHED = [
    'CI', 'GITHUB_ACTIONS', 'WSL_DISTRO_NAME', 'WSL_INTEROP', 'REMOTE_CONTAINERS',
    'DEVCONTAINER', 'CODESPACES', 'GITPOD_WORKSPACE_ID', 'TERM_PROGRAM', 'TERM',
    'SHELL', 'PSModulePath', 'ComSpec',
  ];
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = {};
    for (const k of TOUCHED) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('emits all 7 machine keys, every fact Tier-C with the given detectedAt', () => {
    const facts = probeMachine(NOW);
    expect(Object.keys(facts).sort()).toEqual([...MACHINE_FACT_KEYS].sort());
    for (const k of MACHINE_FACT_KEYS) {
      expect(facts[k].tier).toBe('C');
      expect(facts[k].detectedAt).toBe(NOW);
    }
  });

  it('reports os_platform as the live platform', () => {
    expect(probeMachine(NOW).os_platform.value).toBe(process.platform);
  });

  it('detects CI context from env vars', () => {
    expect(probeMachine(NOW).is_ci_context.value).toBe(false);
    process.env.GITHUB_ACTIONS = 'true';
    expect(probeMachine(NOW).is_ci_context.value).toBe(true);
  });

  it('detects WSL / devcontainer / cloud-dev from env vars', () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    process.env.REMOTE_CONTAINERS = 'true';
    process.env.CODESPACES = 'true';
    const f = probeMachine(NOW);
    expect(f.is_wsl.value).toBe(true);
    expect(f.is_devcontainer_docker.value).toBe(true);
    expect(f.is_cloud_dev.value).toBe(true);
  });

  it('marks shell_type and terminal_type LOW confidence', () => {
    const f = probeMachine(NOW);
    expect(f.shell_type.confidence).toBe('low');
    expect(f.terminal_type.confidence).toBe('low');
  });

  it('derives shell_type from SHELL, and terminal_type from TERM_PROGRAM', () => {
    process.env.SHELL = '/usr/bin/zsh';
    process.env.TERM_PROGRAM = 'iTerm.app';
    const f = probeMachine(NOW);
    expect(f.shell_type.value).toBe('zsh');
    expect(f.terminal_type.value).toBe('iTerm.app');
  });

  it('falls back to a Windows shell signal when SHELL is unset (LOW confidence)', () => {
    // SHELL is unset (deleted in beforeEach); the Windows fallback should fire.
    process.env.PSModulePath = 'C:\\Program Files\\PowerShell\\Modules';
    const f = probeMachine(NOW);
    expect(f.shell_type.value).toBe('powershell');
    expect(f.shell_type.confidence).toBe('low');
  });

  it('reports os_platform per-platform (win32 / darwin / linux fixtures)', () => {
    const orig = process.platform;
    try {
      for (const plat of ['win32', 'darwin', 'linux'] as const) {
        Object.defineProperty(process, 'platform', { value: plat, configurable: true });
        const f = probeMachine(NOW);
        expect(f.os_platform.value).toBe(plat);
        // is_wsl must never be a confident negative-by-crash on any platform.
        expect([true, false]).toContain(f.is_wsl.value);
        // shell/terminal stay LOW everywhere (weakest on win32, where they're unset).
        expect(f.shell_type.confidence).toBe('low');
        expect(f.terminal_type.confidence).toBe('low');
      }
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    }
  });
});

// ── Project probe ────────────────────────────────────────────────────────────

describe('probeProject', () => {
  let dirs: string[] = [];
  function mkProject(): string {
    const d = mkdtempSync(join(tmpdir(), 'nexpath-env-'));
    dirs.push(d);
    return d;
  }
  beforeEach(() => { dirs = []; });
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('emits all 9 project keys, every fact Tier-C with the given detectedAt', () => {
    const { facts } = probeProject(mkProject(), NOW);
    expect(Object.keys(facts).sort()).toEqual([...PROJECT_FACT_KEYS].sort());
    for (const k of PROJECT_FACT_KEYS) {
      expect(facts[k].tier).toBe('C');
      expect(facts[k].detectedAt).toBe(NOW);
    }
  });

  it('S2: anchors at the enclosing repo root from a nested package dir', () => {
    const root = mkProject();
    mkdirSync(join(root, '.git'));
    const nested = join(root, 'packages', 'app');
    mkdirSync(nested, { recursive: true });
    const { facts, anchoredRoot } = probeProject(nested, NOW);
    expect(anchoredRoot).toBe(root);
    // A cwd-anchored probe would wrongly report no version control here.
    expect(facts.has_version_control.value).toBe(true);
  });

  it('detects has_* facts from marker files', () => {
    const root = mkProject();
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, 'CLAUDE.md'), '# rules');
    writeFileSync(join(root, 'package-lock.json'), '{}');
    writeFileSync(join(root, 'Dockerfile'), 'FROM node');
    writeFileSync(join(root, '.env.example'), 'KEY=');
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'on: push');
    writeFileSync(join(root, '.github', 'dependabot.yml'), 'version: 2');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { vitest: '1.0.0' } }));
    const { facts } = probeProject(root, NOW);
    expect(facts.has_version_control.value).toBe(true);
    expect(facts.has_persistent_context_file.value).toBe(true);
    expect(facts.has_lockfile.value).toBe(true);
    expect(facts.has_deploy_config.value).toBe(true);
    expect(facts.has_env_separation.value).toBe(true);
    expect(facts.has_ci_pipeline.value).toBe(true);
    expect(facts.has_security_scanner.value).toBe(true);
    expect(facts.has_test_runner.value).toBe(true);
  });

  it('resolves project_framework from package.json deps (open-nominal axis)', () => {
    const root = mkProject();
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { next: '14', react: '18' } }));
    expect(probeProject(root, NOW).facts.project_framework.value).toBe('nextjs');
  });

  it('detects a monorepo shape from a workspaces field', () => {
    const root = mkProject();
    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }));
    expect(probeProject(root, NOW).projectShape).toBe('monorepo');
  });

  it('detects a monorepo shape from a root marker file (pnpm-workspace.yaml)', () => {
    const root = mkProject();
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"');
    expect(probeProject(root, NOW).projectShape).toBe('monorepo');
  });

  it('still detects a marker among many root entries (bounded streaming read)', () => {
    const root = mkProject();
    for (let i = 0; i < 200; i++) writeFileSync(join(root, `file-${i}.txt`), 'x');
    writeFileSync(join(root, 'package-lock.json'), '{}');
    expect(probeProject(root, NOW).facts.has_lockfile.value).toBe(true);
  });

  it('matches root-level markers case-insensitively', () => {
    const root = mkProject();
    // Unusual casing must still be detected (matches OS case-insensitive FS behaviour).
    writeFileSync(join(root, 'Claude.MD'), '# rules');
    writeFileSync(join(root, 'DOCKERFILE'), 'FROM node');
    const { facts } = probeProject(root, NOW);
    expect(facts.has_persistent_context_file.value).toBe(true);
    expect(facts.has_deploy_config.value).toBe(true);
  });

  it('S3: a malformed package.json never crashes → framework UNKNOWN (null)', () => {
    const root = mkProject();
    writeFileSync(join(root, 'package.json'), '{ this is not json ');
    const { facts } = probeProject(root, NOW);
    expect(facts.project_framework.value).toBeNull();
  });

  it('S3: an oversize package.json (>1 MB) is treated as absent', () => {
    const root = mkProject();
    const huge = '{"dependencies":{"next":"14"},"_pad":"' + 'x'.repeat(1024 * 1024 + 10) + '"}';
    writeFileSync(join(root, 'package.json'), huge);
    expect(probeProject(root, NOW).facts.project_framework.value).toBeNull();
  });

  it('S9: an empty project reports booleans as false and framework null — never undefined', () => {
    const { facts } = probeProject(mkProject(), NOW);
    expect(facts.has_version_control.value).toBe(false);
    expect(facts.has_test_runner.value).toBe(false);
    expect(facts.project_framework.value).toBeNull();
    for (const k of PROJECT_FACT_KEYS) {
      expect(facts[k].value).not.toBeUndefined();
    }
  });

  it('refreshes detectedAt on re-probe (staleness)', () => {
    const root = mkProject();
    expect(probeProject(root, NOW).facts.has_lockfile.detectedAt).toBe(NOW);
    expect(probeProject(root, NOW + 5000).facts.has_lockfile.detectedAt).toBe(NOW + 5000);
  });
});
