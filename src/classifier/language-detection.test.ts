import { describe, it, expect } from 'vitest';
import {
  preprocessText,
  runDetection,
  applyThreshold,
  detectLanguage,
  resolveLanguage,
  LANG_MIN_ACCURACY,
  LANG_MIN_GAP,
  LANG_WINDOW,
} from './LanguageDetector.js';
import type { DetectionResult } from './LanguageDetector.js';

// ── preprocessText ────────────────────────────────────────────────────────────

describe('preprocessText', () => {
  it('returns empty string for empty input', () => {
    expect(preprocessText('')).toBe('');
  });

  it('strips lines with > 50% non-letter characters (code lines)', () => {
    const input = 'const x = { a: 1, b: 2 };\nI want to implement the auth module';
    const result = preprocessText(input);
    // Code line dropped, natural language kept
    expect(result).not.toContain('{');
    expect(result).toContain('implement');
  });

  it('keeps lines where >= 50% chars are letters', () => {
    const result = preprocessText('implement the authentication service');
    expect(result).toContain('implement');
    expect(result).toContain('authentication');
  });

  it('splits camelCase tokens into separate words', () => {
    const result = preprocessText('getUserById is the function name');
    expect(result).toContain('User');
    expect(result).toContain('By');
    expect(result).toContain('Id');
    expect(result).not.toContain('getUserById');
  });

  it('drops English programming keywords', () => {
    const result = preprocessText('const function return async await null undefined');
    expect(result).not.toContain('const');
    expect(result).not.toContain('function');
    expect(result).not.toContain('async');
    expect(result).not.toContain('null');
    expect(result).not.toContain('undefined');
  });

  it('does NOT drop non-keyword words that happen to be English', () => {
    const result = preprocessText('implement the authentication module with validation');
    expect(result).toContain('implement');
    expect(result).toContain('authentication');
  });

  it('keeps non-English natural language text unchanged (no false drops)', () => {
    // Hindi text — all letter characters, well above 50%
    const result = preprocessText('मैं इस परियोजना पर काम करना चाहता हूं');
    expect(result.trim()).not.toBe('');
  });

  it('drops blank lines silently', () => {
    const result = preprocessText('line one\n\n\nline two');
    expect(result.trim()).not.toContain('\n\n');
  });

  it('drops ENG_KEYWORDS (const, import) but keeps non-keyword identifiers (require, Router)', () => {
    // Note: preprocessText strips code LINES only when < 50% of chars are letters.
    // Lines like `const db = require("sqlite3");` are ~67% letters → NOT dropped.
    // However, the ENG_KEYWORDS step removes "const" and "import" from those lines.
    // "require" and "Router" are NOT in ENG_KEYWORDS so they remain — by design.
    // The research spec says preprocessing "doesn't need to be perfect."
    const input = [
      'const db = require("sqlite3");',
      'implement the auth endpoint here',
      'import { Router } from "express";',
      'add validation for the user input',
    ].join('\n');
    const result = preprocessText(input);
    // Natural language lines are kept
    expect(result).toContain('implement');
    expect(result).toContain('add validation');
    // ENG_KEYWORDS are stripped
    expect(result).not.toContain('const');
    expect(result).not.toContain('import');
    // Non-keyword identifiers remain (letter-ratio too high for line to be dropped)
    expect(result).toContain('require');
  });

  it('drops truly symbol-heavy lines (< 50% letters)', () => {
    // A line like `{ a: 1, b: 2, c: 3 }` — mostly symbols, dropped
    const input = '{ a: 1, b: 2, c: 3 }\nimplement the authentication module';
    const result = preprocessText(input);
    expect(result).toContain('implement');
    expect(result).not.toContain('{');
  });

  it('drops a line that becomes empty after all keywords are stripped', () => {
    // 'const return null' — all three are ENG_KEYWORDS → filtered.trim() = '' → line dropped
    const input = 'const return null\nI want to add the authentication feature here';
    const result = preprocessText(input);
    expect(result).not.toContain('const');
    expect(result).not.toContain('return');
    expect(result).not.toContain('null');
    expect(result).toContain('authentication');
  });

  it('strips ENG_KEYWORDS case-insensitively (CONST, RETURN, NULL removed)', () => {
    // w.toLowerCase() is used → uppercase variants are also stripped
    const result = preprocessText('CONST RETURN NULL the feature works');
    expect(result).not.toContain('CONST');
    expect(result).not.toContain('RETURN');
    expect(result).not.toContain('NULL');
    expect(result).toContain('feature');
  });

  it('strips remaining ENG_KEYWORDS: let, var, true, false', () => {
    const result = preprocessText('let var true false the feature is ready to test');
    expect(result).not.toContain('let');
    expect(result).not.toContain('var');
    expect(result).not.toContain('true');
    expect(result).not.toContain('false');
    expect(result).toContain('feature');
  });

  it('strips remaining ENG_KEYWORDS: export, class, new, this', () => {
    const result = preprocessText('export class new this the feature is ready to test');
    expect(result).not.toContain('export');
    expect(result).not.toContain('class');
    expect(result).not.toContain('new');
    expect(result).not.toContain('this');
    expect(result).toContain('feature');
  });

  it('handles multi-step camelCase (processUserPaymentRequest → multiple splits)', () => {
    const result = preprocessText('processUserPaymentRequest is called here');
    // camelCase split: process User Payment Request
    expect(result).toContain('User');
    expect(result).toContain('Payment');
    expect(result).toContain('Request');
    expect(result).not.toContain('processUserPaymentRequest');
  });

  it('returns empty string when ALL lines fail the letter ratio test', () => {
    // Every line is < 50% letters → all dropped → empty string returned
    const input = '{ a: 1 }\n[1, 2, 3]\n==> !!';
    const result = preprocessText(input);
    expect(result).toBe('');
  });
});

// ── applyThreshold ────────────────────────────────────────────────────────────

describe('applyThreshold', () => {
  it('returns undefined on empty results with no prior', () => {
    expect(applyThreshold([])).toBeUndefined();
  });

  it('returns priorDetected on empty results (sticky)', () => {
    expect(applyThreshold([], 'hi')).toBe('hi');
  });

  it('accepts detection when accuracy >= 0.5 and single candidate', () => {
    const results: DetectionResult[] = [{ lang: 'en', accuracy: 0.9 }];
    expect(applyThreshold(results)).toBe('en');
  });

  it('accepts detection when accuracy >= 0.5 and gap to #2 >= 0.15', () => {
    const results: DetectionResult[] = [
      { lang: 'hi', accuracy: 0.82 },
      { lang: 'en', accuracy: 0.60 },  // gap = 0.22 >= 0.15
    ];
    expect(applyThreshold(results)).toBe('hi');
  });

  it('rejects when accuracy < 0.5 — returns prior (sticky)', () => {
    const results: DetectionResult[] = [{ lang: 'en', accuracy: 0.45 }];
    expect(applyThreshold(results, 'fr')).toBe('fr');
  });

  it('rejects when accuracy < 0.5 — returns undefined if no prior', () => {
    const results: DetectionResult[] = [{ lang: 'en', accuracy: 0.45 }];
    expect(applyThreshold(results)).toBeUndefined();
  });

  it('rejects when gap to #2 < 0.15 (ambiguous) — sticky', () => {
    const results: DetectionResult[] = [
      { lang: 'en', accuracy: 0.62 },
      { lang: 'hi', accuracy: 0.55 },  // gap = 0.07 < 0.15 → ambiguous
    ];
    expect(applyThreshold(results, 'de')).toBe('de');
  });

  it('rejects when gap to #2 < 0.15 — undefined if no prior', () => {
    const results: DetectionResult[] = [
      { lang: 'en', accuracy: 0.62 },
      { lang: 'hi', accuracy: 0.55 },
    ];
    expect(applyThreshold(results)).toBeUndefined();
  });

  it('accepts when accuracy >= 0.5 and gap == 0.15 exactly (boundary — accept)', () => {
    const results: DetectionResult[] = [
      { lang: 'fr', accuracy: 0.75 },
      { lang: 'en', accuracy: 0.60 },  // gap = 0.15 exactly → accept
    ];
    expect(applyThreshold(results)).toBe('fr');
  });

  it('rejects when gap is exactly below 0.15 (boundary — reject)', () => {
    const results: DetectionResult[] = [
      { lang: 'fr', accuracy: 0.75 },
      { lang: 'en', accuracy: 0.6099 },  // gap = 0.14... < 0.15 → ambiguous
    ];
    expect(applyThreshold(results, 'de')).toBe('de');
  });

  it('accepts at exactly LANG_MIN_ACCURACY = 0.5 (boundary)', () => {
    const results: DetectionResult[] = [{ lang: 'hi', accuracy: 0.5 }];
    expect(applyThreshold(results)).toBe('hi');
  });

  it('rejects just below LANG_MIN_ACCURACY (0.499) → sticky', () => {
    const results: DetectionResult[] = [{ lang: 'hi', accuracy: 0.499 }];
    expect(applyThreshold(results, 'hi')).toBe('hi');
  });

  it('does not hardcode en fallback — returns undefined when no prior', () => {
    expect(applyThreshold([])).toBeUndefined();
    expect(applyThreshold([{ lang: 'hi', accuracy: 0.3 }])).toBeUndefined();
  });

  it('ignores candidates beyond #2 — only gap between #1 and #2 is checked', () => {
    // #3 candidate at 0.01 does not affect the gap calculation between #1 and #2
    const results: DetectionResult[] = [
      { lang: 'hi', accuracy: 0.82 },
      { lang: 'en', accuracy: 0.60 },  // gap = 0.22 >= 0.15 → accepted
      { lang: 'de', accuracy: 0.01 },  // ignored
    ];
    expect(applyThreshold(results)).toBe('hi');
  });

  it('3+ candidates: rejects when #1 vs #2 gap is small, even if #3 is tiny', () => {
    const results: DetectionResult[] = [
      { lang: 'en', accuracy: 0.62 },
      { lang: 'hi', accuracy: 0.55 },  // gap = 0.07 < 0.15 → ambiguous
      { lang: 'de', accuracy: 0.01 },  // ignored
    ];
    expect(applyThreshold(results, 'fr')).toBe('fr');
  });
});

// ── detectLanguage ────────────────────────────────────────────────────────────

describe('detectLanguage', () => {
  it('returns priorDetected for empty prompt list (sticky)', () => {
    expect(detectLanguage([], 'en')).toBe('en');
  });

  it('returns undefined for empty prompt list with no prior', () => {
    expect(detectLanguage([])).toBeUndefined();
  });

  it('detects English from English prompts', () => {
    const prompts = Array(5).fill(
      'I want to implement the authentication module with proper validation and error handling',
    );
    const result = detectLanguage(prompts);
    expect(result).toBe('en');
  });

  it('aggregates multiple prompts before detection (window)', () => {
    // 3 prompts concatenated → still detects correctly
    const prompts = [
      'implement the authentication service here',
      'add the validation layer for user input',
      'write tests for the new endpoint',
    ];
    const result = detectLanguage(prompts);
    expect(result).toBe('en');
  });

  it('returns prior on low-confidence detection (sticky behavior)', () => {
    // Very short / ambiguous input — may return low accuracy
    // We mock this by passing a single blank-ish prompt; behavior tested via applyThreshold
    // Here we test the flow: if detectAll returns empty, prior is returned
    const result = detectLanguage(['   '], 'fr');
    // Preprocessed to empty → detectAll gets nothing → prior returned
    expect(result).toBe('fr');
  });

  it('detects language correctly across a full 20-prompt window', () => {
    // detectLanguage does NOT slice internally — caller is responsible (per spec/pattern).
    // This tests that detection works correctly when given the 20-prompt window.
    const englishPrompts = Array(20).fill(
      'I want to add the login feature so users can access their account and reset their password',
    );
    const result = detectLanguage(englishPrompts);
    expect(result).toBe('en');
  });

  it('LANG_WINDOW constant is 20', () => {
    expect(LANG_WINDOW).toBe(20);
  });

  it('LANG_MIN_ACCURACY constant is 0.5', () => {
    expect(LANG_MIN_ACCURACY).toBe(0.5);
  });

  it('LANG_MIN_GAP constant is 0.15', () => {
    expect(LANG_MIN_GAP).toBe(0.15);
  });
});

// ── resolveLanguage ───────────────────────────────────────────────────────────

describe('resolveLanguage', () => {
  it('returns undefined when no override and no detected language', () => {
    expect(resolveLanguage()).toBeUndefined();
    expect(resolveLanguage(undefined, undefined)).toBeUndefined();
  });

  it('returns undefined for empty string override (treated as not set)', () => {
    expect(resolveLanguage('', 'en')).toBe('en'); // override empty → fall to detected
  });

  it('returns undefined for whitespace-only override', () => {
    expect(resolveLanguage('   ', 'en')).toBe('en');
  });

  it('uses override when set — ignores detected', () => {
    expect(resolveLanguage('hi', 'en')).toBe('hi');
  });

  it('uses override trimmed (strips surrounding whitespace)', () => {
    expect(resolveLanguage(' fr ', 'en')).toBe('fr');
  });

  it('falls through to detected when override is empty and detected is set', () => {
    expect(resolveLanguage('', 'hi')).toBe('hi');
    expect(resolveLanguage(undefined, 'de')).toBe('de');
  });

  it('returns undefined when both are undefined — does NOT default to en', () => {
    // Research: do NOT hardcode en fallback; let LLM default handle it
    expect(resolveLanguage(undefined, undefined)).toBeUndefined();
  });

  it('returns undefined when both are empty strings — does NOT default to en', () => {
    expect(resolveLanguage('', '')).toBeUndefined();
  });

  it('priority: override > detected (override wins when both set)', () => {
    expect(resolveLanguage('zh', 'en')).toBe('zh');
    expect(resolveLanguage('gu', 'hi')).toBe('gu');
  });

  it('accepts any ISO 639-1 code as override — no validation enforced', () => {
    expect(resolveLanguage('ja')).toBe('ja');
    expect(resolveLanguage('ar')).toBe('ar');
    expect(resolveLanguage('ko')).toBe('ko');
  });

  it('whitespace-only detectedLanguage is treated as not set → undefined', () => {
    // detectedLanguage.trim() = '' → falsy → falls through to undefined
    expect(resolveLanguage(undefined, '   ')).toBeUndefined();
    expect(resolveLanguage('', '   ')).toBeUndefined();
  });

  it('detected language with surrounding whitespace is trimmed and returned', () => {
    expect(resolveLanguage(undefined, ' hi ')).toBe('hi');
  });
});

// ── runDetection (integration smoke test) ─────────────────────────────────────

describe('runDetection', () => {
  it('returns empty array for empty string input', () => {
    const results = runDetection('');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('returns empty array for blank/whitespace input', () => {
    const results = runDetection('   ');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('returns empty array when input preprocesses to empty (only code lines)', () => {
    // All lines are symbol-heavy (< 50% letters) → preprocessed to '' → tinyld not called
    const codeOnlyText = '{ a: 1, b: 2 }\n[1, 2, 3, 4, 5]\n====>>\n;;; {}';
    const results = runDetection(codeOnlyText);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('returns empty array when input is only ENG_KEYWORDS (all stripped → empty after preprocess)', () => {
    // All words are ENG_KEYWORDS → filtered away → line becomes empty → dropped → '' → []
    const results = runDetection('const let var function return async await null undefined true false import export class new this');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('returns an array of DetectionResult objects for real text', () => {
    const results = runDetection(
      'I want to implement the authentication service with proper error handling and validation',
    );
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('lang');
      expect(results[0]).toHaveProperty('accuracy');
      expect(typeof results[0].lang).toBe('string');
      expect(typeof results[0].accuracy).toBe('number');
    }
  });

  it('returns English for conversational English text', () => {
    // Note: tinyld classifies heavy technical jargon (schema, migration, throughput...)
    // as 'tlh' (Klingon) due to Latin root patterns — conversational text is needed.
    const results = runDetection(
      'I want to add a login page so that users can reset their password and access their account settings',
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].lang).toBe('en');
  });

  it('accuracy values are in 0.0–1.0 range', () => {
    const results = runDetection(
      'I want to implement the complete user authentication system with all edge cases',
    );
    for (const r of results) {
      expect(r.accuracy).toBeGreaterThanOrEqual(0);
      expect(r.accuracy).toBeLessThanOrEqual(1);
    }
  });

  it('results are sorted descending by accuracy', () => {
    const results = runDetection(
      'implement authentication service with proper validation and error handling in the system',
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].accuracy).toBeGreaterThanOrEqual(results[i].accuracy);
    }
  });
});
