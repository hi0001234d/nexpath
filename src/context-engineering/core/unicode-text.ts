/**
 * Unicode word helpers for Feature 1 (V2 #7 multilingual memory, dev plan Phase 1).
 *
 * Feature 1 used to cut words with `a-z0-9`, `\W` or `\b`, which drops Hindi, Gujarati and Amharic
 * letters and breaks accented words (`está`, `não`). These helpers keep a word whole in every script.
 *
 * `\p{L}` alone is not enough: Hindi and Gujarati vowel signs (ा ि ે ં …) are marks (`\p{M}`), so the word
 * class is letters + marks + numbers. For plain-ASCII text every helper gives exactly what the old
 * `a-z0-9` code gave, so English behaviour does not change.
 */

/** Letters, marks and numbers of any script (regex class body, no brackets). */
export const WORD_CHARS = '\\p{L}\\p{M}\\p{N}';

/** One word character in any script, plus `_` (same set as `\w` for ASCII). */
export const WORD = `[${WORD_CHARS}_]`;

const MARK = /\p{M}/gu;
/** Zero-width joiner / non-joiner: written inside Indic words, never a word break. */
const ZERO_WIDTH_JOINERS = /[‌‍]/g;
const RUN_NO_UNDERSCORE = new RegExp(`[${WORD_CHARS}]+`, 'gu');
const RUN_WITH_UNDERSCORE = new RegExp(`[${WORD_CHARS}_]+`, 'gu');

/**
 * NFC + zero-width joiners removed. NFC makes the two ways of typing a nukta letter (`फ़` as one code
 * point or `फ` + `़`) the same text. A no-op for ASCII.
 */
export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(ZERO_WIDTH_JOINERS, '');
}

/** Letters in a word, vowel signs and other marks not counted (`बदलना` = 4, `इसे` = 2, `retry` = 5). */
export function letterCount(word: string): number {
  return [...word].length - (word.match(MARK)?.length ?? 0);
}

export interface WordsOptions {
  /**
   * Keep `_` inside a word (`max_attempts` stays one word), as the old `[a-z0-9_]` and `\W` splits did.
   * Default false: `_` breaks words, as the old `[^a-z0-9]+` split did.
   */
  underscore?: boolean;
}

/**
 * Lowercased words of any script, as a Set. `minLength` counts letters (marks not counted).
 * For ASCII text: `words(t, n)` equals `t.toLowerCase().split(/[^a-z0-9]+/)` filtered to length >= n, and
 * with `{ underscore: true }` equals `t.toLowerCase().match(/[a-z0-9_]+/g)` filtered the same way.
 */
export function words(text: string, minLength = 1, opts: WordsOptions = {}): Set<string> {
  const runs = normalizeText(text).toLowerCase().match(opts.underscore ? RUN_WITH_UNDERSCORE : RUN_NO_UNDERSCORE) ?? [];
  const out = new Set<string>();
  for (const w of runs) if (letterCount(w) >= minLength) out.add(w);
  return out;
}

/** Share (0–1) of the letters of `text` that are in `script` (a Unicode script name, e.g. `Devanagari`); 0 when there are no letters. */
export function scriptShare(text: string, script: string): number {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters === 0) return 0;
  const inScript = text.match(new RegExp(`\\p{Script=${script}}`, 'gu'))?.filter((c) => /\p{L}/u.test(c)).length ?? 0;
  return inScript / letters;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A regex source for one literal phrase: regex characters escaped, NFC, any run of spaces matching any
 * whitespace (`'final hai'` also matches `final  hai`).
 */
export function literal(text: string): string {
  return normalizeText(text).trim().split(/\s+/).map(escapeRegex).join('\\s+');
}

/**
 * Whole-word match of any alternative, in every script: the Unicode replacement for `\b(a|b)\b`.
 * Alternatives are regex sources (use `literal()` for plain text). Test it against `normalizeText(text)`.
 * `phrase(['final hai'])` matches `ye final hai.` but not `finalhai`; `phrase(['es definitivo'])` does not
 * match `es definitivamente`.
 */
export function phrase(alternatives: readonly string[], flags = 'iu'): RegExp {
  const f = flags.includes('u') ? flags : `${flags}u`;
  return new RegExp(`(?<!${WORD})(?:${alternatives.join('|')})(?!${WORD})`, f);
}

/**
 * Sentence end: `. ! ?`, the Hindi danda `।` / `॥` and the Amharic full stop `።` / question mark `፧`
 * followed by whitespace, or a newline. The Amharic colon `፦` and semicolon `፤` do not end a sentence (as
 * `:` and `;` do not in English), so `የመጨረሻ ውሳኔ ነው፦ …` stays one sentence. The danda and `።` also end a
 * sentence when no space follows (Hindi and Amharic text is often typed that way).
 */
export const SENTENCE_END = /(?<=[.!?])\s+|(?<=[।॥።፧])\s*|\r?\n+/u;

/** Splits text into trimmed, non-empty sentences at `SENTENCE_END`. */
export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
