---
commit_hash: 50567496804f83227d9d0fc50d552cdbb3833a6d
---

## Import Graph (gap-relevant)

| File | Imports From | Symbols |
|------|-------------|---------|
| auto.ts | classifier/PromptClassifier.js | classifyPrompt |
| auto.ts | classifier/SessionStateManager.js | SessionStateManager |
| auto.ts | classifier/AbsenceDetector.js | detectAbsenceFlags |
| auto.ts | classifier/Stage2Trigger.js | shouldFireStage2, runStage2 |
| auto.ts | decision-session/PinchGenerator.js | generatePinchLabel |
| auto.ts | decision-session/DecisionSession.js | runDecisionSession, SelectFn |
| auto.ts | store/db.js | openStore, closeStore, DEFAULT_DB_PATH |
| auto.ts | ❌ NOT imported | UserProfileClassifier — classifyUserProfile |
| auto.ts | ❌ NOT imported | LanguageDetector — detectLanguage, resolveLanguage |
| auto.ts | ❌ NOT imported | store/config — getConfig (needed for language_override) |
| store.ts(cmd) | store/index.js | openStore, closeStore, DEFAULT_DB_PATH, deleteProjectPrompts, deleteAllPrompts, pruneOlderThan, setConfig |
| store.ts(cmd) | ❌ NOT imported | skipped-sessions — deleteAllSkippedSessions |
| PinchGenerator.ts | classifier/types.js | Stage |
| PinchGenerator.ts | classifier/Stage2Trigger.js | FlagType |
| PinchGenerator.ts | decision-session/options.js | resolveDecisionContent, content blocks |
| DecisionSession.ts | store/skipped-sessions.js | insertSkippedSession |
| UserProfileClassifier.ts | classifier/NatureClassifier.js | classifyNature |
| UserProfileClassifier.ts | classifier/MoodClassifier.js | classifyMood |
| UserProfileClassifier.ts | classifier/DepthClassifier.js | classifyDepth |

## Call Graph (gap paths — what SHOULD exist but doesn't)

| Caller | Callee | Missing? | Purpose |
|--------|--------|----------|---------|
| runAuto | classifyUserProfile(mgr.current.promptHistory, promptCount) | ✅ MISSING | Compute/update cached profile |
| runAuto | isProfileStale(mgr.current.profile, promptCount) | ✅ MISSING | Guard recompute |
| runAuto | detectLanguage(historyTexts, priorDetected) | ✅ MISSING | Detect language from history |
| runAuto | resolveLanguage(langOverride, detectedLang) | ✅ MISSING | Apply priority chain |
| runAuto | getConfig(store.db, 'language_override') | ✅ MISSING | Read override config |
| generatePinchLabel | buildPinchPrompt(q, flagType, stage, profile, language) | ✅ MISSING (extra params) | Profile+language-aware tone |
| storeDeleteAction (--project) | deleteAllSkippedSessions(store, projectRoot) | ✅ MISSING | Clean orphans |
| storeDeleteAction (ALL) | store.db.run('DELETE FROM skipped_sessions') | ✅ MISSING | Clean all orphans |
| storePruneAction | pruneSkippedSessions(store, cutoff, projectRoot?) | ✅ MISSING (fn doesn't exist) | Prune stale skipped items |

## Data Flows

| Source | Transform | Sink | Gap? |
|--------|-----------|------|------|
| mgr.current.promptHistory | classifyUserProfile() | UserProfile object | ❌ Gap 1: never computed |
| UserProfile | buildPinchPrompt() | LLM pinch prompt tone | ❌ Gap 1: never passed |
| mgr.current.promptHistory | detectLanguage() | string \| undefined | ❌ Gap 2: never computed |
| store.db config 'language_override' | getConfig() | resolveLanguage() | ❌ Gap 2: never read |
| detectedLanguage | resolveLanguage() | buildPinchPrompt() | ❌ Gap 2: never passed |
| store delete --project X | deleteAllSkippedSessions() | skipped_sessions table | ❌ Gap 3: never called |
| store delete ALL | DELETE FROM skipped_sessions | skipped_sessions table | ❌ Gap 3: no all-delete fn |
