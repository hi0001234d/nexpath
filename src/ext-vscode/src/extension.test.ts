import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// vi.hoisted lets the mocks declared here be referenced from the vi.mock
// factories below (which are themselves hoisted above the import block).
const {
  mockShowOnboarding,
  mockRegisterWebviewViewProvider,
  mockProviderCtor,
  mockDetectHost,
  mockWorkspaceStorageDir,
  mockEnumerateStateVscdbPaths,
  mockCreateChatHistoryWatcher,
  mockWatcherStart,
  mockWatcherStop,
  mockCreateChatEventHandler,
  mockShowInformationMessage,
} = vi.hoisted(() => ({
  mockShowOnboarding: vi.fn(),
  mockRegisterWebviewViewProvider: vi.fn(),
  mockProviderCtor: vi.fn(),
  mockDetectHost: vi.fn(() => 'vscode-generic'),
  mockWorkspaceStorageDir: vi.fn(() => null),
  mockEnumerateStateVscdbPaths: vi.fn(() => []),
  mockCreateChatHistoryWatcher: vi.fn(),
  mockWatcherStart: vi.fn(),
  mockWatcherStop: vi.fn(),
  mockCreateChatEventHandler: vi.fn(() => vi.fn()),
  mockShowInformationMessage: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    registerWebviewViewProvider: mockRegisterWebviewViewProvider,
    showInformationMessage: mockShowInformationMessage,
  },
  workspace: {
    workspaceFolders: undefined,
  },
  env: { appName: 'Visual Studio Code' },
  commands: {
    executeCommand: vi.fn(),
    getCommands: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('./onboarding.js', () => ({
  CONSENT_KEY: 'nexpath.consentGranted',
  showOnboardingIfNeeded: mockShowOnboarding,
}));
vi.mock('./webview/view-provider.js', () => ({
  VIEW_ID: 'nexpath.status',
  NexpathDecisionSessionViewProvider: class {
    constructor(...args: unknown[]) {
      mockProviderCtor(...args);
    }
    publishPayload(): void {}
  },
}));
vi.mock('./webview/prompt-injection.js', () => ({
  handleOptionSelection: vi.fn(),
}));
vi.mock('./host-detector.js', () => ({
  detectHost: mockDetectHost,
  workspaceStorageDir: mockWorkspaceStorageDir,
}));
vi.mock('./chat-input-injector.js', () => ({
  chatInputInject: vi.fn(),
}));
vi.mock('./path-enumerator.js', () => ({
  enumerateStateVscdbPaths: mockEnumerateStateVscdbPaths,
}));
vi.mock('./chat-history-watcher.js', () => ({
  createChatHistoryWatcher: mockCreateChatHistoryWatcher,
}));
vi.mock('./chat-pipeline.js', () => ({
  createChatEventHandler: mockCreateChatEventHandler,
}));
vi.mock('./ipc.js', () => ({
  spawnAuto: vi.fn(),
  spawnStop: vi.fn(),
}));

import { activate, deactivate, getViewProvider } from './extension.js';

interface FakeContext {
  extensionUri: { __uri: true };
  subscriptions: unknown[];
  globalState: { get: <T>(k: string) => T | undefined };
}

function makeCtx(consent: boolean | undefined = undefined): FakeContext {
  return {
    extensionUri: { __uri: true },
    subscriptions: [],
    globalState: {
      get: <T>(k: string) =>
        (k === 'nexpath.consentGranted' ? (consent as T) : undefined) as
          | T
          | undefined,
    },
  };
}

describe('activate', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockShowOnboarding.mockReset();
    mockRegisterWebviewViewProvider.mockReset();
    mockProviderCtor.mockReset();
    mockDetectHost.mockReset().mockReturnValue('vscode-generic');
    mockWorkspaceStorageDir.mockReset().mockReturnValue(null);
    mockEnumerateStateVscdbPaths.mockReset().mockReturnValue([]);
    mockCreateChatHistoryWatcher.mockReset().mockReturnValue({
      start: mockWatcherStart,
      stop: mockWatcherStop,
    });
    mockWatcherStart.mockReset();
    mockWatcherStop.mockReset();
    mockCreateChatEventHandler.mockReset().mockReturnValue(vi.fn());
    mockShowInformationMessage.mockReset();
    mockRegisterWebviewViewProvider.mockReturnValue({ dispose: vi.fn() });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Reset module-level state in extension.ts (deactivate clears viewProvider + watcher)
    deactivate();
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

  it('registers the view provider on every activation regardless of consent', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    await activate(makeCtx(false) as never); // user denied
    expect(mockProviderCtor).toHaveBeenCalledOnce();
    expect(mockRegisterWebviewViewProvider).toHaveBeenCalledOnce();
  });

  it('does NOT start the watcher when consent is undefined (first launch, user has not answered)', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    await activate(makeCtx(undefined) as never);
    expect(mockCreateChatHistoryWatcher).not.toHaveBeenCalled();
    expect(mockWatcherStart).not.toHaveBeenCalled();
  });

  it('does NOT start the watcher when consent is explicitly false (user denied)', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    await activate(makeCtx(false) as never);
    expect(mockCreateChatHistoryWatcher).not.toHaveBeenCalled();
  });

  it('does NOT start the watcher on plain VS Code host even if consent is true', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('vscode-generic');
    await activate(makeCtx(true) as never);
    expect(mockCreateChatHistoryWatcher).not.toHaveBeenCalled();
  });

  it('does NOT start the watcher when no state.vscdb files are found under workspaceStorage', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    mockWorkspaceStorageDir.mockReturnValueOnce('/fake/workspaceStorage');
    mockEnumerateStateVscdbPaths.mockReturnValueOnce([]);
    await activate(makeCtx(true) as never);
    expect(mockCreateChatHistoryWatcher).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('no workspace state.vscdb found'),
    );
  });

  it('starts the watcher when consent=true + host=cursor + dbs present', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    mockWorkspaceStorageDir.mockReturnValueOnce('/fake/workspaceStorage');
    mockEnumerateStateVscdbPaths.mockReturnValueOnce([
      '/fake/workspaceStorage/wsA/state.vscdb',
      '/fake/workspaceStorage/wsB/state.vscdb',
    ]);
    const ctx = makeCtx(true);
    await activate(ctx as never);
    expect(mockCreateChatHistoryWatcher).toHaveBeenCalledOnce();
    const watcherOpts = mockCreateChatHistoryWatcher.mock.calls[0]![0] as {
      targets: Array<{ path: string; kind: string }>;
    };
    expect(watcherOpts.targets).toHaveLength(2);
    expect(watcherOpts.targets[0]!.kind).toBe('cursor-sqlite');
    expect(mockWatcherStart).toHaveBeenCalledOnce();
    // Cleanup disposable pushed onto subscriptions
    expect(ctx.subscriptions.length).toBeGreaterThanOrEqual(2);
  });

  it('builds the chat-event handler with the right composer (workspace-prefixed session id)', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    mockWorkspaceStorageDir.mockReturnValueOnce('/fake/ws');
    mockEnumerateStateVscdbPaths.mockReturnValueOnce(['/fake/ws/a/state.vscdb']);
    await activate(makeCtx(true) as never);
    expect(mockCreateChatEventHandler).toHaveBeenCalledOnce();
    const deps = mockCreateChatEventHandler.mock.calls[0]![0] as {
      composeSessionId?: (e: { rawSessionId: string }) => string;
    };
    expect(typeof deps.composeSessionId).toBe('function');
    const composed = deps.composeSessionId!({ rawSessionId: 'tab-1' });
    // workspaceFolders is undefined in the mock → the composer falls back to
    // `process.cwd()`. We don't pin the literal value because it differs by
    // runner; just assert it ends with the tab id and contains the pipe.
    expect(composed.endsWith('|tab-1')).toBe(true);
    expect(composed).toMatch(/.+\|tab-1$/);
  });

  it('does not throw when showOnboardingIfNeeded rejects — logs error and continues', async () => {
    mockShowOnboarding.mockRejectedValueOnce(new Error('onboarding boom'));
    mockDetectHost.mockReturnValueOnce('cursor');
    await expect(activate(makeCtx(true) as never)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      '[nexpath] onboarding failed:',
      expect.any(Error),
    );
  });

  it('exposes the constructed provider via getViewProvider()', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    await activate(makeCtx() as never);
    expect(getViewProvider()).toBeDefined();
  });
});

describe('deactivate', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockShowOnboarding.mockReset();
    mockRegisterWebviewViewProvider.mockReset();
    mockProviderCtor.mockReset();
    mockDetectHost.mockReset().mockReturnValue('vscode-generic');
    mockWorkspaceStorageDir.mockReset().mockReturnValue(null);
    mockEnumerateStateVscdbPaths.mockReset().mockReturnValue([]);
    mockCreateChatHistoryWatcher.mockReset().mockReturnValue({
      start: mockWatcherStart,
      stop: mockWatcherStop,
    });
    mockWatcherStart.mockReset();
    mockWatcherStop.mockReset();
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

  it('clears module-level viewProvider on deactivate', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    await activate(makeCtx() as never);
    expect(getViewProvider()).toBeDefined();
    deactivate();
    expect(getViewProvider()).toBeUndefined();
  });

  it('stops the watcher on deactivate (if one was started)', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    mockWorkspaceStorageDir.mockReturnValueOnce('/fake/ws');
    mockEnumerateStateVscdbPaths.mockReturnValueOnce(['/fake/ws/a/state.vscdb']);
    await activate(makeCtx(true) as never);
    expect(mockWatcherStart).toHaveBeenCalledOnce();
    deactivate();
    expect(mockWatcherStop).toHaveBeenCalled();
  });
});
