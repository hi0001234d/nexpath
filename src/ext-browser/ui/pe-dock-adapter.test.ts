// @vitest-environment jsdom
/**
 * The bridge between the engine popup flow and the UI developer's dock —
 * tested with the REAL dock, REAL surface controller, and REAL surface view
 * (no mocks of PR #1's code), so these are integration-grade: my producers
 * must satisfy their renderer, their keyboard/click grammar must come back
 * out as my commands, and the PEF-backed-by-signals flow must hold together.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountNexpathPeDock, mpsSurfaceModel, peSurfaceModel, pefSurfaceModel } from './pe-dock-adapter.js';
import { NEXPATH_DOCK_HOST_ID } from './surfaces/dock.js';
import type { PePanelControllerV1, PePanelEventV1, PeSequenceOfferViewV1, PePanelViewV1 } from './pe-contract.js';

let events: PePanelEventV1[];
let adapter: PePanelControllerV1;

const commands = () => events.filter((e) => e.type === 'command').map((e) => (e.type === 'command' ? e.command : null));

function view(overrides: Partial<PePanelViewV1> = {}): PePanelViewV1 {
  return {
    schemaVersion: 1, viewSeq: 1,
    title: 'Nexpath · Prompt enhancement',
    editorHeading: 'Use enhanced prompt',
    bodyText: 'Enhanced body text',
    bodyEditable: true,
    hasAdditionalDetails: true,
    additionalDetailsText: '',
    directional: [
      { actionType: 'shorter', label: 'Shorter', availability: 'available' },
      { actionType: 'more_thorough', label: 'More thorough', availability: 'requires_llm_budget' },
    ],
    refinement: false, hasFeedback: false, trustCues: ['Your original request is kept.'],
    pinchLabel: 'Shipping something?', whyHelp: 'Risky step — confirm first.',
    ...overrides,
  };
}

function offer(overrides: Partial<PeSequenceOfferViewV1> = {}): PeSequenceOfferViewV1 {
  return {
    schemaVersion: 1, kind: 'sequence_offer', viewSeq: 1,
    title: 'Nexpath · Multi-prompt sequence', heading: 'First prompt of your sequence',
    bodyText: 'build the login page first', remainingTaskCount: 2,
    taskSummaryLines: ['add a database', 'deploy'], cancelLabel: 'Use original prompt',
    ...overrides,
  };
}

/** The dock's shadow is closed — reach the surface DOM via the wrapper the
 * controller focuses (document.activeElement pierces to the host; for tests we
 * use the adapter-internal route: the dock host exists in light DOM, and the
 * REAL renderer parks focus inside, so we drive by keyboard + activeElement,
 * plus querying through the mount element captured from mountNexpathDock…
 * simplest honest route: grab the shadow root at attach time. */
let shadowRoots: ShadowRoot[];
let intents: string[];
const realAttachShadow = HTMLElement.prototype.attachShadow;

beforeEach(() => {
  document.body.innerHTML = '';
  shadowRoots = [];
  HTMLElement.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
    const root = realAttachShadow.call(this, init);
    shadowRoots.push(root);
    return root;
  };
  events = [];
  intents = [];
  adapter = mountNexpathPeDock({
    onEvent: (e) => events.push(e),
    onTerminalIntent: (o) => intents.push(o),
  });
});

afterEach(() => {
  adapter.destroy();
  HTMLElement.prototype.attachShadow = realAttachShadow;
});

function surfaceEl(): HTMLElement {
  const root = shadowRoots.at(-1)!;
  return root.querySelector('.np-surface-root') as HTMLElement;
}
function bodyField(): HTMLTextAreaElement {
  return surfaceEl().querySelector('textarea') as HTMLTextAreaElement;
}
function rowByLabel(label: string): HTMLElement {
  const rows = [...surfaceEl().querySelectorAll('.np-row')];
  const hit = rows.find((r) => r.textContent?.includes(label));
  if (!hit) throw new Error(`no row containing "${label}"`);
  return hit as HTMLElement;
}
function pressOn(el: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init }));
}

describe('producers (my views → their models)', () => {
  it('the PE model is the CLI\'s THREE rows exactly: body, Additional details, Use original prompt', () => {
    const m = peSurfaceModel(view());
    expect(m.id).toBe('prompt_enhancement');
    expect(m.pinch).toBe('Shipping something?');
    expect(m.rows.filter((r) => r.kind === 'field')).toHaveLength(2);
    expect(m.rows.filter((r) => r.kind === 'action')).toHaveLength(1);
    expect(m.rows.some((r) => r.kind === 'action' && r.act === 'use-original')).toBe(true);
  });

  // Owner ruling 2026-08-25 after seeing a REAL CLI popup: the CLI renders no
  // directional rows at all — its own loop is commented out at
  // cli-submit-popup.ts:641-662. Ours rendered them, and a row the engine
  // silently refuses looks like broken software (tester report). Pinned so they
  // cannot reappear.
  it('renders NO directional rows even when the engine offers them (cli-submit-popup.ts:641-662)', () => {
    const m = peSurfaceModel(view());
    const labels = m.rows.map((r) => (r.kind === 'note' ? r.text : r.label));
    expect(labels).not.toContain('Shorter');
    expect(labels).not.toContain('More thorough');
    expect(labels).not.toContain('More project-grounded');
  });

  it('the MPS model carries the first prompt, the plan notes, and the engine cancel label', () => {
    const m = mpsSurfaceModel(offer());
    expect(m.id).toBe('mps_first');
    expect(m.rows.filter((r) => r.kind === 'note').map((r) => (r.kind === 'note' ? r.text : ''))).toEqual([
      'Sequence plan', 'add a database', 'deploy',
    ]);
    expect(m.rows.some((r) => r.kind === 'action' && r.act === 'cancel-sequence' && r.label === 'Use original prompt')).toBe(true);
  });

  it('the PEF model is the CLI\'s three rows — two categories + the free-text Other field (:1112)', () => {
    const m = pefSurfaceModel();
    expect(m.rows).toHaveLength(3);
    expect(m.rows[0]).toMatchObject({ kind: 'action', label: 'Not relevant enough' });
    expect(m.rows[1]).toMatchObject({ kind: 'action', label: 'Too much or too long' });
    expect(m.rows[2]).toMatchObject({ kind: 'field', label: 'Other', placeholder: '(type your feedback)' });
  });
});

describe('PE surface flows (real dock + controller)', () => {
  it('show() renders in the dock; Enter on the body sends use_current with the LIVE text — no fixture notice', () => {
    adapter.show(view());
    expect(document.getElementById(NEXPATH_DOCK_HOST_ID)).toBeTruthy();
    expect(adapter.isOpen()).toBe(true);
    const body = bodyField();
    expect(body.value).toBe('Enhanced body text');
    body.value = 'edited live';
    pressOn(body, 'Enter');
    expect(commands()).toEqual([{ type: 'use_current', bodyText: 'edited live' }]);
    expect(surfaceEl().textContent).not.toContain('static build');
  });

  it('an EMPTY body Enter is the BF-1 silent guard — nothing emitted', () => {
    adapter.show(view());
    const body = bodyField();
    body.value = '   ';
    pressOn(body, 'Enter');
    expect(commands()).toHaveLength(0);
  });

  it('details Enter runs the CLI local merge and reports edit_body with the merged text', () => {
    adapter.show(view());
    (surfaceEl().querySelectorAll('textarea')[1] as HTMLTextAreaElement).focus();
    // The controller re-renders on row-focus change — re-query the LIVE node.
    const details = surfaceEl().querySelectorAll('textarea')[1] as HTMLTextAreaElement;
    details.value = 'keep the retry helper';
    pressOn(details, 'Enter');
    const cmd = commands()[0];
    expect(cmd).toMatchObject({ type: 'edit_body' });
    expect((cmd as { bodyText: string }).bodyText).toContain('Enhanced body text');
    expect((cmd as { bodyText: string }).bodyText).toContain('Additional details to incorporate:');
    expect((cmd as { bodyText: string }).bodyText).toContain('keep the retry helper');
    expect(bodyField().value).toContain('keep the retry helper'); // visible merge
  });

  it('no directional row exists in the rendered dock — the CLI shows none', () => {
    adapter.show(view());
    const text = surfaceEl().textContent ?? '';
    expect(text).not.toContain('Shorter');
    expect(text).not.toContain('More thorough');
    expect(text).not.toContain('More project-grounded');
    expect(text).toContain('Use original prompt'); // the row that DOES exist
  });

  it('Go back renders on refinement views and emits go_back', () => {
    adapter.show(view({ refinement: true }));
    rowByLabel('Go back').click();
    expect(commands()).toEqual([{ type: 'go_back', }]);
  });

  it('setBusy(true) suppresses commands until the next show()', () => {
    adapter.show(view());
    adapter.setBusy(true);
    pressOn(bodyField(), 'Enter');
    expect(commands()).toHaveLength(0);
    adapter.show(view({ viewSeq: 2 }));
    pressOn(bodyField(), 'Enter');
    expect(commands()).toHaveLength(1);
  });
});

describe('PEF-backed-by-signals (owner decision 2026-08-25)', () => {
  it('Esc on PE closes IMMEDIATELY with no PEF — the CLI\'s shipped rule (cli-submit-popup.ts:1469-1471)', () => {
    adapter.show(view());
    pressOn(surfaceEl(), 'Escape');
    expect(commands()).toEqual([{ type: 'close' }]);           // straight out
    expect(surfaceEl().textContent).not.toContain('Not relevant enough'); // never PEF
  });

  it('Use-original → PEF → a category click records the signal THEN completes use_original', () => {
    adapter.show(view());
    rowByLabel('Use original prompt').click();
    expect(surfaceEl().textContent).toContain('Not relevant enough'); // PEF visible
    expect(commands()).toHaveLength(0); // nothing terminal yet
    rowByLabel('Too much or too long').click();
    expect(commands()).toEqual([
      { type: 'feedback_suggested', category: 'too_much_or_too_long' },
      { type: 'use_original' },
    ]);
  });

  // ── RELEASING A HELD PROMPT WITHOUT ENDING THE FEEDBACK STEP ───────────────
  // On the submit path the user's prompt is held until the terminal command
  // arrives, and the hold has no ceiling. Because "Use original" parks its
  // command behind a satisfaction step, an abandoned survey held the prompt
  // forever — reported live as "the flow stucked". These pin the announcement
  // that lets the hold end early WITHOUT changing what the panel emits.
  describe('announcing the decision before the feedback step', () => {
    it('announces use_original the instant the row is clicked — before any command', () => {
      adapter.show(view());
      rowByLabel('Use original prompt').click();
      expect(intents).toEqual(['use_original']);
      expect(commands()).toHaveLength(0);          // command still parked (CLI order)
      expect(adapter.isCollectingFeedback?.()).toBe(true);
    });

    it('the parked command STILL follows the feedback — the announcement replaces nothing', () => {
      adapter.show(view());
      rowByLabel('Use original prompt').click();
      rowByLabel('Too much or too long').click();
      expect(commands()).toEqual([
        { type: 'feedback_suggested', category: 'too_much_or_too_long' },
        { type: 'use_original' },
      ]);
      expect(intents).toEqual(['use_original']);   // announced once, not twice
      expect(adapter.isCollectingFeedback?.()).toBe(false);
    });

    it('is not collecting feedback before a terminal choice, nor after skipping it', () => {
      adapter.show(view());
      expect(adapter.isCollectingFeedback?.()).toBe(false);
      rowByLabel('Use original prompt').click();
      pressOn(surfaceEl(), 'Escape');              // skip
      expect(adapter.isCollectingFeedback?.()).toBe(false);
    });

    it('a fresh view clears the flag — a stale feedback step never guards a new popup', () => {
      adapter.show(view());
      rowByLabel('Use original prompt').click();
      expect(adapter.isCollectingFeedback?.()).toBe(true);
      adapter.show(view({ viewSeq: 2 }));
      expect(adapter.isCollectingFeedback?.()).toBe(false);
    });

    it('NOTHING is announced for the paths that do not park a command', () => {
      // use_current carries the body text, so it must be decided by the popup,
      // not released early; Esc emits close directly with no feedback step.
      adapter.show(view());
      pressOn(surfaceEl(), 'Escape');
      expect(intents).toEqual([]);
      expect(commands()).toEqual([{ type: 'close' }]);
    });

    it('a host that does not supply the hook behaves exactly as before', () => {
      const plain = mountNexpathPeDock({ onEvent: (e) => events.push(e) });
      try {
        plain.show(view());
        // The last-attached shadow root is this adapter's.
        const rows = [...(shadowRoots.at(-1)!.querySelector('.np-surface-root') as HTMLElement)
          .querySelectorAll('.np-row')];
        (rows.find((r) => r.textContent?.includes('Use original prompt')) as HTMLElement).click();
        expect(events.at(-1)).toBeUndefined();   // still parked, nothing thrown
      } finally {
        plain.destroy();
      }
    });
  });

  it('Use-original opens PEF; skip completes with use_original', () => {
    adapter.show(view());
    rowByLabel('Use original prompt').click();
    expect(surfaceEl().textContent).toContain('Too much or too long');
    pressOn(surfaceEl(), 'Escape');
    expect(commands()).toEqual([{ type: 'use_original' }]);
  });
});

describe('MPS offer flows', () => {
  it('Enter on the offer body sends mps_send with the live text', () => {
    adapter.show(offer());
    const body = bodyField();
    body.value = 'edited first prompt';
    pressOn(body, 'Enter');
    expect(commands()).toEqual([{ type: 'mps_send', bodyText: 'edited first prompt' }]);
  });

  it('Esc with no editor focused declines; the cancel row goes through PEF then mps_cancel', () => {
    adapter.show(offer());
    pressOn(surfaceEl(), 'Escape'); // editor focused → blur only
    pressOn(surfaceEl(), 'Escape'); // now declines
    expect(commands()).toEqual([{ type: 'mps_decline' }]);

    events.length = 0;
    adapter.show(offer({ viewSeq: 2 }));
    rowByLabel('Use original prompt').click(); // the engine-labeled cancel row
    expect(surfaceEl().textContent).toContain('Not relevant enough'); // PEF
    rowByLabel('Not relevant enough').click();
    expect(commands()).toEqual([
      { type: 'feedback_suggested', category: 'not_relevant_enough' },
      { type: 'mps_cancel' },
    ]);
  });
});

describe('dock furniture', () => {
  it('the dock ✕ maps to plain close (window dismissal skips PEF) and hides', () => {
    adapter.show(view());
    const root = shadowRoots.find((r) => r.querySelector('[data-nexpath-dock-close], .np-dock-close, button'));
    const closeBtn = [...(root?.querySelectorAll('button') ?? [])]
      .find((b) => b.textContent?.includes('✕') || b.getAttribute('aria-label')?.toLowerCase().includes('close'));
    expect(closeBtn, 'dock close button').toBeTruthy();
    closeBtn!.click();
    expect(commands()).toEqual([{ type: 'close' }]);
    expect(adapter.isOpen()).toBe(false);
  });

  it('hide()/isOpen()/destroy() drive the dock', () => {
    adapter.show(view());
    expect(adapter.isOpen()).toBe(true);
    adapter.hide();
    expect(adapter.isOpen()).toBe(false);
    adapter.destroy();
    expect(document.getElementById(NEXPATH_DOCK_HOST_ID)).toBeNull();
  });
});

describe('chrome styles (live-caught 2026-08-25: unstyled transparent dock)', () => {
  it('show() installs the CLI frame stylesheet into the dock shadow root exactly once', () => {
    adapter.show(view());
    const dockShadow = shadowRoots.find((r) => r.querySelector('.np-surface-root'))!;
    const styleNodes = [...dockShadow.querySelectorAll('style')]
      .filter((s) => s.textContent?.includes('.np-frame'));
    expect(styleNodes.length).toBeGreaterThanOrEqual(1);
    adapter.show(view({ viewSeq: 2 }));
    const after = [...dockShadow.querySelectorAll('style')]
      .filter((s) => s.textContent?.includes('.np-frame'));
    expect(after.length).toBe(styleNodes.length); // once per dock lifetime, not per show
  });
});

describe('REAL prepare → whitelisted view → real dock DOM (plan §7: fixtures from real results, not hand-invented)', () => {
  it('a real keyless engine prepare renders in the dock with its actual body and controls', async () => {
    const { buildBrowserPeRequest, prepareBrowserPe } = await import('../background/pe-prepare.js');
    const { buildPePanelView } = await import('../background/pe-popup-host.js');
    const prep = await prepareBrowserPe(buildBrowserPeRequest({
      projectRoot: 'https://bolt.new/~/real-fixture',
      promptText: 'add a login page with email and password to the app',
      sessionId: 's-real', promptCount: 6,
      currentStage: 'implementation', prevStage: 'implementation',
      triggerKind: 'absence', effectiveFlagType: 'absence:tests_before_merge',
      firedKey: 'absence:tests_before_merge@implementation', triggerConfidence: 0.9,
      classifierState: 'fire_recommended', profile: null, configuredRole: 'founder',
      detectedLanguage: undefined, streamBOutputs: [],
      triggerEligibility: 'fresh_trigger_eligible', recentPromptRefs: [],
    }));
    expect(prep.safeFallback).toBe(false);
    if (prep.safeFallback) return;

    // buildPePanelView needs the engine's render view — build it the way the
    // popup host does, through the engine's own render model.
    const { buildPromptEnhancementPopupRenderModelV1 } = await import('../../prompt-enhancement/popup-render-model.js');
    const rm = buildPromptEnhancementPopupRenderModelV1({
      result: prep.result, timestampMs: 1, deliverySurface: prep.result.delivery.deliveryChannel,
    });
    expect(rm.state).toBe('render_model_ready');
    if (rm.state !== 'render_model_ready') return;
    const view = buildPePanelView(
      { model: rm.model, editedBodyText: rm.model.body.text, additionalDetailsText: '', refinement: false },
      1,
    );

    adapter.show(view);
    // The REAL engine body is in the dock's real DOM, with the locked controls.
    expect(bodyField().value).toBe(rm.model.body.text);
    expect(bodyField().value.length).toBeGreaterThan(100);
    expect(surfaceEl().textContent).toContain('Use original prompt');
    expect(surfaceEl().textContent).not.toContain('static build');
  });
});

describe('read-only fallback bodies (live 2026-08-25: typed edits silently dropped)', () => {
  it('bodyEditable:false renders BOTH fields natively read-only — the field never promises an edit the send path will discard', () => {
    adapter.show(view({ bodyEditable: false }));
    const fields = [...surfaceEl().querySelectorAll('textarea')] as HTMLTextAreaElement[];
    expect(fields).toHaveLength(2); // body + details
    expect(fields.every((f) => f.readOnly)).toBe(true);
  });

  it('Enter on a read-only body still sends the engine\'s own text (the CLI keeps use_current on locked bodies)', () => {
    adapter.show(view({ bodyEditable: false }));
    const field = bodyField();
    field.focus();
    pressOn(field, 'Enter');
    expect(commands()).toEqual([{ type: 'use_current', bodyText: 'Enhanced body text' }]);
  });

  it('bodyEditable:true stays fully editable (regression)', () => {
    adapter.show(view());
    const fields = [...surfaceEl().querySelectorAll('textarea')] as HTMLTextAreaElement[];
    expect(fields.some((f) => f.readOnly)).toBe(false);
  });
});

describe('open focus + stale docks (live 2026-08-25: keys dead until a manual click)', () => {
  it('show() makes the dock visible BEFORE the surface renders, so the first focus() really lands', () => {
    adapter.show(view());
    const host = document.getElementById(NEXPATH_DOCK_HOST_ID) as HTMLElement;
    expect(host.style.display).not.toBe('none');
    // Focus inside the shadow retargets: the document sees the HOST as active.
    // Before the ordering fix the host was display:none during render() and
    // focus stayed wherever the page had it (jsdom: body).
    expect(document.activeElement).toBe(host);
    const root = shadowRoots.at(-1)!;
    expect(root.activeElement).toBe(bodyField()); // and the body field holds the keyboard
  });

  it('sweeps dock hosts left by an orphaned content-script generation before mounting its own', () => {
    adapter.destroy();
    const orphan = document.createElement('div');
    orphan.id = NEXPATH_DOCK_HOST_ID;
    document.body.appendChild(orphan);
    adapter = mountNexpathPeDock({ onEvent: (e) => events.push(e) });
    adapter.show(view());
    expect(orphan.isConnected).toBe(false); // the stale twin is gone
    expect(document.querySelectorAll(`#${NEXPATH_DOCK_HOST_ID}`)).toHaveLength(1);
  });
});

describe('apply echo keeps the CLI\'s scrolled-to-the-merge position (live 2026-08-25)', () => {
  it('the show() following a details apply follows the body caret once; other shows never do', async () => {
    const { fieldScroller } = await import('./surfaces/surface-view.js');
    const follow = vi.spyOn(fieldScroller, 'follow').mockImplementation(() => {});
    try {
      adapter.show(view());
      expect(follow).not.toHaveBeenCalled(); // opening never follows (CLI opens at the top)

      // Type details and apply — the controller merges locally and follows its
      // own render; the adapter arms the one-shot for the engine's echo.
      (surfaceEl().querySelectorAll('textarea')[1] as HTMLTextAreaElement).focus();
      // The controller re-renders on row-focus change — re-query the LIVE node.
      const freshDetails = surfaceEl().querySelectorAll('textarea')[1] as HTMLTextAreaElement;
      freshDetails.value = 'echo follow details';
      pressOn(freshDetails, 'Enter');
      expect(commands().some((c) => c?.type === 'edit_body')).toBe(true);
      follow.mockClear();

      adapter.show(view({ viewSeq: 2, bodyText: 'echoed merged body' })); // the engine's echo
      expect(follow).toHaveBeenCalledTimes(1); // one-shot follow on the rebuilt body

      follow.mockClear();
      adapter.show(view({ viewSeq: 3 }));      // any later render
      expect(follow).not.toHaveBeenCalled();   // the shot is spent
    } finally {
      follow.mockRestore();
    }
  });
});

describe('CLI row grammar — full-read parity (2026-08-25 line-by-line audit)', () => {
  it('an unavailable details control still RENDERS its row, marked and read-only (cli-submit-popup.ts:630-639,:777)', () => {
    adapter.show(view({ hasAdditionalDetails: false, detailsAvailable: false }));
    const details = [...surfaceEl().querySelectorAll('textarea')][1] as HTMLTextAreaElement;
    expect(details).toBeTruthy();                       // never hidden
    expect(details.readOnly).toBe(true);                // typing impossible
    expect(surfaceEl().textContent).toContain('Additional details  (unavailable)');
  });

  it('a locked body marks the heading row "(unavailable)" — the CLI\'s lock indicator (:610,:777)', () => {
    adapter.show(view({ bodyEditable: false }));
    expect(surfaceEl().textContent).toContain('Use enhanced prompt  (unavailable)');
  });

  it('an unavailable Use-original row carries the marker (:672,:777)', () => {
    adapter.show(view({ originalAvailable: false }));
    expect(surfaceEl().textContent).toContain('Use original prompt  (unavailable)');
  });

  it('the refinement view shows ONLY the body and "← Go back" (:614-628)', () => {
    const m = peSurfaceModel(view({ refinement: true }));
    expect(m.rows).toHaveLength(2);
    expect(m.rows[0]!.kind).toBe('field');
    expect(m.rows[1]).toMatchObject({ kind: 'action', label: '← Go back', blankBefore: true });
  });

  it('the CLI blank-line rule: blank before details and Go back, NOT before Use original (:769-775)', () => {
    const m = peSurfaceModel(view());
    const details = m.rows.find((r) => r.kind === 'field' && r.label === 'Additional details');
    const useOriginal = m.rows.find((r) => r.kind === 'action' && r.act === 'use-original');
    expect(details && 'blankBefore' in details && details.blankBefore).toBe(true);
    expect(useOriginal && (useOriginal as { blankBefore?: boolean }).blankBefore).toBeUndefined();
  });
});

describe('PEF free-text Other — PE-BR-11 closed (CLI cli-submit-popup.ts:1112,:1164-1166)', () => {
  function openPefViaUseOriginal(): void {
    adapter.show(view());
    rowByLabel('Use original prompt').click();
  }
  function otherField(): HTMLTextAreaElement {
    return surfaceEl().querySelector('textarea') as HTMLTextAreaElement; // PEF's only field
  }

  it('typing into Other and Enter emits feedback_other then the remembered terminal', () => {
    openPefViaUseOriginal();
    otherField().focus();
    const field = otherField(); // re-query after the focus re-render
    field.value = '  needs project names  ';
    pressOn(field, 'Enter');
    expect(commands()).toEqual([
      { type: 'feedback_other', text: 'needs project names' }, // trimmed, CLI :1164
      { type: 'use_original' },
    ]);
  });

  it('empty Other is the CLI silent pending — nothing emitted, PEF stays', () => {
    openPefViaUseOriginal();
    otherField().focus();
    pressOn(otherField(), 'Enter');
    expect(commands()).toHaveLength(0);
    expect(surfaceEl().textContent).toContain('Not relevant enough'); // still PEF
  });

  it('over the 5,000-char cap is silently refused (:1165)', () => {
    openPefViaUseOriginal();
    otherField().focus();
    const field = otherField();
    field.value = 'x'.repeat(5_001);
    pressOn(field, 'Enter');
    expect(commands()).toHaveLength(0);
  });
});

describe('same-body echo preserves the interaction state (CLI :1444-1453)', () => {
  it('keeps row focus and the typed details draft across a rebuild with the same body', () => {
    adapter.show(view());
    ([...surfaceEl().querySelectorAll('textarea')][1] as HTMLTextAreaElement).focus();
    const details = [...surfaceEl().querySelectorAll('textarea')][1] as HTMLTextAreaElement;
    details.value = 'half-typed draft';

    adapter.show(view({ viewSeq: 2, publicNotice: 'a notice' })); // same bodyText echo

    const rebuiltDetails = [...surfaceEl().querySelectorAll('textarea')][1] as HTMLTextAreaElement;
    expect(rebuiltDetails.value).toBe('half-typed draft');           // draft survives
    const root = shadowRoots.at(-1)!;
    expect(root.activeElement).toBe(rebuiltDetails);                 // focus survives
  });

  it('a CHANGED body rebuilds fresh — the CLI resets on a new bodyRevision', () => {
    adapter.show(view());
    ([...surfaceEl().querySelectorAll('textarea')][1] as HTMLTextAreaElement).focus();
    adapter.show(view({ viewSeq: 2, bodyText: 'a different body' }));
    const root = shadowRoots.at(-1)!;
    expect(root.activeElement).toBe(bodyField()); // back to the body row
  });
});

describe('unapplied details are NOT sent (the CLI\'s shipped send semantics)', () => {
  // The plan text said "dirty details disable Use-enhanced"; the SHIPPED CLI
  // reducer does neither disable nor merge — Enter on the body sends the body
  // and typed-but-unapplied details are dropped, with the always-visible hint
  // carrying the warning (cli-submit-popup.ts:1018-1029 + :512). Pin ours to
  // the shipped behaviour, not the plan sentence.
  it('Enter on the body sends the body only; typed-but-unapplied details are excluded', () => {
    adapter.show(view());
    const details = surfaceEl().querySelectorAll('textarea')[1] as HTMLTextAreaElement;
    details.value = 'TYPED BUT NEVER APPLIED';
    const body = bodyField();
    body.focus();
    pressOn(body, 'Enter');
    const cmd = commands()[0] as { type: string; bodyText: string };
    expect(cmd).toMatchObject({ type: 'use_current' });
    expect(cmd.bodyText).toBe('Enhanced body text');
    expect(cmd.bodyText).not.toContain('TYPED BUT NEVER APPLIED');
  });
});

describe('locked bodies explain themselves (tester read a silent read-only popup as broken)', () => {
  it('a locked body shows an always-visible read-only line naming what Enter will do', () => {
    adapter.show(view({ bodyEditable: false }));
    const text = surfaceEl().textContent ?? '';
    expect(text).toContain('Read-only');
    expect(text).toContain('Enter sends this prompt as shown');
  });

  it('an editable body shows the normal edit-keys hint instead, and never the read-only line', () => {
    adapter.show(view());
    const body = bodyField();
    body.focus();
    const text = surfaceEl().textContent ?? '';
    expect(text).not.toContain('Read-only');
  });
});
