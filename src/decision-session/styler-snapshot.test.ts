import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { STYLE_PASSTHROUGH_ENV, styler, type LineKind } from './styler.js';
import {
  captureStyledAndUnstyled,
  captureStyledAndUnstyledAsync,
  withStylerEnv,
  withStylerEnvAsync,
} from './styler-snapshot.js';
import { computeLayout, type RenderLoopOptions } from './render-loop.js';

// Force isTTY=true so the styler safeguards do not short-circuit ANSI
// emission in non-TTY test workers — captureStyledAndUnstyled is only
// meaningful when the OFF path actually applies styling.
let origIsTTY: boolean | undefined;
beforeAll(() => {
  origIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
});
afterAll(() => {
  process.stdout.isTTY = origIsTTY;
});

describe('styler-snapshot — withStylerEnv', () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env[STYLE_PASSTHROUGH_ENV]; });
  afterEach(() => {
    if (saved === undefined) delete process.env[STYLE_PASSTHROUGH_ENV];
    else                     process.env[STYLE_PASSTHROUGH_ENV] = saved;
  });

  it('sets the env-var inside the callback and restores it afterwards', () => {
    delete process.env[STYLE_PASSTHROUGH_ENV];
    const observed = withStylerEnv('1', () => process.env[STYLE_PASSTHROUGH_ENV]);
    expect(observed).toBe('1');
    expect(process.env[STYLE_PASSTHROUGH_ENV]).toBeUndefined();
  });

  it('deletes the env-var inside the callback when value is undefined and restores afterwards', () => {
    process.env[STYLE_PASSTHROUGH_ENV] = '1';
    const observed = withStylerEnv(undefined, () => process.env[STYLE_PASSTHROUGH_ENV]);
    expect(observed).toBeUndefined();
    expect(process.env[STYLE_PASSTHROUGH_ENV]).toBe('1');
  });

  it('restores the prior env-var on thrown exception inside the callback', () => {
    process.env[STYLE_PASSTHROUGH_ENV] = 'prior-value';
    expect(() => withStylerEnv('1', () => { throw new Error('boom'); })).toThrow('boom');
    expect(process.env[STYLE_PASSTHROUGH_ENV]).toBe('prior-value');
  });

  it('returns the callback\'s value', () => {
    const out = withStylerEnv('1', () => 42);
    expect(out).toBe(42);
  });
});

describe('styler-snapshot — withStylerEnvAsync', () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env[STYLE_PASSTHROUGH_ENV]; });
  afterEach(() => {
    if (saved === undefined) delete process.env[STYLE_PASSTHROUGH_ENV];
    else                     process.env[STYLE_PASSTHROUGH_ENV] = saved;
  });

  it('handles a resolved promise + restores env afterwards', async () => {
    delete process.env[STYLE_PASSTHROUGH_ENV];
    const observed = await withStylerEnvAsync('1', async () => process.env[STYLE_PASSTHROUGH_ENV]);
    expect(observed).toBe('1');
    expect(process.env[STYLE_PASSTHROUGH_ENV]).toBeUndefined();
  });

  it('restores the prior env-var on a rejected promise', async () => {
    process.env[STYLE_PASSTHROUGH_ENV] = 'prior-async';
    await expect(
      withStylerEnvAsync('1', async () => { throw new Error('async-boom'); }),
    ).rejects.toThrow('async-boom');
    expect(process.env[STYLE_PASSTHROUGH_ENV]).toBe('prior-async');
  });
});

describe('styler-snapshot — captureStyledAndUnstyled', () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env[STYLE_PASSTHROUGH_ENV]; });
  afterEach(() => {
    if (saved === undefined) delete process.env[STYLE_PASSTHROUGH_ENV];
    else                     process.env[STYLE_PASSTHROUGH_ENV] = saved;
  });

  it('invokes the produce callback twice — once per env-var state', () => {
    let callCount = 0;
    captureStyledAndUnstyled(() => { callCount++; return callCount; });
    expect(callCount).toBe(2);
  });

  it('produces styled + unstyled keys on the result', () => {
    const out = captureStyledAndUnstyled(() => 'demo');
    expect(out).toEqual({ styled: 'demo', unstyled: 'demo' });
  });

  it('captures styler output that diverges on styled kinds (styled wraps ANSI; unstyled passes through)', () => {
    const allKinds: LineKind[] = ['popup-why-help', 'option-label', 'question'];
    const out = captureStyledAndUnstyled(() => allKinds.map((k) => styler('sample', k)));
    // Styled output: popup-why-help wrapped with ANSI; option-label + question pass through.
    expect(out.styled[0]).not.toBe('sample');
    expect(out.styled[0]).toContain('sample');
    expect(out.styled[1]).toBe('sample');
    expect(out.styled[2]).toBe('sample');
    // Unstyled output (bypass ON): all three pass through.
    expect(out.unstyled).toEqual(['sample', 'sample', 'sample']);
  });

  it('snapshot-ready demo — capturing computeLayout output via the helper', () => {
    const opts: RenderLoopOptions = {
      pinchLabel: 'Pinch demo', question: 'Question demo',
      options: [{ value: 'a', label: 'A', descBase: 'desc demo' }],
      rows: 40, cols: 80,
    };
    const out = captureStyledAndUnstyled(
      () => computeLayout(opts, { focusedIndex: 0, expandedOptions: new Set(), scrollOffset: 0 }).styledLines,
    );
    // Styled and unstyled both remain snapshot-able; the styled variant
    // contains ANSI on the styled line-kinds while the unstyled variant
    // matches the raw layout output verbatim.
    expect(Array.isArray(out.styled)).toBe(true);
    expect(Array.isArray(out.unstyled)).toBe(true);
    expect(out.styled).not.toEqual(out.unstyled);
  });
});

describe('styler-snapshot — captureStyledAndUnstyledAsync', () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env[STYLE_PASSTHROUGH_ENV]; });
  afterEach(() => {
    if (saved === undefined) delete process.env[STYLE_PASSTHROUGH_ENV];
    else                     process.env[STYLE_PASSTHROUGH_ENV] = saved;
  });

  it('produces styled + unstyled keys from an async producer', async () => {
    const out = await captureStyledAndUnstyledAsync(async () => 'async-demo');
    expect(out).toEqual({ styled: 'async-demo', unstyled: 'async-demo' });
  });
});
