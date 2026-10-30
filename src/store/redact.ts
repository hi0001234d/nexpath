// Option B from retention-privacy-research: lightweight regex redaction of common secret patterns.
// Applied on every prompt before it is written to the store.
// Not exhaustive — documented limitation.

const PATTERNS: [RegExp, string][] = [
  // OpenAI (`sk-proj-…`) and Anthropic (`sk-ant-api03-…`) keys put `-` and `_`
  // inside the body, so the class carries both. The lookbehind keeps ordinary
  // hyphenated words such as `task-management-dashboard` from matching mid-word.
  [/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/g, 'sk-[REDACTED]'],
  // Nexpath tokens are url-safe base64, so the class carries `_` and `-` like
  // the `sk-` pattern above. The body length here matches the
  // validator's own minimum, and redaction stays the looser of the two by
  // construction: it asks only "does this look like a token", never "is this
  // one we would accept" — a malformed or truncated token must be scrubbed too.
  // The point is that it never reaches the store.
  [/npk_[A-Za-z0-9_-]{20,}/g, 'npk_[REDACTED]'],
  [/ghp_[A-Za-z0-9]{36}/g, 'ghp_[REDACTED]'],
  [/ghu_[A-Za-z0-9]{36}/g, 'ghu_[REDACTED]'],
  [/Bearer\s+[A-Za-z0-9._\-]{10,}/g, 'Bearer [REDACTED]'],
  // PEM blocks — capped lookahead to avoid catastrophic backtracking
  [/-----BEGIN [A-Z ]{1,40}-----[\s\S]{0,8192}?-----END [A-Z ]{1,40}-----/g, '[PEM-REDACTED]'],
];

/**
 * Pad a marker with dots so it occupies exactly as many characters as the text it replaces.
 *
 * Redaction is the only step between the prompt as received and the copy that is stored, so
 * without this the stored copy is SHORTER — every secret shrinks it — and any character position
 * measured against the received prompt lands somewhere else in the stored one. Positions are how
 * the sequence planner records which part of a request each item covers, so a shifted copy makes
 * a stored range point at the wrong words, silently, and only on prompts that contained a secret.
 *
 * Dots rather than an invisible filler on purpose: a zero-width or non-breaking character would
 * keep the count while hiding that anything was removed, and it survives copy-paste, terminals,
 * editors and JSON far less predictably than ASCII does. A visibly long marker is the point — it
 * shows how much was taken out.
 *
 * Every marker in THIS module is shorter than its shortest possible match, so padding always
 * applies here. Other layers reuse this helper and some of their markers are longer than the
 * shortest thing they match — an email can be six characters and its marker is sixteen. There the
 * marker is returned unpadded and the text grows, because mangling the marker to hit a length
 * would be worse than the length being wrong. Only a layer whose markers all fit can promise the
 * property outright.
 */
export function lengthPreservingMarker(marker: string, matchLength: number): string {
  if (marker.length >= matchLength) return marker;
  const padding = '.'.repeat(matchLength - marker.length);
  return marker.endsWith(']') ? `${marker.slice(0, -1)}${padding}]` : `${marker}${padding}`;
}

/**
 * Replace known secret shapes with a marker of the SAME LENGTH, so the stored text lines up
 * character-for-character with what the user typed.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const [pattern, marker] of PATTERNS) {
    result = result.replace(pattern, (match) => lengthPreservingMarker(marker, match.length));
  }
  return result;
}
