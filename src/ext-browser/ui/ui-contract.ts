// Frozen contract — copied verbatim from the v0.1.5 UI developer brief.
// Do not edit without a major-version bump or explicit sign-off from both the
// engine team and the UI developer. Deliberately has zero imports (see §9 of the
// brief) so it can be dropped standalone into the UI developer's own build.
//
// Corrected 2026-07-03: `stage` was `'planning' | 'implementation' | 'review'` — a
// 3-value taxonomy that never matched the real engine, which has always used the
// 8-value Stage enum below (core/classifier/types.ts). Confirmed live: a real
// advisory fired with `stage: 'review_testing'`, which the old type didn't even
// allow. This file was also, independently, out of sync with the brief document
// itself (a stale pre-brief draft — different AdvisoryPayload/PanelEvent/
// MountNexpathPanel shapes entirely) — replaced wholesale to match the brief, not
// just patched, since the previous version had never matched what was actually
// documented and delivered.

// ─── Types sent FROM engine TO panel ──────────────────────────────────

export interface AdvisoryPayload {
  /** Always 1 — runtime-checked; panel throws graceful error on mismatch */
  schemaVersion: 1;

  /** Unique ID for this advisory, format: "adv-{uuid4}" */
  advisoryId: string;

  /**
   * Short attention-grabbing label.
   * Examples: "Before coding.", "Scope check.", "Review ready?",
   *           "Before you ship.", "Step back."
   * Max 40 chars. Always ends with punctuation.
   */
  pinchLabel: string;

  /** Which phase of the session triggered this advisory */
  stage:
    | 'idea'
    | 'prd'
    | 'architecture'
    | 'task_breakdown'
    | 'implementation'
    | 'review_testing'
    | 'release'
    | 'feedback_loop';

  /**
   * CLI-parity: the question line the popup shows below the pinch label
   * (element 5 in the CLI-parity brief). Bold, highest-contrast — the actual ask.
   */
  question: string;

  /**
   * CLI-parity: the pre-composed "why this matters right now" block
   * (element 6). Multi-line; render verbatim, preserving line breaks. `null`
   * when the stage has no why-help — then omit the block entirely.
   */
  whyHelp: string | null;

  /**
   * CLI-parity option lists — one ARRAY per level (the CLI shows a numbered
   * LIST at each level, not a single option). Render every option in
   * `levels[currentLevel]`. "Show simpler options →" advances L1→L2→L3.
   */
  levels: {
    L1: AdvisoryOption[];
    L2: AdvisoryOption[];
    L3: AdvisoryOption[];
  };

  /**
   * DEPRECATED (shipped pre-CLI-parity panel only): flat [L1[0], L2[0], L3[0]].
   * The CLI-parity panel uses `levels` instead. Kept so the currently-shipped
   * panel keeps working during the transition; will be removed afterward.
   */
  options: AdvisoryOption[];

  meta: {
    /** Which coding agent this tab is running */
    agent: 'replit' | 'bolt' | 'lovable';

    /** User's configured advisory frequency — for display only, not logic */
    frequency: 'off' | 'major_only' | 'once_per_session' | 'every_event' | 'optimum';

    /**
     * User's configured role, or null when unset — display only ("(current)"
     * marker in the Alt+Shift+T adjust chooser). Additive; older panels ignore it.
     */
    role?: string | null;
  };
}

export interface AdvisoryOption {
  /** Display-only level tag */
  level: 'L1' | 'L2' | 'L3';

  /**
   * Opaque identifier — pass back in PanelEvent.optionId on select/copy.
   * Format: "{advisoryId}-{level}" but treat as opaque string.
   */
  id: string;

  /** Short headline for this option (max 80 chars) */
  title: string;

  /**
   * The full text of this option — this is what gets injected into the
   * agent's chat input when the user selects it.
   * L1: ~200–350 chars · L2: ~120–200 chars · L3: ~60–100 chars
   */
  body: string;
}


// ─── Types sent FROM panel TO engine (via onEvent callback) ───────────

/**
 * User picked an option → engine will inject option.body into the agent chat.
 * After emitting this, expect controller.setBusy(true) → inject runs →
 * controller.setBusy(false) → controller.hide() in sequence.
 */
export type SelectEvent    = { type: 'select';    optionId: string; body: string };

/**
 * User clicked "Skip" (acknowledge but don't act).
 * Engine stores the skip. You should call hide() if you want — but the
 * engine may also call controller.hide() in response.
 */
export type SkipEvent      = { type: 'skip' };

/**
 * User clicked ✕ or pressed Escape (ignore entirely).
 * Engine does not store anything for dismiss. Panel should close.
 */
export type DismissEvent   = { type: 'dismiss' };

/**
 * User clicked "Copy" on an option (without selecting it for inject-back).
 * Engine may log this. Panel stays open.
 */
export type CopyEvent      = { type: 'copy';      optionId: string };

/**
 * User clicked "Show simpler →" to navigate to the next level.
 * Panel manages its own level display internally.
 * Engine logs this for analytics. You do not need to do anything in response.
 */
export type ShowSimplerEvent = { type: 'show-simpler' };

/**
 * CLI-parity footer shortcut (CLI Ctrl+X): "Disable for this project".
 * Engine sets this project's advisory frequency to `off`, then closes the panel.
 */
export type DisableProjectEvent = { type: 'disable-project' };

/**
 * CLI-parity footer shortcut (CLI Ctrl+T): "Adjust frequency or role".
 * Engine opens the extension options page. Panel STAYS open.
 */
export type OpenSettingsEvent = { type: 'open-settings' };

/**
 * Emitted while the user DRAGS the panel by its header (the ▲ NEXPATH bar).
 * `dx`/`dy` are the pointer movement in px since the previous move event. The
 * engine repositions the panel host by that delta so the user can move the popup
 * aside to see the screen behind it. Non-terminal (panel stays open); emit one per
 * pointermove during a drag.
 */
export type MoveEvent = { type: 'move'; dx: number; dy: number };

/**
 * CLI-parity Alt+Shift+T adjust chooser (the CLI Ctrl+T root chooser's frequency
 * submenu, TtySelectFn runFrequencySubMenu): engine writes the PER-PROJECT key
 * `advisory_frequency:<projectRoot>=<value>`. Non-terminal — the panel loops
 * back to its chooser exactly like the CLI.
 */
export type SetFrequencyEvent = { type: 'set-frequency'; value: 'optimum' | 'every_event' | 'major_only' };

/**
 * CLI-parity Alt+Shift+T adjust chooser (runRoleSubMenu): engine writes the
 * PER-PROJECT key `role:<projectRoot>=<value>`. Non-terminal.
 */
export type SetRoleEvent = { type: 'set-role'; value: 'founder' | 'vibe_coder' | 'indie_hacker' | 'pm' };

export type PanelEvent =
  | SelectEvent
  | SkipEvent
  | DismissEvent
  | CopyEvent
  | ShowSimplerEvent
  | DisableProjectEvent
  | OpenSettingsEvent
  | SetFrequencyEvent
  | SetRoleEvent
  | MoveEvent;


// ─── What you return from mountNexpathPanel ───────────────────────────

export interface PanelController {
  /**
   * Show (or update) the panel with a new advisory payload.
   * Called every time an advisory fires. If the panel is already open,
   * replace its content with the new payload.
   */
  show(payload: AdvisoryPayload): void;

  /**
   * Set / clear the busy (loading) state.
   * Called true immediately after 'select' while inject-back is running.
   * Called false when inject-back completes (or fails).
   * While busy: disable all interactions; show a loading indicator.
   */
  setBusy(isBusy: boolean): void;

  /**
   * Hide the panel (slide or fade out). Do not destroy — show() may be
   * called again later.
   */
  hide(): void;

  /**
   * Permanently destroy the panel and clean up all event listeners,
   * DOM nodes, and any internal timers. Called when the content script
   * unloads (tab close / navigation away from the agent site).
   * After this call, no further methods will be called.
   */
  destroy(): void;
}


// ─── The ONE function you export ──────────────────────────────────────

/**
 * Mount the nexpath advisory panel into the provided root element.
 *
 * @param root    - An empty HTMLElement inside the engine's Shadow root.
 *                  You own this element and all its children.
 *                  Do NOT reach outside this element into the page DOM.
 * @param options - { onEvent } — call this for every user interaction.
 *
 * @returns PanelController that the engine uses to drive the panel.
 *
 * This function is called ONCE per content-script lifetime.
 * It should be synchronous and return immediately. Do not fetch resources.
 */
export type MountNexpathPanel = (
  root: HTMLElement,
  options: { onEvent: (e: PanelEvent) => void }
) => PanelController;
