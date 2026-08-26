import { describe, expect, it } from 'vitest';
import { API_KEY_REGEX as realRegex, isValidApiKey as realIsValid } from '../../config/ApiKeyResolver.js';
import { API_KEY_REGEX as stubRegex, isValidApiKey as stubIsValid } from './api-key-resolver.js';

/**
 * The browser stub duplicates the key-shape regex BY VALUE (the real module
 * cannot be bundled — it drags dotenv + the native keychain). This differential
 * test is the drift pin: if the real regex ever changes, the stub fails here
 * until it is updated to match.
 */
describe('api-key-resolver stub — differential parity with the real module', () => {
  it('the regex source is character-identical', () => {
    expect(stubRegex.source).toBe(realRegex.source);
    expect(stubRegex.flags).toBe(realRegex.flags);
  });

  it('isValidApiKey agrees with the real implementation across shape classes', () => {
    const cases = [
      'sk-' + 'a'.repeat(20),          // minimal valid
      'sk-proj-' + 'Ab_9-'.repeat(10), // project-style key
      'sk-short',                       // too short
      'pk-' + 'a'.repeat(30),           // wrong prefix
      '',                               // empty
      ' sk-' + 'a'.repeat(20),          // leading whitespace
      'sk-' + 'a'.repeat(20) + '\n',    // trailing newline
    ];
    for (const key of cases) {
      expect(stubIsValid(key)).toBe(realIsValid(key));
    }
  });
});
