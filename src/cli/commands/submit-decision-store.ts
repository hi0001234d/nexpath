/**
 * CLI-side persistence for the submit-time decision (hook milestone H3, Gap 2b).
 *
 * The missing link: the hook blocks a prompt and must hand the replacement to the
 * extension, which runs in a different process. This writes the record the
 * extension's `readPendingSubmitDecision` consumes.
 *
 * ── WHY THE SHAPE IS DUPLICATED, NOT IMPORTED ────────────────────────────────
 * `src/ext-vscode` is a separate npm package; `src/cli` cannot import from it and
 * vice versa — the `G-ROOTDIR`/TS6059 wall the PE milestone hit six times. So the
 * record shape and the path convention are restated here and **pinned against the
 * extension's copy by test** (`submit-decision-store.test.ts` asserts both the
 * literal path segments and every field name). Divergence fails the suite rather
 * than silently breaking the handoff at runtime.
 *
 * ── OWNERSHIP ────────────────────────────────────────────────────────────────
 * Everything here belongs to this track (`src/cli/commands/**`). The engine's
 * `engine-option-generator.ts` and the store layer's `TtySelectFn.ts` are **consumed via
 * injected ports at the call site and never imported here** — this file has no
 * `decision-session` dependency at all.
 *
 * ── WRITE ATOMICITY ──────────────────────────────────────────────────────────
 * Written to a temp file then renamed. The extension polls on an interval and
 * could otherwise observe a half-written file; `rename` is atomic on the same
 * filesystem, so a reader sees either the old state or a complete record — never
 * a partial one. The extension's parser rejects malformed JSON anyway, but that
 * would silently drop a real decision, so preventing the torn read matters.
 */
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

/** Must match `submit-decision-record.ts`'s constant in the extension package. */
export const SUBMIT_DECISION_SCHEMA_V1 = 1 as const;

/** Must match `submitDecisionPath()` in the extension package — pinned by test. */
export function submitDecisionPath(projectRoot: string): string {
  return join(projectRoot, '.nexpath', 'submit-decision.json');
}

/**
 * User-level MIRROR of the same record — the cwd-independent handoff (RC22).
 *
 * ── WHY (the cross-OS fragility this removes) ────────────────────────────────
 * The primary handoff above is workspace-relative, so it only reaches the
 * extension when the HOOK'S `process.cwd()` equals the folder the editor has
 * open. Cascade's hook payload carries no workspace (`agent_action_name`,
 * `trajectory_id`, `execution_id`, `model_name`, `tool_info` — nothing else),
 * so cwd is our only source, and on Windows/Devin the hook that actually fires
 * is the WORKSPACE-level one whose cwd we do not control. If they disagree the
 * user's prompt is blocked and the replacement is written where nobody looks —
 * a silent, total failure of the new flow.
 *
 * The OLD flow never had this problem because its handoff was the per-user
 * store, not a file inside the project. This mirror restores that property:
 * one fixed location under `~/.nexpath`, with `projectRoot` embedded so the
 * reader can still refuse a record that belongs to a different project.
 *
 * The project-local file stays PRIMARY and unchanged — where it already works
 * (Linux + macOS, both live-verified) the mirror is never consulted.
 */
export function submitDecisionMirrorPath(home: string = homedir()): string {
  return join(home, '.nexpath', 'submit-decision.json');
}

export interface WriteSubmitDecisionInput {
  projectRoot: string;
  decisionId: string;
  replacementText: string;
  createdAt: number;
  host: 'windsurf' | 'cursor';
  /**
   * When the hook DECIDED to block, captured before persisting.
   *
   * The dev plan mandates five timestamps
   * (`block issued → decision persisted → extension observed → inject dispatched
   * → submit dispatched`). Without this the measured handoff excludes the hook's
   * own decision time — which, under option-A ordering, contains `auto`'s LLM
   * classification and is the largest term in the budget.
   */
  blockIssuedAt: number;
  /**
   * PID of the hook process that issued the block.
   *
   * ── WHY (the block/injection race) ──────────────────────────────────────
   * This record is persisted BEFORE `exit(2)`. Windsurf only cancels the prompt
   * when the hook process actually exits, so between persistence and exit there
   * is a window in which the original prompt is still live. If the extension
   * injected during that window the user would get TWO prompts: the original
   * (never cancelled) and the replacement.
   *
   * Process liveness is the reliable cross-process signal — "hook alive" ⇒ "exit
   * code not yet delivered" ⇒ "not safe to inject". The reader defers while this
   * pid is alive rather than assuming the poll interval outruns the gap.
   */
  hookPid: number;
  /**
   * RC30 (Windows/Devin tester, 2026-08-21): pid of the SHELL that spawned this
   * hook. Set **only on win32**, where Cascade executes the `powershell` field
   * and the tree is `powershell.exe -> node.exe`: `hookPid` is node, but the
   * host cancels the original prompt only when the WRAPPER exits. The reader
   * defers on both, so the replacement can no longer be injected into a turn
   * that is still live. Omitted on POSIX (no wrapper), which keeps the record —
   * and therefore every Linux/macOS decision — byte-identical to pre-RC30.
   */
  hookShellPid?: number;
}

export interface SubmitDecisionStoreDeps {
  mkdirFn?: (dir: string) => Promise<void>;
  writeFn?: (path: string, data: string) => Promise<void>;
  renameFn?: (from: string, to: string) => Promise<void>;
  /** RC22: where the user-level mirror goes; injected for hermetic tests. */
  mirrorPath?: () => string;
}

/**
 * Persist a decision for the extension to pick up.
 *
 * **Throws on failure, deliberately.** The decider treats a persist failure as
 * "allow" — it must not block a prompt whose replacement was never written, or
 * the user's prompt is cancelled with nothing to inject. Swallowing the error
 * here would hide that from the decider and produce exactly that outcome.
 */
export async function writeSubmitDecision(
  input: WriteSubmitDecisionInput,
  deps: SubmitDecisionStoreDeps = {},
): Promise<void> {
  if (!input.replacementText || input.replacementText.length === 0) {
    // Mirrors the extension-side validator: an empty replacement would clear the
    // composer and silently lose the turn, so it is never written.
    throw new Error('submit decision: refusing to persist an empty replacement');
  }

  // JSON.stringify DROPS undefined, so an unset timestamp would produce a record
  // silently missing the field — which the extension validator rejects, losing a
  // real decision. Fail here instead: the decider treats a throw as 'allow'.
  if (typeof input.blockIssuedAt !== 'number' || !Number.isFinite(input.blockIssuedAt)) {
    throw new Error('submit decision: blockIssuedAt must be a finite number');
  }
  if (typeof input.hookPid !== 'number' || !Number.isInteger(input.hookPid) || input.hookPid <= 0) {
    // Same JSON.stringify-drops-undefined trap as blockIssuedAt: a missing pid
    // would make the reader unable to tell whether the hook had exited.
    throw new Error('submit decision: hookPid must be a positive integer');
  }

  const finalPath = submitDecisionPath(input.projectRoot);
  const tmpPath = `${finalPath}.tmp`;
  const mkdirFn = deps.mkdirFn ?? (async (d: string) => { await mkdir(d, { recursive: true }); });
  const writeFn = deps.writeFn ?? ((p: string, d: string) => writeFile(p, d, 'utf8'));
  const renameFn = deps.renameFn ?? ((a: string, b: string) => rename(a, b));

  const record = {
    schemaVersion: SUBMIT_DECISION_SCHEMA_V1,
    decisionId: input.decisionId,
    replacementText: input.replacementText,
    createdAt: input.createdAt,
    host: input.host,
    blockIssuedAt: input.blockIssuedAt,
    hookPid: input.hookPid,
    // RC30: win32 only. `JSON.stringify` drops `undefined`, so on POSIX this key
    // is simply absent and the persisted bytes are identical to pre-RC30.
    hookShellPid: input.hookShellPid,
    // RC22: carried so the user-level mirror can be matched to the right editor
    // window. Harmless in the primary file (the reader ignores unknown fields).
    projectRoot: input.projectRoot,
  };

  await mkdirFn(dirname(finalPath));
  await writeFn(tmpPath, JSON.stringify(record));
  await renameFn(tmpPath, finalPath);

  // RC22 mirror — BEST EFFORT, and deliberately after the primary write: the
  // primary is the contract, and a mirror failure must never turn a successful
  // block into a thrown "allow" (which would send the unrefined prompt).
  try {
    const mirrorPath = (deps.mirrorPath ?? submitDecisionMirrorPath)();
    const mirrorTmp = `${mirrorPath}.tmp`;
    await mkdirFn(dirname(mirrorPath));
    await writeFn(mirrorTmp, JSON.stringify(record));
    await renameFn(mirrorTmp, mirrorPath);
  } catch { /* primary already landed — never fail the block over the mirror */ }
}

// ── RC38 (Windows/Devin tester, 2026-08-21): the replacement-echo REGISTRY ───
//
// THE FAILURE: Devin QUEUES a replacement injected while Cascade is busy, and
// re-fires `pre_user_prompt` when it dequeues. The echo skip reads Layer C's
// `lastInjectedPrompt` — a SINGLE slot — which a newer block overwrites while
// the older replacement still sits in the queue. Echo miss ⇒ a popup opens on
// OUR OWN replacement (the tester's screenshots show the literal proof: nested
// "My original request (verbatim): My original request (verbatim):") ⇒ its
// selection re-blocks the dequeued item ⇒ another queued replacement ⇒ spiral.
// Linux never exercises this path: Cascade is idle at inject time, so the
// immediate resubmit consumes the slot before anything can overwrite it.
//
// The registry keeps the LAST FEW replacements per project in a small file the
// hook can consult IN ADDITION to the slot — multi-entry kills the overwrite
// hole, the time window covers long queue delays. Additive and safe by
// direction: an extra echo hit only ever SKIPS a popup on text WE injected
// (never blocks user content — the same ≥40-char floor as the slot check
// applies at the reader). Best-effort: a registry failure changes nothing.
export const REPLACEMENT_ECHO_REGISTRY_FILENAME = 'submit-replacement-echoes.json';
export const REPLACEMENT_ECHO_MAX_ENTRIES = 8;
export const REPLACEMENT_ECHO_MAX_AGE_MS = 10 * 60_000;

export function replacementEchoRegistryPath(projectRoot: string): string {
  return join(projectRoot, '.nexpath', REPLACEMENT_ECHO_REGISTRY_FILENAME);
}

/** Append one replacement to the project's echo registry (called by the decider
 *  right after the decision persists). Sync + swallowed: the block already
 *  succeeded and must never be failed by bookkeeping. */
export function appendReplacementEcho(
  projectRoot: string,
  text: string,
  deps: { now?: () => number; readFileFn?: (p: string) => string; writeFileFn?: (p: string, d: string) => void } = {},
): void {
  try {
    if (!text || text.trim().length === 0) return;
    const now = deps.now ?? (() => Date.now());
    const path = replacementEchoRegistryPath(projectRoot);
    let entries: Array<{ text: string; at: number }> = [];
    try {
      const raw = (deps.readFileFn ?? ((p: string) => readFileSync(p, 'utf8')))(path);
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        entries = parsed.filter(
          (e): e is { text: string; at: number } =>
            !!e && typeof (e as { text?: unknown }).text === 'string' && typeof (e as { at?: unknown }).at === 'number',
        );
      }
    } catch { /* absent or corrupt ⇒ start fresh */ }
    const t = now();
    entries = entries.filter((e) => t - e.at <= REPLACEMENT_ECHO_MAX_AGE_MS);
    entries.push({ text, at: t });
    if (entries.length > REPLACEMENT_ECHO_MAX_ENTRIES) entries = entries.slice(-REPLACEMENT_ECHO_MAX_ENTRIES);
    const write = deps.writeFileFn ?? ((p: string, d: string) => {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, d, 'utf8');
    });
    write(path, JSON.stringify(entries));
  } catch { /* best-effort — never break the block */ }
}

/** Read the live (windowed) registry entries for a project. Fail-open ⇒ []. */
export function readReplacementEchoes(
  projectRoot: string,
  deps: { now?: () => number; readFileFn?: (p: string) => string } = {},
): string[] {
  try {
    const now = deps.now ?? (() => Date.now());
    const raw = (deps.readFileFn ?? ((p: string) => readFileSync(p, 'utf8')))(replacementEchoRegistryPath(projectRoot));
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const t = now();
    return parsed
      .filter(
        (e): e is { text: string; at: number } =>
          !!e && typeof (e as { text?: unknown }).text === 'string' && typeof (e as { at?: unknown }).at === 'number',
      )
      .filter((e) => t - e.at <= REPLACEMENT_ECHO_MAX_AGE_MS)
      .map((e) => e.text);
  } catch {
    return [];
  }
}

/**
 * RC43 — the newest block's timestamp for a project, from the echo registry
 * (both the submit decider and the continuation runner append here at persist
 * time, so this IS "when did we last block", surviving the decision file's
 * consume-unlink). Null when the registry is absent/expired — fail-open.
 */
export function latestReplacementEchoAt(
  projectRoot: string,
  deps: { now?: () => number; readFileFn?: (p: string) => string } = {},
): number | null {
  try {
    const now = deps.now ?? (() => Date.now());
    const raw = (deps.readFileFn ?? ((p: string) => readFileSync(p, 'utf8')))(replacementEchoRegistryPath(projectRoot));
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const t = now();
    const ats = parsed
      .filter(
        (e): e is { text: string; at: number } =>
          !!e && typeof (e as { at?: unknown }).at === 'number' && typeof (e as { text?: unknown }).text === 'string',
      )
      .map((e) => e.at)
      .filter((at) => t - at <= REPLACEMENT_ECHO_MAX_AGE_MS);
    return ats.length > 0 ? Math.max(...ats) : null;
  } catch {
    return null;
  }
}
