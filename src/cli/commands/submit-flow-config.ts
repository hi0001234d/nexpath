/**
 * Submit-time advisory switch — the SHIPPED, developer-controlled activation.
 *
 * OWNER RULING 2026-08-12 (backward-compatibility concept, do not re-litigate —
 * memory `hook-milestone-switch-delivery-config-backed`): the new prompt-submit
 * flow ships behind a switch that is a DEVELOPER control, never shown to end
 * users. We ship the new flow ON and keep the old flow's code intact behind the
 * switch, so reverting is a config flip, not an erase-then-rewrite.
 *
 * ── WHY A FLAG FILE, NOT THE nexpath CONFIG TABLE ────────────────────────────
 * The natural home would be `nexpath config`, but that table is dumped by
 * `nexpath status` (`status.ts`, another member's module) and read/written by
 * `nexpath config get/set` (`config.ts` / `src/store/**`, the store owner's
 * module, FROZEN as consume-only). Hiding a key there would require editing
 * files we do not own. A dedicated JSON flag in `~/.nexpath/` is read/written
 * ONLY by this track's files, so it is invisible to `status`/`config` BY CONSTRUCTION — no
 * other member's code touched, and the team-lead "invisible to end users"
 * intent is honoured while giving the owner the config control they asked for.
 *
 * ── RESOLUTION ORDER ─────────────────────────────────────────────────────────
 *   1. ENV VAR (`NEXPATH_{CURSOR,WINDSURF}_PROMPTSUBMIT_ADVISORY`) — the
 *      developer override. `'1'` ⇒ on, `'0'` ⇒ off. Wins if present so a
 *      developer can force either flow for one launch without editing the flag.
 *   2. The flag file `~/.nexpath/submit-flow.json` — `{ "cursor": bool,
 *      "windsurf": bool }`. This is what install writes and what ships.
 *   3. Default OFF (old flow, byte-identical) — absent/unreadable/garbage all
 *      fall through to today's behaviour, so a missing file never surprises.
 *
 * The env-var read is kept exact-equality (`=== '1'` / `=== '0'`) to match the
 * shipped `NEXPATH_SIM`/`NEXPATH_DEBUG` convention. The extension mirrors this
 * resolver (separate npm package, cannot import `src/cli` — G-ROOTDIR); a
 * contract test pins the filename + shape so the two halves cannot drift.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export type SubmitHost = 'cursor' | 'windsurf';

/** Env var per host — duplicated string, pinned by test, matching the shipped constants. */
export const SUBMIT_ADVISORY_ENV: Record<SubmitHost, string> = {
  cursor:   'NEXPATH_CURSOR_PROMPTSUBMIT_ADVISORY',
  windsurf: 'NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY',
};

/** The flag file both the CLI and the extension read. Never in the config table. */
export const SUBMIT_FLOW_FLAG_FILENAME = 'submit-flow.json';

/** `~/.nexpath/submit-flow.json` (overridable for tests). */
export function submitFlowFlagPath(nexpathHome?: string): string {
  return join(nexpathHome ?? join(homedir(), '.nexpath'), SUBMIT_FLOW_FLAG_FILENAME);
}

export interface SubmitFlowResolverDeps {
  env?: NodeJS.ProcessEnv;
  /** Read the raw flag-file text; returns null on any error (tests inject). */
  readFlagFile?: (path: string) => string | null;
  nexpathHome?: string;
}

function defaultReadFlagFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Resolve whether the submit-time advisory flow is ON for `host`.
 *
 * Fail-safe: any parse/read error ⇒ the flag contributes `false`, so a corrupt
 * file degrades to the old flow rather than an undefined state. Never throws.
 */
export function isSubmitAdvisoryEnabledForHost(
  host: SubmitHost,
  deps: SubmitFlowResolverDeps = {},
): boolean {
  const env = deps.env ?? process.env;
  const envVal = env[SUBMIT_ADVISORY_ENV[host]];
  if (envVal === '1') return true;   // developer override — force ON
  if (envVal === '0') return false;  // developer override — force OFF

  const readFlagFile = deps.readFlagFile ?? defaultReadFlagFile;
  const raw = readFlagFile(submitFlowFlagPath(deps.nexpathHome));
  if (raw === null) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed[host] === true;
  } catch {
    return false;
  }
}

/**
 * Set the shipped flag for one host, merging into any existing file (the other
 * host's value is preserved). Called from `nexpath install`'s per-host hook
 * writers so a normal install ships the new flow ON — the owner's "write 1 in
 * config" delivery. Developers flip a host by editing this file (or re-running
 * install). Best-effort: a write failure is swallowed (the env var still works
 * as the override, and the resolver defaults OFF), never breaking install.
 */
export function setSubmitFlowFlag(
  host: SubmitHost,
  enabled: boolean,
  deps: { nexpathHome?: string; readFlagFile?: (p: string) => string | null;
          writeFlagFile?: (p: string, text: string) => void } = {},
): void {
  const path = submitFlowFlagPath(deps.nexpathHome);
  const read = deps.readFlagFile ?? defaultReadFlagFile;
  let current: Record<string, unknown> = {};
  const raw = read(path);
  if (raw !== null) { try { current = JSON.parse(raw) as Record<string, unknown>; } catch { current = {}; } }
  current[host] = enabled;
  const write = deps.writeFlagFile ?? ((p: string, text: string) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text, 'utf8');
  });
  try { write(path, JSON.stringify(current, null, 2)); } catch { /* best-effort */ }
}
