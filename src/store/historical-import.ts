import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Store } from './db.js';
import { insertPrompt, getRecentPrompts } from './prompts.js';
import { setDetectedLanguage } from './projects.js';
import { detectLanguage, LANG_WINDOW } from '../classifier/LanguageDetector.js';
import { SessionStateManager, MAX_HISTORY } from '../classifier/SessionStateManager.js';
import { detectSignalsByChannel } from '../classifier/signals.js';
import { appendParamEvents } from '../telemetry/param-events.js';
import type { PromptRecord, Stage } from '../classifier/types.js';

const IMPORT_CAP = 500;

/** Session marker for param-events derived from the historical-import backfill. */
const HISTORICAL_IMPORT_SESSION_ID = 'historical-import';

export async function importHistoricalPrompts(store: Store, projectRoot: string): Promise<void> {
  // Guard: skip if prompts already exist for this project
  if (getRecentPrompts(store, projectRoot, 1).length > 0) return;

  // Path resolution
  const base     = process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude');
  const safeName = projectRoot.replace(/[^a-zA-Z0-9]/g, '-');
  const projDir  = join(base, 'projects', safeName);
  if (!existsSync(projDir)) return;

  // File discovery — .jsonl files sorted newest-first
  const entries = readdirSync(projDir, { withFileTypes: true });
  const jsonlFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => {
      const p = join(projDir, e.name);
      return { path: p, mtime: statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  // Parsing — collect up to IMPORT_CAP user prompt strings
  const collected: string[] = [];

  outer: for (const { path } of jsonlFiles) {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      if (collected.length >= IMPORT_CAP) break outer;
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as {
          type?: unknown;
          message?: { content?: unknown };
        };
        if (
          obj.type === 'user' &&
          typeof obj.message?.content === 'string' &&
          obj.message.content.trim().length > 0
        ) {
          collected.push(obj.message.content.trim());
        }
      } catch { /* skip invalid JSON lines */ }
    }
  }

  if (collected.length === 0) return;

  // Import prompts into the store
  for (const text of collected) {
    insertPrompt(store, { projectRoot, promptText: text, agent: 'claude-code' });
  }

  // §1.8 retro-population — record param-detection events for the imported
  // history so the longitudinal detectors see the user's full pre-install
  // behaviour, not just post-install prompts. Stage-agnostic (no real stage for
  // historical prompts → stage: null, never a fake stamp); pure-CPU keyword scan,
  // no LLM / no network. Idempotent: this whole function returns early (the
  // prompts-exist guard above) once prompts exist, so the retro runs only on the
  // first import per project. No-op for in-memory stores.
  const retroEvents = collected.flatMap((text, i) =>
    detectSignalsByChannel(text).map((d) => ({
      projectRoot,
      sessionId:       HISTORICAL_IMPORT_SESSION_ID,
      promptIndex:     i,
      signalKey:       d.key,
      channel:         d.channel,
      stage:           null,
      stageConfidence: null,
      source:          'historical_import' as const,
    })),
  );
  appendParamEvents(store, retroEvents);

  // Bootstrap: language detection on most recent LANG_WINDOW prompts
  const langTexts = collected.slice(0, LANG_WINDOW);
  const detected  = detectLanguage(langTexts, undefined);
  if (detected) {
    setDetectedLanguage(store, projectRoot, detected);
  }

  // Bootstrap: pre-seed session state so first advisory is not cold-started
  const promptRecords: PromptRecord[] = collected.slice(0, MAX_HISTORY).map((text, i) => ({
    index:           i,
    text,
    capturedAt:      Date.now(),
    classifiedStage: 'idea' as Stage,
    confidence:      0.5,
  }));
  SessionStateManager.bootstrapFromHistory(store, projectRoot, promptRecords, collected.length);
}
