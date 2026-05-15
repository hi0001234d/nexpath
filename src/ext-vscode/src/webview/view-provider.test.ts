import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({}));

import {
  NexpathDecisionSessionViewProvider,
  VIEW_ID,
} from './view-provider.js';
import type { DecisionSessionPayload } from '../ipc.js';

interface FakeWebview {
  options: unknown;
  html: string;
  cspSource: string;
  onDidReceiveMessage: ReturnType<typeof vi.fn>;
  __messageListener: ((m: unknown) => void) | undefined;
}

interface FakeWebviewView {
  webview: FakeWebview;
  show: ReturnType<typeof vi.fn>;
  onDidDispose: ReturnType<typeof vi.fn>;
  __disposeListener: (() => void) | undefined;
}

function makeFakeView(): FakeWebviewView {
  const view: FakeWebviewView = {
    webview: {
      options: undefined,
      html: '',
      cspSource: 'vscode-resource:csp-source',
      onDidReceiveMessage: vi.fn((fn: (m: unknown) => void) => {
        view.webview.__messageListener = fn;
        return { dispose: vi.fn() };
      }),
      __messageListener: undefined,
    },
    show: vi.fn(),
    onDidDispose: vi.fn((fn: () => void) => {
      view.__disposeListener = fn;
      return { dispose: vi.fn() };
    }),
    __disposeListener: undefined,
  };
  return view;
}

const fakeUri = { fsPath: '/fake/extension' } as unknown as never;

const payload: DecisionSessionPayload = {
  advisory: 'Be specific about the change.',
  options: [
    { id: 'opt-1', label: 'Refine the request' },
    { id: 'opt-2', label: 'Proceed anyway' },
  ],
};

describe('NexpathDecisionSessionViewProvider', () => {
  describe('VIEW_ID', () => {
    it('matches the package.json view declaration', () => {
      expect(VIEW_ID).toBe('nexpath.status');
    });
  });

  describe('resolveWebviewView', () => {
    it('sets webview.options with enableScripts and localResourceRoots', () => {
      const provider = new NexpathDecisionSessionViewProvider(fakeUri);
      const view = makeFakeView();
      provider.resolveWebviewView(view as never, {} as never, {} as never);
      const opts = view.webview.options as {
        enableScripts: boolean;
        localResourceRoots: unknown[];
      };
      expect(opts.enableScripts).toBe(true);
      expect(opts.localResourceRoots).toEqual([fakeUri]);
    });

    it('renders the empty-state HTML when no payload has been published', () => {
      const provider = new NexpathDecisionSessionViewProvider(fakeUri);
      const view = makeFakeView();
      provider.resolveWebviewView(view as never, {} as never, {} as never);
      expect(view.webview.html).toContain('Nexpath is active');
      expect(view.webview.html).not.toContain('Be specific about the change.');
    });

    it('renders a previously-published payload when the view resolves later', () => {
      const provider = new NexpathDecisionSessionViewProvider(fakeUri);
      provider.publishPayload(payload); // before resolve
      const view = makeFakeView();
      provider.resolveWebviewView(view as never, {} as never, {} as never);
      expect(view.webview.html).toContain('Be specific about the change.');
      expect(view.webview.html).toContain('Refine the request');
    });

    it('registers an onDidDispose handler that clears the view reference', () => {
      const provider = new NexpathDecisionSessionViewProvider(fakeUri);
      const view = makeFakeView();
      provider.resolveWebviewView(view as never, {} as never, {} as never);
      expect(view.onDidDispose).toHaveBeenCalledOnce();
      view.__disposeListener!();
      // After dispose, publishPayload should not touch a stale view
      const sentinel = view.webview.html;
      provider.publishPayload(payload);
      expect(view.webview.html).toBe(sentinel); // unchanged — view was released
    });
  });

  describe('publishPayload', () => {
    it('stores the payload even before any view is resolved', () => {
      const provider = new NexpathDecisionSessionViewProvider(fakeUri);
      provider.publishPayload(payload);
      expect(provider.getCurrentPayload()).toEqual(payload);
    });

    it('updates the resolved view HTML to the payload-state HTML', () => {
      const provider = new NexpathDecisionSessionViewProvider(fakeUri);
      const view = makeFakeView();
      provider.resolveWebviewView(view as never, {} as never, {} as never);
      provider.publishPayload(payload);
      expect(view.webview.html).toContain('Be specific about the change.');
    });

    it('auto-reveals the view via show(true)', () => {
      const provider = new NexpathDecisionSessionViewProvider(fakeUri);
      const view = makeFakeView();
      provider.resolveWebviewView(view as never, {} as never, {} as never);
      provider.publishPayload(payload);
      expect(view.show).toHaveBeenCalledWith(true);
    });

    it('a second publishPayload replaces the first (no stacking)', () => {
      const provider = new NexpathDecisionSessionViewProvider(fakeUri);
      const view = makeFakeView();
      provider.resolveWebviewView(view as never, {} as never, {} as never);
      const first: DecisionSessionPayload = {
        advisory: 'FIRST advisory text here',
        options: [{ id: 'a', label: 'first-only' }],
      };
      const second: DecisionSessionPayload = {
        advisory: 'SECOND advisory text here',
        options: [{ id: 'b', label: 'second-only' }],
      };
      provider.publishPayload(first);
      provider.publishPayload(second);
      expect(provider.getCurrentPayload()).toBe(second);
      expect(view.webview.html).toContain('SECOND advisory text here');
      expect(view.webview.html).toContain('second-only');
      expect(view.webview.html).not.toContain('FIRST advisory text here');
      expect(view.webview.html).not.toContain('first-only');
      expect(view.show).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearPayload', () => {
    it('drops the stored payload and re-renders the empty state', () => {
      const provider = new NexpathDecisionSessionViewProvider(fakeUri);
      const view = makeFakeView();
      provider.resolveWebviewView(view as never, {} as never, {} as never);
      provider.publishPayload(payload);
      provider.clearPayload();
      expect(provider.getCurrentPayload()).toBeNull();
      expect(view.webview.html).toContain('Nexpath is active');
      expect(view.webview.html).not.toContain('Be specific about the change.');
    });
  });

  describe('handleMessage (message routing)', () => {
    it('forwards a "select" message with optionLabel to onSelect', async () => {
      const onSelect = vi.fn().mockResolvedValue(undefined);
      const provider = new NexpathDecisionSessionViewProvider(fakeUri, onSelect);
      await provider.handleMessage({
        type: 'select',
        optionId: 'opt-1',
        optionLabel: 'Refine the request',
      });
      expect(onSelect).toHaveBeenCalledWith('Refine the request');
    });

    it('ignores a "select" message that has no string optionLabel', async () => {
      const onSelect = vi.fn().mockResolvedValue(undefined);
      const provider = new NexpathDecisionSessionViewProvider(fakeUri, onSelect);
      await provider.handleMessage({ type: 'select', optionId: 'opt-1' });
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('a "dismiss" message clears the current payload', async () => {
      const onSelect = vi.fn().mockResolvedValue(undefined);
      const provider = new NexpathDecisionSessionViewProvider(fakeUri, onSelect);
      provider.publishPayload(payload);
      await provider.handleMessage({ type: 'dismiss' });
      expect(provider.getCurrentPayload()).toBeNull();
    });

    it('ignores unknown / malformed messages without throwing', async () => {
      const onSelect = vi.fn().mockResolvedValue(undefined);
      const provider = new NexpathDecisionSessionViewProvider(fakeUri, onSelect);
      await expect(provider.handleMessage(null)).resolves.toBeUndefined();
      await expect(provider.handleMessage(undefined)).resolves.toBeUndefined();
      await expect(provider.handleMessage('string')).resolves.toBeUndefined();
      await expect(provider.handleMessage({ type: 'bogus' })).resolves.toBeUndefined();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('catches errors from onSelect so they never become unhandled rejections', async () => {
      const onSelect = vi.fn().mockRejectedValue(new Error('inject blew up'));
      const provider = new NexpathDecisionSessionViewProvider(fakeUri, onSelect);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(
        provider.handleMessage({ type: 'select', optionLabel: 'x' }),
      ).resolves.toBeUndefined();
      expect(onSelect).toHaveBeenCalledOnce();
      expect(errSpy).toHaveBeenCalledWith(
        '[nexpath] onSelect failed:',
        expect.any(Error),
      );
      errSpy.mockRestore();
    });

    it('routes messages from the webview via the registered listener', async () => {
      const onSelect = vi.fn().mockResolvedValue(undefined);
      const provider = new NexpathDecisionSessionViewProvider(fakeUri, onSelect);
      const view = makeFakeView();
      provider.resolveWebviewView(view as never, {} as never, {} as never);
      expect(view.webview.__messageListener).toBeDefined();
      view.webview.__messageListener!({
        type: 'select',
        optionLabel: 'from-webview',
      });
      // Listener fires synchronously but onSelect resolution is async.
      await new Promise((r) => setTimeout(r, 5));
      expect(onSelect).toHaveBeenCalledWith('from-webview');
    });
  });
});
