import type { UserMood } from './types.js';

/**
 * Mood classifier — last-N=5 prompts, rule-based thresholds (per New-B-2 research).
 *
 * Five features:
 *   1. avg_word_count       — <8 → Rushed; >25 → Focused signal
 *   2. neg_lexicon_hits     — "broken", "wrong", "ugh", "again", etc.  → Frustrated
 *   3. exclamation_density  — avg ! per prompt > 1.0 → Excited
 *   4. list_structure_count — numbered / bulleted prompts → Methodical
 *   5. all_caps_present     — any ALL CAPS word (3+ chars) → Frustrated
 *
 * Classification logic (exact algorithm from research):
 *   if neg_lexicon_hits > 2 OR all_caps_present → Frustrated
 *   elif avg_word_count < 8                     → Rushed
 *   elif exclamation_density > 1.0              → Excited
 *   elif list_structure_count > 2               → Methodical
 *   elif avg_word_count > 25 AND neg == 0       → Focused
 *   else                                        → Casual
 *
 * Mood is re-evaluated every 5 prompts; stickiness is the caller's responsibility.
 */

// ── Negative lexicon ───────────────────────────────────────────────────────────

const NEG_LEXICON: string[] = [
  'broken', 'again', 'wrong', 'ugh', 'still', 'not working',
  'why is', 'why does', 'why did', 'why won\'t', 'doesn\'t work',
  'failed', 'failing', 'error again', 'same issue', 'keeps',
];

// ── Detection helpers ──────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function negLexiconHits(text: string): number {
  const lower = text.toLowerCase();
  return NEG_LEXICON.reduce((n, term) => n + (lower.includes(term) ? 1 : 0), 0);
}

function exclamationCount(text: string): number {
  return (text.match(/!/g) ?? []).length;
}

function hasAllCaps(text: string): boolean {
  // Any word of 3+ consecutive uppercase letters (avoids "I" or "UI")
  return /\b[A-Z]{3,}\b/.test(text);
}

function isListStructured(text: string): boolean {
  // Starts with a number+period, dash, or bullet-like character
  return /^(\d+[.)]\s|-\s|•\s|\*\s)/m.test(text);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface MoodFeatures {
  avgWordCount: number;
  negLexiconHits: number;
  exclamationDensity: number;
  listStructureCount: number;
  allCapsPresent: boolean;
}

/** Extract raw mood features from a window of prompts (last 5 recommended). */
export function extractMoodFeatures(prompts: string[]): MoodFeatures {
  if (prompts.length === 0) {
    return { avgWordCount: 0, negLexiconHits: 0, exclamationDensity: 0, listStructureCount: 0, allCapsPresent: false };
  }

  let totalWords = 0;
  let totalNeg   = 0;
  let totalExcl  = 0;
  let listCount  = 0;
  let caps       = false;

  for (const p of prompts) {
    totalWords += wordCount(p);
    totalNeg   += negLexiconHits(p);
    totalExcl  += exclamationCount(p);
    if (isListStructured(p)) listCount++;
    if (hasAllCaps(p)) caps = true;
  }

  return {
    avgWordCount:       totalWords / prompts.length,
    negLexiconHits:     totalNeg,
    exclamationDensity: totalExcl / prompts.length,
    listStructureCount: listCount,
    allCapsPresent:     caps,
  };
}

/**
 * Classify mood from the last N=5 prompt strings.
 * Exact algorithm from New-B-2 research — no deviation.
 */
export function classifyMood(prompts: string[]): UserMood {
  if (prompts.length === 0) return 'casual';

  const f = extractMoodFeatures(prompts);

  if (f.negLexiconHits > 2 || f.allCapsPresent) return 'frustrated';
  if (f.avgWordCount < 8)                        return 'rushed';
  if (f.exclamationDensity > 1.0)                return 'excited';
  if (f.listStructureCount > 2)                  return 'methodical';
  if (f.avgWordCount > 25 && f.negLexiconHits === 0) return 'focused';
  return 'casual';
}
