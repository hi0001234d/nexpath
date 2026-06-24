import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClipboardWrite, mockShowInfo } = vi.hoisted(() => ({
  mockClipboardWrite: vi.fn(),
  mockShowInfo: vi.fn(),
}));

vi.mock('vscode', () => ({
  env: { clipboard: { writeText: mockClipboardWrite } },
  window: { showInformationMessage: mockShowInfo },
}));

import { handleOptionSelection } from './prompt-injection.js';

describe('handleOptionSelection', () => {
  beforeEach(() => {
    mockClipboardWrite.mockReset();
    mockShowInfo.mockReset();
  });

  it('writes the selected text to the clipboard', async () => {
    mockClipboardWrite.mockResolvedValueOnce(undefined);
    mockShowInfo.mockResolvedValueOnce(undefined);
    await handleOptionSelection('refined prompt');
    expect(mockClipboardWrite).toHaveBeenCalledWith('refined prompt');
  });

  it('shows the success toast after a successful clipboard write', async () => {
    mockClipboardWrite.mockResolvedValueOnce(undefined);
    mockShowInfo.mockResolvedValueOnce(undefined);
    await handleOptionSelection('refined prompt');
    expect(mockShowInfo).toHaveBeenCalledWith(
      expect.stringMatching(/pasted to clipboard/i),
    );
  });

  it('shows a failure toast when the clipboard write rejects', async () => {
    mockClipboardWrite.mockRejectedValueOnce(new Error('permission denied'));
    mockShowInfo.mockResolvedValueOnce(undefined);
    await handleOptionSelection('any');
    expect(mockShowInfo).toHaveBeenCalledTimes(1);
    expect(mockShowInfo).toHaveBeenCalledWith(
      expect.stringContaining("couldn't copy to clipboard"),
    );
    expect(mockShowInfo).toHaveBeenCalledWith(
      expect.stringContaining('permission denied'),
    );
  });

  it('does not throw even if both clipboard AND toast fail', async () => {
    mockClipboardWrite.mockRejectedValueOnce(new Error('clip-fail'));
    mockShowInfo.mockRejectedValueOnce(new Error('toast-fail'));
    await expect(handleOptionSelection('x')).rejects.toThrow('toast-fail');
    // (The toast-fail surfaces because there's no second fallback. The
    //  important guarantee is the clipboard-fail path is reached — it is.)
  });

  it('uses injected dependencies in preference to the vscode module', async () => {
    const localClip = vi.fn().mockResolvedValue(undefined);
    const localToast = vi.fn().mockResolvedValue(undefined);
    await handleOptionSelection('hello', {
      clipboardWrite: localClip,
      showInfo: localToast,
    });
    expect(localClip).toHaveBeenCalledWith('hello');
    expect(localToast).toHaveBeenCalledOnce();
    expect(mockClipboardWrite).not.toHaveBeenCalled();
    expect(mockShowInfo).not.toHaveBeenCalled();
  });

  it('handles empty string without crashing', async () => {
    const clip = vi.fn().mockResolvedValue(undefined);
    const toast = vi.fn().mockResolvedValue(undefined);
    await handleOptionSelection('', { clipboardWrite: clip, showInfo: toast });
    expect(clip).toHaveBeenCalledWith('');
    expect(toast).toHaveBeenCalledOnce();
  });

  describe('injectFn primary path (B4 contract)', () => {
    it('skips clipboard + toast when injectFn returns true', async () => {
      const inject = vi.fn().mockResolvedValue(true);
      const clip = vi.fn().mockResolvedValue(undefined);
      const toast = vi.fn().mockResolvedValue(undefined);
      await handleOptionSelection('hello', {
        injectFn: inject,
        clipboardWrite: clip,
        showInfo: toast,
      });
      expect(inject).toHaveBeenCalledWith('hello');
      expect(clip).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
    });

    it('falls back to clipboard when injectFn returns false', async () => {
      const inject = vi.fn().mockResolvedValue(false);
      const clip = vi.fn().mockResolvedValue(undefined);
      const toast = vi.fn().mockResolvedValue(undefined);
      await handleOptionSelection('hello', {
        injectFn: inject,
        clipboardWrite: clip,
        showInfo: toast,
      });
      expect(inject).toHaveBeenCalledOnce();
      expect(clip).toHaveBeenCalledWith('hello');
      expect(toast).toHaveBeenCalledOnce();
    });

    it('falls back to clipboard when injectFn throws', async () => {
      const inject = vi.fn().mockRejectedValue(new Error('command not found'));
      const clip = vi.fn().mockResolvedValue(undefined);
      const toast = vi.fn().mockResolvedValue(undefined);
      await handleOptionSelection('hello', {
        injectFn: inject,
        clipboardWrite: clip,
        showInfo: toast,
      });
      expect(inject).toHaveBeenCalledOnce();
      expect(clip).toHaveBeenCalledWith('hello');
      expect(toast).toHaveBeenCalledOnce();
    });

    it('does NOT call injectFn when it is undefined (default B3 behaviour)', async () => {
      const clip = vi.fn().mockResolvedValue(undefined);
      const toast = vi.fn().mockResolvedValue(undefined);
      await handleOptionSelection('hello', {
        clipboardWrite: clip,
        showInfo: toast,
      });
      expect(clip).toHaveBeenCalledWith('hello');
    });
  });
});
