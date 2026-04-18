---
commit_hash: 50567496804f83227d9d0fc50d552cdbb3833a6d
analyzed_at: 2026-04-18T21:10:00Z
scope: src/cli/commands/auto.ts, src/classifier/UserProfileClassifier.ts, src/classifier/LanguageDetector.ts, src/decision-session/PinchGenerator.ts, src/decision-session/DecisionSession.ts, src/decision-session/options.ts, src/cli/commands/store.ts, src/store/skipped-sessions.ts, src/classifier/types.ts
files_analyzed: 9
---

## Functions

| File | Function | Signature | Lines | Calls | Called By |
|------|----------|-----------|-------|-------|-----------|
| auto.ts | runAuto | (input: AutoInput, store: Store, openai?: OpenAI, selectFn?: SelectFn) => Promise<AutoOutcome> | 73–159 | classifyPrompt, SessionStateManager.load, detectAbsenceFlags, shouldFireStage2, runStage2, generatePinchLabel, runDecisionSession | registerAutoCommand |
| auto.ts | buildFiredKey | (flagType: FlagType, currentStage: Stage) => string | 41–46 | — | runAuto |
| auto.ts | readStdin | () => Promise<string> | 167–179 | — | registerAutoCommand |
| auto.ts | registerAutoCommand | (program: Command) => void | 198–253 | readStdin, openStore, runAuto, closeStore | index.ts |
| UserProfileClassifier.ts | classifyUserProfile | (history: PromptRecord[], currentPromptCount: number) => UserProfile | 28–49 | classifyNature, classifyMood, classifyDepth | NOWHERE IN PRODUCTION |
| UserProfileClassifier.ts | isProfileStale | (profile: UserProfile\|null, currentPromptCount: number) => boolean | 64–68 | — | NOWHERE IN PRODUCTION |
| LanguageDetector.ts | detectLanguage | (prompts: string[], priorDetected?: string) => string\|undefined | 127–136 | runDetection, applyThreshold | NOWHERE IN PRODUCTION |
| LanguageDetector.ts | resolveLanguage | (languageOverride?: string, detectedLanguage?: string) => string\|undefined | 146–151 | — | NOWHERE IN PRODUCTION |
| LanguageDetector.ts | preprocessText | (text: string) => string | 42–64 | — | runDetection |
| LanguageDetector.ts | applyThreshold | (results, priorDetected?) => string\|undefined | 83–103 | — | detectLanguage |
| LanguageDetector.ts | runDetection | (aggregatedText: string) => DetectionResult[] | 73–79 | preprocessText, detectAll | detectLanguage |
| PinchGenerator.ts | buildPinchPrompt | (question: string, flagType: FlagType, currentStage: Stage) => string | 67–88 | — | generatePinchLabel |
| PinchGenerator.ts | generatePinchLabel | (stage: Stage, flagType: FlagType, client?: OpenAI) => Promise<string> | 131–end | resolveDecisionContent, buildPinchPrompt, OpenAI.chat.completions.create | runAuto |
| PinchGenerator.ts | validatePinchLabel | (raw: string) => string\|null | 102–115 | — | generatePinchLabel |
| DecisionSession.ts | runDecisionSession | (input: DecisionSessionInput, store?: Store, selectFn?) => Promise<DecisionSessionResult> | 142–180 | runLevel, insertSkippedSession | runAuto, runOptimize |
| DecisionSession.ts | runLevel | (input, level, selectFn) => Promise<'skip'\|'next'\|string> | 99–127 | resolveDecisionContent, buildOptionList, buildSelectMessage, selectFn | runDecisionSession |
| store.ts(cmd) | storeDeleteAction | (opts, dbPath, confirmFn) => Promise<void> | 40–64 | openStore, deleteProjectPrompts, deleteAllPrompts, closeStore | registerStoreCommand |
| store.ts(cmd) | storePruneAction | (opts, dbPath) => Promise<void> | 100–118 | openStore, pruneOlderThan, closeStore | registerStoreCommand |
| skipped-sessions.ts | deleteAllSkippedSessions | (store: Store, projectRoot: string) => void | 127–129 | store.db.run | NOWHERE (only tests) |
| skipped-sessions.ts | insertSkippedSession | (store: Store, data: InsertSkippedSessionInput) => void | 51–71 | store.db.run | runDecisionSession |
| skipped-sessions.ts | getSkippedSessions | (store: Store, projectRoot: string) => SkippedSessionRecord[] | 75–103 | store.db.exec | runOptimize |

## Classes & Types

| File | Name | Kind | Key Properties | Notes |
|------|------|------|----------------|-------|
| types.ts | SessionState | interface | currentStage, stageConfidence, promptCount, promptHistory, firedDecisionSessions | Missing: profile, detectedLanguage |
| types.ts | UserProfile | interface | nature, precisionScore, playfulnessScore, mood, depth, depthScore, computedAt | Built but never used |
| types.ts | PromptRecord | interface | index, text, capturedAt, classifiedStage, confidence | Used in history window |
| auto.ts | AutoInput | interface | promptText, projectRoot | — |
| auto.ts | AutoOutcome | type | 'no_action' \| 'selected' \| 'skipped' | — |
| DecisionSession.ts | DecisionSessionInput | interface | stage, flagType, pinchLabel, sessionId, projectRoot, promptCount | No profile or language fields |
| skipped-sessions.ts | SkippedSessionRecord | interface | id, projectRoot, sessionId, flagType, stage, levelReached, skippedAtPromptCount, skippedAt | — |

## Gaps identified at function level

| Gap | Missing call site | Available function | Impact |
|-----|-------------------|-------------------|--------|
| Gap 1 | auto.ts:runAuto | UserProfileClassifier.classifyUserProfile | Profile never computed |
| Gap 1 | auto.ts:runAuto | UserProfileClassifier.isProfileStale | Stickiness never enforced |
| Gap 1 | PinchGenerator.buildPinchPrompt | (no profile param) | Profile can't influence tone |
| Gap 2 | auto.ts:runAuto | LanguageDetector.detectLanguage | Language never detected |
| Gap 2 | auto.ts:runAuto | LanguageDetector.resolveLanguage | language_override never read |
| Gap 2 | PinchGenerator.buildPinchPrompt | (no language param) | Language can't influence prompt |
| Gap 3 | store.ts:storeDeleteAction (--project) | skipped-sessions.deleteAllSkippedSessions | Orphaned rows on project delete |
| Gap 3 | store.ts:storeDeleteAction (all) | (no all-projects delete exists) | Orphaned rows on full delete |
| Gap 3 | store.ts:storePruneAction | (no prune by time for skipped) | Stale items survive prune |
