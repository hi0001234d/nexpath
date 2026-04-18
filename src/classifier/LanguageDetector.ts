import { detectAll } from 'tinyld';

/**
 * Language detection module (per language-detection-research.md).
 *
 * Strategy:
 *   - Aggregate last-20 prompts into one text blob → `tinyld.detectAll()`
 *   - Preprocess before detection: strip code lines, split camelCase, drop eng keywords
 *   - Acceptance: accuracy >= 0.5 AND gap to #2 >= 0.15
 *   - On ambiguity / low-confidence / failure: sticky (keep prior) or skip (leave undefined)
 *   - Priority chain: language_override > detected_language > undefined (LLM default)
 *
 * Re-detection runs on-demand (per analyze/review invocation), NOT on every captured prompt.
 * Per-project: each project passes its own prompt history.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const LANG_WINDOW          = 20;
export const LANG_MIN_ACCURACY    = 0.5;
export const LANG_MIN_GAP         = 0.15;

/** English programming keywords that inflate English scores — stripped before detection. */
const ENG_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'async', 'await',
  'null', 'undefined', 'true', 'false', 'import', 'export',
  'class', 'new', 'this',
]);

// ── Text preprocessing ────────────────────────────────────────────────────────

/**
 * Strip code-heavy lines (>50% non-letter chars), split camelCase tokens,
 * and drop English programming keywords — reduces English-inflation bias
 * for users who code in English but prompt in another natural language.
 */
export function preprocessText(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Drop lines where more than half the characters are non-letter
    const letters = (trimmed.match(/[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u0900-\u097F]/g) ?? []).length;
    if (letters / trimmed.length < 0.5) continue;

    // Split camelCase: getUserById → get User By Id
    const expanded = trimmed.replace(/([a-z])([A-Z])/g, '$1 $2');

    // Drop English programming keywords (word boundary match)
    const filtered = expanded
      .split(/\s+/)
      .filter((w) => !ENG_KEYWORDS.has(w.toLowerCase()))
      .join(' ');

    if (filtered.trim()) kept.push(filtered);
  }

  return kept.join(' ');
}

// ── Detection ─────────────────────────────────────────────────────────────────

export interface DetectionResult {
  lang: string;
  accuracy: number;
}

/**
 * Run tinyld.detectAll() on aggregated, preprocessed prompt text.
 * Returns the full candidate list (may be empty on total failure).
 * Exported for testing.
 */
export function runDetection(aggregatedText: string): DetectionResult[] {
  const preprocessed = preprocessText(aggregatedText);
  if (!preprocessed.trim()) return [];
  return detectAll(preprocessed) as DetectionResult[];
}

/**
 * Apply the confidence threshold and sticky-fallback logic.
 *
 * Returns:
 *   - ISO 639-1 code string  → detection accepted
 *   - `priorDetected`        → low-confidence / ambiguous / failure → sticky
 *   - `undefined`            → no prior exists → skip
 */
export function applyThreshold(
  results: DetectionResult[],
  priorDetected?: string,
): string | undefined {
  // Total failure — no candidates
  if (results.length === 0) {
    return priorDetected;
  }

  const top = results[0];

  // Low confidence — below minimum accuracy
  if (top.accuracy < LANG_MIN_ACCURACY) {
    return priorDetected;
  }

  // Ambiguous — top two candidates too close
  if (results.length >= 2) {
    const gap = top.accuracy - results[1].accuracy;
    if (gap < LANG_MIN_GAP) {
      return priorDetected;
    }
  }

  // Accepted — accuracy >= 0.5 and lead is clear
  return top.lang;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect the natural language from the last N=20 prompt strings.
 *
 * @param prompts   Raw prompt text strings (caller slices last 20 from history)
 * @param priorDetected  Previously accepted detected_language (for sticky fallback)
 * @returns ISO 639-1 code if detection passes, prior value on sticky, undefined on skip
 */
export function detectLanguage(
  prompts: string[],
  priorDetected?: string,
): string | undefined {
  if (prompts.length === 0) return priorDetected;

  const aggregated = prompts.join('\n');
  const results    = runDetection(aggregated);
  return applyThreshold(results, priorDetected);
}

/**
 * Resolve the effective language from config values.
 *
 * Priority chain (per research):
 *   1. language_override (if set and non-empty) → use it, skip detection
 *   2. detected_language (if set and non-empty) → use it
 *   3. Neither → undefined (LLM defaults to English — do NOT hardcode 'en')
 */
export function resolveLanguage(
  languageOverride?: string,
  detectedLanguage?: string,
): string | undefined {
  if (languageOverride && languageOverride.trim()) return languageOverride.trim();
  if (detectedLanguage && detectedLanguage.trim()) return detectedLanguage.trim();
  return undefined;
}
