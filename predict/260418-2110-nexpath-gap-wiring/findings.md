# Findings — nexpath gap wiring

Ranked by priority score = severity_weight×0.4 + confidence_boost×0.2 + consensus_ratio×0.4

---

## Finding 1: Gap 3a — All-delete does not clean skipped_sessions

**Severity:** HIGH
**Confidence:** HIGH
**Location:** `src/cli/commands/store.ts:57-63`
**Consensus:** 5/5 personas

**Evidence:**
```typescript
// store.ts storeDeleteAction — no-project branch
const store = await openStore(dbPath);
deleteAllPrompts(store);    // ← deletes only from `prompts` table
closeStore(store);
console.log('All stored prompts deleted.');
// skipped_sessions table: ALL rows remain — orphaned
```
`deleteAllSkippedSessions(store, projectRoot)` requires a `projectRoot` — no all-projects variant exists.

**Recommendation:**
1. Add to `src/store/skipped-sessions.ts`:
```typescript
export function deleteAllSkippedSessionsGlobal(store: Store): void {
  store.db.run('DELETE FROM skipped_sessions');
}
```
2. Import + call in `storeDeleteAction` (ALL branch):
```typescript
import { deleteAllSkippedSessions, deleteAllSkippedSessionsGlobal } from '../../store/skipped-sessions.js';
// ...
deleteAllPrompts(store);
deleteAllSkippedSessionsGlobal(store);  // ← add this
closeStore(store);
```

**Persona Votes:**
| Persona | Vote | Note |
|---------|------|------|
| Architecture Reviewer | confirm | AR-3 |
| Security Analyst | confirm | data integrity |
| Performance Engineer | confirm | — |
| Reliability Engineer | confirm | RE-1 |
| Devil's Advocate | confirm | highest priority gap |

---

## Finding 2: Gap 3b — Project delete does not clean skipped_sessions

**Severity:** HIGH
**Confidence:** HIGH
**Location:** `src/cli/commands/store.ts:44-53`
**Consensus:** 5/5 personas

**Evidence:**
```typescript
// --project branch
const store = await openStore(dbPath);
deleteProjectPrompts(store, opts.project);   // ← prompts table only
closeStore(store);
// skipped_sessions rows for opts.project remain — orphaned
```
`deleteAllSkippedSessions` exists and is exported from `store/index.ts` but never imported in `commands/store.ts`.

**Recommendation:**
```typescript
import { deleteAllSkippedSessions, deleteAllSkippedSessionsGlobal } from '../../store/skipped-sessions.js';
// --project branch:
deleteProjectPrompts(store, opts.project);
deleteAllSkippedSessions(store, opts.project);   // ← add this
closeStore(store);
```

**Persona Votes:** 5/5 confirm.

---

## Finding 3: Gap 2 — Language detection never stored; sticky fallback broken

**Severity:** HIGH
**Confidence:** HIGH
**Location:** `src/classifier/types.ts:38` (SessionState missing field), `src/cli/commands/auto.ts:80`
**Consensus:** 5/5 personas

**Evidence:**
- `applyThreshold(results, priorDetected?)` uses `priorDetected` for sticky fallback. If `priorDetected` is always `undefined` (because it's never persisted), every ambiguous detection falls through to `undefined` — language never stabilises.
- Each `runAuto` is a new process (Claude Code hook). In-memory state is lost between calls. `priorDetected` MUST come from the persisted `SessionState`.
- `detectLanguage()` and `resolveLanguage()` are never called from any production file.

**Recommendation — 5-step plan:**

**Step 1:** Add `detectedLanguage: string | undefined` to `SessionState` in `types.ts`:
```typescript
export interface SessionState {
  // ... existing fields ...
  detectedLanguage: string | undefined;   // ← add
}
```

**Step 2:** Add `LANG_DETECT_INTERVAL = 10` constant to `LanguageDetector.ts`.

**Step 3:** Add `setDetectedLanguage(store, lang)` to `SessionStateManager`:
```typescript
setDetectedLanguage(store: Store, lang: string | undefined): void {
  this.current.detectedLanguage = lang;
  this.saveState(store);
}
```

**Step 4:** In `runAuto()` after `mgr.processPrompt()`, add:
```typescript
// Language detection (every LANG_DETECT_INTERVAL prompts or first time)
const shouldDetect = mgr.current.detectedLanguage === undefined
  || mgr.current.promptCount % LANG_DETECT_INTERVAL === 0;

if (shouldDetect) {
  const historyTexts = mgr.current.promptHistory.map((r) => r.text);
  const langOverride = getConfig(store.db, 'language_override');
  const detected     = detectLanguage(historyTexts.slice(-LANG_WINDOW), mgr.current.detectedLanguage);
  const resolved     = resolveLanguage(langOverride, detected);
  mgr.setDetectedLanguage(store, resolved);
}
const effectiveLang = mgr.current.detectedLanguage;
```

**Step 5:** Pass `effectiveLang` to `generatePinchLabel` (see Finding 5).

**Imports to add to auto.ts:**
```typescript
import { detectLanguage, resolveLanguage, LANG_WINDOW, LANG_DETECT_INTERVAL } from '../../classifier/LanguageDetector.js';
import { getConfig } from '../../store/config.js';
```

**Persona Votes:** 5/5 confirm.

---

## Finding 4: Gap 1 — User profile never computed; stickiness logic dead

**Severity:** HIGH
**Confidence:** HIGH
**Location:** `src/classifier/types.ts:38` (SessionState missing field), `src/cli/commands/auto.ts:80`
**Consensus:** 4/5 personas (DA conceded after Round 2)

**Evidence:**
- `classifyUserProfile()` is implemented and correct. `isProfileStale()` is the gating function. Neither is called from any production file.
- `UserProfile.computedAt` exists for stickiness — it's only meaningful if `profile` is persisted in `SessionState` so future `runAuto` invocations can read it (each invocation is a new process).

**Recommendation — 4-step plan:**

**Step 1:** Add `profile: UserProfile | null` to `SessionState` in `types.ts`:
```typescript
export interface SessionState {
  // ... existing fields ...
  profile: UserProfile | null;   // ← add
}
```

**Step 2:** Initialise to `null` in `SessionStateManager.createInitialState()`.

**Step 3:** In `SessionStateManager.processPrompt()`, after updating history and counters, add:
```typescript
if (isProfileStale(this.current.profile, this.current.promptCount)) {
  this.current.profile = classifyUserProfile(
    this.current.promptHistory,
    this.current.promptCount,
  );
}
```
Note: `processPrompt` already calls `saveState(store)` at the end — profile is persisted automatically.

**Step 4:** In `runAuto()`, read the computed profile:
```typescript
const profile = mgr.current.profile;  // may be null on first call with < 5 prompts
```
Pass `profile` to `generatePinchLabel` (see Finding 5).

**Imports to add to auto.ts:**
```typescript
// No new imports needed — profile is read from mgr.current.profile
```
**Imports to add to SessionStateManager.ts:**
```typescript
import { classifyUserProfile, isProfileStale } from './UserProfileClassifier.js';
```

**Persona Votes:**
| Persona | Vote |
|---------|------|
| Architecture Reviewer | confirm |
| Security Analyst | confirm |
| Performance Engineer | confirm |
| Reliability Engineer | confirm |
| Devil's Advocate | confirm (after Round 2 concession) |

---

## Finding 5: `buildPinchPrompt` and `generatePinchLabel` need profile + language params

**Severity:** MEDIUM
**Confidence:** HIGH
**Location:** `src/decision-session/PinchGenerator.ts:67` (`buildPinchPrompt`), `src/decision-session/PinchGenerator.ts:131` (`generatePinchLabel`)
**Consensus:** 4/5 personas

**Evidence:**
Current CO-STAR prompt has fixed "Tone" and "Audience" sections. With profile and language available, these should be dynamic. Without this change, Gaps 1 and 2 are wired but their values never reach the LLM.

**Recommendation:**

Extend `buildPinchPrompt`:
```typescript
export function buildPinchPrompt(
  question:     string,
  flagType:     FlagType,
  currentStage: Stage,
  profile?:     UserProfile,
  language?:    string,
): string {
  // ... existing CO-STAR base ...

  const toneHint = profile
    ? buildToneHint(profile)   // see below
    : 'Motivating and friendly, not judgmental.';

  const langInstruction = language
    ? `\n\nLanguage: Respond with the label in ${language}.`
    : '';

  return `${base}${langInstruction}`;
}

function buildToneHint(profile: UserProfile): string {
  const parts: string[] = [];
  if (profile.mood === 'frustrated') parts.push('especially empathetic');
  if (profile.mood === 'rushed')     parts.push('ultra-concise');
  if (profile.mood === 'excited')    parts.push('energetic');
  if (profile.depth === 'high')      parts.push('peer-level technical');
  if (profile.nature === 'beginner') parts.push('encouraging, jargon-free');
  return parts.length > 0
    ? `Motivating and friendly. Tone modifiers: ${parts.join(', ')}.`
    : 'Motivating and friendly, not judgmental.';
}
```

Extend `generatePinchLabel`:
```typescript
export async function generatePinchLabel(
  stage:    Stage,
  flagType: FlagType,
  client?:  OpenAI,
  profile?: UserProfile,
  language?: string,
): Promise<string> {
  // pass profile and language through to buildPinchPrompt
}
```

Update `runAuto` call site:
```typescript
const pinchLabel = await generatePinchLabel(
  mgr.current.currentStage,
  flagType,
  openai,
  profile ?? undefined,    // UserProfile | undefined
  effectiveLang,           // string | undefined
);
```

**Persona Votes:** 4/5 confirm (SA abstains — outside security domain).

---

## Finding 6: Gap 3c — storePruneAction does not prune skipped_sessions

**Severity:** MEDIUM
**Confidence:** HIGH
**Location:** `src/cli/commands/store.ts:100-118`
**Consensus:** 4/5 personas

**Evidence:**
`pruneOlderThan(store, ms, opts.project)` removes prompts by age. Skipped sessions have `skipped_at` timestamp. After pruning, skipped items whose prompt context no longer exists remain in the optimize queue — they replay correctly (using static fallback) but their prompt context is gone.

**Recommendation:**

Add to `src/store/skipped-sessions.ts`:
```typescript
/**
 * Remove skipped items older than cutoffMs.
 * Optionally scoped to a single project.
 */
export function pruneSkippedSessions(
  store:       Store,
  cutoffMs:    number,
  projectRoot?: string,
): void {
  const cutoff = Date.now() - cutoffMs;
  if (projectRoot) {
    store.db.run(
      'DELETE FROM skipped_sessions WHERE project_root = ? AND skipped_at < ?',
      [projectRoot, cutoff],
    );
  } else {
    store.db.run('DELETE FROM skipped_sessions WHERE skipped_at < ?', [cutoff]);
  }
}
```

In `storePruneAction`, after `pruneOlderThan`:
```typescript
import { pruneSkippedSessions } from '../../store/skipped-sessions.js';
// ...
const deleted = pruneOlderThan(store, ms, opts.project);
pruneSkippedSessions(store, ms, opts.project);   // ← add
closeStore(store);
```

**Persona Votes:** RE, AR, DA, SA confirm. PE abstains (not performance-relevant).

---

## Finding 7: Language string must be validated before LLM injection

**Severity:** MEDIUM
**Confidence:** MEDIUM
**Location:** `src/decision-session/PinchGenerator.ts:82-88`
**Consensus:** 3/5 personas (SA upgraded from LOW→MEDIUM; AR and DA confirm)

**Evidence:**
`language_override` is user-set config. A misconfigured value could inject arbitrary text into the LLM prompt. `tinyld` output is safe (ISO codes), but the override path is not.

**Recommendation:**

Add to `LanguageDetector.ts` (exported, testable):
```typescript
export function isValidLanguageCode(s: string): boolean {
  return /^[a-zA-Z]{2,8}$/.test(s.trim());
}
```

Use in `buildPinchPrompt`:
```typescript
import { isValidLanguageCode } from '../classifier/LanguageDetector.js';
// ...
const langInstruction = language && isValidLanguageCode(language)
  ? `\n\nLanguage: Respond with the label in ${language}.`
  : '';
```

Also validate in `resolveLanguage` before returning or in the auto pipeline before storing.

**Persona Votes:** SA confirm (upgraded), AR confirm, DA confirm, PE abstain, RE abstain.

---

## Finding 8: Profile null + language undefined need graceful no-ops

**Severity:** MEDIUM
**Confidence:** HIGH
**Location:** `src/decision-session/PinchGenerator.ts:67-88`
**Consensus:** 3/5 personas

**Evidence:**
Both `profile` and `language` are optional. On first invocation (< 5 prompts), `profile` will be `null`. If `undefined` is passed where `null` is expected, type narrowing must be explicit.

**Recommendation:**
- `generatePinchLabel` signature: `profile?: UserProfile` (not null). Pass `profile ?? undefined` at call site.
- `buildPinchPrompt` degrades gracefully: `if (!profile)` uses static tone; `if (!language || !isValidLanguageCode(language))` omits language instruction.

**Persona Votes:** RE, AR, SA confirm.
