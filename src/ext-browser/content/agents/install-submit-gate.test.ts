// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockAddListener, mockSendMessage, mockSetInterceptor } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockAddListener: vi.fn(), mockSendMessage: vi.fn(), mockSetInterceptor: vi.fn(),
}));
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: { local: { get: mockGet }, onChanged: { addListener: mockAddListener } },
    runtime: { sendMessage: mockSendMessage },
  },
}));
vi.mock('./capture-kit.js', () => ({ setComposerSubmitInterceptor: mockSetInterceptor }));

import { installSubmitGate } from './install-submit-gate.js';
import { SITE_SUBSTITUTION_STRATEGY } from '../../inject/submit-substitution.js';

/** The interceptor the installer handed to capture-kit. */
type Interceptor = (
  ev: Event, prompt: string, input: HTMLElement,
  composer: { readComposerText: (el: HTMLElement) => string },
) => boolean;

function lastInterceptor(): Interceptor {
  return mockSetInterceptor.mock.calls.at(-1)![0] as Interceptor;
}

function makeEvent() {
  return {
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as Event;
}

const COMPOSER = { readComposerText: () => 'ship this to production now' };
const INPUT = {} as HTMLElement;

/** Let the installer's async switch resolution settle. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.clearAllMocks();
  // Nothing in storage ⇒ the switch resolves to its shipped default: ON.
  mockGet.mockResolvedValue({});
  // Real jsdom window (the gate dispatches a CustomEvent to close the panel);
  // only `location` needs to look like a project page.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { hostname: 'bolt.new', pathname: '/~/p1', origin: 'https://bolt.new' },
  });
  vi.spyOn(document, 'querySelector').mockReturnValue({ click: vi.fn() } as unknown as Element);
});

describe('installSubmitGate — exactly one gate may own a site', () => {
  it('a COMPOSER-mechanism site is intercepted when the switch is on', async () => {
    expect(SITE_SUBSTITUTION_STRATEGY['bolt']).toBe('composer_intercept');
    installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText: vi.fn() });
    await settle();

    const ev = makeEvent();
    expect(lastInterceptor()(ev, 'ship this to production now', INPUT, COMPOSER)).toBe(true);
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('a BODY-REWRITE site is NOT intercepted, even with the switch on', async () => {
    // Lovable is rewritten by the page's fetch patch. If this gate also took the
    // submission, one prompt would be decided twice — and on Lovable it would
    // also cancel the very request the rewrite path needs to hold.
    expect(SITE_SUBSTITUTION_STRATEGY['lovable']).toBe('body_rewrite');
    installSubmitGate({ agent: 'lovable', submitButtonSelector: '#send', injectPromptText: vi.fn() });
    await settle();

    const ev = makeEvent();
    expect(lastInterceptor()(ev, 'ship this to production now', INPUT, COMPOSER)).toBe(false);
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it('follows the table rather than the agent name — flipping a site flips the gate', async () => {
    const prev = SITE_SUBSTITUTION_STRATEGY['bolt'];
    try {
      SITE_SUBSTITUTION_STRATEGY['bolt'] = 'body_rewrite';
      installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText: vi.fn() });
      await settle();
      expect(lastInterceptor()(makeEvent(), 'ship this to production now', INPUT, COMPOSER)).toBe(false);
    } finally {
      SITE_SUBSTITUTION_STRATEGY['bolt'] = prev!;
    }
  });

  it('an explicitly disabled site is not intercepted', async () => {
    mockGet.mockResolvedValue({ bolt_promptsubmit_advisory: 'false' });
    installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText: vi.fn() });
    await settle();
    expect(lastInterceptor()(makeEvent(), 'ship this to production now', INPUT, COMPOSER)).toBe(false);
  });

  it('does not intercept before the switch has resolved', () => {
    installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText: vi.fn() });
    // No await: storage has not answered yet, so the page must behave as today.
    expect(lastInterceptor()(makeEvent(), 'ship this to production now', INPUT, COMPOSER)).toBe(false);
  });

  describe('surviving a long hold (live-caught on Firefox: the worker died mid-popup)', () => {
    it('heartbeats the worker while the decision is outstanding', async () => {
      vi.useFakeTimers();
      try {
        installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText: vi.fn() });
        // Let the switch resolve under fake timers.
        await vi.advanceTimersByTimeAsync(0);
        mockSendMessage.mockReturnValue(new Promise(() => {})); // decision never answers

        lastInterceptor()(makeEvent(), 'ship this to production now', INPUT, COMPOSER);
        await vi.advanceTimersByTimeAsync(35_000);

        const beats = mockSendMessage.mock.calls
          .map((c) => c[0] as { type?: string })
          .filter((m) => m.type === 'nexpath:pe-keepalive');
        // 35s at a 10s cadence — comfortably inside Firefox's teardown window.
        expect(beats.length).toBeGreaterThanOrEqual(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it('stops heartbeating once the decision resolves', async () => {
      vi.useFakeTimers();
      try {
        installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText: vi.fn() });
        await vi.advanceTimersByTimeAsync(0);
        mockSendMessage.mockResolvedValue({ decision: { kind: 'allow' } });

        lastInterceptor()(makeEvent(), 'ship this to production now', INPUT, COMPOSER);
        await vi.advanceTimersByTimeAsync(1_000);
        const afterResolve = mockSendMessage.mock.calls.filter(
          (c) => (c[0] as { type?: string }).type === 'nexpath:pe-keepalive').length;

        await vi.advanceTimersByTimeAsync(60_000);
        const later = mockSendMessage.mock.calls.filter(
          (c) => (c[0] as { type?: string }).type === 'nexpath:pe-keepalive').length;
        expect(later).toBe(afterResolve); // no beats after it settled
      } finally {
        vi.useRealTimers();
      }
    });

    it('closes the panel when the original is released — never leave a dead popup on screen', async () => {
      const dispatched: string[] = [];
      const realDispatch = window.dispatchEvent.bind(window);
      vi.spyOn(window, 'dispatchEvent').mockImplementation((e: Event) => {
        const d = (e as CustomEvent<{ type?: string }>).detail;
        if (e.type === 'nexpath:sw-message' && d?.type) dispatched.push(d.type);
        return realDispatch(e);
      });

      installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText: vi.fn() });
      await settle();
      mockSendMessage.mockResolvedValue({ decision: { kind: 'allow' } });

      lastInterceptor()(makeEvent(), 'ship this to production now', INPUT, COMPOSER);
      await vi.waitFor(() => expect(dispatched).toContain('nexpath:pe-close'));
    });
  });

  it('marks the replacement as injected BEFORE delivering it', async () => {
    const injectPromptText = vi.fn().mockResolvedValue(undefined);
    installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText });
    await settle();
    mockSendMessage.mockResolvedValue({ decision: { kind: 'block', replacement: 'the improved prompt' } });

    lastInterceptor()(makeEvent(), 'ship this to production now', INPUT, COMPOSER);
    await vi.waitFor(() => expect(injectPromptText).toHaveBeenCalledWith('the improved prompt'));

    const marks = mockSendMessage.mock.calls
      .map((c) => c[0] as { type?: string; text?: string })
      .filter((m) => m.type === 'nexpath:prompt-injected');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.text).toBe('the improved prompt');
  });

  /**
   * An inject that degraded to the clipboard KNOWS it did. This used to report
   * success regardless, so the gate then spent its whole send-verification
   * window hunting the composer for text it had already been told was never put
   * there — seconds of waiting for an answer available immediately.
   */
  describe('the delivery outcome the injector reports', () => {
    /** Every submit-flow event the gate emitted through the worker channel. */
    const emitted = (): string[] => mockSendMessage.mock.calls
      .map((c) => c[0] as { type?: string; event?: string })
      .filter((m) => m.type === 'nexpath:submit-flow-event')
      .map((m) => m.event ?? '');

    /** A composer whose text the test controls, so a send can be observed. */
    function controllableComposer(initial: string) {
      let text = initial;
      return {
        composer: { readComposerText: () => text },
        set: (t: string) => { text = t; },
      };
    }

    it('⭐ FALSE is taken at its word — failed immediately, without a verification window', async () => {
      const { composer } = controllableComposer('ship this to production now');
      // Degraded to the clipboard: the replacement was never put in the composer.
      const injectPromptText = vi.fn().mockResolvedValue(false);
      installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText });
      await settle();
      mockSendMessage.mockResolvedValue({ decision: { kind: 'block', replacement: 'the improved prompt' } });

      lastInterceptor()(makeEvent(), 'ship this to production now', INPUT, composer);
      await vi.waitFor(() => expect(emitted()).toContain('submit_hold_substitution_failed'));
      expect(emitted()).not.toContain('submit_replacement_sent');
    });

    it('reporting NOTHING is read as success — an injector that says nothing keeps today\'s behaviour', async () => {
      const { composer, set } = controllableComposer('ship this to production now');
      // Delivered and sent, and says nothing about it — the shipped shape.
      const injectPromptText = vi.fn(async () => { set(''); });
      installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText });
      await settle();
      mockSendMessage.mockResolvedValue({ decision: { kind: 'block', replacement: 'the improved prompt' } });

      lastInterceptor()(makeEvent(), 'ship this to production now', INPUT, composer);
      await vi.waitFor(() => expect(emitted()).toContain('submit_replacement_sent'));
      expect(emitted()).not.toContain('submit_hold_substitution_failed');
    });
  });

  describe('re-issuing the original (live: "Use original" left the prompt stuck)', () => {
    function composerWith(text: string): HTMLElement {
      const el = document.createElement('div');
      el.textContent = text;
      document.body.appendChild(el);
      return el;
    }

    it('presses the send control', async () => {
      const btn = { click: vi.fn() } as unknown as HTMLElement;
      vi.spyOn(document, 'querySelector').mockReturnValue(btn as unknown as Element);
      installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText: vi.fn() });
      await settle();
      mockSendMessage.mockResolvedValue({ decision: { kind: 'allow' } });

      lastInterceptor()(makeEvent(), 'ship it now', INPUT, COMPOSER);
      await vi.waitFor(() => expect((btn as unknown as { click: ReturnType<typeof vi.fn> }).click).toHaveBeenCalled());
    });

    it('falls back to Enter when the composer STILL holds the text after the click', async () => {
      // This is the reported failure: the button click did nothing and the
      // prompt sat in the composer unsent. We already cancelled the user's own
      // submit, so silence here costs them their prompt.
      const composer = composerWith('ship it now');
      const keys: string[] = [];
      composer.addEventListener('keydown', (e) => keys.push((e as KeyboardEvent).key));
      vi.spyOn(document, 'querySelector').mockReturnValue({ click: vi.fn() } as unknown as Element);

      installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText: vi.fn() });
      await settle();
      mockSendMessage.mockResolvedValue({ decision: { kind: 'allow' } });

      lastInterceptor()(makeEvent(), 'ship it now', composer, {
        readComposerText: () => composer.textContent ?? '',
      });
      await vi.waitFor(() => expect(keys).toContain('Enter'), { timeout: 3000 });
    });

    it('does NOT press Enter when the click already sent it', async () => {
      const composer = composerWith('ship it now');
      const keys: string[] = [];
      composer.addEventListener('keydown', (e) => keys.push((e as KeyboardEvent).key));
      vi.spyOn(document, 'querySelector').mockReturnValue({
        click: () => { composer.textContent = ''; },   // the site accepted it
      } as unknown as Element);

      installSubmitGate({ agent: 'bolt', submitButtonSelector: '#send', injectPromptText: vi.fn() });
      await settle();
      mockSendMessage.mockResolvedValue({ decision: { kind: 'allow' } });

      lastInterceptor()(makeEvent(), 'ship it now', composer, {
        readComposerText: () => composer.textContent ?? '',
      });
      await new Promise((r) => setTimeout(r, 900));
      expect(keys).not.toContain('Enter');
    });
  });
});
