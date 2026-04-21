import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'node:fs';

// Mock randomUUID for predictable temp file paths
vi.mock('node:crypto', () => ({ randomUUID: vi.fn(() => 'test-uuid-tty') }));

// Mock spawnSync — tests configure its behaviour per-case
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// Deferred import so mocks are in place before module is evaluated
const { createTtySelectFn } = await import('./TtySelectFn.js');
const { spawnSync }         = await import('node:child_process');

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID        = 'test-uuid-tty';
const OPT_FILE    = join(tmpdir(), `nexpath-opt-${UUID}.json`);
const RESULT_FILE = join(tmpdir(), `nexpath-res-${UUID}.txt`);
const SCRIPT_FILE = join(tmpdir(), `nexpath-sel-${UUID}.mjs`); // .mjs — ESM Node.js script

function cleanTempFiles(): void {
  for (const f of [OPT_FILE, RESULT_FILE, SCRIPT_FILE]) {
    try { unlinkSync(f); } catch { /* ignore */ }
  }
}

function makeOpts() {
  return {
    message: 'Test gap spotted.',
    options: [
      { label: 'Option A', value: 'option-a-value' },
      { label: 'Option B', value: 'option-b-value' },
      { label: 'Skip for now', value: '__skip__' },
    ],
  };
}

// ── Windows SelectFn (these tests run on the win32 platform naturally) ─────────

describe('createTtySelectFn — Windows (win32)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    cleanTempFiles();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanTempFiles();
  });

  it('returns a non-null SelectFn on Windows', () => {
    const fn = createTtySelectFn();
    expect(fn).not.toBeNull();
    expect(typeof fn).toBe('function');
  });

  it('resolves with selected value when user picks a valid option', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, 'option-a-value', 'utf8');
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(result).toBe('option-a-value');
  });

  it('resolves with Symbol when window is closed without selecting', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      // no result file written — simulates window closed or Ctrl+C
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(typeof result).toBe('symbol');
  });

  it('resolves with Symbol when result file is empty', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, '', 'utf8');
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(typeof result).toBe('symbol');
  });

  it('resolves with Symbol on 60s timeout (no result file written)', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    const result = await createTtySelectFn()!(makeOpts());
    expect(typeof result).toBe('symbol');
  });

  it('uses cmd.exe /c start /WAIT for reliable foreground activation', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());

    const [cmd, args] = (spawnSync as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
    expect(cmd).toBe('cmd.exe');
    expect(args[0]).toBe('/c');
    expect(args[1]).toBe('start');
    expect(args[2]).toBe('/WAIT');
    // Runs Node.js — not PowerShell — for full @clack/prompts arrow-key UI
    expect(args[4]).toBe('node');
  });

  it('passes a branded window title for taskbar discoverability', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());

    const args = (spawnSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
    const title = args[3];
    expect(title).toContain('Nexpath');
  });

  it('passes the .mjs script file path as last arg to node', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());

    const args = (spawnSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
    const scriptArg = args[args.length - 1];
    expect(scriptArg).toContain('nexpath-sel-');
    expect(scriptArg).toContain('.mjs');
  });

  it('preserves ANSI codes in message — @clack/prompts renders them in the new window', async () => {
    let capturedOptContent = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(OPT_FILE)) capturedOptContent = readFileSync(OPT_FILE, 'utf8');
    });
    await createTtySelectFn()!({
      message: '\x1b[1;96mHold up.\x1b[0m',
      options: [{ label: '\x1b[32mOption A\x1b[0m', value: 'val-a' }],
    });
    const parsed = JSON.parse(capturedOptContent) as { message: string; options: { label: string }[] };
    // ANSI preserved — @clack/prompts handles rendering, unlike the old PS1 approach
    expect(parsed.message).toContain('\x1b[1;96m');
    expect(parsed.options[0].label).toContain('\x1b[32m');
  });

  it('.mjs script imports @clack/prompts and uses Promise.race for 60s timeout', async () => {
    let capturedScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(SCRIPT_FILE)) capturedScript = readFileSync(SCRIPT_FILE, 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    expect(capturedScript).toContain('@clack/prompts');
    expect(capturedScript).toContain('Promise.race');
    expect(capturedScript).toContain('60_000');
    expect(capturedScript).toContain('select(');
    expect(capturedScript).toContain('isCancel(');
  });

  it('.mjs script uses forward-slash file paths for cross-platform Node.js reads', async () => {
    let capturedScript = '';
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (existsSync(SCRIPT_FILE)) capturedScript = readFileSync(SCRIPT_FILE, 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    // Backslashes in embedded paths would break readFileSync on some Node versions
    expect(capturedScript).not.toMatch(/readFileSync\('.*\\.+.*'\)/);
    expect(capturedScript).not.toMatch(/writeFileSync\('.*\\.+.*'\)/);
  });

  it('writes stderr message before spawning the window', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    const spawnMock = spawnSync as ReturnType<typeof vi.fn>;
    spawnMock.mockReturnValue({ status: 0 });

    await createTtySelectFn()!(makeOpts());

    const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(stderrCalls.some((msg) => msg.toLowerCase().includes('nexpath'))).toBe(true);
    // stderr must fire before spawnSync
    const stderrOrder = stderrSpy.mock.invocationCallOrder[0];
    const spawnOrder  = spawnMock.mock.invocationCallOrder[0];
    expect(stderrOrder).toBeLessThan(spawnOrder!);
  });

  it('cleans up all three temp files after resolution', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, 'option-a-value', 'utf8');
    });
    await createTtySelectFn()!(makeOpts());
    expect(existsSync(OPT_FILE)).toBe(false);
    expect(existsSync(RESULT_FILE)).toBe(false);
    expect(existsSync(SCRIPT_FILE)).toBe(false);
  });

  it('cleans up temp files even when no result file is written', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
    await createTtySelectFn()!(makeOpts());
    expect(existsSync(OPT_FILE)).toBe(false);
    expect(existsSync(SCRIPT_FILE)).toBe(false);
  });

  it('preserves option value as-is through the result file', async () => {
    (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      writeFileSync(RESULT_FILE, 'option-b-value', 'utf8');
    });
    const result = await createTtySelectFn()!(makeOpts());
    expect(result).toBe('option-b-value');
  });
});
