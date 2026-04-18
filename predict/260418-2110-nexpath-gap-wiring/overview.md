# Predict Analysis — nexpath-gap-wiring

**Date:** 2026-04-18 21:10
**Scope:** 9 files — auto.ts, UserProfileClassifier.ts, LanguageDetector.ts, PinchGenerator.ts, DecisionSession.ts, options.ts, store.ts(cmd), skipped-sessions.ts, types.ts
**Personas:** 5 — Architecture Reviewer, Security Analyst, Performance Engineer, Reliability Engineer, Devil's Advocate
**Debate Rounds:** 2
**Commit Hash:** 50567496804f83227d9d0fc50d552cdbb3833a6d
**Anti-Herd Status:** PASSED (flip_rate 0.17, entropy 0.68)

---

## Summary

- **Total Findings:** 8
  - Confirmed (≥3/5): 8 | Probable: 0 | Minority: 0
- **Severity Breakdown:** HIGH: 4 | MEDIUM: 4
- **Composite Score:** 4×15 + 0×8 + 0×3 + (5/5)×20 + (2/2)×10 + 5 = 95

---

## Top Findings

1. [Gap 3a — All-delete does not clean skipped_sessions](./findings.md#finding-1) — HIGH | 5/5 consensus
2. [Gap 3b — Project delete does not clean skipped_sessions](./findings.md#finding-2) — HIGH | 5/5 consensus
3. [Gap 2 — Language detection never stored; sticky fallback broken](./findings.md#finding-3) — HIGH | 5/5 consensus
4. [Gap 1 — User profile never computed; stickiness logic dead](./findings.md#finding-4) — HIGH | 4/5 consensus
5. [buildPinchPrompt needs profile + language params](./findings.md#finding-5) — MEDIUM | 4/5 consensus
6. [Gap 3c — storePruneAction does not prune skipped_sessions](./findings.md#finding-6) — MEDIUM | 4/5 consensus
7. [Language string must be validated before LLM injection](./findings.md#finding-7) — MEDIUM | 3/5 consensus
8. [Profile null + language undefined need graceful no-ops](./findings.md#finding-8) — MEDIUM | 3/5 consensus

---

## Files in This Report

- [Findings](./findings.md) — 8 findings ranked by priority score
- [Implementation Plan](./implementation-plan.md) — complete locked plan for all three gaps
- [Persona Debates](./persona-debates.md) — full debate transcript
- [Codebase Analysis](./codebase-analysis.md) — functions, types, gaps at function level
- [Dependency Map](./dependency-map.md) — import graph, call graph, missing data flows

---

## Key Decisions (Locked)

| Decision | Rationale |
|----------|-----------|
| Profile stored in SessionState (not on-demand) | Each runAuto is a new process — in-memory state lost. Stickiness requires persistence. |
| detectedLanguage stored in SessionState | Same reason — sticky fallback requires priorDetected from prior call. |
| LANG_DETECT_INTERVAL = 10 | Matches depth classifier cadence. Avoids unnecessary tinyld calls. |
| PROFILE_RECOMPUTE_INTERVAL = 5 | Already defined. Mood re-eval cadence drives the interval. |
| buildPinchPrompt gets optional profile + language | Required for features to actually reach the LLM. Both are optional — graceful no-op when absent. |
| deleteAllSkippedSessionsGlobal as new export | Keeps store.ts clean; makes the function testable. |
| pruneSkippedSessions as new export | Mirrors pruneOlderThan pattern; testable. |
| Language validation before LLM injection | language_override is user-set config — must not allow prompt injection. |
| generatePinchLabel in optimize.ts: no change | Optimize uses static pinch fallback; profile + language are optional → backward compatible. |
| No schema migration needed | SessionState is stored as JSON blob in state_json column. New fields are additive. |
