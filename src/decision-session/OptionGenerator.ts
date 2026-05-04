import OpenAI from 'openai';
import type { UserProfile, PromptRecord, Stage } from '../classifier/types.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';
import type { DecisionContent } from './options.js';
import { logger } from '../logger.js';
import { GroundingConfig } from '../config/GroundingConfig.js';

/**
 * Dynamic option text generator.
 *
 * Rewrites the vocabulary of static advisory options to match the developer's
 * profile (nature, mood, depth) and project grounding (detected completed
 * artifacts from prompt history).
 *
 * CO-STAR prompt structure — mirrors PinchGenerator.ts.
 * Returns null on any failure; caller falls back to static buildOptionList().
 */

// ── Constants ──────────────────────────────────────────────────────────────────

export const OPTION_GEN_MODEL       = 'gpt-4o-mini';
export const OPTION_GEN_MAX_TOKENS  = 750;
export const OPTION_GEN_TEMP        = 0;
export const OPTION_GEN_MAX_RETRIES = 2;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GeneratedOptions {
  l1: string[];
  l2: string[];
  l3: string[];
}

export interface OptionGenContext {
  flagType:              FlagType;
  currentStage:          Stage;
  prevStage?:            Stage;
  promptsInCurrentStage: number;
}

// ── Project grounding — completed artifact detection ──────────────────────────

interface ArtifactConfidence {
  spec:          number;
  unitTests:     number;
  e2eTests:      number;
  taskBreakdown: number;
}

const SPEC_KEYWORDS        = /\b(prd|spec|requirements?|user stor(?:y|ies)|acceptance criteria|product doc)\b/i;
const SPEC_REVIEW_KEYWORDS = /\b(review(?:ing)? (?:the )?(?:prd|spec|requirements?)|correct(?:ing)? (?:the )?(?:prd|spec)|update(?:ing)? (?:the )?(?:prd|spec))\b/i;
const UNIT_TEST_KEYWORDS   = /\b(unit test|write (?:a )?test|test file|describe\s*\(|it\s*\(|jest|vitest|pytest|mocha|spec file)\b/i;
const UNIT_TEST_RUN        = /\b(run(?:ning)? (?:the )?tests?|fix(?:ing)? (?:the )?tests?|test(?:s)? (?:fail|pass))\b/i;
const E2E_KEYWORDS         = /\b(e2e|end.to.end|cypress|playwright|integration test|acceptance test)\b/i;
const TASK_KEYWORDS        = /\b(break(?:ing)? (?:it |this |down )?into tasks?|subtasks?|tickets?|user stor(?:y|ies)|task list|backlog|checklist)\b/i;
const TASK_REVIEW_KEYWORDS = /\b(review(?:ing)? (?:the )?tasks?|updat(?:e|ing) (?:the )?task)\b/i;
const NEW_TASK_BOUNDARY    = /\b(now (?:let['']?s )?work on|next(?:,| up)|starting on|moving (?:on )?to)\b/i;

function scoreArtifacts(history: PromptRecord[]): ArtifactConfidence {
  const conf: ArtifactConfidence = { spec: 0, unitTests: 0, e2eTests: 0, taskBreakdown: 0 };

  // Scope to current task window — reset at any new-task-boundary prompt
  let windowStart = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (NEW_TASK_BOUNDARY.test(history[i].text)) { windowStart = i + 1; break; }
  }
  const window = history.slice(windowStart);

  for (const p of window) {
    const t = p.text;

    // Spec
    if (SPEC_REVIEW_KEYWORDS.test(t))   conf.spec = Math.min(60, conf.spec + 25);
    else if (SPEC_KEYWORDS.test(t))     conf.spec = Math.min(60, conf.spec + 30);

    // Unit tests
    if (UNIT_TEST_RUN.test(t))          conf.unitTests = Math.min(60, conf.unitTests + 30);
    else if (UNIT_TEST_KEYWORDS.test(t)) conf.unitTests = Math.min(60, conf.unitTests + 30);

    // E2E tests
    if (E2E_KEYWORDS.test(t))           conf.e2eTests = Math.min(60, conf.e2eTests + 30);

    // Task breakdown
    if (TASK_REVIEW_KEYWORDS.test(t))   conf.taskBreakdown = Math.min(60, conf.taskBreakdown + 25);
    else if (TASK_KEYWORDS.test(t))     conf.taskBreakdown = Math.min(60, conf.taskBreakdown + 30);
  }

  return conf;
}

function buildGroundingLines(conf: ArtifactConfidence): string {
  const lines: string[] = [];

  // Spec
  if (conf.spec < 30) {
    lines.push('EXCLUDE any option that references a spec, PRD, or requirements document. Substitute with a code-review-only alternative.');
  } else if (conf.spec < 60) {
    lines.push('If an option references a spec or PRD, phrase it as "if you have written requirements for this, verify now" — do not assume it exists.');
  }
  // conf.spec >= 60 (cap): include spec-referencing options with vocabulary adaptation only

  // Unit tests
  if (conf.unitTests >= 60) {
    lines.push('Unit tests are likely written. Replace any option that says "write unit tests" with the next logical step: suggest integration or e2e tests instead.');
  } else if (conf.unitTests >= 30) {
    lines.push('Unit tests may partially exist. If an option references unit tests, phrase it as "verify unit test coverage before continuing".');
  }

  // E2E tests
  if (conf.e2eTests >= 30) {
    lines.push('E2E tests appear to be in progress or complete. If an option suggests writing e2e tests, advance it to the next quality step (e.g. "review coverage gaps" or "run the full test suite").');
  }

  // Task breakdown
  if (conf.taskBreakdown >= 30) {
    lines.push('A task breakdown likely exists. Replace any option that says "break this into tasks" with a review or validation step: "review your task list before starting implementation".');
  }

  return lines.length > 0 ? lines.join('\n  ') : 'No completed artifacts detected — use the options as-is, only adapt vocabulary.';
}

// ── Style / tone helpers ───────────────────────────────────────────────────────

function buildStyleLine(profile: UserProfile): string {
  const { nature, depth } = profile;
  if (depth === 'low')            return 'Plain English, avoid jargon, short sentences, encouraging.';
  if (nature === 'cool_geek')    return 'Casual technical — "ship it", "wire up" style, informal but accurate.';
  if (nature === 'pro_geek_soul') return 'Technical + energy — precise but expressive, enthusiastic.';
  if (nature === 'beginner')      return 'Plain English, avoid jargon, short sentences, encouraging.';
  if (nature === 'hardcore_pro' || depth === 'high') return 'Precise technical terms, no hand-holding, peer-level.';
  return 'Neutral professional tone.';
}

function buildToneLine(profile: UserProfile): string {
  const { mood } = profile;
  if (mood === 'frustrated') return 'Empathetic — acknowledge the difficulty, reduce friction.';
  if (mood === 'rushed')     return 'Ultra-concise — no filler, action words only.';
  if (mood === 'excited')    return 'Match the energy — enthusiastic but still directive.';
  if (mood === 'casual')     return 'Relaxed — conversational, low pressure.';
  return 'Direct and structured — no emotional content.';
}

// ── Feature word grounding helper ──────────────────────────────────────────────

/**
 * Builds the feature word grounding section of the option generation prompt.
 *
 * Passes the last `promptWindow` session prompts to the LLM and instructs it
 * to extract 1–maxWords specific feature nouns and embed them naturally into
 * each generated option. If fewer prompts exist than the window, all are used.
 *
 * When `context` is provided, an informational advisory block is prepended that
 * explains why this advisory fired. This helps the LLM calibrate grounding
 * without overriding the identification logic.
 */
function buildFeatureGroundingSection(
  history:      PromptRecord[],
  promptWindow: number,
  maxWords:     number,
  context?:     OptionGenContext,
): string {
  const recent = history.slice(-promptWindow);
  if (recent.length === 0) return '';

  const promptLines = recent.map((p, i) => `[${i + 1}] ${p.text}`).join('\n');

  // Advisory context block — informational only; explains WHY the advisory fired.
  // Does not prescribe which prompts to use for grounding.
  let advisoryBlock = '';
  if (context) {
    if (context.flagType === 'stage_transition') {
      advisoryBlock = `Advisory context: stage_transition — developer moved from "${context.prevStage ?? 'unknown'}" → "${context.currentStage}" stage. This advisory asks them to review what was completed before moving on.\n`;
    } else {
      const absenceFlag = context.flagType.replace('absence:', '');
      advisoryBlock = `Advisory context: absence advisory — "${absenceFlag}" pattern not yet seen across ${context.promptsInCurrentStage} prompt(s) in "${context.currentStage}" stage. This advisory asks them to address this quality gap before moving forward.\n`;
    }
  }

  return `
Feature word grounding — embed at most ${maxWords} word(s) naturally per option:
${advisoryBlock}Most recent session prompts (current feature context — do not quote verbatim):
${promptLines}
Extract the feature term from the last prompt listed only (the highest-numbered one).
If it describes a meta-operation (fixing a bug, making something look nicer, deploying,
restyling) with no specific feature noun, write 'this feature' as the replacement — it
reads neutrally. Embed the term into each option by replacing the most fitting generic
noun phrase. Valid replacement targets:
  "what was just built", "what was just made", "what was just created",
  "this project", "this feature".
Replace the first natural occurrence per option only. If none of these phrases
appears in an option, leave that option unchanged.`;
}

// ── CO-STAR prompt ─────────────────────────────────────────────────────────────

export function buildOptionPrompt(
  content:  DecisionContent,
  profile:  UserProfile | undefined,
  language: string | undefined,
  history:  PromptRecord[],
  context?: OptionGenContext,
): string {
  const conf         = scoreArtifacts(history);
  const grounding    = buildGroundingLines(conf);
  const styleLine    = profile ? buildStyleLine(profile) : 'Neutral professional tone.';
  const toneLine     = profile ? buildToneLine(profile)  : 'Direct and structured.';
  const langNote     = language && language !== 'en'
    ? `\nLanguage: Rewrite in vocabulary appropriate for a ${language}-speaking developer. Use plain, jargon-free phrasing — the developer may not be a native English speaker.`
    : '';

  // Vocab calibration — always use last 3 (same as before)
  const last3 = history.slice(-3).map((p, i) => `[${i + 1}] ${p.text}`).join('\n');

  // Feature word grounding — recent window for current-feature context
  const groundingLines = GroundingConfig.enabled
    ? buildFeatureGroundingSection(history, GroundingConfig.promptWindow, GroundingConfig.maxWords, context)
    : '';

  // Multi-line options (steps separated by \n) are serialised as sub-arrays so the LLM
  // never needs to preserve \n inside a string — it just keeps the array structure.
  const toPromptItem = (s: string): string | string[] =>
    s.includes('\n') ? s.split('\n') : s;

  const inputJson = JSON.stringify({
    l1: content.L1.map(toPromptItem),
    l2: content.L2.map(toPromptItem),
    l3: content.L3.map(toPromptItem),
  });

  return `Context:
  A developer is using an AI coding agent. An advisory has been triggered.
  ${profile ? `Session profile: nature=${profile.nature}, mood=${profile.mood}, depth=${profile.depth}, precision=${profile.precisionOrdinal} (${profile.precisionScore}/10), playfulness=${profile.playfulnessOrdinal} (${profile.playfulnessScore}/10).` : 'Session profile: not yet computed — use neutral style.'}
  Completed artifacts detected from session history (confidence scores):
    - Spec/PRD: ${conf.spec}%
    - Unit tests: ${conf.unitTests}%
    - E2E tests: ${conf.e2eTests}%
    - Task breakdown: ${conf.taskBreakdown}%
  Grounding rules based on above confidence:
  ${grounding}${langNote}

Objective:
  Rewrite the vocabulary of each advisory option to match this developer's profile and the grounding rules above.
  CRITICAL RULES:
    - Do NOT change the meaning, intent, or action of any option.
    - Do NOT add, remove, or reorder options.
    - Return EXACTLY the same JSON structure as the input.
    - If an input item is a STRING → output must be a STRING.
    - If an input item is an ARRAY → output must be an ARRAY of the SAME length. Each element is one step — rewrite its vocabulary only.
    - Each option or step must remain a complete instruction ready to send to an AI agent.
    - Feature grounding (apply when the section below identifies a feature term): replace
      the first matching phrase in each option ("what was just built", "what was just made",
      "what was just created", "this project", "this feature") with the specific feature noun.
      Replace one occurrence per option only. See Example 4 below.

Style: ${styleLine}

Tone: ${toneLine}

Audience: A developer who is moving fast with an AI coding agent. Options are pre-filled prompts they will send directly to the agent.

Last 3 developer prompts (for vocabulary calibration — do not quote them in output):
${last3 || '(none yet)'}
${groundingLines}

Schema examples — each shows input → output. Follow this structure exactly:

Example 1 — option with numbered steps (input array → output array, same length):
Input:  {"l1":[["1. Review what was just built.","2. Share your review before marking this done.","3. Check if anything might break."],"Keep it brief — share what you find."],"l2":["Walk through each step.","Quick summary."],"l3":["One-liner only."]}
Output: {"l1":[["1. Take a look at what was just made.","2. Let me know what you find before we say it's done.","3. Check if anything could break."],"Quick look — tell me what you see."],"l2":["Walk me through each step.","Short summary."],"l3":["One line."]}

Example 2 — all simple text options (strings in, strings out):
Input:  {"l1":["Run the full test suite now.","Smoke test first."],"l2":["Run the specific failing test.","Skip tests, check logs."],"l3":["Ignore tests for now."]}
Output: {"l1":["Run all the tests now.","Quick check first."],"l2":["Run just the broken test.","Skip tests, look at logs."],"l3":["Don't worry about tests yet."]}

Example 3 — mixed: some items are step arrays, some are plain strings:
Input:  {"l1":[["1. Describe what changed.","2. Confirm it works as expected."],"One-line summary of what changed."],"l2":["Detail each changed part.","High-level only."],"l3":["Just the summary."]}
Output: {"l1":[["1. Say what you changed in plain words.","2. Tell me it's working now."],"Short — what just happened?"],"l2":["Walk me through each changed part.","Just the big picture."],"l3":["Quick summary only."]}

Example 4 — feature word grounding ("recurring invoice feature" replaces "this project" in a planning option):
Input:  {"l1":["Write a PRD for this project: define the problem, target user, core features with acceptance criteria, and what is out of scope.","Define the problem and success criteria first: who is this project for and what problem does it solve?"],"l2":["Write a one-paragraph scope statement for this project."],"l3":["List the 3 most important acceptance criteria for this project."]}
Output: {"l1":["Write a PRD for the recurring invoice feature: define the problem, target user, core features with acceptance criteria, and what is out of scope.","Define the problem and success criteria first: who is the recurring invoice feature for and what problem does it solve?"],"l2":["Write a one-paragraph scope statement for the recurring invoice feature."],"l3":["List the 3 most important acceptance criteria for the recurring invoice feature."]}

Now rewrite the following input:
${inputJson}

Response — return JSON only, no explanation, no markdown fencing:
{"l1":[...],"l2":[...],"l3":[...]}`;
}

// ── Validation ─────────────────────────────────────────────────────────────────

type ValidationResult = { options: GeneratedOptions } | { error: string };

function validateWithError(raw: string, content: DecisionContent): ValidationResult {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed: unknown;
  try { parsed = JSON.parse(stripped); } catch {
    return { error: 'Response is not valid JSON.' };
  }

  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.l1) || !Array.isArray(p.l2) || !Array.isArray(p.l3))
    return { error: 'Response is missing required arrays l1, l2, or l3.' };

  const rawL1 = p.l1 as unknown[];
  const rawL2 = p.l2 as unknown[];
  const rawL3 = p.l3 as unknown[];

  if (rawL1.length !== content.L1.length)
    return { error: `l1 has ${rawL1.length} item(s) but must have exactly ${content.L1.length}.` };
  if (rawL2.length !== content.L2.length)
    return { error: `l2 has ${rawL2.length} item(s) but must have exactly ${content.L2.length}.` };
  if (rawL3.length !== content.L3.length)
    return { error: `l3 has ${rawL3.length} item(s) but must have exactly ${content.L3.length}.` };

  // Per-item type validation and reassembly:
  //   source had \n  → generated item must be array of same step-count → join with \n
  //   source had no \n → generated item must be a plain string
  const reassemble = (items: unknown[], source: string[], key: string): string[] | string => {
    const result: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const srcSteps     = source[i].split('\n').length;
      const srcMultiLine = source[i].includes('\n');
      const item = items[i];
      if (srcMultiLine) {
        if (!Array.isArray(item))
          return `${key}[${i}] must be an array of ${srcSteps} step(s) (input was multi-line), got string.`;
        if ((item as unknown[]).length !== srcSteps)
          return `${key}[${i}] is an array of ${(item as unknown[]).length} step(s) but must have exactly ${srcSteps}.`;
        if (!(item as unknown[]).every((x) => typeof x === 'string' && (x as string).trim().length > 0))
          return `${key}[${i}] contains an empty or non-string step.`;
        result.push((item as string[]).join('\n'));
      } else {
        if (typeof item !== 'string' || !(item as string).trim())
          return `${key}[${i}] must be a non-empty string (input was single-line), got ${Array.isArray(item) ? 'array' : typeof item}.`;
        result.push(item as string);
      }
    }
    return result;
  };

  const r1 = reassemble(rawL1, content.L1, 'l1');
  if (typeof r1 === 'string') return { error: r1 };
  const r2 = reassemble(rawL2, content.L2, 'l2');
  if (typeof r2 === 'string') return { error: r2 };
  const r3 = reassemble(rawL3, content.L3, 'l3');
  if (typeof r3 === 'string') return { error: r3 };

  return { options: { l1: r1, l2: r2, l3: r3 } };
}

export function validateGeneratedOptions(
  raw:     string,
  content: DecisionContent,
): GeneratedOptions | null {
  const result = validateWithError(raw, content);
  return 'options' in result ? result.options : null;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generate personalised option text for the decision session.
 *
 * On validation failure, retries up to OPTION_GEN_MAX_RETRIES times — each retry
 * appends the specific rejection error to the conversation so the LLM can self-correct.
 * Returns null only after all attempts are exhausted; caller falls back to static options.
 * Never throws.
 */
export async function generateOptionList(
  content:  DecisionContent,
  profile:  UserProfile | undefined,
  language: string | undefined,
  history:  PromptRecord[],
  context?: OptionGenContext,
  client?:  OpenAI,
): Promise<GeneratedOptions | null> {
  try {
    const openai  = client ?? new OpenAI();
    const prompt  = buildOptionPrompt(content, profile, language, history, context);

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: prompt },
    ];

    let lastRaw   = '';
    let lastError = '';

    for (let attempt = 0; attempt <= OPTION_GEN_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        messages.push({ role: 'assistant', content: lastRaw });
        messages.push({
          role:    'user',
          content: `Your response was rejected. Error: ${lastError} Fix only this issue and re-generate the complete JSON.`,
        });
      }

      const response = await openai.chat.completions.create(
        {
          model:           OPTION_GEN_MODEL,
          messages,
          temperature:     OPTION_GEN_TEMP,
          max_tokens:      OPTION_GEN_MAX_TOKENS,
          response_format: { type: 'json_object' },
        },
        { timeout: 5_000 },
      );

      const raw    = response.choices[0]?.message?.content ?? '';
      const result = validateWithError(raw, content);

      if ('options' in result) return result.options;

      lastRaw   = raw;
      lastError = result.error;
      logger.debug('option_gen_validate_fail', { attempt, error: result.error, raw: raw.slice(0, 200) });
    }

    logger.debug('option_gen_all_retries_failed', { lastError });
    return null;
  } catch (err) {
    logger.debug('option_gen_error', { error: String(err) });
    return null;
  }
}
