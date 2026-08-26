/**
 * HB1 — the submit-time advisory switch, browser shape.
 *
 * The browser mirror of the SHIPPED CLI resolver
 * (`src/cli/commands/submit-flow-config.ts`). That file is a FROZEN path for this
 * milestone: it was read as the reference and is never edited or imported (the
 * extension is bundled separately and cannot reach `src/cli`, exactly as the CLI
 * resolver's own doc comment anticipates).
 *
 * ── RESOLUTION ORDER (mirroring the shipped three tiers) ────────────────────
 *   1. OVERRIDE — one hidden `storage.local` key for one-off developer forcing.
 *      Browsers have no env vars, so this key plays the role the CLI's
 *      `NEXPATH_*_PROMPTSUBMIT_ADVISORY` env var plays. Exact-equality `'1'`/`'0'`,
 *      matching the shipped convention.
 *   2. PER-SITE PERSISTED FLAG — `bolt_/lovable_/replit_promptsubmit_advisory`,
 *      exact-equality `'true'`/`'false'`.
 *   3. DEFAULT — **ON** (HB-D2).
 *
 * ── WHY THE DEFAULT IS THE OPPOSITE POLARITY TO THE CLI'S ────────────────────
 * The CLI defaults OFF because `nexpath install` WRITES the flag, so "absent"
 * there means "never installed". A browser extension has no installer step that
 * could write a flag, so the default itself is the ship polarity: absent ⇒ ON.
 * This asymmetry is deliberate — not a porting slip.
 *
 * ── TWO DIFFERENT DEFAULTS, DELIBERATELY (do not "simplify" them together) ────
 * "Absent ⇒ ON" is about STORAGE resolution. The PAGE world starts DISARMED
 * until a resolved value is pushed to it (see `inject/submit-flow-page.ts`),
 * because the inverted-risk rule says a failure while holding
 * means the user's prompt never sends. So: we ship ON, and we never hold a
 * request on a value we have not actually resolved.
 *
 * ── READ-ERROR IS NOT THE SAME AS ABSENT ─────────────────────────────────────
 * Absent-but-readable ⇒ ON (the ship polarity). An unreadable store is an
 * ABNORMAL state, and by the same inverted-risk rule we never enter a holding
 * flow from an abnormal state — it resolves OFF, with a reason label.
 *
 * ── RC19c ────────────────────────────────────────────────────────────────────
 * An explicit `'false'` is the documented revert and must never be self-healed
 * back on. This module has NO writer at all, so that is guaranteed by
 * construction rather than by discipline. Do not add one.
 *
 * ── VISIBILITY (A9 / team-lead ruling 2026-07-29) ────────────────────────────
 * None of these keys may ever appear in `options.html`, `options.ts`, or
 * `renderSelfCheck()`. Guard-tested in `pe-config.test.ts` alongside the PE keys.
 */
import browser from 'webextension-polyfill';

/** The three sites this milestone gates. `unknown` hosts are never gated. */
export type SubmitFlowSite = 'bolt' | 'lovable' | 'replit';

export const SUBMIT_FLOW_SITES: readonly SubmitFlowSite[] = ['bolt', 'lovable', 'replit'] as const;

/** Hidden developer override — the browser's stand-in for the CLI's env var. */
export const SUBMIT_FLOW_OVERRIDE_KEY = 'nexpath_promptsubmit_advisory';

/** Per-site persisted flags (the names locked by the team lead 2026-07-29). */
export const SUBMIT_FLOW_SITE_KEYS: Record<SubmitFlowSite, string> = {
  bolt:    'bolt_promptsubmit_advisory',
  lovable: 'lovable_promptsubmit_advisory',
  replit:  'replit_promptsubmit_advisory',
};

/** HB-D2 ship polarity: absent ⇒ ON. */
export const SUBMIT_FLOW_DEFAULT_ENABLED = true;

export function isSubmitFlowSite(value: string): value is SubmitFlowSite {
  return (SUBMIT_FLOW_SITES as readonly string[]).includes(value);
}

/**
 * Why the flow is on or off. RC19's "never let off be silent" — every resolution
 * carries the reason, so a log line can always answer "why didn't it arm?".
 */
export type SubmitFlowSource =
  | 'override_on'
  | 'override_off'
  | 'site_on'
  | 'site_off'
  | 'default_on'
  | 'read_error_off'
  | 'unsupported_site_off';

export interface SubmitFlowResolution {
  enabled: boolean;
  source:  SubmitFlowSource;
}

export interface SubmitFlowResolverDeps {
  /** Raw multi-key read; tests inject. Rejection is handled, never propagated. */
  getRaw?: (keys: string[]) => Promise<Record<string, unknown>>;
}

function defaultGetRaw(keys: string[]): Promise<Record<string, unknown>> {
  return browser.storage.local.get(keys) as Promise<Record<string, unknown>>;
}

/** Exact-equality, and only for real strings — a stray `true` boolean is not `'true'`. */
function exact(value: unknown, want: string): boolean {
  return typeof value === 'string' && value === want;
}

/**
 * Resolve whether the submit-time flow is armed for `site`. Never throws.
 *
 * `site` is the agent string from `resolveAgentFromHostname`, so `'unknown'`
 * (and any future host) resolves OFF: we never gate a site whose submit
 * mechanism has not been built and proven.
 */
export async function resolveSubmitFlow(
  site: string,
  deps: SubmitFlowResolverDeps = {},
): Promise<SubmitFlowResolution> {
  if (!isSubmitFlowSite(site)) return { enabled: false, source: 'unsupported_site_off' };

  const siteKey = SUBMIT_FLOW_SITE_KEYS[site];
  let raw: Record<string, unknown>;
  try {
    raw = await (deps.getRaw ?? defaultGetRaw)([SUBMIT_FLOW_OVERRIDE_KEY, siteKey]);
  } catch {
    // Abnormal state — see the read-error note in the header.
    return { enabled: false, source: 'read_error_off' };
  }

  const override = raw[SUBMIT_FLOW_OVERRIDE_KEY];
  if (exact(override, '1')) return { enabled: true,  source: 'override_on' };
  if (exact(override, '0')) return { enabled: false, source: 'override_off' };

  const persisted = raw[siteKey];
  if (exact(persisted, 'true'))  return { enabled: true,  source: 'site_on' };
  if (exact(persisted, 'false')) return { enabled: false, source: 'site_off' };

  return { enabled: SUBMIT_FLOW_DEFAULT_ENABLED, source: 'default_on' };
}

/** Every key this module reads — the guard test and the bridge both use this. */
export function submitFlowStorageKeys(): string[] {
  return [SUBMIT_FLOW_OVERRIDE_KEY, ...SUBMIT_FLOW_SITES.map((s) => SUBMIT_FLOW_SITE_KEYS[s])];
}
