import type {
  ChatHistoryExtractor,
  FingerprintResult,
} from '../chat-history-types.js';
import { cursorV2024Q4 } from './cursor-v2024-q4.js';
import { cursorV2025Q1 } from './cursor-v2025-q1.js';
import { cursorV2025Q2 } from './cursor-v2025-q2.js';
import { windsurf } from './windsurf.js';

/**
 * Registry of all known per-version chat-history extractors. Ordered
 * newest-first so that on a tie in fingerprint match count the latest
 * version wins (see `pickExtractor`).
 */
export const ALL_EXTRACTORS: readonly ChatHistoryExtractor[] = [
  cursorV2025Q2,
  cursorV2025Q1,
  cursorV2024Q4,
  windsurf,
];

export function getExtractorById(id: string): ChatHistoryExtractor | undefined {
  return ALL_EXTRACTORS.find((e) => e.id === id);
}

/**
 * Schema fingerprint detection (M4).
 *
 * Examine a set of observed ItemTable keys and pick the most-specific
 * known extractor. If no extractor's `fingerprintKeys` (treated as
 * prefixes) match any observed key, return a `kind: 'unknown'` result
 * that the extension layer surfaces as a "schema unknown" toast.
 *
 * Matching strategy:
 *   - For each extractor, count the observed keys whose value starts with
 *     any of the extractor's `fingerprintKeys`.
 *   - The extractor with the highest match count wins.
 *   - Ties are broken by registry order — first listed wins (newest-first).
 */
export function pickExtractor(
  observedKeys: readonly string[],
): FingerprintResult {
  let best: { extractor: ChatHistoryExtractor; matches: string[] } | undefined;

  for (const extractor of ALL_EXTRACTORS) {
    const matches = observedKeys.filter((k) =>
      extractor.fingerprintKeys.some((fp) => k.startsWith(fp)),
    );
    if (matches.length === 0) continue;
    if (!best || matches.length > best.matches.length) {
      best = { extractor, matches };
    }
  }

  if (best) {
    return {
      kind: 'known',
      extractor: best.extractor,
      matchedKeys: best.matches,
    };
  }

  return {
    kind: 'unknown',
    observedKeyCount: observedKeys.length,
    observedSampleKeys: observedKeys.slice(0, 5),
  };
}

export { cursorV2024Q4, cursorV2025Q1, cursorV2025Q2, windsurf };
