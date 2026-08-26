import type { PromptCapturedMsg, ResponseStoppedMsg } from '../ipc.js';

/**
 * Capture kit — the agent-agnostic DOM-capture machinery shared by every
 * browser-agent content script (Replit today; Bolt/Lovable next).
 *
 * Everything in this file was extracted verbatim from the B3 Replit capture code
 * after 8+ real bugs (found only via live testing) shaped it — the mechanisms here
 * are hypothesis-independent safety nets, not premature abstraction. Each agent
 * supplies only what genuinely differs per site: selectors, text-extraction rules,
 * and the completion-label pattern. Everything that was hard to get right — the
 * multi-channel dedup funnel, park-and-sweep reconciliation, polling safety nets,
 * priming against history replay, the MV3 stale-re-injection guard — lives here
 * exactly once.
 *
 * ZERO top-level side effects, by contract: content-script entry points auto-run
 * their bootstrap at import time, and esbuild inlines a module's full top-level
 * code (side effects included) into every entry that imports from it — importing a
 * side-effecting module from two entries silently duplicates its behavior into
 * both bundles (confirmed the hard way in B3; see replit-inject.ts's header).
 * A factory with per-instance state is immune: nothing runs until the agent file
 * calls it.
 */

export interface ComposerCaptureConfig {
  /** The chat composer/input element (e.g. CodeMirror's `.cm-content`). */
  composerSelector: string;
  /** The idle-state submit/send button. */
  submitButtonSelector: string;
  /**
   * Read the user's text out of the composer element. Site-specific: e.g.
   * CodeMirror renders one `.cm-line` per line and its placeholder as real text —
   * only the agent file knows those rules.
   */
  readComposerText(input: HTMLElement): string;
}

export interface CompletionLabelConfig {
  /** Text pattern the site reliably shows the moment a turn completes. */
  pattern: RegExp;
  /**
   * Upper bound on a matching element's text length — bounds false positives from
   * a large container that happens to contain the phrase somewhere deep inside
   * unrelated content; a short, leaf-like label is very unlikely to occur elsewhere.
   */
  maxTextLength: number;
  /** Page-console line logged when this detector fires (visible by default). */
  log: string;
}

export interface CaptureKitConfig {
  /** Agent id carried in every IPC message (must match the SW's expectations). */
  agent: string;
  /** Logged at bootstrap per devplan §8.1, e.g. 'mutation-observer'. */
  captureTier: string;
  /**
   * Name of the `window` property guarding against MV3 stale re-injection — must
   * be unique per agent. MV3 does not remove an old content script's running
   * instance from an already-open tab when the extension is reloaded; without this
   * guard, 2+ independent copies of the script end up alive in the same page, each
   * with its own observers, each independently capturing every event (confirmed
   * live 2026-07-02). `window` survives re-injection; module scope does not.
   */
  bootstrapFlag: string;
  /** A rendered user-message bubble in the chat feed. */
  userMessageSelector: string;
  /**
   * Extract the prompt text from a user-message element. Must return '' for a
   * fill-in-progress shell so the kit parks it for re-check rather than emitting
   * stray UI text (timestamps, action labels) as the prompt.
   */
  extractPromptText(el: Element): string;
  /**
   * Present in the DOM only while the agent is generating; its disappearance
   * after having been present is the response-stop signal.
   */
  stopButtonSelector: string;
  /** Source-side capture channel (read the composer at submit). Optional per agent. */
  composer?: ComposerCaptureConfig;
  /** Independent completion-label response-stop detector. Optional per agent. */
  completionLabel?: CompletionLabelConfig;
  /**
   * Listen for `nexpath:fetch-prompt` messages posted by inject/main-world.ts's
   * fetch-interception rules (B4: Bolt's POST /api/chat/v2 — see
   * internal recon). Enable only for agents whose recon
   * confirmed a page-context fetch transport. The fetch rule posts a DISTINCT
   * message type precisely so the text enters through THIS kit's emitIfNewText
   * funnel — never forwarded to the SW directly — keeping the no-double-emit
   * guarantee across fetch/composer/observer channels.
   */
  listenForFetchPrompts?: boolean;

  /**
   * Whether bootstrap() wires the rendered-message MutationObserver channel
   * (observeUserMessages + its reconciliation sweep). Default true.
   *
   * Set FALSE for agents whose chat re-renders/re-creates message DOM nodes
   * during a single turn: the observer keys "already seen" on element identity,
   * so re-created history nodes read as brand-new and get re-captured every
   * 1500ms sweep — and because those false captures alternate different old
   * texts, they also defeat the funnel's consecutive-duplicate guard, breaking
   * the legitimate composer/fetch collapse too. Confirmed live on Lovable
   * 2026-07-06 (promptCount exploded to 13+ from one prompt). Lovable's genuine
   * prompt is captured exactly once by the composer + fetch channels, which the
   * funnel collapses correctly, so the observer is redundant there — not merely
   * disabled to hide a symptom. `observeUserMessages` stays exported for direct
   * unit testing; only the bootstrap wiring is gated.
   */
  observeRenderedMessages?: boolean;
}

export interface CaptureKit {
  observeUserMessages(root: Element): MutationObserver;
  observeComposerSubmit(root: Document | Element): { disconnect(): void };
  observeStopButton(root: Node): MutationObserver;
  observeCompletionLabel(root: Element): MutationObserver;
  observeFetchPrompts(win: Window): { disconnect(): void };
  observeCaptureRejections(win: Window): { disconnect(): void };
  /**
   * Wire every capture channel for this agent. Idempotent per page (see
   * bootstrapFlag). Returns a teardown that disconnects everything this call
   * wired — the observers AND observeStopButton's poll interval — and clears the
   * idempotency guard so a later bootstrap() can re-wire. Production entry points
   * ignore the return (the content script lives for the page's lifetime); it
   * exists so callers that DO have a lifecycle (tests, any future re-init) can
   * release the long-lived MutationObservers + setInterval deterministically
   * instead of leaking them.
   */
  bootstrap(): () => void;
  resetResponseStopDedupForTests(): void;
  resetPromptCaptureStateForTests(): void;
}

// Shared across every response-stop detection mechanism (stop-button presence and
// the completion-label text marker) — several independent detectors run in parallel
// by design (relying on a single mechanism repeatedly proved insufficient during B3),
// so a brief cooldown prevents a duplicate response_stop_received signal when more
// than one of them notices the same completion within a moment of each other. This
// is expected, harmless overlap, not a bug to eliminate — better to risk an
// occasional harmless duplicate than to miss the signal entirely again.
const RESPONSE_STOP_DEDUP_WINDOW_MS = 3000;

const PENDING_EMPTY_MAX_AGE_MS = 60_000;
const SWEEP_INTERVAL_MS = 1500;
const POLL_INTERVAL_MS = 1500;

/**
 * Injected by the composer submit gate at wire-up time (see
 * agents/install-submit-gate.ts). Default is a permanent "not mine", so this
 * module behaves exactly as it always has unless an agent installs a real gate.
 */
let maybeInterceptComposerSubmit: (
  ev: Event, prompt: string, input: HTMLElement, composer: ComposerCaptureConfig,
) => boolean = () => false;

export function setComposerSubmitInterceptor(
  fn: (ev: Event, prompt: string, input: HTMLElement, composer: ComposerCaptureConfig) => boolean,
): void {
  maybeInterceptComposerSubmit = fn;
}

export function createCaptureKit(config: CaptureKitConfig): CaptureKit {
  // ── Per-instance state (was module-level in the original Replit file — a factory
  // instance per agent means two agents can never share dedup state) ──────────────

  const seenMessages = new WeakSet<Element>();

  // Sites re-create the user-message element (new DOM node, same text) more than
  // once per turn — confirmed live on Replit 2026-07-02 across two separate
  // occasions: once during the page's own loading→hydrated-list swap, and again on
  // an unrelated re-render when the status label first appears after submit. A fixed
  // time window can't reliably bound this (the gap depends on the site's own
  // variable latency), and the WeakSet dedups by element identity so it can't help
  // when each re-render is a genuinely different element. Instead: collapse only
  // *consecutive* identical captures, with no time bound — any number of redundant
  // re-renders of the same still-most-recent message collapse to one emission, but
  // the guard resets the instant a genuinely different message is captured, so an
  // intentional identical resend after another prompt still counts. Accepted
  // tradeoff: sending the exact same text twice in a row with nothing in between is
  // indistinguishable from a re-render artifact — unavoidable from DOM observation
  // alone, and a narrower miss than a time window.
  let lastEmittedText: string | null = null;

  // Messages whose element existed but whose text was still EMPTY when first
  // examined. Root cause of "first prompt captured, every later prompt silently
  // lost" (Replit, live 2026-07-02/03): React can insert the message shell first
  // and fill the text child a tick later, and marking the element seen *before*
  // checking its text permanently consumed it with no capture and no log. Empty
  // elements are parked here instead and re-checked by the reconciliation sweep
  // until their text arrives, they leave the DOM, or they age out.
  const pendingEmptyMessages = new Map<Element, number>();

  let lastResponseStoppedEmittedAt = 0;

  // Is a turn genuinely in flight (or just was, un-emitted)? The completion-label
  // detector below matches TEXT that also exists throughout the historical
  // transcript ("Version 3 at …", "Worked for 12 seconds"), and content scripts
  // attach at document_idle — so hydration, scroll-back and virtualised
  // re-inserts of OLD rows all looked like "the agent just finished" and fired a
  // response-stop with no turn behind it (live: a PE popup opened on a freshly
  // loaded project page with no prompt sent, 2026-08-25/26). The stop-BUTTON
  // detector never had this problem because it primes `wasGenerating` from the
  // DOM and only fires on a real generating→idle transition; the label detector
  // had no state whatsoever. This flag gives it the same discipline: it is armed
  // by evidence that a turn exists (our own captured prompt, or the stop button
  // observed present) and disarmed the moment a stop is emitted.
  let turnActive = false;

  // ── IPC emission ────────────────────────────────────────────────────────────────

  function emitPromptCaptured(promptText: string): void {
    const msg: PromptCapturedMsg = {
      type: 'nexpath:prompt-captured',
      promptText,
      agent: config.agent,
    };
    window.postMessage(msg, window.location.origin);
  }

  function emitResponseStopped(): void {
    const msg: ResponseStoppedMsg = { type: 'nexpath:response-stopped', agent: config.agent };
    window.postMessage(msg, window.location.origin);
  }

  function emitResponseStoppedOnce(): void {
    const now = Date.now();
    if (now - lastResponseStoppedEmittedAt < RESPONSE_STOP_DEDUP_WINDOW_MS) return;
    lastResponseStoppedEmittedAt = now;
    // The turn is over: a later label must not re-fire until a NEW turn arms it.
    turnActive = false;
    emitResponseStopped();
  }

  // Single funnel for every prompt-capture channel (composer submit, mutation
  // observer, reconciliation sweep) — the consecutive-identical collapse lives here
  // once, so any two channels noticing the same prompt (e.g. composer capture at
  // submit time followed by the rendered message echo in the chat feed) can never
  // double-emit.
  function emitIfNewText(text: string, viaLog?: string): void {
    if (!text || text === lastEmittedText) return;
    lastEmittedText = text;
    if (viaLog) console.log(viaLog);
    // A prompt we just captured IS a turn — arm the completion-label detector
    // even on sites/response types where the stop button is never observed.
    turnActive = true;
    emitPromptCaptured(text);
  }

  function tryCapture(el: Element, via: 'observer' | 'sweep'): void {
    const text = config.extractPromptText(el);
    if (!text) {
      if (!pendingEmptyMessages.has(el)) {
        pendingEmptyMessages.set(el, Date.now());
        // Visible by default (same rationale as the response-stop detection logs):
        // this exact state was previously indistinguishable from "nothing happened
        // at all".
        console.log('[nexpath] user-message appeared with empty text — parked for re-check');
      }
      return;
    }
    pendingEmptyMessages.delete(el);
    emitIfNewText(
      text,
      via === 'sweep'
        ? '[nexpath] prompt captured via reconciliation sweep (mutation path missed it)'
        : undefined,
    );
  }

  // ── Prompt-submit: new user-message nodes in the chat feed ──────────────────────

  function observeUserMessages(root: Element): MutationObserver {
    // Prime: register any messages already in the DOM at setup time as "seen"
    // WITHOUT emitting captures for them. Mirrors src/ext-vscode/
    // chat-history-watcher.ts's "primedTargets" pattern, which fixed the identical
    // bug class for Cursor/Windsurf — without priming, every page load/reload
    // replays the entire prompt history through the pipeline, inflating promptCount
    // and producing advisory storms that bypass the warmup/cooldown gates. Only
    // genuinely new prompts may reach the pipeline — this is also the implicit
    // guarantee Claude Code's push-based hook gives for free, since it can never
    // fire for an old prompt in the first place.
    for (const el of root.querySelectorAll(config.userMessageSelector)) {
      seenMessages.add(el);
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          const matches = node.matches(config.userMessageSelector)
            ? [node]
            : Array.from(node.querySelectorAll(config.userMessageSelector));
          for (const el of matches) {
            if (seenMessages.has(el)) continue;
            seenMessages.add(el);
            tryCapture(el, 'observer');
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });

    // Reconciliation sweep — the same hypothesis-independent safety-net philosophy
    // that ended the response-stop saga (see observeStopButton's poll), applied to
    // prompt capture: on a fixed interval, re-check ground truth directly instead
    // of trusting any single assumption about how/when the site mutates the DOM.
    // Covers both known loss modes at once: (1) shell-inserted-then-text-filled
    // messages parked above, and (2) any user-message the addedNodes walk never saw
    // at all. Whichever path (observer or sweep) reaches a message first wins;
    // lastEmittedText collapses the overlap.
    const sweep = (): void => {
      const now = Date.now();
      for (const [el, firstSeenAt] of pendingEmptyMessages) {
        if (!el.isConnected || now - firstSeenAt > PENDING_EMPTY_MAX_AGE_MS) {
          pendingEmptyMessages.delete(el);
          continue;
        }
        tryCapture(el, 'sweep');
      }
      for (const el of root.querySelectorAll(config.userMessageSelector)) {
        if (seenMessages.has(el)) continue;
        seenMessages.add(el);
        tryCapture(el, 'sweep');
      }
    };
    const sweepIntervalId = setInterval(sweep, SWEEP_INTERVAL_MS);
    const originalDisconnect = observer.disconnect.bind(observer);
    observer.disconnect = (): void => {
      clearInterval(sweepIntervalId);
      originalDisconnect();
    };

    return observer;
  }

  // ── Prompt-submit, independent source-side channel: read the composer at submit ──
  //
  // The mutation-observer channel above depends on render-path assumptions (message
  // selector + text-extraction structure) that recon can only ever confirm for the
  // render paths actually observed — on Replit, selectors confirmed against
  // server-hydrated history demonstrably did NOT hold for live-typed messages
  // (2026-07-03: the reconciliation sweep re-scanned the whole document every 1.5s
  // for minutes without matching a live-typed bubble, ruling out timing entirely).
  // This channel removes the render-path dependency: read the user's text directly
  // from the composer at the moment of submit (capture-phase Enter keydown /
  // send-button click, which beat the page's own handlers, so the text is still
  // present when read). The rendered-message echo that may follow collapses via
  // emitIfNewText's consecutive-identical guard.

  // Sites may use the same editor component for chat AND file editing (Replit's
  // file editors are CodeMirror too) — the composer selector alone could match a
  // code editor and capture file contents as a "prompt" on every Enter keystroke.
  // The chat composer is disambiguated by anchoring on the agent submit/stop
  // button: walk up from the button until an ancestor's subtree contains the
  // editor — that shared container is the prompt box, and its editor is the chat
  // composer. File editors live in different panes and never share a container
  // with these buttons below the page root.
  function findChatComposer(composer: ComposerCaptureConfig): HTMLElement | null {
    const anchor =
      document.querySelector(composer.submitButtonSelector) ??
      document.querySelector(config.stopButtonSelector);
    let node: Element | null = anchor;
    while (node) {
      const cm = node.querySelector<HTMLElement>(composer.composerSelector);
      if (cm) return cm;
      node = node.parentElement;
    }
    return null;
  }

  function captureFromComposer(composer: ComposerCaptureConfig, input: HTMLElement): void {
    const text = composer.readComposerText(input);
    if (!text) return;
    emitIfNewText(text, '[nexpath] prompt captured at submit (composer read)');
  }

  function observeComposerSubmit(root: Document | Element): { disconnect(): void } {
    const composer = config.composer;
    if (!composer) {
      throw new Error(`[nexpath] observeComposerSubmit requires composer config (agent: ${config.agent})`);
    }
    /**
     * The submit-time gate's one hook into this file. Returns true only when the
     * gate has TAKEN OVER the submission — it refuses unless the switch is armed,
     * so with the switch off this is a no-op.
     *
     * CAPTURE MUST RUN FIRST, ALWAYS. The gate cancels the submission, so when it
     * takes over the site never issues its request — which means the composer read
     * is the ONLY channel that will ever see this prompt. Skipping capture here
     * starves the pipeline: no prompt reaches the worker, no enhancement is
     * prepared, the decision falls through to "allow", and the popup can never
     * appear. (Found by cross-confirming the phase against its own acceptance
     * criteria, before it reached a live run.)
     */
    const takenOver = (ev: Event, input: HTMLElement): boolean => {
      try {
        return maybeInterceptComposerSubmit(ev, composer.readComposerText(input) ?? '', input, composer);
      } catch {
        return false; // never let the gate break capture
      }
    };

    const onKeyDown = (ev: Event): void => {
      const ke = ev as KeyboardEvent;
      // Shift+Enter is "newline", every other Enter variant (plain/Ctrl/Cmd) submits.
      if (ke.key !== 'Enter' || ke.shiftKey) return;
      const target = ev.target instanceof Element ? ev.target : null;
      const cm = target?.closest<HTMLElement>(composer.composerSelector);
      if (!cm || cm !== findChatComposer(composer)) return; // Enter in a file editor is just a newline
      captureFromComposer(composer, cm);
      takenOver(ev, cm);
    };
    const onClick = (ev: Event): void => {
      const target = ev.target instanceof Element ? ev.target : null;
      if (!target?.closest(composer.submitButtonSelector)) return;
      const cm = findChatComposer(composer);
      if (!cm) return;
      captureFromComposer(composer, cm);
      takenOver(ev, cm);
    };
    root.addEventListener('keydown', onKeyDown, true);
    root.addEventListener('click', onClick, true);
    return {
      disconnect(): void {
        root.removeEventListener('keydown', onKeyDown, true);
        root.removeEventListener('click', onClick, true);
      },
    };
  }

  // ── Prompt-submit, transport-side channel: fetch prompts from the MAIN world ────
  //
  // inject/main-world.ts intercepts the agent's page-context fetch (where recon
  // confirmed the prompt travels over HTTP — Bolt: POST /api/chat/v2) and posts a
  // `nexpath:fetch-prompt` message. This listener routes it through emitIfNewText,
  // making transport capture the most direct channel available while keeping the
  // single-funnel guarantee: the composer/observer channels seeing the same prompt
  // collapse instead of double-emitting.

  function observeFetchPrompts(win: Window): { disconnect(): void } {
    const onMessage = (ev: MessageEvent): void => {
      if (ev.source !== win || ev.origin !== win.location.origin) return;
      const msg = ev.data as { type?: unknown; promptText?: unknown; agent?: unknown } | null;
      if (!msg || msg.type !== 'nexpath:fetch-prompt' || msg.agent !== config.agent) return;
      if (typeof msg.promptText !== 'string') return;
      emitIfNewText(msg.promptText.trim(), '[nexpath] prompt captured via fetch interception');
    };
    win.addEventListener('message', onMessage as EventListener);
    return {
      disconnect(): void {
        win.removeEventListener('message', onMessage as EventListener);
      },
    };
  }

  // ── Upstream-rejection feedback: never let the funnel dedup an undelivered prompt ─
  //
  // The injector SKIPS forwarding when the page has no project context (e.g. a
  // prompt typed on the bolt.new landing composer). But by the time it skips, this
  // funnel has already recorded the text in lastEmittedText — and Bolt navigates
  // from landing to the new project WITHOUT a full page load, so the SAME kit
  // instance then collapses the project page's /api/chat/v2 re-send of that exact
  // prompt as a duplicate. Net effect: the first prompt of every landing-created
  // project was silently lost (confirmed live 2026-07-06). The injector now posts
  // `nexpath:capture-rejected` back for every skipped prompt; clearing the funnel
  // record here lets the next channel that sees the text re-emit it once a real
  // project root exists.
  function observeCaptureRejections(win: Window): { disconnect(): void } {
    const onMessage = (ev: MessageEvent): void => {
      if (ev.source !== win || ev.origin !== win.location.origin) return;
      const msg = ev.data as { type?: unknown; promptText?: unknown } | null;
      if (!msg || msg.type !== 'nexpath:capture-rejected') return;
      if (typeof msg.promptText !== 'string') return;
      if (lastEmittedText === msg.promptText) {
        lastEmittedText = null;
        console.log('[nexpath] capture rejected upstream (no project context) — cleared for re-capture on the project page');
      }
    };
    win.addEventListener('message', onMessage as EventListener);
    return {
      disconnect(): void {
        win.removeEventListener('message', onMessage as EventListener);
      },
    };
  }

  // ── Response-stop: the stop button disappearing from the DOM ────────────────────

  function observeStopButton(root: Node): MutationObserver {
    // Read current state at observer setup so an already-mid-generation attach
    // (e.g. observer starts while a response is already streaming) doesn't
    // spuriously fire on its first observed transition.
    let wasGenerating = document.querySelector(config.stopButtonSelector) !== null;

    const checkAndEmit = (): void => {
      const isGenerating = document.querySelector(config.stopButtonSelector) !== null;
      // Seeing the stop button IS a turn — this is what arms the completion-label
      // detector for response types whose prompt we never captured ourselves.
      if (isGenerating) turnActive = true;
      if (wasGenerating && !isGenerating) {
        // Visible in the page console regardless of whether the SW message that
        // follows succeeds — closes an observability gap confirmed live 2026-07-03:
        // response-stop silently stopped firing on longer, multi-action responses
        // with no trace of whether the content script ever detected the transition
        // at all, or detected it but the message to the SW got lost.
        console.log('[nexpath] response-stop detected (stop button no longer present)');
        emitResponseStoppedOnce();
      }
      wasGenerating = isGenerating;
    };

    const observer = new MutationObserver(checkAndEmit);
    // childList (element swapped — confirmed live on Replit 2026-07-02 for short
    // responses) + attributes (in case some response types toggle visibility on a
    // persistent element instead). Kept as the primary, lowest-latency path; the
    // poll below is the actual safety net.
    observer.observe(root, { childList: true, subtree: true, attributes: true });

    // Polling safety net, independent of MutationObserver's mutation-type coverage.
    // Confirmed necessary live 2026-07-03: response-stop still failed to fire on
    // longer, multi-action responses across two separate MutationObserver-config
    // attempts (childList, then childList+attributes) — meaning the actual DOM
    // mechanism the site uses for these response types isn't understood with
    // certainty, and guessing a third specific mutation-type config risks the same
    // result. This checks ground truth directly on a fixed interval regardless of
    // *how* the DOM changed, so it cannot have the same class of blind spot a
    // mutation-type filter can — the trade-off is up to POLL_INTERVAL_MS of added
    // detection latency, which only affects when we notice completion, not whether
    // it's noticed at all. Both mechanisms share `wasGenerating`, so whichever
    // detects the transition first wins; the other is a silent no-op. disconnect()
    // is wrapped so callers (bootstrap, tests) that already call the standard
    // MutationObserver.disconnect() correctly stop the poll too, without needing to
    // know it exists.
    const pollIntervalId = setInterval(checkAndEmit, POLL_INTERVAL_MS);
    const originalDisconnect = observer.disconnect.bind(observer);
    observer.disconnect = (): void => {
      clearInterval(pollIntervalId);
      originalDisconnect();
    };

    return observer;
  }

  // ── Response-stop, independent second signal: a completion label in the feed ────
  //
  // Three separate stop-button-based detection strategies (element-swap,
  // attribute-toggle, presence-polling) all failed to reliably fire live on Replit
  // (2026-07-03), specifically on longer multi-action responses. Rather than a
  // fourth guess at the same button mechanism, this uses a completely independent
  // signal: a label the site's own transcript reliably shows the moment a turn
  // completes (Replit: "Worked for X seconds/minutes" — confirmed by direct visual
  // evidence across every live-test screenshot, and later live-confirmed working).
  // Matched by text-content pattern instead of a selector — arguably more resilient
  // anyway, since sites' CSS class names often carry deploy-specific content hashes
  // that break on their next release. Runs in parallel with observeStopButton, not
  // as a replacement — whichever detector notices completion first wins
  // (emitResponseStoppedOnce dedups).

  function observeCompletionLabel(root: Element): MutationObserver {
    let suppressedLogged = false;
    const completion = config.completionLabel;
    if (!completion) {
      throw new Error(`[nexpath] observeCompletionLabel requires completionLabel config (agent: ${config.agent})`);
    }
    const isCompletionLabel = (el: Element): boolean => {
      const text = el.textContent?.trim() ?? '';
      return text.length > 0 && text.length < completion.maxTextLength && completion.pattern.test(text);
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          const matches = isCompletionLabel(node)
            ? [node]
            : Array.from(node.querySelectorAll('*')).filter(isCompletionLabel);
          if (matches.length === 0) continue;
          // Only a label belonging to a turn we have evidence for counts. Without
          // this the transcript's OWN history fires stops (see `turnActive`).
          // Logged once per observer so a suppressed page-load storm is visible
          // without flooding the console.
          if (!turnActive) {
            if (!suppressedLogged) {
              suppressedLogged = true;
              console.log('[nexpath] completion label ignored — no active turn (historical/re-rendered row)');
            }
            continue;
          }
          console.log(completion.log);
          emitResponseStoppedOnce();
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    return observer;
  }

  // ── Bootstrap ───────────────────────────────────────────────────────────────────

  function bootstrap(): () => void {
    // Idempotent-injection guard — see CaptureKitConfig.bootstrapFlag. First
    // generation per page wins; every later stale generation becomes a logged no-op.
    const w = window as unknown as Record<string, boolean | undefined>;
    if (w[config.bootstrapFlag]) {
      console.log(`[nexpath] capture: ${config.captureTier} — skipped, already bootstrapped in this page (stale re-injection guard)`);
      return () => {}; // nothing was wired this generation, so nothing to tear down
    }
    w[config.bootstrapFlag] = true;

    // console.log (not .debug) — Chrome's DevTools console hides "Verbose" level
    // (which .debug is categorized as) unless the user explicitly enables it in the
    // level filter. This line is meant to be visible by default, per devplan §8.1.
    console.log(`[nexpath] capture: ${config.captureTier}`);
    // Collect each channel's disconnect so bootstrap can hand back one teardown for
    // all of them. Every observeX returns a { disconnect() } (observeStopButton's
    // wrapped disconnect also clears its poll interval), so disposing is uniform.
    const wired: Array<{ disconnect(): void }> = [];
    if (config.listenForFetchPrompts) wired.push(observeFetchPrompts(window));
    wired.push(observeCaptureRejections(window));
    if (config.composer) wired.push(observeComposerSubmit(document));
    if (config.observeRenderedMessages !== false) wired.push(observeUserMessages(document.body));
    wired.push(observeStopButton(document.body));
    if (config.completionLabel) wired.push(observeCompletionLabel(document.body));

    return () => {
      for (const channel of wired) channel.disconnect();
      // Torn down ⇒ not bootstrapped: clearing the guard lets a later bootstrap()
      // legitimately re-wire (a no-op in production, correct for re-init/tests).
      w[config.bootstrapFlag] = false;
    };
  }

  // ── Test-only resets ────────────────────────────────────────────────────────────

  // The response-stop dedup is time-based (real Date.now(), not element identity or
  // text content like the other per-instance dedups), so different tests in the
  // same run can genuinely fall within RESPONSE_STOP_DEDUP_WINDOW_MS of each other
  // in real wall-clock time and spuriously suppress one another without this.
  function resetResponseStopDedupForTests(): void {
    lastResponseStoppedEmittedAt = 0;
  }

  // pendingEmptyMessages holds strong Element refs across tests in the same file,
  // and lastEmittedText's consecutive-collapse would otherwise couple tests that
  // happen to reuse a prompt string.
  function resetPromptCaptureStateForTests(): void {
    pendingEmptyMessages.clear();
    lastEmittedText = null;
  }

  return {
    observeUserMessages,
    observeComposerSubmit,
    observeStopButton,
    observeCompletionLabel,
    observeFetchPrompts,
    observeCaptureRejections,
    bootstrap,
    resetResponseStopDedupForTests,
    resetPromptCaptureStateForTests,
  };
}
