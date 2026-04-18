// Option B from retention-privacy-research: lightweight regex redaction of common secret patterns.
// Applied on every prompt before it is written to the store.
// Not exhaustive — documented limitation.

const PATTERNS: [RegExp, string][] = [
  [/sk-[A-Za-z0-9]{20,}/g, 'sk-[REDACTED]'],
  [/ghp_[A-Za-z0-9]{36}/g, 'ghp_[REDACTED]'],
  [/ghu_[A-Za-z0-9]{36}/g, 'ghu_[REDACTED]'],
  [/Bearer\s+[A-Za-z0-9._\-]{10,}/g, 'Bearer [REDACTED]'],
  // PEM blocks — capped lookahead to avoid catastrophic backtracking
  [/-----BEGIN [A-Z ]{1,40}-----[\s\S]{0,8192}?-----END [A-Z ]{1,40}-----/g, '[PEM-REDACTED]'],
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
