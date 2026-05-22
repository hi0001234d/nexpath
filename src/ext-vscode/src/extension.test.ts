import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// vi.hoisted lets the mocks declared here be referenced from the vi.mock
// factories below (which are themselves hoisted above the import block).
const {
  mockShowOnboarding,
  mockRegisterWebviewViewProvider,
  mockProviderCtor,
  mockDetectHost,
  mockWorkspaceStorageDir,
  mockWindsurfCodeiumDir,
  mockEnumerateStateVscdbPaths,
  mockCreateChatHistoryWatcher,
  mockWatcherStart,
  mockWatcherStop,
  mockCreateChatEventHandler,
  mockShowInformationMessage,
  mockExistsSync,
  mockExecuteCommand,
} = vi.hoisted(() => ({
  mockShowOnboarding: vi.fn(),
  mockRegisterWebviewViewProvider: vi.fn(),
  mockProviderCtor: vi.fn(),
  mockDetectHost: vi.fn(() => 'vscode-generic'),
  mockWorkspaceStorageDir: vi.fn(() => null),
  mockWindsurfCodeiumDir: vi.fn(() => '/home/u/.codeium/windsurf'),
  mockEnumerateStateVscdbPaths: vi.fn(() => []),
  mockCreateChatHistoryWatcher: vi.fn(),
  mockWatcherStart: vi.fn(),
  mockWatcherStop: vi.fn(),
  mockCreateChatEventHandler: vi.fn(() => vi.fn()),
  mockShowInformationMessage: vi.fn(),
  mockExistsSync: vi.fn(() => false),
  mockExecuteCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    registerWebviewViewProvider: mockRegisterWebviewViewProvider,
    showInformationMessage: mockShowInformationMessage,
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  workspace: {
    workspaceFolders: undefined,
  },
  env: { appName: 'Visual Studio Code' },
  commands: {
    executeCommand: mockExecuteCommand,
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
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: mockExistsSync };
});
vi.mock('./host-detector.js', () => ({
  detectHost: mockDetectHost,
  workspaceStorageDir: mockWorkspaceStorageDir,
  windsurfCodeiumDir: mockWindsurfCodeiumDir,
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
    mockWindsurfCodeiumDir.mockReset().mockReturnValue('/home/u/.codeium/windsurf');
    mockEnumerateStateVscdbPaths.mockReset().mockReturnValue([]);
    mockCreateChatHistoryWatcher.mockReset().mockReturnValue({
      start: mockWatcherStart,
      stop: mockWatcherStop,
    });
    mockWatcherStart.mockReset();
    mockWatcherStop.mockReset();
    mockCreateChatEventHandler.mockReset().mockReturnValue(vi.fn());
    mockShowInformationMessage.mockReset();
    mockExistsSync.mockReset().mockReturnValue(false);
    mockExecuteCommand.mockReset().mockResolvedValue(undefined);
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

  // ── Notification-panel pre-open (Cursor/Windsurf toast visibility) ─────────
  // VS Code shows showInformationMessage toasts as transient bottom-right
  // popups. Cursor and Windsurf route them to the silent notification stack
  // (bell icon) and stay invisible until the user opens the panel. extension.ts
  // pre-opens the panel via the `notifications.showList` command on non-VS-Code
  // hosts so the consent toast is immediately discoverable. Dev plan §2.2 M11
  // ("consent toast") + §2.5 cursor-quirks compliance.

  it('on host=cursor: pre-opens notification panel before consent toast', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    await activate(makeCtx() as never);
    expect(mockExecuteCommand).toHaveBeenCalledWith('notifications.showList');
  });

  it('on host=windsurf: pre-opens notification panel before consent toast', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('windsurf');
    await activate(makeCtx() as never);
    expect(mockExecuteCommand).toHaveBeenCalledWith('notifications.showList');
  });

  it('on host=vscode-generic: does NOT pre-open notification panel (toast surfaces natively)', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('vscode-generic');
    await activate(makeCtx() as never);
    expect(mockExecuteCommand).not.toHaveBeenCalledWith('notifications.showList');
  });

  it('swallows errors from notifications.showList (best-effort discoverability hint)', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    mockExecuteCommand.mockRejectedValueOnce(new Error('command not found'));
    await expect(activate(makeCtx() as never)).resolves.toBeUndefined();
    // Onboarding still runs even though showList rejected
    expect(mockShowOnboarding).toHaveBeenCalledOnce();
  });

  // ── Windsurf codeium-cascade dir wiring (Drift A fix) ──────────────────────
  // Per dev plan §2.3 acceptance #2: when host=windsurf, the watcher must
  // monitor BOTH state.vscdb files AND `~/.codeium/windsurf/`. These tests
  // verify the extension.ts wiring that adds the codeium dir as a
  // windsurf-dir WatchTarget alongside the cursor-sqlite targets.

  it('windsurf host: adds codeium cascade dir as a windsurf-dir target when it exists on disk', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('windsurf');
    mockWorkspaceStorageDir.mockReturnValueOnce('/fake/ws');
    mockEnumerateStateVscdbPaths.mockReturnValueOnce(['/fake/ws/a/state.vscdb']);
    mockWindsurfCodeiumDir.mockReturnValueOnce('/home/u/.codeium/windsurf');
    mockExistsSync.mockImplementation(
      (p: string) => p === '/home/u/.codeium/windsurf',
    );

    await activate(makeCtx(true) as never);

    expect(mockCreateChatHistoryWatcher).toHaveBeenCalledOnce();
    const watcherOpts = mockCreateChatHistoryWatcher.mock.calls[0]![0] as {
      targets: Array<{ path: string; kind: string }>;
    };
    expect(watcherOpts.targets).toHaveLength(2);
    expect(watcherOpts.targets[0]).toEqual({
      path: '/fake/ws/a/state.vscdb',
      kind: 'cursor-sqlite',
    });
    expect(watcherOpts.targets[1]).toEqual({
      path: '/home/u/.codeium/windsurf',
      kind: 'windsurf-dir',
    });
  });

  it('windsurf host: skips codeium dir when it does not exist (existsSync = false)', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('windsurf');
    mockWorkspaceStorageDir.mockReturnValueOnce('/fake/ws');
    mockEnumerateStateVscdbPaths.mockReturnValueOnce(['/fake/ws/a/state.vscdb']);
    mockExistsSync.mockReturnValue(false);

    await activate(makeCtx(true) as never);

    const watcherOpts = mockCreateChatHistoryWatcher.mock.calls[0]![0] as {
      targets: Array<{ path: string; kind: string }>;
    };
    expect(watcherOpts.targets).toHaveLength(1);
    expect(watcherOpts.targets[0]!.kind).toBe('cursor-sqlite');
  });

  it('windsurf host: starts watcher when ONLY the codeium dir exists (no state.vscdb yet)', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('windsurf');
    mockWorkspaceStorageDir.mockReturnValueOnce('/fake/ws');
    mockEnumerateStateVscdbPaths.mockReturnValueOnce([]);
    mockWindsurfCodeiumDir.mockReturnValueOnce('/home/u/.codeium/windsurf');
    mockExistsSync.mockImplementation(
      (p: string) => p === '/home/u/.codeium/windsurf',
    );

    await activate(makeCtx(true) as never);

    expect(mockCreateChatHistoryWatcher).toHaveBeenCalledOnce();
    const watcherOpts = mockCreateChatHistoryWatcher.mock.calls[0]![0] as {
      targets: Array<{ path: string; kind: string }>;
    };
    expect(watcherOpts.targets).toHaveLength(1);
    expect(watcherOpts.targets[0]).toEqual({
      path: '/home/u/.codeium/windsurf',
      kind: 'windsurf-dir',
    });
  });

  it('cursor host: never adds a windsurf-dir target (no cross-host leakage)', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    mockWorkspaceStorageDir.mockReturnValueOnce('/fake/ws');
    mockEnumerateStateVscdbPaths.mockReturnValueOnce(['/fake/ws/a/state.vscdb']);
    // Even if existsSync would say yes for /home/u/.codeium/windsurf, the
    // cursor-host branch must never consult it.
    mockExistsSync.mockReturnValue(true);

    await activate(makeCtx(true) as never);

    expect(mockWindsurfCodeiumDir).not.toHaveBeenCalled();
    const watcherOpts = mockCreateChatHistoryWatcher.mock.calls[0]![0] as {
      targets: Array<{ path: string; kind: string }>;
    };
    expect(watcherOpts.targets.every((t) => t.kind === 'cursor-sqlite')).toBe(
      true,
    );
  });

  // ── Watcher-callback wiring (B5 audit follow-up) ───────────────────────────
  // The watcher takes three callbacks at construction time (onEvent,
  // onError, onSchemaUnknown). The watcher itself is mocked in these tests,
  // so we capture the callbacks from the createChatHistoryWatcher call args
  // and invoke them directly — verifying that what extension.ts wires up
  // does the right thing.

  /** Helper: drive activate() with watcher-starting conditions + return the watcher opts. */
  async function activateWithWatcher(): Promise<{
    onEvent: (event: unknown) => void;
    onError: (err: Error) => void;
    onSchemaUnknown: (info: { path: string; observedSampleKeys: readonly string[] }) => void;
  }> {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    mockWorkspaceStorageDir.mockReturnValueOnce('/fake/ws');
    mockEnumerateStateVscdbPaths.mockReturnValueOnce(['/fake/ws/a/state.vscdb']);
    await activate(makeCtx(true) as never);
    const opts = mockCreateChatHistoryWatcher.mock.calls[0]![0] as {
      onEvent: (event: unknown) => void;
      onError: (err: Error) => void;
      onSchemaUnknown: (info: {
        path: string;
        observedSampleKeys: readonly string[];
      }) => void;
    };
    return opts;
  }

  it('routes watcher onEvent through the chat-event handler (the integration proof)', async () => {
    const trackedHandler = vi.fn();
    mockCreateChatEventHandler.mockReturnValueOnce(trackedHandler);
    const opts = await activateWithWatcher();
    const event = {
      prompt: 'hi',
      rawSessionId: 'tab-7',
      capturedAt: new Date(0),
      sourcePath: '/fake/ws/a/state.vscdb',
      extractorId: 'cursor-v2025-q2',
    };
    opts.onEvent(event);
    expect(trackedHandler).toHaveBeenCalledOnce();
    expect(trackedHandler).toHaveBeenCalledWith(event);
  });

  it('watcher onSchemaUnknown surfaces a visible info toast with path + observed keys', async () => {
    const opts = await activateWithWatcher();
    opts.onSchemaUnknown({
      path: '/fake/ws/a/state.vscdb',
      observedSampleKeys: ['unknown.key.1', 'unknown.key.2', 'unknown.key.3'],
    });
    expect(mockShowInformationMessage).toHaveBeenCalledOnce();
    const msg = mockShowInformationMessage.mock.calls[0]![0] as string;
    expect(msg).toContain('/fake/ws/a/state.vscdb');
    expect(msg).toContain('schema is not recognised');
    expect(msg).toContain('unknown.key.1');
  });

  it('watcher onError logs to console.error (does not crash the extension)', async () => {
    const opts = await activateWithWatcher();
    const watcherErr = new Error('watch boom');
    expect(() => opts.onError(watcherErr)).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith('[nexpath] watcher error:', watcherErr);
  });

  // ── Pipeline logger wiring (B1.4 follow-up — spawn errors in Output) ──────
  // chat-pipeline.ts catches spawnAuto / spawnStop failures and forwards them
  // to its `logger.error`. extension.ts must wire a logger that writes to
  // BOTH console.error AND the Nexpath OutputChannel (via the local `log`
  // helper). Otherwise IPC errors only surface in Developer Tools Console,
  // invisible to end users. Verified live during B1.4 (nexpath binary moved
  // aside → spawnAuto ENOENT → silent before this fix, surfaces in Output
  // after this fix).

  it('wires a logger into createChatEventHandler that writes spawn errors to the Output channel', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    mockWorkspaceStorageDir.mockReturnValueOnce('/fake/ws');
    mockEnumerateStateVscdbPaths.mockReturnValueOnce(['/fake/ws/a/state.vscdb']);
    await activate(makeCtx(true) as never);
    const handlerDeps = mockCreateChatEventHandler.mock.calls[0]![0] as {
      logger?: { error: (msg: string, err: unknown) => void };
    };
    expect(handlerDeps.logger).toBeDefined();
    expect(typeof handlerDeps.logger!.error).toBe('function');

    // Calling the wired logger.error should reach console.error (existing
    // path) and also call `log()` which writes to console.log (which the
    // OutputChannel mock will also receive via appendLine in production).
    const enoent = Object.assign(new Error('spawn nexpath ENOENT'), {
      code: 'ENOENT',
    });
    handlerDeps.logger!.error('[nexpath] spawnAuto failed:', enoent);
    expect(errorSpy).toHaveBeenCalledWith(
      '[nexpath] spawnAuto failed:',
      enoent,
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('spawn nexpath ENOENT'),
    );
  });

  it('wired logger.error formats non-Error rejection values cleanly', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    mockDetectHost.mockReturnValueOnce('cursor');
    mockWorkspaceStorageDir.mockReturnValueOnce('/fake/ws');
    mockEnumerateStateVscdbPaths.mockReturnValueOnce(['/fake/ws/a/state.vscdb']);
    await activate(makeCtx(true) as never);
    const handlerDeps = mockCreateChatEventHandler.mock.calls[0]![0] as {
      logger?: { error: (msg: string, err: unknown) => void };
    };
    handlerDeps.logger!.error('[nexpath] spawnStop failed:', 'plain string err');
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('plain string err'),
    );
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
    mockWindsurfCodeiumDir.mockReset().mockReturnValue('/home/u/.codeium/windsurf');
    mockEnumerateStateVscdbPaths.mockReset().mockReturnValue([]);
    mockCreateChatHistoryWatcher.mockReset().mockReturnValue({
      start: mockWatcherStart,
      stop: mockWatcherStop,
    });
    mockWatcherStart.mockReset();
    mockWatcherStop.mockReset();
    mockExistsSync.mockReset().mockReturnValue(false);
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
