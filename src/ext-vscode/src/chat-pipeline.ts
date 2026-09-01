import type { ChatHistoryEvent } from './chat-history-types.js';
import type { StopSelection } from './ipc.js';
import { toSafeErrorRecord } from './diagnostics.js';

/**
 * Chat pipeline orchestrator (M13 of M2 Branch 5).
 *
 * Glues the chat-history watcher to the existing nexpath pipeline (`auto`
 * + `stop`). For each user prompt the watcher captures, this handler:
 *
 *   1. Calls `nexpath auto <prompt> <session-id>` via ipc — forwards the
 *      prompt to the existing capture/classify/advisory stages
 *      (Layer C, untouched).
 *   2. Calls `onAfterCapture` — the caller checks the store and arms the
 *      in-editor advisory fallback if `auto` just parked one. This runs BEFORE
 *      the (possibly blocking) terminal popup so the user always has a path to
 *      the advisory even when the popup can't open — e.g. on macOS the popup is
 *      `osascript` → Terminal.app, which BLOCKS on the Automation-permission
 *      dialog and may never return.
 *   3. Calls `nexpath stop <session-id>` via ipc — Layer C opens its terminal
 *      popup and blocks until the user acts.
 *   4. If the user SELECTED an option in the popup, `stop` returns a
 *      `StopSelection`; the handler injects that prompt into the host's chat
 *      input (`injectSelection`) and the wiring clears the now-redundant
 *      fallback. No selection (dismissed / no-advisory / popup couldn't open) →
 *      the armed fallback stays as the escape hatch.
 *
 * **PE branch (PE-origin routing, additive — DS behaviour above is unchanged
 * when the three optional PE deps are omitted):**
 *   0. Before any of the above: `isPeEcho` (if provided) checks whether this
 *      event is a self-echo of a PE body the extension itself just injected
 *      (F6). If so, the handler returns immediately — no `auto`/`stop` at all.
 *   3a. Right after `auto` succeeds, `checkPeOrigin` (if provided) decides
 *       from typed store evidence — never from Stop's returned text — whether
 *       THIS turn parked a Prompt Enhancement rather than a DS advisory.
 *   4a. A PE-origin result routes to `injectPeResult` instead of step 4's
 *       `injectSelection`. Omitting `injectPeResult` falls back to step 4
 *       unchanged, so a partial wiring degrades safely rather than dropping
 *       the result.
 *
 * **Timing simplification for B5 smoke test:** `auto` and `stop` are
 * called back-to-back. In production we'd want `stop` to fire after the
 * agent's response completes (so the advisory has the latest context),
 * but our chat-history watcher only emits user-prompt events — we don't
 * yet detect "agent response done". This is acceptable for B5 because:
 *   - The legacy Claude Code hook flow also fires `auto` then `stop`
 *     and works fine.
 *   - Layer C's classifier doesn't require the assistant response to
 *     be present — it advises based on the user prompt alone.
 *   - A future M5 hardening pass can add "response done" detection via
 *     state.vscdb assistant-message extractors.
 *
 * **Resilience:** the handler catches everything. A failed spawn /
 * malformed payload / view-provider error never propagates to the
 * watcher (the watcher uses `void this.handleMessage(raw)` patterns
 * where unhandled rejections would crash the extension host).
 */

export interface ChatPipelineDeps {
  /**
   * Inject `ipc.spawnAuto`. Tests pass a mock.
   *
   * The third argument carries the originating `ChatHistoryEvent` so the
   * caller can derive a per-event `cwd` from `event.sourcePath` — necessary
   * for multi-workspace correctness, since one extension instance may watch
   * `state.vscdb` files belonging to other workspaces and must attribute
   * each prompt to its true project root, not to its own `workspaceCwd`.
   */
  spawnAuto: (
    prompt: string,
    sessionId: string,
    event: ChatHistoryEvent,
  ) => Promise<void>;
  /** Inject `ipc.spawnStop`. Tests pass a mock. */
  spawnStop: (
    sessionId: string,
    event: ChatHistoryEvent,
  ) => Promise<StopSelection | null>;
  /**
   * Inject the selected prompt back into the host's chat input. Called only
   * when the user picked an option in Layer C's terminal popup.
   */
  injectSelection: (selectedPrompt: string, event: ChatHistoryEvent) => Promise<void> | void;
  /**
   * Optional: called right after `auto` succeeds, BEFORE the terminal popup.
   * The caller checks the store and arms the in-editor advisory fallback if an
   * advisory was just parked — so it's available even if the popup blocks (the
   * macOS Automation-dialog case) or can't open at all.
   */
  onAfterCapture?: (event: ChatHistoryEvent) => Promise<void> | void;
  /**
   * Optional session-id composer. Production passes a function that prefixes
   * the host workspace id; tests omit this and just use `event.rawSessionId`.
   */
  composeSessionId?: (event: ChatHistoryEvent) => string;
  /** Optional logger override (tests). */
  logger?: { error: (msg: string, err: unknown) => void };
  /**
   * Optional: called right after `spawnAuto` succeeds, to decide whether THIS
   * turn parked a pending Prompt Enhancement rather than a Decision Session
   * advisory (PE-origin routing — see `pe-origin.ts`; decided from typed store
   * evidence only, never from Stop's returned text). When it resolves `true`,
   * a later non-null `spawnStop` result is routed to `injectPeResult` instead
   * of `injectSelection`. Absent, or throwing, => every result is treated as
   * DS-origin — today's exact behaviour is the fail-safe default.
   */
  checkPeOrigin?: (event: ChatHistoryEvent) => Promise<boolean>;
  /**
   * Called instead of `injectSelection` when `checkPeOrigin` reported this
   * turn as PE-origin. If omitted, a PE-origin result still falls back to
   * `injectSelection` — a partial wiring degrades to the pre-PE behaviour
   * rather than silently dropping the result.
   */
  injectPeResult?: (resultText: string, event: ChatHistoryEvent) => Promise<void> | void;
  /**
   * Optional: called FIRST, before `spawnAuto`. Returns true when this
   * event's prompt text is a recognised self-echo of a PE body the extension
   * itself just injected (analysis F6) — the handler then returns
   * immediately without running `auto`/`stop` at all. Absent, or throwing,
   * => treated as "not an echo" (fail-safe; Decision Session behaviour is
   * never affected by an echo-check failure).
   */
  isPeEcho?: (event: ChatHistoryEvent) => Promise<boolean> | boolean;
  /**
   * OWNER RULING 2026-08-12 (Cursor half of G-ARBITRATION): with the submit-time
   * advisory switch ON, the OLD Decision-Session advisory surface must not fire —
   * the submit-time hook owns it now. On Cursor there is no post-response hook to
   * consume the row (unlike Windsurf's suppression leg), so the DB-watcher's
   * `stop` is the old advisory's ONLY driver, and this is the enforcement point.
   *
   * **Surgical, NOT a blanket kill:** it suppresses ONLY the DS-advisory path —
   * a turn that `checkPeOrigin` reports as a Prompt Enhancement STILL runs
   * `spawnStop` + `injectPeResult`, so **PE keeps working** ("all popups working
   * in the new flow"). Only a non-PE (DS-advisory) turn is skipped. Absent/false
   * ⇒ byte-identical old behaviour (both surfaces fire as today).
   */
  suppressDsAdvisory?: boolean;
  /**
   * RC6 (live root cause, 2026-08-13): with the submit switch ON, the hook
   * ALREADY runs `nexpath auto` for this very prompt inside its hold (option-A
   * ordering) — the watcher's own `spawnAuto` here is a SECOND, concurrent
   * classification of the same prompt. The store is sql.js (in-memory,
   * whole-file write-back, lock waited max 8 s then bypassed), so two autos +
   * PE's `stop` racing produced last-writer-wins clobbering: the decider's
   * lookup found "no pending_advisory row" while the row demonstrably existed
   * seconds before — measured live, timestamps matching LOCK_WAIT_MS exactly.
   *
   * With this flag ON the watcher SKIPS its duplicate `spawnAuto`. Everything
   * downstream is unchanged and reads the rows the HOOK's auto wrote (same
   * command, same store, same project): `checkPeOrigin` still classifies the
   * turn, PE turns still run `spawnStop` + `injectPeResult`. An injected
   * replacement then has NO auto at all (the hook echo-skips its own) — which
   * is precisely PEH-10's requirement; Layer C clears the stale guard on
   * the next genuine turn regardless.
   *
   * Interim implementation of the G-ARBITRATION injector-contention half,
   * pending team-lead ratification. Absent/false ⇒ byte-identical old flow.
   */
  suppressWatcherAuto?: boolean;
}

// Redacts before logging: this pipeline catches spawnAuto/spawnStop failures,
// whose errors can carry the delivered body or the user's prompt in a `cause`
// chain or an attached property. extension.ts injects its own logger, but the
// default must be safe on its own.
const defaultLogger = {
  error: (msg: string, err: unknown) => console.error(msg, toSafeErrorRecord(err)),
};

/**
 * Build the handler the watcher calls for every captured prompt.
 *
 * The returned function takes a `ChatHistoryEvent` and runs the auto →
 * stop → publish pipeline. It never throws.
 */
export function createChatEventHandler(
  deps: ChatPipelineDeps,
): (event: ChatHistoryEvent) => Promise<void> {
  const composeSessionId =
    deps.composeSessionId ?? ((e: ChatHistoryEvent) => e.rawSessionId);
  const logger = deps.logger ?? defaultLogger;

  return async (event: ChatHistoryEvent): Promise<void> => {
    // F6 self-echo guard: skip entirely if this prompt is our own PE body
    // reappearing. Must run before spawnAuto — a real user prompt has not
    // been submitted, so there is nothing for auto/stop to process.
    if (deps.isPeEcho) {
      try {
        if (await deps.isPeEcho(event)) return;
      } catch (err) {
        logger.error('[nexpath] isPeEcho check failed:', err);
        // fall through — fail-safe, treat as not-an-echo
      }
    }
    const sessionId = composeSessionId(event);
    // RC6: under the submit switch the hook already ran `auto` for this prompt
    // inside its hold — a second concurrent auto here corrupted the sql.js
    // store (last-writer-wins) and made the submit popup nondeterministic.
    // Skip the duplicate; downstream reads the hook-auto's rows unchanged.
    if (!deps.suppressWatcherAuto) {
      try {
        await deps.spawnAuto(event.prompt, sessionId, event);
      } catch (err) {
        logger.error('[nexpath] spawnAuto failed:', err);
        return;
      }
    }
    // Decide DS vs PE origin from typed store evidence while the row is still
    // genuinely pending — see pe-origin.ts for why this must happen here and
    // not after spawnStop returns.
    let isPe = false;
    if (deps.checkPeOrigin) {
      try {
        isPe = await deps.checkPeOrigin(event);
      } catch (err) {
        logger.error('[nexpath] checkPeOrigin failed:', err);
        // fail-safe — fall back to DS routing on failure
      }
    }
    // OWNER RULING 2026-08-12 (original): switch ON ⇒ old DS-advisory surface
    // OFF, PE preserved. SUPERSEDED by H9 (2026-08-13): ALL popups — PE
    // included — fire at submit time via the hook's own `stop`.
    //
    // RC18 (macOS Cursor tester, 2026-08-15, pixel-proven): the `&& !isPe`
    // carve-out left the watcher's PE stop leg alive under the switch. On
    // Linux the watcher event always arrived AFTER the hook's popup was
    // answered and the PE row consumed (isPe=false ⇒ skipped) — pure timing
    // luck. On the Mac the watcher fired WHILE the hook's popup was open:
    // checkPeOrigin saw the still-pending row ⇒ isPe=true ⇒ a SECOND
    // identical PE popup spawned. The user answered the watcher's copy, its
    // selection went down the OLD delivery path (`PE visible-surface ACK`),
    // the hook's popup was orphaned ⇒ no submit decision was ever persisted ⇒
    // the poller had nothing to inject/auto-submit. With the switch ON the
    // watcher is capture-only: NO stop, NO popup, NO old delivery, for any
    // turn kind. Switch OFF ⇒ byte-identical old behaviour (PE leg intact).
    if (deps.suppressDsAdvisory) return;
    // Arm the in-editor fallback BEFORE the popup. `stop` can block indefinitely
    // on macOS (osascript waiting on the Automation-permission dialog), so the
    // fallback must not depend on `stop` returning.
    if (deps.onAfterCapture) {
      try {
        await deps.onAfterCapture(event);
      } catch (err) {
        logger.error('[nexpath] onAfterCapture failed:', err);
      }
    }
    let selection: StopSelection | null;
    try {
      selection = await deps.spawnStop(sessionId, event);
    } catch (err) {
      // The popup couldn't deliver a selection — the fallback armed above stands.
      logger.error('[nexpath] spawnStop failed:', err);
      return;
    }
    if (selection === null) return; // dismissed / no advisory / no TTY — fallback stands
    const routeToPe = isPe && deps.injectPeResult !== undefined;
    try {
      if (routeToPe) {
        await deps.injectPeResult!(selection.selectedPrompt, event);
      } else {
        await deps.injectSelection(selection.selectedPrompt, event);
      }
    } catch (err) {
      logger.error(
        routeToPe ? '[nexpath] injectPeResult failed:' : '[nexpath] injectSelection failed:',
        err,
      );
    }
  };
}
