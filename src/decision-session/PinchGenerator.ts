import { newNexpathOpenAIClient } from '../config/llm-client-scope.js';
import OpenAI from 'openai';
import type { Stage, UserProfile } from '../classifier/types.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';
import { isValidLanguageCode } from '../classifier/LanguageDetector.js';
import { pinchSignalTypeForFlag } from './content-template-source.js';
import { resolvePinchFields } from './signal-pinch-fields.js';
import { selectionRegister } from './selection-registry.js';

/**
 * Pinch word generator (per decision-session-ux-research.md Part 4).
 *
 * Makes a separate gpt-4o-mini call to produce a 2-3 word "pinch label" —
 * a bold bright-cyan header line that opens the decision session.
 *
 * The label sets the tone before the question line. It stays constant
 * across all cascade levels (identity anchor — per research decision).
 *
 * CO-STAR prompt structure used for the generation call.
 *
 * Fallback: if the API call fails, times out, or returns unusable output,
 * a static label is used from the content table (pinchFallback field).
 */

// ── Constants ──────────────────────────────────────────────────────────────────

export const PINCH_MODEL           = 'gpt-4o-mini';
export const PINCH_MAX_TOKENS      = 24;   // 2-3 words — generous budget
export const PINCH_TEMPERATURE     = 0.9;  // creative variation
/** Maximum characters for a valid pinch label (2-3 short words). */
export const PINCH_MAX_CHARS       = 40;
/** Minimum characters — must be at least 2 chars (not empty). */
export const PINCH_MIN_CHARS       = 2;

// ── Static fallback table ──────────────────────────────────────────────────────

// ── CO-STAR prompt ─────────────────────────────────────────────────────────────

function buildToneHint(profile: UserProfile): string {
  const modifiers: string[] = [];
  if (profile.mood === 'frustrated') modifiers.push('especially empathetic and patient');
  if (profile.mood === 'rushed')     modifiers.push('ultra-concise, no filler');
  if (profile.mood === 'excited')    modifiers.push('energetic and encouraging');
  if (profile.depth === 'high')      modifiers.push('peer-level technical, no hand-holding');
  if (profile.nature === 'beginner') modifiers.push('encouraging, jargon-free');
  return modifiers.length > 0
    ? `Motivating and friendly. Additional tone: ${modifiers.join('; ')}.`
    : 'Motivating and friendly, not judgmental. Like a trusted colleague tapping them on the shoulder.';
}

/**
 * Build the CO-STAR prompt for the pinch label generation.
 *
 * CO-STAR structure:
 *   C — Context     : what is happening in the session
 *   O — Objective   : generate a 2-3 word label
 *   S — Style       : concise, punchy, developer-friendly
 *   T — Tone        : motivating, not judgmental, non-technical (profile-adapted when available)
 *   A — Audience    : a developer who is vibe coding with an AI agent
 *   R — Response    : 2-3 words only, plain text, no punctuation
 */
export function buildPinchPrompt(
  question:     string,
  flagType:     FlagType,
  currentStage: Stage,
  profile?:     UserProfile,
  language?:    string,
): string {
  const tone = profile
    ? buildToneHint(profile)
    : 'Motivating and friendly, not judgmental. Like a trusted colleague tapping them on the shoulder.';

  const isKnownEnglish = language === 'en';
  const plainEnglishNote = !isKnownEnglish
    ? '\n\nStyle note: Use plain, jargon-free English — no idioms or cultural references. The developer may not be a native English speaker.'
    : '';

  return `Context: A developer is using an AI coding agent. The system has detected that the developer may benefit from a quick check-in. The situation: ${question}

Objective: Generate a 2-3 word label that opens a short advisory popup. The label appears in bold at the top of the popup, above the question "${question}".

Style: Ultra-concise. Punchy. Memorable. Think of it as a chapter title or a traffic sign — not a sentence.

Tone: ${tone}

Audience: A developer who is moving fast with an AI coding agent. They may be mid-flow. The label should feel like a natural pause, not an interruption.

Response format: Output ONLY the 2-3 word label. No punctuation at the end. No quotes. No explanation. Examples of the right style: "Hold up.", "Quick check.", "Before coding.", "Worth a pause."

Flag type context: ${flagType}
Current stage: ${currentStage}${plainEnglishNote}

Output the label now:`;
}

// ── Validation ─────────────────────────────────────────────────────────────────

/**
 * Validate and clean a raw LLM response for use as a pinch label.
 *
 * Rules (per research):
 *   - Must be 2–3 words
 *   - Strip surrounding quotes and whitespace
 *   - If empty or too long (> PINCH_MAX_CHARS), reject
 *
 * Returns the cleaned label, or null if invalid.
 */
export function validatePinchLabel(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '') // strip surrounding quotes
    .trim();

  if (!cleaned || cleaned.length < PINCH_MIN_CHARS) return null;
  if (cleaned.length > PINCH_MAX_CHARS) return null;

  const wordCount = cleaned.split(/\s+/).length;
  if (wordCount < 1 || wordCount > 4) return null; // allow up to 4 for flexibility

  return cleaned;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generate a 2-3 word pinch label for the decision session header.
 *
 * Tries the gpt-4o-mini API call first.
 * Falls back to the static label from the content table on any failure.
 *
 * Never throws — always returns a usable string.
 *
 * @param stage    Current detected stage
 * @param flagType What triggered the decision session
 * @param client   Optional OpenAI client (injectable for testing)
 */
export async function generatePinchLabel(
  stage:     Stage,
  flagType:  FlagType,
  client?:   OpenAI,
  profile?:  UserProfile,
  language?: string,
  overrides?: { question?: string; pinchFallback?: string },
): Promise<string> {
  // The caller usually supplies the migrated record's own question / pinchFallback; otherwise resolve
  // them from the register-keyed pinch-fields map (the whole question/pinch layer after the cutover).
  const signalType = pinchSignalTypeForFlag(flagType, stage);
  const fields   = signalType ? resolvePinchFields(signalType, selectionRegister(profile?.nature)) : undefined;
  const question = overrides?.question ?? fields?.question ?? '';
  const fallback = overrides?.pinchFallback ?? fields?.pinchFallback ?? '';

  try {
    const openai   = client ?? newNexpathOpenAIClient();
    const prompt   = buildPinchPrompt(question, flagType, stage, profile, language);

    const response = await openai.chat.completions.create(
      {
        model:       PINCH_MODEL,
        messages:    [{ role: 'user', content: prompt }],
        temperature: PINCH_TEMPERATURE,
        max_tokens:  PINCH_MAX_TOKENS,
      },
      { timeout: 10_000 },
    );

    const raw   = response.choices[0]?.message?.content ?? '';
    const label = validatePinchLabel(raw);

    return label ?? fallback;
  } catch {
    // API failure, timeout, or any error → use fallback silently
    return fallback;
  }
}
