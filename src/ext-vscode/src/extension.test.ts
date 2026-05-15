import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mocks for the modules the extension entrypoint imports. `vi.hoisted` is
// required because `vi.mock` is hoisted above import statements, so the mock
// references must live at hoist time too.
const {
  mockShowOnboarding,
  mockRegisterWebviewViewProvider,
  mockProviderCtor,
} = vi.hoisted(() => ({
  mockShowOnboarding: vi.fn(),
  mockRegisterWebviewViewProvider: vi.fn(),
  mockProviderCtor: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: { registerWebviewViewProvider: mockRegisterWebviewViewProvider },
  env: { appName: 'Visual Studio Code' },
  commands: {
    executeCommand: vi.fn(),
    getCommands: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('./onboarding.js', () => ({
  showOnboardingIfNeeded: mockShowOnboarding,
}));
vi.mock('./webview/view-provider.js', () => ({
  VIEW_ID: 'nexpath.status',
  NexpathDecisionSessionViewProvider: class {
    constructor(...args: unknown[]) {
      mockProviderCtor(...args);
    }
  },
}));
vi.mock('./webview/prompt-injection.js', () => ({
  handleOptionSelection: vi.fn(),
}));
vi.mock('./host-detector.js', () => ({
  detectHost: vi.fn(() => 'vscode-generic'),
}));
vi.mock('./chat-input-injector.js', () => ({
  chatInputInject: vi.fn(),
}));

import { activate, deactivate, getViewProvider } from './extension.js';

function makeCtx(): {
  extensionUri: { __uri: true };
  subscriptions: unknown[];
} {
  return { extensionUri: { __uri: true }, subscriptions: [] };
}

describe('activate', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockShowOnboarding.mockReset();
    mockRegisterWebviewViewProvider.mockReset();
    mockProviderCtor.mockReset();
    mockRegisterWebviewViewProvider.mockReturnValue({ dispose: vi.fn() });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs the activation message', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    await activate(makeCtx() as never);
    expect(logSpy).toHaveBeenCalledWith('[nexpath] extension activated');
  });

  it('forwards the ExtensionContext to showOnboardingIfNeeded', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    const ctx = makeCtx();
    await activate(ctx as never);
    expect(mockShowOnboarding).toHaveBeenCalledOnce();
    expect(mockShowOnboarding).toHaveBeenCalledWith(ctx);
  });

  it('constructs the view provider with the extensionUri and registers it under VIEW_ID', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    const ctx = makeCtx();
    await activate(ctx as never);
    expect(mockProviderCtor).toHaveBeenCalledTimes(1);
    expect(mockProviderCtor).toHaveBeenCalledWith(ctx.extensionUri, expect.any(Function));
    expect(mockRegisterWebviewViewProvider).toHaveBeenCalledTimes(1);
    expect(mockRegisterWebviewViewProvider.mock.calls[0]![0]).toBe(
      'nexpath.status',
    );
  });

  it('pushes the registration disposable onto context.subscriptions', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    const fakeDisposable = { dispose: vi.fn() };
    mockRegisterWebviewViewProvider.mockReturnValueOnce(fakeDisposable);
    const ctx = makeCtx();
    await activate(ctx as never);
    expect(ctx.subscriptions).toContain(fakeDisposable);
  });

  it('exposes the constructed provider via getViewProvider()', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    await activate(makeCtx() as never);
    expect(getViewProvider()).toBeDefined();
  });

  it('does not throw when showOnboardingIfNeeded rejects — logs error instead', async () => {
    const err = new Error('boom');
    mockShowOnboarding.mockRejectedValueOnce(err);
    await expect(activate(makeCtx() as never)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('[nexpath] onboarding failed:', err);
  });

  it('still registers the view provider even when onboarding rejects', async () => {
    mockShowOnboarding.mockRejectedValueOnce(new Error('x'));
    await activate(makeCtx() as never);
    expect(mockRegisterWebviewViewProvider).toHaveBeenCalledOnce();
  });

  it('still logs the activation message even when onboarding rejects', async () => {
    mockShowOnboarding.mockRejectedValueOnce(new Error('x'));
    await activate(makeCtx() as never);
    expect(logSpy).toHaveBeenCalledWith('[nexpath] extension activated');
  });
});

describe('deactivate', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockShowOnboarding.mockReset();
    mockRegisterWebviewViewProvider.mockReset();
    mockProviderCtor.mockReset();
    mockRegisterWebviewViewProvider.mockReturnValue({ dispose: vi.fn() });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs the deactivation message', () => {
    deactivate();
    expect(logSpy).toHaveBeenCalledWith('[nexpath] extension deactivated');
  });

  it('returns synchronously without throwing', () => {
    expect(() => deactivate()).not.toThrow();
  });

  it('clears the module-level viewProvider so getViewProvider() returns undefined', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    await activate(makeCtx() as never);
    expect(getViewProvider()).toBeDefined();
    deactivate();
    expect(getViewProvider()).toBeUndefined();
  });
});
