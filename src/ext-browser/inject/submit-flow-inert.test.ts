/**
 * Structural pins for the gated submit path — the things a behavioural test
 * cannot express.
 *
 * The switch-OFF proof itself is now BEHAVIOURAL and lives in main-world.test.ts
 * ("patchedFetch — both switch positions"): it drives a real disarmed fetch and
 * asserts the native call happens synchronously with the original arguments, and
 * that no gated-path event is emitted. That is a stronger proof than reading the
 * source, and it replaced the source-level "the switch is never consulted" pins
 * that were correct only while the gate was unwired.
 *
 * What remains here is ordering and not-yet-landed phases — claims about code
 * that has no behaviour to observe yet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mainWorld = readFileSync(join(here, 'main-world.ts'), 'utf8');
const captureKit = readFileSync(join(here, '..', 'content', 'agents', 'capture-kit.ts'), 'utf8');

/** The body of `window.fetch = function patchedFetch(...)`, source-exact. */
function patchedFetchBody(): string {
  const start = mainWorld.indexOf('window.fetch = function patchedFetch(');
  expect(start).toBeGreaterThan(-1);
  const end = mainWorld.indexOf('\n};', start);
  expect(end).toBeGreaterThan(start);
  return mainWorld.slice(start, end);
}

describe('gated-path ordering pins', () => {
  it('the switch check is evaluated BEFORE anything else in patchedFetch', () => {
    const body = patchedFetchBody();
    const gateAt = body.indexOf('submitFlow.isArmed()');
    const captureAt = body.indexOf('maybeCaptureFetch');
    const sendAt = body.indexOf('_nativeFetch(input, init)');
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(captureAt);
    expect(gateAt).toBeLessThan(sendAt);
  });

  it('the disarmed branch still fire-and-forgets the capture and returns the native call', () => {
    const body = patchedFetchBody();
    expect(body).toContain('void maybeCaptureFetch(input, init).catch(() => {});');
    expect(body).toContain('return _nativeFetch(input, init);');
  });

  it('patchedFetch itself is still a plain function, not async', () => {
    // An async signature would wrap EVERY response in an extra microtask, for
    // every request the page makes, gated or not.
    expect(mainWorld).toContain('window.fetch = function patchedFetch(');
    expect(mainWorld).not.toContain('window.fetch = async function patchedFetch(');
  });

  it('the fetch patch is installed before the switch and gate are constructed', () => {
    const patchAt = mainWorld.indexOf('window.fetch = function patchedFetch(');
    expect(mainWorld.indexOf('setupSubmitFlowPage()')).toBeGreaterThan(patchAt);
    expect(mainWorld.indexOf('createSubmitGate(')).toBeGreaterThan(patchAt);
  });

  it('exactly one code path performs the send (the double-submit guarantee)', () => {
    // Hold and send must stay the same closure. If this count grows, a second
    // send site has appeared and the "only ever WHICH text, never WHETHER a
    // second send happens" invariant needs re-proving.
    const sends = mainWorld.match(/_nativeFetch\(input, init\)/g) ?? [];
    // Exactly two: the ungated `return`, and `gatedFetch`'s single `send`
    // closure — which every branch of the gate routes through.
    expect(sends).toHaveLength(2);
  });
});

describe('the composer gate — where cancelling lives, and where it must not', () => {
  const gate = readFileSync(join(here, '..', 'content', 'composer-submit-gate.ts'), 'utf8');

  it('capture-kit itself still never cancels an event', () => {
    // Cancelling lives entirely in composer-submit-gate.ts, behind the switch.
    // capture-kit's own listeners stay pure observers, so a gate that is absent,
    // disarmed, or throwing changes nothing about today's capture.
    expect(captureKit).not.toContain('preventDefault');
    expect(captureKit).not.toContain('stopImmediatePropagation');
  });

  it('the interceptor hook defaults to "not mine", so an unwired build behaves as today', () => {
    expect(captureKit).toContain('= () => false;');
  });

  it('a throwing interceptor can never break capture', () => {
    const idx = captureKit.indexOf('const takenOver =');
    expect(idx).toBeGreaterThan(-1);
    const body = captureKit.slice(idx, idx + 600);
    expect(body).toContain('catch');
    expect(body).toContain('return false');
  });

  it('the gate uses stopIMMEDIATEPropagation — the weaker form was live-disproven on Bolt', () => {
    // 2026-08-26: with plain stopPropagation Bolt still submitted
    // (`prompt-attempted` fired); with the immediate form it did not. Bolt has a
    // document-level listener registered before ours. Downgrading this silently
    // re-breaks every site.
    expect(gate).toContain('ev.stopImmediatePropagation();');
    expect(gate).not.toContain('ev.stopPropagation();');
  });

  it('the gate refuses unless the switch is armed', () => {
    // The guard gained a body (it now logs WHY it is off), so pin the check and
    // its refusal rather than a single formatting-sensitive line.
    expect(gate).toContain('if (!deps.isArmed()) {');
    expect(gate).toContain("return false;                       // switch off");
  });
});
