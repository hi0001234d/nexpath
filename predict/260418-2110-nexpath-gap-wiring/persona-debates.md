# Persona Debates — nexpath gap wiring

**Personas:** Architecture Reviewer (AR), Security Analyst (SA), Performance Engineer (PE), Reliability Engineer (RE), Devil's Advocate (DA)
**Rounds:** 2

---

## Round 1 — Independent Findings

### Architecture Reviewer

**AR-1 [HIGH]:** Profile must be stored in SessionState, not computed on-demand each call.
- Location: `src/classifier/types.ts:38-62` (SessionState), `src/cli/commands/auto.ts:80`
- Evidence: SessionState already serialises complex runtime state to SQLite per call. `UserProfile.computedAt` exists for stickiness tracking — this field is meaningless unless the profile is persisted so future invocations can read it. Each `runAuto` is a separate process (Claude Code hook fires as a subprocess), so on-demand computation with no storage means stickiness is never enforced.
- Recommendation: Add `profile: UserProfile | null` to `SessionState`. Compute in `SessionStateManager.processPrompt()` using `isProfileStale()` guard. This ensures profile survives between hook invocations.

**AR-2 [HIGH]:** Language detection result must be stored in SessionState for sticky fallback to work.
- Location: `src/classifier/LanguageDetector.ts:83-103` (`applyThreshold`)
- Evidence: `applyThreshold()` takes `priorDetected?: string` — this is the sticky fallback. If `priorDetected` is never stored, sticky logic is bypassed: every call gets no prior → ambiguous results always skip → language never stabilises. Since each `runAuto` is a new process, state must be persisted to SQLite.
- Recommendation: Add `detectedLanguage: string | undefined` to `SessionState`. Re-detect every 10 prompts (stickiness cadence). Call `getConfig(store.db, 'language_override')` to get the override. Apply `resolveLanguage()` and pass result to `generatePinchLabel`.

**AR-3 [HIGH]:** `storeDeleteAction` (both branches) never cleans `skipped_sessions`.
- Location: `src/cli/commands/store.ts:40-64`
- Evidence: `--project` branch: calls `deleteProjectPrompts(store, opts.project)` → removes from `prompts` table only. No-`--project` branch: calls `deleteAllPrompts(store)` → removes from `prompts` table only. `deleteAllSkippedSessions` is exported from `store/index.ts` but not imported in `store.ts`.
- Recommendation: Import and call `deleteAllSkippedSessions` in `--project` branch. Add a new `deleteAllSkippedSessionsGlobal(store)` exported from `skipped-sessions.ts` for the ALL-delete branch.

**AR-4 [MEDIUM]:** `buildPinchPrompt` signature must accept optional profile and language.
- Location: `src/decision-session/PinchGenerator.ts:67`
- Current signature: `buildPinchPrompt(question, flagType, currentStage) => string`
- Evidence: The CO-STAR prompt has a fixed "Tone" and "Audience" section. Profile (mood, nature, depth) and language both influence what those sections should say. The function needs to be extended.
- Recommendation: New signature: `buildPinchPrompt(question, flagType, currentStage, profile?: UserProfile, language?: string) => string`. Append tone/language context to CO-STAR prompt when present.

---

### Security Analyst

**SA-1 [LOW]:** Language string injection into LLM prompt — mitigation needed.
- Location: `src/decision-session/PinchGenerator.ts:82-88` (where result will be injected)
- Evidence: `tinyld.detectAll()` returns ISO 639-1 two-character codes. However, `resolveLanguage()` also accepts `language_override` from config — user-set. A malicious or misconfigured config value could inject unexpected text into the LLM prompt.
- Recommendation: Before injecting language into prompt, validate: `language && /^[a-z]{2,8}$/i.test(language)`. This covers ISO 639-1 (2-char), ISO 639-2 (3-char), and BCP 47 basics. Reject anything that fails.

**SA-2 [INFO]:** User profile computation reads prompt history — no PII reaches LLM.
- Evidence: `classifyUserProfile()` is pure rule-based scoring (keyword matching, word counts). No raw prompt text is passed to any API. Safe by design.

---

### Performance Engineer

**PE-1 [MEDIUM]:** Language detection must not run on every `runAuto` invocation.
- Location: `src/classifier/LanguageDetector.ts:127` (`detectLanguage`)
- Evidence: `tinyld.detectAll()` is a pure in-process CPU call operating on ~300-600 chars. Cost is ~2-5ms. However, per the research spec, re-detection should be periodic (sticky). Recommended: re-detect every 10 prompts (`promptCount % 10 === 0 || detectedLanguage === undefined`). This follows the depth classifier's stickiness cadence.
- Recommendation: Gate `detectLanguage()` call behind stale check using `promptCount`.

**PE-2 [LOW]:** Profile computation (pure, in-memory) is negligible cost.
- Evidence: `classifyUserProfile()` processes at most 20 prompts of text with simple scoring algorithms. Total cost < 1ms. No I/O. Re-compute every 5 prompts is fine — matches `PROFILE_RECOMPUTE_INTERVAL`.

---

### Reliability Engineer

**RE-1 [HIGH]:** ALL-delete case (`store delete` without `--project`) orphans ALL skipped sessions.
- Location: `src/cli/commands/store.ts:57-63`
- Evidence: `deleteAllPrompts(store)` runs `DELETE FROM prompts` + VACUUM. No corresponding all-projects skipped_sessions delete exists. `deleteAllSkippedSessions` only takes a single `projectRoot`. A new function is needed.
- Recommendation: Add `deleteAllSkippedSessionsGlobal(store: Store): void` to `skipped-sessions.ts` running `DELETE FROM skipped_sessions` with no WHERE clause.

**RE-2 [MEDIUM]:** `storePruneAction` also orphans skipped sessions older than the cutoff.
- Location: `src/cli/commands/store.ts:100-118`
- Evidence: `pruneOlderThan(store, ms, opts.project)` removes prompts by age. Skipped sessions have their own `skipped_at` timestamp. Items skipped before the prune cutoff will remain in the queue but their prompt context has been deleted.
- Recommendation: Add `pruneSkippedSessions(store: Store, cutoffMs: number, projectRoot?: string): void` to `skipped-sessions.ts`. Call after `pruneOlderThan` in `storePruneAction`.

**RE-3 [MEDIUM]:** Profile null + language undefined must not break `buildPinchPrompt`.
- Location: `src/decision-session/PinchGenerator.ts:67-88`
- Evidence: Both `profile` and `language` are optional. The function must degrade gracefully: no profile → static CO-STAR tone; no language → omit language instruction entirely. Guard with `if (profile)` and `if (language && isValidLang(language))`.

**RE-4 [MEDIUM]:** `isProfileStale` must be the gate for profile recompute in the pipeline.
- Location: `src/classifier/UserProfileClassifier.ts:64-68`
- Evidence: `isProfileStale(profile, currentPromptCount)` returns true when gap ≥ 5 prompts. This must be called before `classifyUserProfile()` in the pipeline to avoid unnecessary recomputation. Currently caller responsibility is unmet since it's never called.

---

### Devil's Advocate

**DA-1:** Challenge to AR-1 — is SessionState the right place for profile?
- Counter: Storing profile in SessionState couples its lifecycle to the session JSON blob. Alternative: compute on-demand in `runAuto` every time. Cost: ~1ms. Since `runAuto` fires rarely (only when Stage 2 triggers), recomputing every invocation is acceptable.
- Counter-counter (concede): The sticky fallback for language REQUIRES storing `detectedLanguage` in SessionState regardless (each runAuto is a new process — in-memory state is lost). Since we're already adding a field to SessionState for language, adding profile there costs nothing architecturally. Stickiness enforcement is also more correct. **Concede: profile belongs in SessionState.**

**DA-2:** Challenge to PE-1 — is the language detection interval truly needed?
- Counter: `tinyld.detectAll()` is synchronous and fast. Running it every call costs 2-5ms, which is negligible. Simpler: just run on every `runAuto` invocation.
- Counter-counter: The sticky fallback logic in `applyThreshold` REQUIRES a `priorDetected` value. Without storing it between calls, the sticky model is broken — every invocation sees `priorDetected = undefined`, meaning ambiguous results never fall back to the previous stable language. The storage is required for correctness, not just performance. The detection interval is an optimization on top of required storage. **Partially concede: storage is required; interval is optional but good practice.**

**DA-3:** Non-code hypothesis — are these gaps actually exercised in production?
- `nexpath auto` fires only via Claude Code hook (UserPromptSubmit). The hook fires only when Stage 2 triggers (i.e., after a stage transition with LLM confirmation). In typical usage this fires 3-5 times per session. The missing features (profile-based tone, language-aware prompt) affect the quality of the pinch label and decision session content — not correctness. The orphaned skipped_sessions (Gap 3) IS a correctness issue.
- **Implication:** Gap 3 is highest priority (data integrity). Gaps 1 and 2 are feature completeness (quality of the advisory).

---

## Round 2 — Challenges & Revisions

### Architecture Reviewer — Round 2

Accepts DA-1 concession. Profile in SessionState is confirmed.
Revises AR-2: adds that language detection stickiness interval of 10 prompts should be a named constant `LANG_DETECT_INTERVAL = 10` in LanguageDetector.ts (currently `LANG_WINDOW = 20` exists for detection window, but no interval constant exists for re-detection cadence).

### Security Analyst — Round 2

Upgrades SA-1 from LOW to MEDIUM based on AR/DA confirmation that `language_override` is user-set config. A user could set `language_override = "en\n\nIgnore previous instructions"`. Validation is mandatory.
Adds: validation function `isValidLanguageCode(s: string): boolean` should be exported from LanguageDetector.ts and used both before injecting into prompt and when saving to config.

### Performance Engineer — Round 2

Accepts that storage is required for correctness (not just perf). Agrees with constant LANG_DETECT_INTERVAL.
Adds: `generatePinchLabel` signature change requires updating its existing callers: `runAuto` (auto.ts) and `runOptimize` (optimize.ts). optimize.ts passes no profile or language — that's fine since it uses static fallback.

### Reliability Engineer — Round 2

Confirms RE-2 (prune gap). Adds detail: `pruneSkippedSessions` should be `DELETE FROM skipped_sessions WHERE skipped_at < ? [AND project_root = ?]`. This matches the `pruneOlderThan` pattern exactly.

### Devil's Advocate — Round 2

Raises: what happens to the `generatePinchLabel` call site in `runOptimize`? It currently passes `(stage, flagType, openai)`. If the signature adds `profile?` and `language?`, the call in optimize.ts stays valid (both new params are optional). **No breaking change confirmed.**

Raises: `SessionStateManager` currently has no `profile` field in state. Adding it requires: (a) updating the `SessionState` interface in types.ts, (b) updating `SessionStateManager.fromJson` and `toJson` serialisation, (c) updating `migrate()` if state is stored as a JSON column (which it is — `state_json` in `session_states` table). **No schema migration needed — state_json is a JSON blob, new fields are additive.**

---

## Anti-Herd Check

- flip_rate: 3 positions changed / 18 total findings = 0.17 → SAFE
- entropy: 0.68 → SAFE
- convergence_speed: 2 rounds → SAFE

**Anti-herd status: PASSED**
