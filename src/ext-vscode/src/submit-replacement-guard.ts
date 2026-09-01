/**
 * DS-bridge suppression of submit-flow replacements (H8, `G-ARBITRATION`
 * Finding 1 — Windsurf only).
 *
 * ── THE COLLISION THIS PREVENTS ──────────────────────────────────────────────
 * `session_states.lastInjectedPrompt` carries TWO meanings:
 *   - everywhere: the echo guard `auto.ts:706` reads-and-clears so an injected
 *     turn is never re-classified (the hook's re-entry fix writes it for
 *     exactly that reason);
 *   - on Windsurf ONLY: it is also the DS advisory-poller's delivery-bridge
 *     signal — "a popup selection appeared; inject it into Cascade."
 *
 * With the submit-advisory switch ON, a blocked turn therefore makes the DS
 * poller deliver the replacement a SECOND time, alongside the submit poller's
 * own decision-file delivery. Both paths are correct in isolation; the
 * collision only exists on Windsurf with the switch on — so this guard is only
 * consulted there, and the shipped DS bridge is untouched when the switch is
 * off (the guard is simply never constructed).
 *
 * ── WHY TWO CHECKS, NOT ONE ──────────────────────────────────────────────────
 * Tick order between the two 2s pollers is non-deterministic:
 *   - DS poller first ⇒ the decision file still exists ⇒ the non-consuming
 *     PEEK identifies the text;
 *   - submit poller first ⇒ the file is consumed (one-shot) ⇒ the in-memory
 *     recent-delivery record identifies it.
 * Either alone leaves a losing order; together they cover both.
 *
 * A genuine old-flow popup selection (the user picked in the post-response
 * popup) matches NEITHER check — no decision file ever existed for it and the
 * submit poller never delivered it — so the DS bridge keeps working exactly as
 * shipped even while the switch is on.
 *
 * ── RC28 (Windows/Devin tester, 2026-08-20): BOTH CHECKS LOOK BACKWARDS ──────
 * Both checks above answer "has the submit flow ALREADY produced this text?".
 * Neither can answer "is a submit turn about to claim it?" — and on Windows the
 * bridge reliably wins that race. Measured from the tester's log:
 *
 *   13:25:01.001  DS bridge fires   ← popup selection already on disk
 *   13:25:01.045  decision id minted (sd-1787232301045)
 *   13:25:02.986  block_issued +1941ms
 *
 * The bridge ran 44 ms BEFORE the decision record was even created, and ~2.0 s
 * before the block. Both checks were correctly false, so the guard passed a
 * submit replacement through: it was injected into a Cascade that was STILL
 * RUNNING the original prompt (the block was 2 s away), then injected a second
 * time by the submit poller. That is the reported "original not cancelled +
 * modified prompt stuck in the queue + duplicate inject".
 *
 * The ordering is INHERENT, not a Windows quirk: the popup writes the selection,
 * and only then does the hook mint and persist its decision. Linux merely hides
 * it — the decider there finishes inside the 2 s poll gap. RC11.5 already fixed
 * the MIRROR of this race (bridge firing 63 ms too LATE) by recording before
 * dispatch; no ordering fix can close this one, because the state being asked
 * about does not exist yet.
 *
 * `isSubmitFlowReplacementWithinGrace` closes it by RE-ASKING for a bounded
 * window instead of once. It only ever DEFERS the bridge; it never changes the
 * verdict for a genuine popup selection, which still injects after the grace.
 * That matters because `stop`'s ladder still reaches feedback/PE under the
 * switch (the 2026-08-12 ruling leaves those untouched), so a real PE
 * "Use enhanced" selection MUST still bridge — a blanket "never bridge while
 * armed" would silently break PE delivery on Windsurf.
 */

/**
 * How long the DS bridge waits for a submit turn to claim a selection before
 * treating it as a genuine popup selection. The observed window on the tester's
 * (slow) Windows box was ~2.0 s from bridge-visible to block-issued; this is a
 * 4x margin. Only ever costs latency, never correctness: too short reopens the
 * duplicate-inject race, too long just delays a genuine PE bridge.
 */
export const SUBMIT_REPLACEMENT_GRACE_MS = 8_000;

/** Re-check cadence inside the grace. Exits early the moment the answer is yes. */
export const SUBMIT_REPLACEMENT_POLL_MS = 250;

export interface SubmitReplacementGuardDeps {
  /** Candidate project roots (the same list both pollers watch). */
  roots: readonly string[];
  /** In-memory record of texts the submit poller has delivered (per root). */
  isRecentSubmitDelivery: (root: string, text: string) => boolean;
  /** Non-consuming peek at the pending decision file for a root. */
  peekPendingDecision: (root: string) => Promise<{ replacementText: string } | null>;
}

/**
 * True when `text` is a submit-flow replacement and the DS bridge must NOT
 * inject it. Never throws — a guard failure must never break the shipped
 * bridge, so any error means "not a replacement" (the DS bridge proceeds;
 * worst case is today's double injection, never a lost selection).
 */
export async function isSubmitFlowReplacement(
  text: string,
  deps: SubmitReplacementGuardDeps,
): Promise<boolean> {
  try {
    for (const root of deps.roots) {
      if (deps.isRecentSubmitDelivery(root, text)) return true;
    }
    for (const root of deps.roots) {
      let peeked: { replacementText: string } | null = null;
      try {
        peeked = await deps.peekPendingDecision(root);
      } catch {
        peeked = null;
      }
      if (peeked && peeked.replacementText === text) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * RC28. `isSubmitFlowReplacement`, re-asked until it says yes or the grace runs
 * out — the fix for the race documented in this module's header.
 *
 * Returns as soon as the answer is yes, so a submit replacement is suppressed
 * about as fast as the decision lands (~2 s in the measured Windows case), not
 * after the full grace. A genuine popup selection never becomes a "yes", so it
 * costs exactly one grace of latency and then bridges as it always has —
 * deferred, never dropped. That one-directional behaviour is what makes this
 * safe to switch on: the guard can only ever ADD suppression for texts the
 * submit flow genuinely claims.
 *
 * Never throws (same contract as the single-shot form): any failure resolves
 * `false`, so the bridge proceeds and the worst case is the pre-RC28 behaviour.
 *
 * The caller (`extension.ts`'s DS bridge) is already serialised by the poller's
 * `inFlight` flag and de-duplicated by its `lastInjectedValue`, so awaiting here
 * cannot stack or re-fire — it just skips poll ticks while it waits.
 */
export async function isSubmitFlowReplacementWithinGrace(
  text: string,
  deps: SubmitReplacementGuardDeps & {
    graceMs?: number;
    pollMs?: number;
    /** Injected in tests so the grace costs no real time. */
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  },
): Promise<boolean> {
  const graceMs = deps.graceMs ?? SUBMIT_REPLACEMENT_GRACE_MS;
  const pollMs = deps.pollMs ?? SUBMIT_REPLACEMENT_POLL_MS;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  try {
    const deadline = now() + graceMs;
    for (;;) {
      if (await isSubmitFlowReplacement(text, deps)) return true;
      if (now() >= deadline) return false;
      await sleep(pollMs);
    }
  } catch {
    return false;
  }
}
