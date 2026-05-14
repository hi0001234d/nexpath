import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mocks for the two modules the extension entrypoint imports. `vi.hoisted` is
// required because `vi.mock` is hoisted above import statements, so the mock
// references must live at hoist time too.
const { mockShowOnboarding } = vi.hoisted(() => ({
  mockShowOnboarding: vi.fn(),
}));

vi.mock('vscode', () => ({}));
vi.mock('./onboarding.js', () => ({
  showOnboardingIfNeeded: mockShowOnboarding,
}));

import { activate, deactivate } from './extension.js';

describe('activate', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockShowOnboarding.mockReset();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs the activation message', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    await activate({} as never);
    expect(logSpy).toHaveBeenCalledWith('[nexpath] extension activated');
  });

  it('forwards the ExtensionContext to showOnboardingIfNeeded', async () => {
    mockShowOnboarding.mockResolvedValueOnce(undefined);
    const ctx = { fake: 'context' };
    await activate(ctx as never);
    expect(mockShowOnboarding).toHaveBeenCalledOnce();
    expect(mockShowOnboarding).toHaveBeenCalledWith(ctx);
  });

  it('does not throw when showOnboardingIfNeeded rejects — logs error instead', async () => {
    const err = new Error('boom');
    mockShowOnboarding.mockRejectedValueOnce(err);
    await expect(activate({} as never)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('[nexpath] onboarding failed:', err);
  });

  it('still logs the activation message even when onboarding rejects', async () => {
    mockShowOnboarding.mockRejectedValueOnce(new Error('x'));
    await activate({} as never);
    expect(logSpy).toHaveBeenCalledWith('[nexpath] extension activated');
  });
});

describe('deactivate', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
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
});
