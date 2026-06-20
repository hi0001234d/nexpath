import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { runSetupFlow, buildSetupCommand, type SetupFlowDeps, type SetupState } from './setup-flow.js';
import { type StageResult } from './cli-stage.js';
import { type PrereqStatus } from './prereq.js';
import { type RunResult } from './terminal-runner.js';

const HOME = '/home/u/.nexpath';

const READY: PrereqStatus = {
  node: { present: true, version: 'v20' },
  npm: { present: true, version: '10' },
  ready: true,
};
const NOT_READY: PrereqStatus = {
  node: { present: false, version: null },
  npm: { present: true, version: '10' },
  ready: false,
};

const STAGED: StageResult = {
  status: 'staged',
  stagedDir: join(HOME, 'cli', '0.1.3'),
  cliEntry: join(HOME, 'cli', '0.1.3', 'dist', 'cli', 'index.js'),
  shimPath: join(HOME, 'bin', 'nexpath'),
  version: '0.1.3',
};
const CURRENT: StageResult = { ...STAGED, status: 'already-current' };

function makeDeps(over: Partial<SetupFlowDeps> = {}): {
  deps: SetupFlowDeps;
  state: { value: SetupState };
  calls: {
    runInTerminal: ReturnType<typeof vi.fn>;
    showError: ReturnType<typeof vi.fn>;
    showInfo: ReturnType<typeof vi.fn>;
    applyNexpathBin: ReturnType<typeof vi.fn>;
    verifyStagedCli: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
    setState: ReturnType<typeof vi.fn>;
  };
} {
  const state = { value: { done: false, version: null } as SetupState };
  const calls = {
    runInTerminal: vi.fn(async (): Promise<RunResult> => ({ ok: true, detail: 'OK', timedOut: false })),
    showError: vi.fn(),
    showInfo: vi.fn(),
    applyNexpathBin: vi.fn(),
    verifyStagedCli: vi.fn(() => true), // default: staged CLI runs (deps installed)
    writeFile: vi.fn(),
    setState: vi.fn(async (s: SetupState) => { state.value = s; }),
  };
  const deps: SetupFlowDeps = {
    nexpathHome: HOME,
    bundledCliDir: '/ext/nexpath-cli',
    checkPrereqs: () => READY,
    stageCli: () => STAGED,
    writeFile: calls.writeFile,
    buildCommand: buildSetupCommand,
    runInTerminal: calls.runInTerminal,
    showError: calls.showError,
    showInfo: calls.showInfo,
    applyNexpathBin: calls.applyNexpathBin,
    verifyStagedCli: calls.verifyStagedCli,
    getState: () => state.value,
    setState: calls.setState,
    ...over,
  };
  return { deps, state, calls };
}

describe('runSetupFlow', () => {
  it('blocks when node/npm are missing (no staging, no terminal)', async () => {
    const stageCli = vi.fn(() => STAGED);
    const { deps, calls } = makeDeps({ checkPrereqs: () => NOT_READY, stageCli });
    const outcome = await runSetupFlow(deps);
    expect(outcome).toBe('blocked');
    expect(stageCli).not.toHaveBeenCalled();
    expect(calls.runInTerminal).not.toHaveBeenCalled();
    expect(calls.showError).toHaveBeenCalledWith(expect.stringContaining('Node.js'));
  });

  it('reports no-bundle (dev build) without running the terminal', async () => {
    const { deps, calls } = makeDeps({
      stageCli: () => ({ status: 'no-bundle', stagedDir: null, cliEntry: null, shimPath: null, version: null }),
    });
    expect(await runSetupFlow(deps)).toBe('no-bundle');
    expect(calls.runInTerminal).not.toHaveBeenCalled();
    expect(calls.showError).toHaveBeenCalled();
  });

  it('runs the full flow on a fresh install and persists state', async () => {
    const { deps, state, calls } = makeDeps();
    const outcome = await runSetupFlow(deps);
    expect(outcome).toBe('done');
    expect(calls.applyNexpathBin).toHaveBeenCalledWith(STAGED.shimPath);
    expect(calls.writeFile).toHaveBeenCalledWith(
      join(HOME, 'nexpath-setup-runner.cjs'),
      expect.stringContaining('install'),
    );
    expect(calls.runInTerminal).toHaveBeenCalledOnce();
    expect(state.value).toEqual({ done: true, version: '0.1.3' });
    expect(calls.showInfo).toHaveBeenCalled();
  });

  it('skips re-running when already done for the current version (but still points IPC at the CLI)', async () => {
    const { deps, calls } = makeDeps({
      stageCli: () => CURRENT,
      getState: () => ({ done: true, version: '0.1.3' }),
    });
    const outcome = await runSetupFlow(deps);
    expect(outcome).toBe('already-done');
    expect(calls.runInTerminal).not.toHaveBeenCalled();
    expect(calls.applyNexpathBin).toHaveBeenCalledWith(STAGED.shimPath); // still wired up
  });

  it('force re-runs even when already done', async () => {
    const { deps, calls } = makeDeps({
      stageCli: () => CURRENT,
      getState: () => ({ done: true, version: '0.1.3' }),
    });
    expect(await runSetupFlow(deps, { force: true })).toBe('done');
    expect(calls.runInTerminal).toHaveBeenCalledOnce();
  });

  it('re-runs automatically when the bundled version changed', async () => {
    const { deps, calls, state } = makeDeps({
      getState: () => ({ done: true, version: '0.1.2' }), // older recorded version
    });
    expect(await runSetupFlow(deps)).toBe('done');
    expect(calls.runInTerminal).toHaveBeenCalledOnce();
    expect(state.value.version).toBe('0.1.3');
  });

  it('reports failure when the terminal run fails and does NOT mark done', async () => {
    const { deps, state, calls } = makeDeps({
      runInTerminal: vi.fn(async () => ({ ok: false, detail: 'FAIL:npm install', timedOut: false })),
    });
    expect(await runSetupFlow(deps)).toBe('failed');
    expect(state.value.done).toBe(false);
    expect(calls.showError).toHaveBeenCalledWith(expect.stringContaining('Set up CLI'));
  });

  // ── Directions 2/3/4: never trust/activate a staged CLI that doesn't run ────
  it('does NOT point IPC at a staged CLI that fails to verify (dep-less copy)', async () => {
    const { deps, calls } = makeDeps({
      stageCli: () => CURRENT,
      getState: () => ({ done: true, version: '0.1.3' }), // flag says done…
      verifyStagedCli: vi.fn(() => false),                // …but the copy can't run
    });
    const outcome = await runSetupFlow(deps);
    // Must NOT short-circuit to already-done, and must NOT set NEXPATH_BIN to the
    // broken copy before the runner re-installs deps.
    expect(outcome).not.toBe('already-done');
    expect(calls.applyNexpathBin).not.toHaveBeenCalled();
    expect(calls.runInTerminal).toHaveBeenCalledOnce();
  });

  it("treats a done+current copy as already-done ONLY when it verifies", async () => {
    const verified = makeDeps({ stageCli: () => CURRENT, getState: () => ({ done: true, version: '0.1.3' }) });
    expect(await runSetupFlow(verified.deps)).toBe('already-done');

    const broken = makeDeps({
      stageCli: () => CURRENT,
      getState: () => ({ done: true, version: '0.1.3' }),
      verifyStagedCli: vi.fn(() => false),
    });
    expect(await runSetupFlow(broken.deps)).not.toBe('already-done');
  });

  it("runner reports OK but the CLI still doesn't run → 'failed', not done", async () => {
    const { deps, state, calls } = makeDeps({
      runInTerminal: vi.fn(async () => ({ ok: true, detail: 'OK', timedOut: false })),
      verifyStagedCli: vi.fn(() => false), // npm install "ran" but deps still missing
    });
    expect(await runSetupFlow(deps)).toBe('failed');
    expect(state.value.done).toBe(false);
    expect(calls.applyNexpathBin).not.toHaveBeenCalled();
    expect(calls.showError).toHaveBeenCalledWith(expect.stringContaining('could not start'));
  });
});

describe('buildSetupCommand', () => {
  it('quotes every path argument', () => {
    const cmd = buildSetupCommand('/r/runner.cjs', '/s/staged', '/s/.sentinel', '/s/staged/dist/cli/index.js');
    expect(cmd).toBe('node "/r/runner.cjs" "/s/staged" "/s/.sentinel" "/s/staged/dist/cli/index.js"');
  });
});
