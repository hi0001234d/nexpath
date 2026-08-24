import { describe, expect, it } from 'vitest';
import type { Store } from '../store/db.js';
import { combineOptionWithWhyDesc, deliverSelectedPrompt, isWhyDescDeliveryEnabled, isInjectedPromptEcho } from './whydesc-delivery.js';

/** Minimal fake store — `getConfig` only calls `db.exec(...)`. `undefined` = key not stored. */
const fakeStore = (stored?: string): Store =>
  ({ db: { exec: () => (stored === undefined ? [] : [{ values: [[stored]] }]) } }) as unknown as Store;

describe('whydesc-delivery — combine (Decision 1: plain, no label)', () => {
  it('joins option + why-desc with a blank line', () => {
    expect(combineOptionWithWhyDesc('Write one test.', 'Just the most important behaviour.'))
      .toBe('Write one test.\n\nJust the most important behaviour.');
  });
  it('returns the option unchanged when the why-desc is empty', () => {
    expect(combineOptionWithWhyDesc('Write one test.', '')).toBe('Write one test.');
  });
  it('returns the option unchanged when the why-desc is undefined', () => {
    expect(combineOptionWithWhyDesc('Write one test.', undefined)).toBe('Write one test.');
  });
  it('trims a whitespace-only why-desc to nothing', () => {
    expect(combineOptionWithWhyDesc('Write one test.', '   \n  ')).toBe('Write one test.');
  });
});

describe('whydesc-delivery — deliver (gate injected)', () => {
  it('delivers the option alone when the gate is OFF', () => {
    expect(deliverSelectedPrompt('Write one test.', 'Just the most important behaviour.', false))
      .toBe('Write one test.');
  });
  it('delivers option + why-desc when the gate is ON', () => {
    expect(deliverSelectedPrompt('Write one test.', 'Just the most important behaviour.', true))
      .toBe('Write one test.\n\nJust the most important behaviour.');
  });
});

describe('whydesc-delivery — config gate (default ON after the voice pass)', () => {
  it('no store → OFF', () => {
    expect(isWhyDescDeliveryEnabled(undefined)).toBe(false);
  });
  it('key unset → default ON', () => {
    expect(isWhyDescDeliveryEnabled(fakeStore(undefined))).toBe(true);
  });
  it("explicit 'false' → OFF", () => {
    expect(isWhyDescDeliveryEnabled(fakeStore('false'))).toBe(false);
  });
  it("explicit 'true' → ON", () => {
    expect(isWhyDescDeliveryEnabled(fakeStore('true'))).toBe(true);
  });
});

describe('whydesc-delivery — injected-prompt echo guard (2.3)', () => {
  const option = 'Write one test for the most important behaviour in what was just built.';
  const combined = `${option}\n\nJust the single most important behaviour, not full coverage yet.`;

  it('exact match (single-line option, gate OFF path)', () => {
    expect(isInjectedPromptEcho(option, option)).toBe(true);
  });
  it('exact match (multi-line combined)', () => {
    expect(isInjectedPromptEcho(combined, combined)).toBe(true);
  });
  it('whitespace-normalized: agent collapsed the blank line', () => {
    expect(isInjectedPromptEcho(combined, combined.replace('\n\n', '\n'))).toBe(true);
    expect(isInjectedPromptEcho(combined, combined.replace('\n\n', ' '))).toBe(true);
  });
  it('option-prefix: agent echoed the option but reformatted/dropped the why-desc tail', () => {
    expect(isInjectedPromptEcho(combined, option)).toBe(true);
    expect(isInjectedPromptEcho(combined, `${option} some paraphrased tail`)).toBe(true);
  });
  it('a genuinely different prompt does NOT match', () => {
    expect(isInjectedPromptEcho(combined, 'Now add error handling to the login flow.')).toBe(false);
    expect(isInjectedPromptEcho(option, 'help me refactor this file')).toBe(false);
  });
});
