import { beforeEach, vi } from 'vitest';

// The OS keychain is system-wide: redirecting HOME does not isolate it, so tests that run
// `uninstallAction({ yes: true })` were deleting the developer's real OpenAI key and Nexpath token.
// Every test file gets an in-memory keychain instead (fresh per file; a file's own
// vi.mock('cross-keychain') still wins). Opt-in real-credential tests set NEXPATH_REAL_KEYCHAIN=1
// to read the real one.
vi.mock('cross-keychain', async (importActual) => {
  const actual = await importActual<typeof import('cross-keychain')>();
  if (process.env.NEXPATH_REAL_KEYCHAIN === '1') return actual;
  const store = new Map<string, string>();
  const k = (service: string, account: string) => `${service}\u0000${account}`;
  return {
    ...actual,
    getPassword: async (service: string, account: string) => store.get(k(service, account)) ?? null,
    setPassword: async (service: string, account: string, password: string) => {
      store.set(k(service, account), password);
    },
    deletePassword: async (service: string, account: string) => {
      store.delete(k(service, account));
    },
  };
});
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Bug 5 / Phase P4: redirect the nexpath home to an isolated temp dir so the test suite NEVER writes
// into the real ~/.nexpath (nexpath.log, telemetry.jsonl, hook-stats.json, prompt-store.db, sync.lock
// — all resolved as `join(homedir(), '.nexpath', ...)` module-level constants).
//
// setupFiles run before the test file's imports, and this file imports only node builtins, so no
// nexpath path constant is evaluated before HOME is redirected. os.homedir() honours $HOME on POSIX
// and %USERPROFILE% on Windows. The temp dirs are removed after the whole run by the globalSetup
// teardown in vitest.global-setup.ts (vitest kills workers, so a per-worker exit handler is not
// reliable). The `nexpath-test-home-` prefix is what that teardown matches.
const testHome = process.env.__NEXPATH_TEST_HOME__ ?? mkdtempSync(join(tmpdir(), 'nexpath-test-home-'));
process.env.__NEXPATH_TEST_HOME__ = testHome;
process.env.HOME = testHome;
process.env.USERPROFILE = testHome;

// `nexpath install` downloads the 24 MB memory model (multilingual #7, Phase 6); the suite must never
// touch the network for it. The install tests for that step pass their own fake download.
process.env.NEXPATH_SKIP_MODEL_DOWNLOAD = '1';

// Same concern, different variable: a real OPENAI_API_KEY must not reach the suite. The
// prompt-enhancement composer runs for any shown popup that has a valid key, so a real key
// turns deterministic assertions into live network calls that hang and then time out.
//
// This has to be a beforeEach rather than a plain statement here. The key arrives from the
// developer's shell AND from the repo `.env` via dotenv, and dotenv is loaded during the test
// file's own imports — which happen after setupFiles has already run. Deleting it at module
// scope would be undone by that import. beforeEach runs after imports and before the test
// body, so tests that exercise the LLM path still set their own fake key and win.
beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
});
