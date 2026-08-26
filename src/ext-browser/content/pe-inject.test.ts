// @vitest-environment jsdom
/**
 * Content-side PE popup wiring — the module that mounts the panel, bridges
 * commands out, keepalives while open, fail-opens on a dead SW (the 12s
 * terminal watchdog), and guards the inject echo. The module registers its
 * window listeners ONCE (like the real content script) — so it is imported
 * once for the file, and each test starts from a torn-down state via a real
 * `pagehide` (the module's own teardown path). Timers are faked; the panel
 * and the inject dispatch are mocked so this file tests ONLY the wiring
 * contracts (the panel's behaviour lives in ui/pe-panel.test.ts, the dispatch
 * table in inject-dispatch.test.ts).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PePanelEventV1, PePanelViewV1 } from '../ui/pe-contract.js';

const { injectPromptTextMock, showToastMock, controller, mountMock } = vi.hoisted(() => {
  const controller = {
    openFlag: false,
    show: vi.fn(),
    setBusy: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    isOpen: vi.fn(),
    collectingFlag: false,
    isCollectingFeedback: vi.fn(),
  };
  return {
    injectPromptTextMock: vi.fn(),
    showToastMock: vi.fn(),
    controller,
    mountMock: vi.fn(),
  };
});
vi.mock('./inject-dispatch.js', () => ({ injectPromptText: injectPromptTextMock }));
const showStickyNoticeMock = vi.fn();
const dismissStickyNoticeMock = vi.fn();
vi.mock('./agents/inject-kit.js', () => ({
  showToast: showToastMock,
  showStickyNotice: showStickyNoticeMock,
  dismissStickyNotice: dismissStickyNoticeMock,
}));
vi.mock('../ui/pe-dock-adapter.js', () => ({ mountNexpathPeDock: mountMock }));

let onEvent: (event: PePanelEventV1) => void;
let onTerminalIntent: ((outcome: string) => void) | undefined;
const liveSpies: Array<[string, EventListener]> = [];

function view(seq = 1): PePanelViewV1 {
  return {
    schemaVersion: 1, viewSeq: seq, title: 't', editorHeading: 'h',
    bodyText: 'b', bodyEditable: true, hasAdditionalDetails: false,
    additionalDetailsText: '', directional: [], refinement: false,
    hasFeedback: false, trustCues: [],
  };
}

function dispatchSwMessage(detail: unknown): void {
  window.dispatchEvent(new CustomEvent('nexpath:sw-message', { detail }));
}

function showPe(seq = 1): void {
  dispatchSwMessage({ type: 'nexpath:show-pe', projectRoot: 'https://bolt.new/~/p', payload: view(seq) });
}

/** Record dispatches of a window CustomEvent; auto-removed after each test. */
function spyEvent(name: string): { calls: unknown[] } {
  const rec = { calls: [] as unknown[] };
  const handler: EventListener = (ev) => { rec.calls.push((ev as CustomEvent<unknown>).detail ?? null); };
  window.addEventListener(name, handler);
  liveSpies.push([name, handler]);
  return rec;
}

beforeAll(async () => {
  (await import('./pe-inject.js')).setupPeListener();
});

beforeEach(() => {
  // The module's own teardown path resets its internal state (controller/host/
  // timers null) so every test starts from "nothing mounted".
  window.dispatchEvent(new Event('pagehide'));
  vi.clearAllMocks();
  vi.useFakeTimers();
  injectPromptTextMock.mockResolvedValue(undefined);
  controller.openFlag = false;
  controller.show.mockImplementation(() => { controller.openFlag = true; });
  controller.hide.mockImplementation(() => { controller.openFlag = false; });
  controller.isOpen.mockImplementation(() => controller.openFlag);
  controller.collectingFlag = false;
  controller.isCollectingFeedback.mockImplementation(() => controller.collectingFlag);
  mountMock.mockImplementation((opts: {
    onEvent: typeof onEvent;
    onTerminalIntent?: (o: string) => void;
  }) => {
    onEvent = opts.onEvent;
    onTerminalIntent = opts.onTerminalIntent;
    return controller;
  });
});

afterEach(() => {
  for (const [name, handler] of liveSpies.splice(0)) window.removeEventListener(name, handler);
  vi.useRealTimers();
});

describe('show-pe handling', () => {
  it('mounts the dock adapter once, shows the view, and acks AFTER the mount', () => {
    const ack = spyEvent('nexpath:pe-view-ack');
    showPe();
    expect(mountMock).toHaveBeenCalledTimes(1);
    expect(controller.show).toHaveBeenCalledWith(expect.objectContaining({ viewSeq: 1 }));
    expect(ack.calls).toHaveLength(1);
    showPe(2); // a re-render reuses the mount
    expect(mountMock).toHaveBeenCalledTimes(1);
    expect(controller.show).toHaveBeenCalledTimes(2);
  });

  it('a schemaVersion mismatch is ignored — no show, no ack', () => {
    const ack = spyEvent('nexpath:pe-view-ack');
    dispatchSwMessage({ type: 'nexpath:show-pe', projectRoot: 'r', payload: { ...view(), schemaVersion: 99 } });
    expect(controller.show).not.toHaveBeenCalled();
    expect(ack.calls).toHaveLength(0);
  });

  it('keepalives every 20s while open and stops after close', () => {
    const beat = spyEvent('nexpath:pe-keepalive-out');
    showPe();
    vi.advanceTimersByTime(60_000);
    expect(beat.calls).toHaveLength(3);
    dispatchSwMessage({ type: 'nexpath:pe-close', projectRoot: 'r' });
    vi.advanceTimersByTime(60_000);
    expect(beat.calls).toHaveLength(3); // no beats after the panel closed
  });
});

describe('command bridging', () => {
  it('a non-terminal command sets busy and goes out with its viewSeq', () => {
    const out = spyEvent('nexpath:pe-command-out');
    showPe(4);
    onEvent({ type: 'command', viewSeq: 4, command: { type: 'shorter', bodyText: 'b' } });
    expect(controller.setBusy).toHaveBeenCalledWith(true);
    expect(out.calls[0]).toEqual({ viewSeq: 4, command: { type: 'shorter', bodyText: 'b' } });
  });

  it('feedback_suggested goes out WITHOUT busy (non-terminal, no re-render comes)', () => {
    const out = spyEvent('nexpath:pe-command-out');
    showPe();
    onEvent({ type: 'command', viewSeq: 1, command: { type: 'feedback_suggested', category: 'not_relevant_enough' } });
    expect(controller.setBusy).not.toHaveBeenCalled();
    expect(out.calls).toHaveLength(1);
  });

  it('a move event is a no-op (the dock owns its geometry; contract still carries the type)', () => {
    showPe();
    expect(() => onEvent({ type: 'move', dx: 30, dy: -10 })).not.toThrow();
  });
});

describe('terminal watchdog (A3 fail-open — a dead SW must never send text)', () => {
  it('a terminal command arms the watchdog; no SW answer within 12s closes with the nothing-sent toast', () => {
    const notice = spyEvent('nexpath:pe-terminal-out');
    showPe();
    onEvent({ type: 'command', viewSeq: 1, command: { type: 'use_current', bodyText: 'b' } });
    expect(notice.calls[0]).toEqual({ outcome: 'use_current' });
    vi.advanceTimersByTime(11_999);
    expect(controller.hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(showToastMock).toHaveBeenCalledWith(expect.stringContaining('nothing was sent'));
    expect(controller.hide).toHaveBeenCalled();
    expect(injectPromptTextMock).not.toHaveBeenCalled(); // fail-open NEVER injects locally
  });

  it('a fresh view from the SW clears the watchdog (the SW answered)', () => {
    showPe();
    onEvent({ type: 'command', viewSeq: 1, command: { type: 'use_original' } });
    showPe(2); // the SW responded with a re-render
    vi.advanceTimersByTime(30_000);
    expect(showToastMock).not.toHaveBeenCalled();
  });
});

describe('pe-inject (the accepted enhanced body arrives)', () => {
  it('dispatches the echo-guard notice BEFORE injecting, closes the panel, injects the exact text', () => {
    const order: string[] = [];
    const guardHandler: EventListener = () => order.push('echo-guard');
    window.addEventListener('nexpath:prompt-injected-notice', guardHandler);
    liveSpies.push(['nexpath:prompt-injected-notice', guardHandler]);
    injectPromptTextMock.mockImplementation(async () => { order.push('inject'); });
    showPe();
    dispatchSwMessage({ type: 'nexpath:pe-inject', projectRoot: 'r', text: 'THE ENHANCED BODY' });
    expect(order).toEqual(['echo-guard', 'inject']);
    expect(injectPromptTextMock).toHaveBeenCalledWith('THE ENHANCED BODY');
    expect(controller.hide).toHaveBeenCalled();
  });

  it('the echo-guard notice carries the injected text (the SW records it as last-seen)', () => {
    const guard = spyEvent('nexpath:prompt-injected-notice');
    showPe();
    dispatchSwMessage({ type: 'nexpath:pe-inject', projectRoot: 'r', text: 'X' });
    expect(guard.calls[0]).toEqual({ text: 'X' });
  });
});

describe('pagehide teardown', () => {
  it('destroys the controller, removes the host, and stops all timers', () => {
    const beat = spyEvent('nexpath:pe-keepalive-out');
    showPe();
    window.dispatchEvent(new Event('pagehide'));
    expect(controller.destroy).toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(beat.calls).toHaveLength(0);
  });

  describe('the held notice (shown only when a popup is actually coming)', () => {
    it('pe-preparing shows a notice that STAYS — the wait can be far longer than a toast', () => {
      dispatchSwMessage({ type: 'nexpath:pe-preparing', projectRoot: 'https://bolt.new/~/p' });
      expect(showStickyNoticeMock).toHaveBeenCalledTimes(1);
      expect(String(showStickyNoticeMock.mock.calls[0]![0])).toMatch(/not been sent/i);
    });

    it('the popup replaces the notice', () => {
      dispatchSwMessage({ type: 'nexpath:pe-preparing', projectRoot: 'https://bolt.new/~/p' });
      showPe();
      expect(dismissStickyNoticeMock).toHaveBeenCalled();
    });

    it('a close dismisses it too — a hold that ends without a popup leaves nothing behind', () => {
      dispatchSwMessage({ type: 'nexpath:pe-preparing', projectRoot: 'https://bolt.new/~/p' });
      dispatchSwMessage({ type: 'nexpath:pe-close', projectRoot: 'https://bolt.new/~/p' });
      expect(dismissStickyNoticeMock).toHaveBeenCalled();
    });

    it('is NOT shown by any other message', () => {
      showPe();
      dispatchSwMessage({ type: 'nexpath:pe-close', projectRoot: 'https://bolt.new/~/p' });
      expect(showStickyNoticeMock).not.toHaveBeenCalled();
    });
  });
});

// ── EARLY RELEASE OF A HELD PROMPT ────────────────────────────────────────────
// "Use original prompt" shows a satisfaction step BEFORE emitting its command,
// and on the submit path the prompt is held until that command lands. The panel
// announces the decision as it is made so the worker can release the prompt
// straight away — which means a close now arrives while the user is still
// answering, and must not tear the question off the screen.
describe('announcing a terminal decision early', () => {
  it('forwards the intent over the same one-way channel a terminal click uses', () => {
    const out = spyEvent('nexpath:pe-terminal-out');
    showPe();
    onTerminalIntent!('use_original');
    expect(out.calls).toEqual([{ outcome: 'use_original' }]);
  });

  it('does NOT arm the terminal watchdog — nothing is pending and the panel is live', () => {
    showPe();
    onTerminalIntent!('use_original');
    vi.advanceTimersByTime(60_000);
    expect(controller.hide).not.toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('a close arriving DURING the feedback step is ignored — the question stays up', () => {
    showPe();
    onTerminalIntent!('use_original');
    controller.collectingFlag = true;               // PEF on screen
    // The gate closes the popup as it re-issues the original prompt.
    dispatchSwMessage({ type: 'nexpath:pe-close', projectRoot: 'https://bolt.new/~/p' });
    expect(controller.hide).not.toHaveBeenCalled();
  });

  it('the close that follows the real terminal command DOES close it', () => {
    showPe();
    onTerminalIntent!('use_original');
    controller.collectingFlag = true;
    dispatchSwMessage({ type: 'nexpath:pe-close', projectRoot: 'https://bolt.new/~/p' });
    controller.collectingFlag = false;             // feedback given → command emitted
    dispatchSwMessage({ type: 'nexpath:pe-close', projectRoot: 'https://bolt.new/~/p' });
    expect(controller.hide).toHaveBeenCalledTimes(1);
  });

  it('an ordinary close still closes — the guard is scoped to the feedback step alone', () => {
    showPe();
    dispatchSwMessage({ type: 'nexpath:pe-close', projectRoot: 'https://bolt.new/~/p' });
    expect(controller.hide).toHaveBeenCalledTimes(1);
  });

  it('a panel host without the accessor is never treated as collecting feedback', () => {
    showPe();
    controller.isCollectingFeedback.mockReturnValue(undefined as unknown as boolean);
    dispatchSwMessage({ type: 'nexpath:pe-close', projectRoot: 'https://bolt.new/~/p' });
    expect(controller.hide).toHaveBeenCalledTimes(1);
  });

  it('the stuck-forever path: with no announcement the prompt has nothing to release it', () => {
    // Guards the wiring itself — the option must reach the mount, or the whole
    // early release is dead code.
    showPe();
    expect(onTerminalIntent).toBeTypeOf('function');
  });
});
