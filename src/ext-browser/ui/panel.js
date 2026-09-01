// ============================================================================
// nexpath advisory panel — panel.js
// ----------------------------------------------------------------------------
// Visual reference: nexpath-popup.html (approved). Contract wiring unchanged
// from panel.skeleton.js. This revision closes the 4 CLI-parity gaps from
// the v0.1.5 UI parity brief:
//   1. centered placement — engine's job; we simply don't set our own position.
//   2. fixed width/min-height so the box doesn't resize between L1/L2/L3/confirm.
//   3. "Send to your agent now / Copy to clipboard" confirm screen after a pick.
//   4. draggable header, emitting { type:'move', dx, dy }.
// Plus: keydown scoped to the panel via e.composedPath().includes(el).
// Ship alongside panel.d.ts (unchanged).
// ============================================================================

const LEVEL_SUBTITLE = {
  L1: '',
  L2: '— lighter options',
  L3: '— minimum viable step',
};

const LEVEL_ORDER = ['L1', 'L2', 'L3'];

// Palette carried over 1:1 from the approved nexpath-popup.html mockup.
const STYLES = `
  .np-root {
    font-family: "SF Mono", "Cascadia Code", "JetBrains Mono", Consolas, "Liberation Mono", ui-monospace, monospace;
    font-size: 12.5px;
    line-height: 15px;
    color: #f5f5f4;
    background: #310823;
    /* #2: FIXED size across L1/L2/L3/confirm/expanded — the box never grows. When the
       options don't fit (e.g. a details block is expanded) the OPTIONS area scrolls
       (.np-scroll), while the header (▲ NEXPATH + pinch + question + why-help) and the
       footer stay pinned — CLI-parity. No position/inset: the engine centers the host. */
    width: 620px;
    height: 500px;
    max-height: calc(100vh - 40px);
    max-width: calc(100vw - 24px);
    padding: 16px 20px 16px 12px;
    border-radius: 10px;
    box-shadow: 0 20px 50px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.04);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: opacity .15s ease, transform .15s ease;
  }
  .np-root * { box-sizing: border-box; }
  .np-root.np-hidden { opacity: 0; transform: scale(.98); pointer-events: none; }

  .np-wordmark {
    display:flex; align-items:center; gap:6px; font-weight:700; letter-spacing:.5px;
    padding-left:6px; cursor: grab; -webkit-user-select:none; user-select:none;
  }
  .np-wordmark:active { cursor: grabbing; }
  .np-wordmark .tri { color:#2cc7dd; font-size:11px; }
  .np-hr { border:none; border-top:1px solid rgba(154,167,167,.28); margin:6px 0 10px; flex: 0 0 auto; }

  .np-body-wrap { flex: 1 1 auto; display:flex; flex-direction:column; min-height:0; }
  .np-root.np-busy .np-body-wrap { opacity:.4; pointer-events:none; }

  /* #2: fixed header (pinch/question/why-help) + scrolling options + fixed footer. */
  /* On a very short viewport (max-height: calc(100vh - 40px)) the header must be
     allowed to shrink and clip its own overflow (why-help drops from the bottom,
     pinch + question stay) so it can never squeeze the options band to zero rows —
     which would leave the panel showing no selectable option and let a blind Enter
     jump straight to the send-confirm. */
  .np-fixed-top { flex: 0 1 auto; min-height: 0; overflow: hidden; }
  .np-scroll {
    /* min-height keeps >=1 option visible even when the header is at full size;
       inert on normal windows (the options band is already far taller than this). */
    flex: 1 1 auto; overflow-y: auto; min-height: 56px;
    scrollbar-width: thin; scrollbar-color: #5a3a52 transparent;
  }
  .np-scroll::-webkit-scrollbar { width: 8px; }
  .np-scroll::-webkit-scrollbar-thumb { background: #5a3a52; border-radius: 4px; }
  .np-scroll::-webkit-scrollbar-track { background: transparent; }

  .np-row { display:flex; }
  .np-rail { flex:0 0 20px; color:#2a667b; padding-left:2px; }
  .np-content { flex:1 1 auto; min-width:0; overflow-wrap: break-word; }

  .np-pinch-row .np-content { color:#2cc7dd; font-weight:700; }
  .np-pinch-row .np-rail { color:#2cc7dd; }
  .np-subtitle { color:#9ba7a7; font-weight:400; font-size:11px; margin-left:6px; }

  .np-question-row { margin-top:2px; }
  .np-question-row .np-content { color:#f5f5f4; font-weight:700; }

  .np-why-row .np-content { color:#9ba7a7; }

  .np-options { margin-top:10px; }

  .np-option { margin-top:6px; cursor:pointer; }
  .np-option .np-label-row { display:flex; }
  .np-option .np-bullet { flex:0 0 20px; color:#7d8686; }
  .np-option.np-focused .np-bullet { color:#1ca46d; }
  .np-option .np-label { color:#a8a9a8; }
  .np-option.np-focused .np-label { color:#f5f5f4; font-weight:600; }

  /* CLI 4-tier parity: expanded details fade with focus like the CLI styler —
     focused desc = #d0d0d0 (xterm-252 tier), unfocused desc = #7d8686 (SGR-90
     gray tier, darker than the #a8a9a8 unfocused label above it). */
  .np-body-row .np-content { color:#7d8686; }
  .np-option.np-focused .np-body-row .np-content { color:#d0d0d0; }
  .np-hint-row .np-content { color:#9ba7a7; font-style:italic; }

  .np-control { margin-top:8px; cursor:pointer; }
  .np-control .np-label-row { display:flex; }
  .np-control .np-bullet { flex:0 0 20px; color:#7d8686; }
  .np-control.np-focused .np-bullet { color:#1ca46d; }
  .np-control .np-label { color:#a8a9a8; }
  .np-control.np-focused .np-label { color:#f5f5f4; }
  .np-control .np-control-sub { color:#7a8494; font-size:11px; margin-left:4px; }

  .np-footer {
    margin-top:10px; padding-top:8px; padding-left:20px; font-size:11px; font-style:italic;
    color:#6f7373; border-top:1px solid rgba(154,167,167,.16); flex: 0 0 auto;
  }
  .np-footer a { color:#c9a96a; cursor:pointer; text-decoration:none; }
  .np-footer a:hover { text-decoration:underline; }
  .np-footer .np-sep { margin:0 4px; opacity:.6; }

  .np-spinner { margin-top:10px; padding-left:20px; color:#9ba7a7; font-style:italic; }

  /* Confirm screen */
  .np-confirm-hint { color:#9ba7a7; font-style:italic; padding-left:20px; margin-bottom:14px; }
  .np-back { margin-top:14px; padding-left:20px; font-size:11px; font-style:italic; color:#7a8494; cursor:pointer; }
  .np-back:hover { color:#c9a96a; }
`;

export function mountNexpathPanel(root, { onEvent }) {
  // ── instance state ────────────────────────────────────────────────────────
  let payload = null;
  let currentLevel = 'L1';
  let focusedIndex = 0;
  const expanded = new Set();
  let busy = false;

  let view = 'options';        // 'options' | 'confirm' | 'adjust' | 'adjust-freq' | 'adjust-role'
  let pendingOption = null;    // option awaiting send/copy decision
  let confirmFocusedIndex = 0; // 0 = send now, 1 = copy

  // ── Alt+Shift+T adjust chooser state (CLI Ctrl+T root chooser, TtySelectFn) ─
  let adjustFocusedIndex = 0;
  let adjustNote = '';         // transient "Frequency set to: High" line (CLI submenu echo)
  let currentFreq = null;      // local copies so "(current)" moves after a set —
  let currentRole = null;      // payload.meta stays a snapshot of show() time.

  // ── DOM scaffold (built once) ─────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = STYLES;
  root.appendChild(style);

  const el = document.createElement('div');
  el.className = 'np-root np-hidden';
  el.tabIndex = -1;              // focusable so composedPath() scoping works even if the
  el.style.outline = 'none';     // engine forgets to focus us; we focus ourselves on show().
  // Agent pages aggressively re-grab focus (seen live on Lovable 2026-07-10);
  // once blurred, the el-scoped keydown never fires again and keyboard nav is
  // dead with no recovery. Any pointerdown inside the panel re-takes focus.
  el.addEventListener('pointerdown', () => el.focus({ preventScroll: true }));
  root.appendChild(el);

  const head = document.createElement('div');
  head.innerHTML = `<div class="np-wordmark"><span class="tri">▲</span>NEXPATH CLI</div>`;
  const hr = document.createElement('hr');
  hr.className = 'np-hr';
  el.appendChild(head);
  el.appendChild(hr);

  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'np-body-wrap';
  el.appendChild(bodyWrap);

  // ── helpers ───────────────────────────────────────────────────────────────
  function levelOptions() {
    return (payload && payload.levels && payload.levels[currentLevel]) || [];
  }

  function focusables() {
    const rows = levelOptions().map((opt) => ({ kind: 'option', opt }));
    if (LEVEL_ORDER.indexOf(currentLevel) < LEVEL_ORDER.length - 1) {
      rows.push({ kind: 'show-simpler' });
    }
    rows.push({ kind: 'skip' });
    return rows;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── event emitters (frozen contract — payload shapes unchanged) ────────────
  function emitSelect(opt)   { onEvent({ type: 'select', optionId: opt.id, body: opt.body }); }
  function emitCopy(opt)     { onEvent({ type: 'copy', optionId: opt.id }); }
  function emitSkip()        { onEvent({ type: 'skip' }); }
  function emitDismiss()     { onEvent({ type: 'dismiss' }); }
  function emitDisable()     { onEvent({ type: 'disable-project' }); }
  function emitSettings()    { onEvent({ type: 'open-settings' }); }
  function emitMove(dx, dy)  { onEvent({ type: 'move', dx, dy }); }
  function emitShowSimpler() {
    onEvent({ type: 'show-simpler' });
    const i = LEVEL_ORDER.indexOf(currentLevel);
    if (i < LEVEL_ORDER.length - 1) {
      currentLevel = LEVEL_ORDER[i + 1];
      focusedIndex = 0;
      render();
    }
  }

  // ── activation ────────────────────────────────────────────────────────────
  // #3: picking an option no longer selects immediately — it opens the confirm screen.
  function activate(row) {
    if (busy || !row) return;
    if (row.kind === 'option') {
      pendingOption = row.opt;
      view = 'confirm';
      confirmFocusedIndex = 0;
      render();
    } else if (row.kind === 'show-simpler') {
      emitShowSimpler();
    } else if (row.kind === 'skip') {
      emitSkip();
    }
  }

  function activateConfirm(index) {
    if (busy || !pendingOption) return;
    if (index === 0) {
      emitSelect(pendingOption);
    } else {
      // CLI clipboard_only parity: copy the option and CLOSE (the CLI resolves
      // clipboard_only and exits — it does NOT return to the option list). The
      // controller (inject.ts) hides the panel on this copy event; we leave the
      // confirm view up until then so the close fades from here, with no flash of
      // the option list on the way out.
      emitCopy(pendingOption);
    }
  }

  function backFromConfirm() {
    view = 'options';
    pendingOption = null;
    render();
  }

  // ── Alt+Shift+T adjust chooser (CLI Ctrl+T: TtySelectFn runCtrlTRootChooser +
  //    runFrequencySubMenu / runRoleSubMenu — same entries, same loop-back,
  //    same "Done!" closing the popup as a skip) ─────────────────────────────
  const ADJUST_ROOT_CHOICES = [
    { value: 'frequency', label: 'Adjust advisory frequency' },
    { value: 'role',      label: 'Configure role' },
    { value: 'done',      label: 'Done!' },
  ];
  // Active popup entries mirror the CLI menu exactly (once_per_session/off stay
  // config-only there too — deliberately hidden from this chooser).
  const ADJUST_FREQ_CHOICES = [
    { value: 'optimum',     label: 'High' },
    { value: 'every_event', label: 'Medium' },
    { value: 'major_only',  label: 'Low' },
  ];
  const ADJUST_ROLE_CHOICES = [
    { value: 'founder',      label: 'founder / product creator' },
    { value: 'vibe_coder',   label: 'vibe coder' },
    { value: 'indie_hacker', label: 'indie hacker' },
    { value: 'pm',           label: 'product manager' },
  ];

  function openAdjust() {
    view = 'adjust';
    adjustFocusedIndex = 0;
    adjustNote = '';
    render();
    el.focus({ preventScroll: true });
  }

  function adjustChoices() {
    if (view === 'adjust-freq') return ADJUST_FREQ_CHOICES;
    if (view === 'adjust-role') return ADJUST_ROLE_CHOICES;
    return ADJUST_ROOT_CHOICES;
  }

  function activateAdjust(index) {
    const choice = adjustChoices()[index];
    if (!choice) return;
    if (view === 'adjust') {
      if (choice.value === 'frequency') { view = 'adjust-freq'; adjustFocusedIndex = 0; render(); return; }
      if (choice.value === 'role')      { view = 'adjust-role'; adjustFocusedIndex = 0; render(); return; }
      // Done! — CLI parity: the chooser closes the popup as a skip (cleanup(SKIP_NOW)).
      emitSkip();
      return;
    }
    if (view === 'adjust-freq') {
      onEvent({ type: 'set-frequency', value: choice.value });
      currentFreq = choice.value;
      adjustNote = `Frequency set to: ${choice.label}`;
    } else {
      onEvent({ type: 'set-role', value: choice.value });
      currentRole = choice.value;
      adjustNote = `Role set to: ${choice.label}`;
    }
    // Loop back to the root chooser so the user can adjust the other one too (CLI).
    view = 'adjust';
    adjustFocusedIndex = 0;
    render();
  }

  function renderAdjustView() {
    const title = view === 'adjust-freq' ? 'Advisory frequency'
      : view === 'adjust-role' ? 'Choose your role'
      : 'What would you like to adjust?';

    if (adjustNote && view === 'adjust') {
      const note = document.createElement('div');
      note.className = 'np-confirm-hint';
      note.textContent = adjustNote;
      bodyWrap.appendChild(note);
    }

    const pinchRow = document.createElement('div');
    pinchRow.className = 'np-row np-pinch-row';
    pinchRow.innerHTML = `<div class="np-rail">◆</div><div class="np-content">${escapeHtml(title)}</div>`;
    bodyWrap.appendChild(pinchRow);

    const currentValue = view === 'adjust-freq' ? currentFreq : view === 'adjust-role' ? currentRole : null;
    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'np-options';
    adjustChoices().forEach((choice, i) => {
      const focused = i === adjustFocusedIndex;
      const suffix = currentValue !== null && choice.value === currentValue ? '  (current)' : '';
      const node = document.createElement('div');
      node.className = 'np-option' + (focused ? ' np-focused' : '');
      const labelRow = document.createElement('div');
      labelRow.className = 'np-label-row';
      labelRow.innerHTML =
        `<div class="np-bullet">${focused ? '●' : '○'}</div>` +
        `<div class="np-label">${escapeHtml(choice.label)}<span class="np-control-sub">${escapeHtml(suffix)}</span></div>`;
      labelRow.addEventListener('click', () => { adjustFocusedIndex = i; activateAdjust(i); });
      node.appendChild(labelRow);
      optionsWrap.appendChild(node);
    });
    bodyWrap.appendChild(optionsWrap);

    const back = document.createElement('div');
    back.className = 'np-back';
    back.textContent = view === 'adjust' ? '← back to advisory  (Esc)' : '← back  (Esc)';
    back.addEventListener('click', () => {
      if (view === 'adjust') { view = 'options'; } else { view = 'adjust'; adjustFocusedIndex = 0; }
      render();
    });
    bodyWrap.appendChild(back);
  }

  // ── render: options view ─────────────────────────────────────────────────
  function renderOptionsView() {
    const rows = focusables();
    if (focusedIndex >= rows.length) focusedIndex = rows.length - 1;

    const pinchRow = document.createElement('div');
    pinchRow.className = 'np-row np-pinch-row';
    pinchRow.innerHTML =
      `<div class="np-rail">◆</div>` +
      `<div class="np-content">${escapeHtml(payload.pinchLabel)}` +
      (LEVEL_SUBTITLE[currentLevel] ? `<span class="np-subtitle">${LEVEL_SUBTITLE[currentLevel]}</span>` : '') +
      `</div>`;
    // FIXED header region — stays pinned; only the options below scroll (#2).
    const fixedTop = document.createElement('div');
    fixedTop.className = 'np-fixed-top';
    fixedTop.appendChild(pinchRow);

    const qRow = document.createElement('div');
    qRow.className = 'np-row np-question-row';
    qRow.innerHTML = `<div class="np-rail">│</div><div class="np-content">${escapeHtml(payload.question)}</div>`;
    fixedTop.appendChild(qRow);

    if (payload.whyHelp) {
      payload.whyHelp.split('\n').forEach((line) => {
        const whyRow = document.createElement('div');
        whyRow.className = 'np-row np-why-row';
        whyRow.innerHTML = `<div class="np-rail">│</div><div class="np-content">${escapeHtml(line)}</div>`;
        fixedTop.appendChild(whyRow);
      });
    }
    bodyWrap.appendChild(fixedTop);

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'np-options';

    rows.forEach((row, i) => {
      const focused = i === focusedIndex;

      if (row.kind === 'option') {
        const opt = row.opt;
        const node = document.createElement('div');
        node.className = 'np-option' + (focused ? ' np-focused' : '');

        const labelRow = document.createElement('div');
        labelRow.className = 'np-label-row';
        labelRow.innerHTML =
          `<div class="np-bullet">${focused ? '●' : '○'}</div>` +
          `<div class="np-label">${escapeHtml(opt.title)}</div>`;
        labelRow.addEventListener('click', () => { focusedIndex = i; activate(row); });
        node.appendChild(labelRow);

        if (expanded.has(opt.id)) {
          // Blank gap row between label and details (CLI parity: computeLayout
          // emits a rail-only spacer row before every desc-base block).
          const gapRow = document.createElement('div');
          gapRow.className = 'np-row np-body-row';
          gapRow.innerHTML = `<div class="np-rail">│</div><div class="np-content"></div>`;
          node.appendChild(gapRow);
          const bodyRow = document.createElement('div');
          bodyRow.className = 'np-row np-body-row';
          bodyRow.innerHTML = `<div class="np-rail">│</div><div class="np-content">↳ ${escapeHtml(opt.body)}</div>`;
          node.appendChild(bodyRow);
        }

        if (focused) {
          const hintRow = document.createElement('div');
          hintRow.className = 'np-row np-hint-row';
          hintRow.innerHTML = `<div class="np-rail"></div><div class="np-content">press Space to toggle details</div>`;
          node.appendChild(hintRow);
        }

        optionsWrap.appendChild(node);
      } else {
        const node = document.createElement('div');
        node.className = 'np-control' + (focused ? ' np-focused' : '');
        const labelRow = document.createElement('div');
        labelRow.className = 'np-label-row';
        if (row.kind === 'show-simpler') {
          labelRow.innerHTML = `<div class="np-bullet">${focused ? '●' : '○'}</div><div class="np-label">Show simpler options →</div>`;
        } else {
          labelRow.innerHTML =
            `<div class="np-bullet">${focused ? '●' : '○'}</div>` +
            `<div class="np-label">Skip for now<span class="np-control-sub">  — nexpath optimize will remind you</span></div>`;
        }
        labelRow.addEventListener('click', () => { focusedIndex = i; activate(row); });
        node.appendChild(labelRow);
        optionsWrap.appendChild(node);
      }
    });

    // SCROLL region — only the options scroll when they don't fit (#2).
    const scrollWrap = document.createElement('div');
    scrollWrap.className = 'np-scroll';
    scrollWrap.appendChild(optionsWrap);
    bodyWrap.appendChild(scrollWrap);

    const footer = document.createElement('div');
    footer.className = 'np-footer';
    footer.innerHTML =
      `don't need nexpath here? <a data-np="disable">Disable for this project (Alt+Shift+X)</a>` +
      `<span class="np-sep">·</span><a data-np="settings">Adjust frequency or role (Alt+Shift+T)</a>`;
    footer.querySelector('[data-np="disable"]').addEventListener('click', emitDisable);
    // Footer link and Alt+Shift+T are the same CLI Ctrl+T function → the in-panel chooser.
    footer.querySelector('[data-np="settings"]').addEventListener('click', openAdjust);
    bodyWrap.appendChild(footer);
  }

  // ── render: confirm view (#3) ─────────────────────────────────────────────
  function renderConfirmView() {
    const hint = document.createElement('div');
    hint.className = 'np-confirm-hint';
    hint.textContent = '↵ hit enter to send directly to your agent';
    bodyWrap.appendChild(hint);

    const pinchRow = document.createElement('div');
    pinchRow.className = 'np-row np-pinch-row';
    pinchRow.innerHTML = `<div class="np-rail">◆</div><div class="np-content">What would you like to do?</div>`;
    bodyWrap.appendChild(pinchRow);

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'np-options';

    const choices = [
      { label: 'Send to your agent now' },
      { label: 'Copy to clipboard — edit before sending' },
    ];
    choices.forEach((choice, i) => {
      const focused = i === confirmFocusedIndex;
      const node = document.createElement('div');
      node.className = 'np-option' + (focused ? ' np-focused' : '');
      const labelRow = document.createElement('div');
      labelRow.className = 'np-label-row';
      labelRow.innerHTML =
        `<div class="np-bullet">${focused ? '●' : '○'}</div>` +
        `<div class="np-label">${choice.label}</div>`;
      labelRow.addEventListener('click', () => { confirmFocusedIndex = i; activateConfirm(i); });
      node.appendChild(labelRow);
      optionsWrap.appendChild(node);
    });

    bodyWrap.appendChild(optionsWrap);

    const back = document.createElement('div');
    back.className = 'np-back';
    back.textContent = '← back  (Esc)';
    back.addEventListener('click', backFromConfirm);
    bodyWrap.appendChild(back);
  }

  // ── render (dispatch) ────────────────────────────────────────────────────
  function render() {
    if (!payload) return;
    bodyWrap.innerHTML = '';

    if (view === 'confirm') {
      renderConfirmView();
    } else if (view === 'adjust' || view === 'adjust-freq' || view === 'adjust-role') {
      renderAdjustView();
    } else {
      renderOptionsView();
    }

    // Keep the focused row visible in the scroll region — auto-scroll on ↑/↓ nav so
    // the user never has to scroll manually to reach an option below the fold.
    const focusedEl = bodyWrap.querySelector('.np-focused');
    if (focusedEl && focusedEl.scrollIntoView) focusedEl.scrollIntoView({ block: 'nearest' });

    el.classList.toggle('np-busy', busy);
    const oldSpinner = el.querySelector('.np-spinner');
    if (oldSpinner) oldSpinner.remove();
    if (busy) {
      const s = document.createElement('div');
      s.className = 'np-spinner';
      s.textContent = 'Working…';
      el.appendChild(s);
    }
  }

  // ── keyboard (per-instance; removed in destroy; scoped to this panel) ──────
  function onKeyDown(e) {
    if (el.classList.contains('np-hidden') || busy) return;
    // Scope: the listener is attached to `el` (below), so it only fires when the panel
    // (or a descendant) is focused — no composedPath check needed and no page-key hijack.
    // (A document-level listener + composedPath().includes(el) does NOT work here: the
    // engine mounts us in a CLOSED shadow root, and composedPath hides our internals from
    // any listener outside that shadow, so the guard rejected every key — arrows/Enter did
    // nothing. Confirmed live on Lovable 2026-07-09.)
    //
    // stopPropagation on every handled key (below): preventDefault alone only cancels the
    // browser's OWN default action — it does NOT stop the same event from continuing to
    // bubble past `el`, out of this closed shadow root, into the host page's document. Agent
    // pages commonly bind their own document-level key handlers (e.g. ArrowUp to recall the
    // last prompt in the chat box) that don't care about our shadow internals; left unblocked,
    // that handler still runs on OUR arrow/Enter/Escape presses and can refocus the agent's own
    // textarea out from under us — matching the reported symptom (Alt+Shift+T opens the
    // adjust chooser fine, since it's a modified combo agent history-recall handlers ignore,
    // but the following bare ArrowUp/ArrowDown gets reinterpreted by the page and steals focus,
    // so nothing in the popup responds again until a manual click re-triggers the pointerdown
    // refocus above). stopPropagation makes every key we fully handle invisible to the host
    // page, closing that path without touching the intentional click-away-releases-focus
    // design (that's driven by pointerdown/click, never by keydown, so it's unaffected).

    // Disable for this project (the CLI's Ctrl+X, TtySelectFn \x18 — remapped to
    // Alt+Shift+X per user decision 2026-07-11). Matched on e.code (physical key):
    // with Alt held, e.key is a composed character on macOS (Option+Shift+X types
    // a symbol) and layout-dependent elsewhere — e.code 'KeyX' is stable on every
    // OS/layout. No ctrl/meta so browser chords can't overlap. Works in any view.
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyX') {
      emitDisable(); e.preventDefault(); e.stopPropagation(); return;
    }
    // Adjust frequency/role (the CLI's Ctrl+T, \x14 — remapped to Alt+Shift+T per
    // user decision 2026-07-11; plain Ctrl+T is the browser's new-tab shortcut and
    // non-interceptable). Same e.code matching rationale as Alt+Shift+X above.
    // Opens the CLI-parity IN-PANEL chooser (runCtrlTRootChooser), not the options page.
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyT') {
      openAdjust(); e.preventDefault(); e.stopPropagation(); return;
    }

    if (view === 'adjust' || view === 'adjust-freq' || view === 'adjust-role') {
      const n = adjustChoices().length;
      if (e.key === 'ArrowDown') { adjustFocusedIndex = Math.min(n - 1, adjustFocusedIndex + 1); render(); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'ArrowUp') { adjustFocusedIndex = Math.max(0, adjustFocusedIndex - 1); render(); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'Enter') { activateAdjust(adjustFocusedIndex); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'Escape') {
        if (view === 'adjust') { view = 'options'; } else { view = 'adjust'; adjustFocusedIndex = 0; }
        render(); e.preventDefault(); e.stopPropagation();
      }
      return;
    }

    if (view === 'confirm') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        confirmFocusedIndex = confirmFocusedIndex === 0 ? 1 : 0;
        render(); e.preventDefault(); e.stopPropagation();
      } else if (e.key === 'Enter') {
        activateConfirm(confirmFocusedIndex); e.preventDefault(); e.stopPropagation();
      } else if (e.key === 'Escape') {
        backFromConfirm(); e.preventDefault(); e.stopPropagation();
      }
      return;
    }

    const rows = focusables();
    if (e.key === 'ArrowDown') { focusedIndex = Math.min(rows.length - 1, focusedIndex + 1); render(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'ArrowUp') { focusedIndex = Math.max(0, focusedIndex - 1); render(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Enter') { activate(rows[focusedIndex]); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Escape') { emitSkip(); e.preventDefault(); e.stopPropagation(); } // CLI parity: Esc = skip (was dismiss)
    else if (e.key === ' ') {
      const row = rows[focusedIndex];
      if (row && row.kind === 'option') {
        // Non-exclusive toggle — CLI defaultOnSpace parity (render-loop.ts): Space
        // toggles ONLY the focused option; any others already expanded stay open.
        if (expanded.has(row.opt.id)) expanded.delete(row.opt.id);
        else expanded.add(row.opt.id);
        render();
      }
      e.preventDefault(); e.stopPropagation();
    }
  }
  el.addEventListener('keydown', onKeyDown); // el-scoped: fires only while the panel is focused

  // ── draggable header (#4) ────────────────────────────────────────────────
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onHeaderPointerDown(e) {
    if (busy) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    head.setPointerCapture && head.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onHeaderPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (dx !== 0 || dy !== 0) emitMove(dx, dy);
  }
  function onHeaderPointerUp(e) {
    dragging = false;
    head.releasePointerCapture && e.pointerId != null && head.releasePointerCapture(e.pointerId);
  }
  head.addEventListener('pointerdown', onHeaderPointerDown);
  head.addEventListener('pointermove', onHeaderPointerMove);
  head.addEventListener('pointerup', onHeaderPointerUp);
  head.addEventListener('pointercancel', onHeaderPointerUp);

  // ── the controller the engine drives ───────────────────────────────────────
  return {
    show(nextPayload) {
      if (!nextPayload || nextPayload.schemaVersion !== 1) return;
      payload = nextPayload;
      currentLevel = 'L1';
      focusedIndex = 0;
      expanded.clear();
      busy = false;
      view = 'options';
      pendingOption = null;
      confirmFocusedIndex = 0;
      adjustFocusedIndex = 0;
      adjustNote = '';
      currentFreq = (nextPayload.meta && nextPayload.meta.frequency) || null;
      currentRole = (nextPayload.meta && nextPayload.meta.role) || null;
      el.classList.remove('np-hidden');
      render();
      el.focus({ preventScroll: true });
    },

    setBusy(isBusy) {
      busy = !!isBusy;
      render();
    },

    hide() {
      el.classList.add('np-hidden');
    },

    destroy() {
      el.removeEventListener('keydown', onKeyDown);
      head.removeEventListener('pointerdown', onHeaderPointerDown);
      head.removeEventListener('pointermove', onHeaderPointerMove);
      head.removeEventListener('pointerup', onHeaderPointerUp);
      head.removeEventListener('pointercancel', onHeaderPointerUp);
      el.remove();
      style.remove();
      payload = null;
    },
  };
}
