import OpenAI from 'openai';
import type { UserProfile, PromptRecord, Stage } from '../classifier/types.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';
import type { DecisionContent, OptionEntry } from './options.js';
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
export const OPTION_GEN_MAX_TOKENS  = 900;
export const OPTION_GEN_TEMP        = 0;
export const OPTION_GEN_MAX_RETRIES = 1;

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

  return lines.length > 0 ? lines.join('\n  ') : 'No completed artifacts detected — no artifact-specific substitutions needed.';
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
 * to extract 1–maxWords specific feature nouns and embed them into
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

  // stop-hook fires on signal prompt; feature noun is in the preceding window prompts
  return `
Feature word grounding — embed at most ${maxWords} word(s) per option:
${advisoryBlock}Most recent session prompts (current feature context — do not copy these prompts verbatim into option text; extracting specific nouns for feature grounding is required):
${promptLines}
Feature noun extraction — identify the primary feature area:

From the 3–5 most recent session prompts, identify the primary feature area the developer has
been working on. Weight more recent prompts more heavily. Extract at most ${maxWords} word(s)
representing that feature area — favour the noun that appears across multiple recent prompts
over a noun that appears only in the last prompt.

A feature noun is a specific component, page, field, or behaviour name (e.g. "study group form",
"booking system", "forgot password flow"). Use 'this feature' only when none of the provided
prompts contains any named feature noun at all.`;
}

// ── CO-STAR prompt ─────────────────────────────────────────────────────────────

export function buildAdaptationPrompt(
  content:  DecisionContent,
  profile:  UserProfile | undefined,
  language: string | undefined,
  history:  PromptRecord[],
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

  // Multi-line options (steps separated by \n) are serialised as sub-arrays so the LLM
  // never needs to preserve \n inside a string — it just keeps the array structure.
  // OptionEntry.option carries the user-facing text the LLM rewrites; descBase is
  // out of scope for the adaptation prompt.
  const toPromptItem = (e: OptionEntry): string | string[] =>
    e.option.includes('\n') ? e.option.split('\n') : e.option;

  const inputJson = JSON.stringify({
    l1: content.L1.map(toPromptItem),
    l2: content.L2.map(toPromptItem),
    l3: content.L3.map(toPromptItem),
  });

  const typeLabel    = (e: OptionEntry): string =>
    e.option.includes('\n') ? `ARRAY(${e.option.split('\n').length})` : 'STRING';
  const typeContract = [
    `l1: [${content.L1.map(typeLabel).join(', ')}]`,
    `l2: [${content.L2.map(typeLabel).join(', ')}]`,
    `l3: [${content.L3.map(typeLabel).join(', ')}]`,
  ].join('\n  ');

  return `Context:
  A developer is using an AI coding agent. An advisory has been triggered.
  ${profile ? `Session profile: nature=${profile.nature}, mood=${profile.mood}, depth=${profile.depth}, precision=${profile.precisionOrdinal} (${profile.precisionScore}/10), playfulness=${profile.playfulnessOrdinal} (${profile.playfulnessScore}/10).` : 'Session profile: not yet computed — use neutral style.'}
  Completed artifacts detected from session history (confidence scores):
    - Spec/PRD: ${conf.spec}%
    - Unit tests: ${conf.unitTests}%
    - E2E tests: ${conf.e2eTests}%
    - Task breakdown: ${conf.taskBreakdown}%
  Artifact completion context (adjustments based on detected artifacts):
  ${grounding}${langNote}

Objective:
  Rewrite the vocabulary of each advisory option to match this developer's profile and the artifact adjustments above. VOCABULARY ADAPTATION ONLY — do not embed project-specific feature nouns.
  CRITICAL RULES:
    - Do NOT change the meaning, intent, or action of any option.
    - Do NOT add, remove, or reorder options.
    - Return EXACTLY the same JSON structure as the input.
    - If an input item is a STRING → output must be a STRING.
    - If an input item is an ARRAY → output must be an ARRAY of the SAME length. Each element is one step — rewrite its vocabulary only.
    - Each option or step must remain a complete instruction ready to send to an AI agent.

Style: ${styleLine}

Tone: ${toneLine}

Audience: A developer who is moving fast with an AI coding agent. Options are pre-filled prompts they will send directly to the agent.

Last 3 developer prompts (for vocabulary calibration — do not quote them in output):
${last3 || '(none yet)'}

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

Item type contract (absolute — semantic content does not override this):
  ${typeContract}

Now rewrite the following input:
${inputJson}

Response — return JSON only, no explanation, no markdown fencing:
{"l1":[...],"l2":[...],"l3":[...]}`;
}

// ── Pass 2 prompt — feature noun embedding ─────────────────────────────────────

export function buildEmbeddingPrompt(
  adaptedOptions: GeneratedOptions,
  history:        PromptRecord[],
  context?:       OptionGenContext,
): string {
  const groundingSection = buildFeatureGroundingSection(
    history,
    GroundingConfig.promptWindow,
    GroundingConfig.maxWords,
    context,
  );

  const typeLabel = (s: string): string => s.includes('\n') ? `ARRAY(${s.split('\n').length})` : 'STRING';
  const typeContract = [
    `l1: [${adaptedOptions.l1.map(typeLabel).join(', ')}]`,
    `l2: [${adaptedOptions.l2.map(typeLabel).join(', ')}]`,
    `l3: [${adaptedOptions.l3.map(typeLabel).join(', ')}]`,
  ].join('\n  ');

  const toPromptItem = (s: string): string | string[] =>
    s.includes('\n') ? s.split('\n') : s;

  const inputJson = JSON.stringify({
    l1: adaptedOptions.l1.map(toPromptItem),
    l2: adaptedOptions.l2.map(toPromptItem),
    l3: adaptedOptions.l3.map(toPromptItem),
  });

  return `${groundingSection.trimStart()}

Embed the extracted feature noun into each adapted option below. Prefer replacing a standard generic phrase if present:
  "what was just built", "what was just made", "what was just created",
  "this project", "this feature".
If none of these phrases survived adaptation, embed the feature noun at the most appropriate place with minimal rewrite — preserve the option's meaning, action, and intent. Replace one occurrence per option only.

Schema examples — each shows adapted input → grounded output:

Example 1 — "what was just built" replaced with the extracted feature noun:
Input:  {"l1":["Review what was just built: does it match the spec? Flag any gaps.","Run the tests for what was just built and report results."],"l2":["Quick check on what was just built — any obvious issues?"],"l3":["Any problems in what was just built before moving on?"]}
Feature noun: "login flow"
Output: {"l1":["Review the login flow: does it match the spec? Flag any gaps.","Run the tests for the login flow and report results."],"l2":["Quick check on the login flow — any obvious issues?"],"l3":["Any problems in the login flow before moving on?"]}

Example 2 — "what was just made" in a step array — replace the first step that contains the phrase; other steps unchanged:
Input:  {"l1":[["Review what was just made — does it do what this task asked for?","Share your review before I mark this done.","Flag anything that looks off."],"Check if what was just made matches what the task asked for."],"l2":["Does what was just made look right to you?"],"l3":["Is there anything in what was just made that looks wrong?"]}
Feature noun: "recurring invoice"
Output: {"l1":[["Review the recurring invoice — does it do what this task asked for?","Share your review before I mark this done.","Flag anything that looks off."],"Check if the recurring invoice matches what the task asked for."],"l2":["Does the recurring invoice look right to you?"],"l3":["Is there anything in the recurring invoice that looks wrong?"]}

Example 3 — "this project" replaced with the extracted feature noun:
Input:  {"l1":["Write a PRD for this project: define the problem, target user, and core features.","What does the first version of this project need to deliver?"],"l2":["Write a one-paragraph scope statement for this project."],"l3":["What is this project for and what problem does it solve?"]}
Feature noun: "client portal"
Output: {"l1":["Write a PRD for the client portal: define the problem, target user, and core features.","What does the first version of the client portal need to deliver?"],"l2":["Write a one-paragraph scope statement for the client portal."],"l3":["What is the client portal for and what problem does it solve?"]}

Example 4 — "this feature" replaced with the extracted feature noun:
Input:  {"l1":["Set up the feedback loop for this feature: what signals tell you it is working?","What are the top 3 signals to watch for this feature in the first 24 hours?"],"l2":["Is there a signal that would tell you if this feature breaks silently in production?"],"l3":["What is the most important thing to monitor for this feature?"]}
Feature noun: "invoice reminder"
Output: {"l1":["Set up the feedback loop for the invoice reminder: what signals tell you it is working?","What are the top 3 signals to watch for the invoice reminder in the first 24 hours?"],"l2":["Is there a signal that would tell you if the invoice reminder breaks silently in production?"],"l3":["What is the most important thing to monitor for the invoice reminder?"]}

Example 5 — no standard target phrase in any option — embed the feature noun at the most appropriate place with minimal rewrite:
Input:  {"l1":[["Check that everything still works — go through the main things before we ship.","Share the results before releasing.","Is there anything that could go wrong once it's live?"],"Check if this is ready to go live."],"l2":["What is the biggest risk in shipping this right now?"],"l3":["Is there anything that could break once it's live?"]}
Feature noun: "login"
Output: {"l1":[["Check that login is still working — go through the main things before we ship.","Share the results before releasing.","Is there anything about login that could go wrong once it's live?"],"Check if login is ready to go live."],"l2":["What is the biggest risk in shipping login right now?"],"l3":["Is there anything about login that could break once it's live?"]}

Item type contract (absolute — semantic content does not override this):
  ${typeContract}

Now embed the feature noun into the following adapted options:
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
  // Source is OptionEntry[]; the .option field holds the user-facing text whose
  // newline structure determines the expected LLM-output shape per item.
  const reassemble = (items: unknown[], source: OptionEntry[], key: string): string[] | string => {
    const result: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const srcText      = source[i].option;
      const srcSteps     = srcText.split('\n').length;
      const srcMultiLine = srcText.includes('\n');
      const item = items[i];
      if (srcMultiLine) {
        // Cases 1+2: structural violations — fall back to original source text for this item
        if (!Array.isArray(item) || (item as unknown[]).length !== srcSteps) {
          result.push(srcText);
          continue;
        }
        // Case 3: content quality failure — keep error-return so retry still fires
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
 * Runs vocabulary adaptation then feature noun embedding.
 * On validation failure, retries up to OPTION_GEN_MAX_RETRIES times — each retry
 * appends the specific rejection error to the conversation so the LLM can self-correct.
 * Returns null only after all adaptation attempts are exhausted; caller falls back to static options.
 * If the embedding step exhausts retries or throws, returns the adapted output as-is.
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
  // ── Pass 1: vocabulary adaptation ─────────────────────────────────────────────
  let pass1Output: GeneratedOptions | null = null;
  // Constructor is inside the try so a missing OPENAI_API_KEY surfaces as a null
  // return (graceful fallback to static options), not a synchronous throw.
  let openai!: OpenAI;

  try {
    openai = client ?? new OpenAI();
    const prompt = buildAdaptationPrompt(content, profile, language, history);
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
        { timeout: 12_000 },
      );

      const raw    = response.choices[0]?.message?.content ?? '';
      const result = validateWithError(raw, content);

      if ('options' in result) {
        pass1Output = result.options;
        break;
      }

      lastRaw   = raw;
      lastError = result.error;
      logger.debug('option_gen_pass1_validate_fail', { pass: 1, attempt, error: result.error, raw: raw.slice(0, 200) });
    }

    if (pass1Output === null) {
      logger.debug('option_gen_pass1_retries_failed', { lastError });
      return null;
    }
  } catch (err) {
    logger.debug('option_gen_error', { error: String(err) });
    return null;
  }

  if (!pass1Output) return null;

  // ── Pass 2: feature noun embedding ────────────────────────────────────────────
  if (!GroundingConfig.enabled) {
    logger.debug('option_gen_pass2_skipped');
    return pass1Output;
  }

  try {
    const prompt = buildEmbeddingPrompt(pass1Output, history, context);
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
        { timeout: 12_000 },
      );

      const raw    = response.choices[0]?.message?.content ?? '';
      const result = validateWithError(raw, content);

      if ('options' in result) return result.options;

      lastRaw   = raw;
      lastError = result.error;
      logger.debug('option_gen_pass2_validate_fail', { pass: 2, attempt, error: result.error, raw: raw.slice(0, 200) });
    }

    logger.debug('option_gen_pass2_retries_failed', { lastError });
    logger.debug('option_gen_pass2_fallback');
    return pass1Output;
  } catch (err) {
    logger.debug('option_gen_error', { error: String(err) });
    logger.debug('option_gen_pass2_fallback');
    return pass1Output;
  }
}

// Post-Pass-2 substitution pipeline lives in ./runtime-substitutions.ts
