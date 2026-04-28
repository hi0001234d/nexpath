import OpenAI from 'openai';
import type { UserProfile, PromptRecord } from '../classifier/types.js';
import type { DecisionContent } from './options.js';

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

export const OPTION_GEN_MODEL      = 'gpt-4o-mini';
export const OPTION_GEN_MAX_TOKENS = 600;
export const OPTION_GEN_TEMP       = 0;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GeneratedOptions {
  l1: string[];
  l2: string[];
  l3: string[];
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
  // Nature takes precedence over depth for vocabulary style
  if (nature === 'cool_geek')    return 'Casual technical — "ship it", "wire up" style, informal but accurate.';
  if (nature === 'pro_geek_soul') return 'Technical + energy — precise but expressive, enthusiastic.';
  if (nature === 'beginner' || depth === 'low')  return 'Plain English, avoid jargon, short sentences, encouraging.';
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

// ── CO-STAR prompt ─────────────────────────────────────────────────────────────

export function buildOptionPrompt(
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

  const last3 = history.slice(-3).map((p, i) => `[${i + 1}] ${p.text}`).join('\n');

  const l1 = content.L1.map((o, i) => `  ${i + 1}. ${o}`).join('\n');
  const l2 = content.L2.map((o, i) => `  ${i + 1}. ${o}`).join('\n');
  const l3 = content.L3.map((o, i) => `  ${i + 1}. ${o}`).join('\n');

  return `Context:
  A developer is using an AI coding agent. An advisory has been triggered.
  ${profile ? `Session profile: nature=${profile.nature}, mood=${profile.mood}, depth=${profile.depth}, precision=${profile.precisionScore}/10, playfulness=${profile.playfulnessScore}/10.` : 'Session profile: not yet computed — use neutral style.'}
  Completed artifacts detected from session history (confidence scores):
    - Spec/PRD: ${conf.spec}%
    - Unit tests: ${conf.unitTests}%
    - E2E tests: ${conf.e2eTests}%
    - Task breakdown: ${conf.taskBreakdown}%
  Grounding rules based on above confidence:
  ${grounding}${langNote}

Objective:
  Rewrite the vocabulary of each advisory option below to match this developer's profile and the grounding rules above.
  CRITICAL RULES — do not break any of these:
    - Do NOT change the meaning, intent, or action of any option.
    - Do NOT add new options. Do NOT remove options. Do NOT reorder options.
    - Return EXACTLY the same number of options at each level (L1=${content.L1.length}, L2=${content.L2.length}, L3=${content.L3.length}).
    - Each option must remain a complete, standalone instruction ready to send to an AI agent.

Style: ${styleLine}

Tone: ${toneLine}

Audience: A developer who is moving fast with an AI coding agent. Options are pre-filled prompts they will send directly to the agent.

Last 3 developer prompts (for vocabulary calibration — do not quote them in output):
${last3 || '(none yet)'}

Options to rewrite:

L1 (${content.L1.length} items):
${l1}

L2 (${content.L2.length} items):
${l2}

L3 (${content.L3.length} items):
${l3}

Response — return JSON only, no explanation, no markdown fencing:
{"l1":["..."],"l2":["..."],"l3":["..."]}`;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateGeneratedOptions(
  raw:     string,
  content: DecisionContent,
): GeneratedOptions | null {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed: unknown;
  try { parsed = JSON.parse(stripped); } catch { return null; }

  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.l1) || !Array.isArray(p.l2) || !Array.isArray(p.l3)) return null;

  const l1 = p.l1 as unknown[];
  const l2 = p.l2 as unknown[];
  const l3 = p.l3 as unknown[];

  // Count must match static exactly
  if (l1.length !== content.L1.length) return null;
  if (l2.length !== content.L2.length) return null;
  if (l3.length !== content.L3.length) return null;

  // All items must be non-empty strings
  const allStrings = [...l1, ...l2, ...l3].every((x) => typeof x === 'string' && (x as string).trim().length > 0);
  if (!allStrings) return null;

  return { l1: l1 as string[], l2: l2 as string[], l3: l3 as string[] };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generate personalised option text for the decision session.
 *
 * Returns null on any failure — caller uses static buildOptionList() as fallback.
 * Never throws.
 */
export async function generateOptionList(
  content:  DecisionContent,
  profile:  UserProfile | undefined,
  language: string | undefined,
  history:  PromptRecord[],
  client?:  OpenAI,
): Promise<GeneratedOptions | null> {
  try {
    const openai  = client ?? new OpenAI();
    const prompt  = buildOptionPrompt(content, profile, language, history);

    const response = await openai.chat.completions.create(
      {
        model:       OPTION_GEN_MODEL,
        messages:    [{ role: 'user', content: prompt }],
        temperature: OPTION_GEN_TEMP,
        max_tokens:  OPTION_GEN_MAX_TOKENS,
      },
      { timeout: 5_000 },
    );

    const raw = response.choices[0]?.message?.content ?? '';
    return validateGeneratedOptions(raw, content);
  } catch {
    return null;
  }
}
