import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { installAction, resolveAgentPaths, type AgentPaths } from './install.js';

/**
 * Real $HOME captured at module load — DEFAULT_DB_PATH (resolved when store/db.ts
 * was imported) bakes this in, so we normalise it out of the snapshot to keep
 * the snapshot portable across machines.
 */
const REAL_HOME = homedir();

/**
 * Snapshot test — captures the current behaviour of installAction before any
 * refactor begins. This is the safety net for Milestone M1 Branch 2's zero-diff
 * guarantee: after the refactor merges, this snapshot MUST remain byte-identical.
 *
 * See dev plan §1.5 and §1.6 in the reviewduel-submodule docs.
 */
describe('installAction snapshot (M1 zero-diff safety net)', () => {
  let tmpHome: string;
  let originalArgv1: string;
  let originalPlatform: NodeJS.Platform;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'nexpath-snapshot-'));
    vi.stubEnv('HOME', tmpHome);

    // Pin process.argv[1] so the hook command's resolved CLI path is deterministic.
    originalArgv1 = process.argv[1];
    process.argv[1] = '/fixture/nexpath/dist/cli/index.js';

    // Pin process.platform to 'linux' so the disclosure modifier-key ("Ctrl+X"
    // vs "Cmd+X" on macOS) is stable regardless of where the test runs.
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv[1] = originalArgv1;
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    vi.unstubAllEnvs();
    logSpy.mockRestore();
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('writes the same settings.json bytes and stdout as the pre-refactor baseline', async () => {
    // Controlled paths — no real user dirs touched, snapshot is fully portable.
    const paths: AgentPaths = resolveAgentPaths(
      tmpHome,
      join(tmpHome, 'AppData', 'Roaming'),
      join(tmpHome, 'cwd'),
      'linux',
    );

    await installAction(
      { yes: true },
      {
        isWin: false,
        paths,
        dbPath: ':memory:',
        skipClipboardCheck: true,
      },
    );

    const settingsPath = join(tmpHome, '.claude', 'settings.json');
    const settingsContent = existsSync(settingsPath)
      ? readFileSync(settingsPath, 'utf8')
      : null;

    const stdout = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');

    // Normalise both the test-tmp home (resolved at install-time) and the real
    // home (which DEFAULT_DB_PATH captured at module-import-time).
    const normalise = (s: string | null): string | null =>
      s === null
        ? null
        : s.replaceAll(tmpHome, '$HOME').replaceAll(REAL_HOME, '$HOME');

    expect({
      settingsContent: normalise(settingsContent),
      stdout: normalise(stdout),
    }).toMatchSnapshot();
  });
});
