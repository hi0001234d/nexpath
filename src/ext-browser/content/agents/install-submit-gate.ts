/**
 * Installs the composer submit gate for one agent.
 *
 * Each agent module calls this once with its own inject function and send-button
 * selector; everything else — resolving the switch, the service-worker
 * round-trip, the heartbeat, the ring events — is identical across sites and
 * lives here.
 *
 * ── WHY THE SWITCH IS RESOLVED PER AGENT MODULE ─────────────────────────────
 * Content-script entry points are bundled SEPARATELY (esbuild inlines a module's
 * top-level code into every entry that imports it), so module-level state does
 * not cross bundles: a value the injector's bundle resolves is invisible here.
 * Resolving locally — once at load, then on every storage change — is
 * self-contained and cheap. `armed` starts false, so an unresolved switch never
 * intercepts, which is the safe direction.
 */
import browser from 'webextension-polyfill';
import { resolveSubmitFlow, submitFlowStorageKeys } from '../../adapters/submit-flow-config.js';
import { createComposerSubmitGate, type ComposerDecision } from '../composer-submit-gate.js';
import { setComposerSubmitInterceptor } from './capture-kit.js';
import { resolveProjectRootFromLocation } from './agent-hosts.js';
import { fetchGateOwnsSite } from '../../inject/submit-substitution.js';

/**
 * Heartbeat cadence while a submit is held.
 *
 * The worker computes the decision and drives the popup. If it is torn down
 * mid-hold the decision dies with it, the panel is orphaned on screen, and the
 * user's click lands on nothing. LIVE-CAUGHT ON FIREFOX 2026-08-26: a 33.6 s
 * hold ended with `build_identity` — a worker RESTART — then
 * `submit_hold_released_error` and `pe_command_no_popup`, and the user's
 * ORIGINAL prompt ran.
 *
 * Firefox's non-persistent background is far more aggressive than Chrome's MV3
 * worker, so 10 s sits well inside any teardown window. The panel's own 20 s
 * keepalive only starts once the panel MOUNTS; this covers the whole hold,
 * including the classification and enhancement work that precedes it.
 */
const HOLD_HEARTBEAT_MS = 10_000;

export interface InstallSubmitGateOptions {
  agent: string;
  /** The site's real send control, clicked to submit what is in the composer. */
  submitButtonSelector: string;
  /**
   * The agent's own inject-and-send helper (simulated paste + submit).
   *
   * Returns FALSE when it could not deliver and degraded to the clipboard.
   * `void` is accepted, and read as success, so an agent that does not report an
   * outcome behaves exactly as it always has — see `deliverReplacement`.
   */
  injectPromptText: (text: string) => Promise<boolean | void>;
}

export function installSubmitGate(opts: InstallSubmitGateOptions): void {
  let armed = false;

  const applySwitch = (): void => {
    void resolveSubmitFlow(opts.agent)
      .then((r) => { armed = r.enabled; })
      .catch(() => { armed = false; });
  };
  applySwitch();
  try {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const watched = new Set(submitFlowStorageKeys());
      if (Object.keys(changes).some((k) => watched.has(k))) applySwitch();
    });
  } catch {
    /* no storage events — the load-time resolution still applies */
  }

  const sendToSw = (msg: unknown): void => {
    try {
      void browser.runtime.sendMessage(msg).catch(() => { /* worker asleep */ });
    } catch { /* extension context invalidated mid-navigation */ }
  };

  const projectRootOf = (): string =>
    resolveProjectRootFromLocation(
      window.location.hostname, window.location.pathname, window.location.origin,
    ) ?? '';

  /**
   * Re-submit whatever is in the composer, by the two routes a user has.
   *
   * Clicking the send control alone was not enough: reported live as "choosing
   * Use original leaves the prompt sitting in the composer, nothing sent". A
   * site's send button can be missing, re-rendered, or refuse a programmatic
   * click after a long hold — and this is the ONE path where failing silently
   * costs the user their prompt, since we already cancelled their own submit.
   *
   * So: press the button, and if the text is still there a moment later, send
   * the Enter the user originally pressed. Both are re-entrancy guarded by the
   * caller, so neither can be re-intercepted.
   */
  const resubmitComposer = async (input: HTMLElement | null): Promise<boolean> => {
    const btn = document.querySelector<HTMLElement>(opts.submitButtonSelector);
    if (btn) btn.click();

    const target = input ?? document.querySelector<HTMLElement>(opts.submitButtonSelector);
    if (!target) return btn !== null;

    // Give the click a chance before trying the second route.
    await new Promise((r) => setTimeout(r, 400));
    const stillThere = (target.textContent ?? '').trim().length > 0;
    if (!stillThere) return true;

    target.focus();
    for (const type of ['keydown', 'keypress', 'keyup'] as const) {
      target.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      }));
    }
    return true;
  };

  /**
   * Close the popup from THIS side.
   *
   * Normally the worker's own popup loop closes it. The case that matters is the
   * worker dying mid-hold: then nothing else can, and the panel sits on screen
   * accepting clicks that reach nothing (`pe_command_no_popup`). The panel
   * listens on the same shared `window` the injector forwards worker messages
   * through, so this reaches it whether or not the worker is alive.
   */
  const closePanel = (): void => {
    try {
      window.dispatchEvent(new CustomEvent('nexpath:sw-message', {
        detail: { type: 'nexpath:pe-close', projectRoot: projectRootOf() },
      }));
    } catch { /* panel not mounted */ }
  };

  const askForDecision = async (ctx: { prompt: string; submitId: string }): Promise<ComposerDecision> => {
    const res = await browser.runtime.sendMessage({
      type: 'nexpath:submit-decision-request',
      site: opts.agent,
      projectRoot: projectRootOf(),
      requestId: `${ctx.submitId}#${performance.now().toFixed(0)}`,
      prompt: ctx.prompt,
      submitId: ctx.submitId,
    }) as { decision?: { kind?: string; replacement?: string } } | undefined;
    const d = res?.decision;
    if (d?.kind === 'block' && typeof d.replacement === 'string' && d.replacement.length > 0) {
      return { kind: 'block', replacement: d.replacement };
    }
    return { kind: 'allow' };
  };

  let gate: ReturnType<typeof createComposerSubmitGate> | null = null;

  setComposerSubmitInterceptor((ev, prompt, input, composer) => {
    gate ??= createComposerSubmitGate({
      agent: opts.agent,
      // Two conditions. The second is what keeps the two mechanisms from ever
      // both owning a submission: where the page's fetch patch does the
      // rewriting (Lovable), this gate stands down completely.
      isArmed: () => armed && !fetchGateOwnsSite(opts.agent),
      emit: (event, data) => {
        sendToSw({ type: 'nexpath:submit-flow-event', site: opts.agent, event, data: data ?? {} });
      },
      readComposerText: () => {
        try { return composer.readComposerText(input); } catch { return ''; }
      },
      decide: async (ctx) => {
        // Keep the worker alive for as long as we hold the user's prompt.
        const beat = setInterval(() => {
          sendToSw({ type: 'nexpath:pe-keepalive', projectRoot: projectRootOf() });
        }, HOLD_HEARTBEAT_MS);
        try {
          return await askForDecision(ctx);
        } finally {
          clearInterval(beat);
        }
      },
      // The agent's inject helper performs the simulated paste AND the send
      // (it verifies the text landed first), so one call delivers the prompt.
      deliverReplacement: async (text) => {
        // Mark it BEFORE it lands. The replacement is submitted through the
        // site's own composer, so the capture channels see it as a brand-new
        // prompt — without this it re-enters the pipeline, double-counts the
        // turn and can prepare a second enhancement. Same marker the shipped
        // response-stop inject path uses; the worker's cross-page dedup
        // collapses the echo.
        sendToSw({ type: 'nexpath:prompt-injected', projectRoot: projectRootOf(), text });
        // An inject that degraded to the clipboard KNOWS it did. This used to
        // return true regardless, so the gate then spent its whole
        // send-verification window hunting the composer for text it had already
        // been told was never put there — eight seconds of waiting for an answer
        // that was available immediately. Only an explicit `false` is treated as
        // failure, so an injector that reports nothing is read as success and
        // keeps today's behaviour exactly.
        return await opts.injectPromptText(text) !== false;
      },
      // The original is still sitting in the composer — we cancelled the user's
      // own submit, so re-issuing means pressing the site's send control. The
      // panel is closed FIRST: whatever it was offering is moot once we release,
      // and leaving it up invites a click that can no longer do anything.
      reissueOriginal: async () => {
        closePanel();
        return resubmitComposer(input);
      },
    });
    return gate.maybeIntercept(ev, prompt);
  });
}
