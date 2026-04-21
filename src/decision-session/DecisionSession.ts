import { select, isCancel } from '@clack/prompts';
import type { Stage } from '../classifier/types.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';
import type { Store } from '../store/db.js';
import { insertSkippedSession } from '../store/skipped-sessions.js';
import {
  resolveDecisionContent,
  buildOptionList,
  getLevelSubtitle,
  SHOW_SIMPLER,
  SKIP_NOW,
} from './options.js';

/**
 * Decision session terminal UI (per decision-session-ux-research.md).
 *
 * Renders a 3-level cascade of pre-filled agent prompts using @clack/prompts.
 * When the user selects an option, that text is returned ready for the agent.
 * When the user selects "Skip for now" or presses Ctrl+C / Escape, the event
 * is recorded in the skipped_sessions table and null is returned.
 *
 * Color / styling (ANSI 8-color only — universally safe):
 *   Pinch label    : bold + bright cyan (\x1b[1;96m)
 *   Question line  : bold white          (\x1b[1;97m)
 *   Level subtitle : dim yellow          (\x1b[2;33m)
 *   Reset          : \x1b[0m
 *
 * Back-navigation is NOT supported (per research decision).
 * Ctrl+C / Escape at any level → treated as "Skip for now".
 */

// ── ANSI helpers ───────────────────────────────────────────────────────────────

const BOLD_CYAN    = '\x1b[1;96m';
const BOLD_WHITE   = '\x1b[1;97m';
const DIM_YELLOW   = '\x1b[2;33m';
const RESET        = '\x1b[0m';

export function formatPinchLabel(label: string): string {
  return `${BOLD_CYAN}${label}${RESET}`;
}

export function formatQuestion(question: string): string {
  return `${BOLD_WHITE}${question}${RESET}`;
}

export function formatSubtitle(subtitle: string): string {
  return `${DIM_YELLOW}${subtitle}${RESET}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DecisionSessionInput {
  stage:        Stage;
  flagType:     FlagType;
  /** 2-3 word pinch label from PinchGenerator (or fallback static label). */
  pinchLabel:   string;
  sessionId:    string;
  projectRoot:  string;
  /** Current prompt count in session — stored on skip for optimize queue ordering. */
  promptCount:  number;
}

/**
 * Injectable select function — mirrors the @clack/prompts `select` signature
 * at the level we need. Used to replace with a mock in tests.
 */
export type SelectFn = (opts: {
  message: string;
  options: Array<{ value: string; label: string }>;
}) => Promise<string | symbol>;

/**
 * Sentinel string returned by SelectFn when the user chose "copy to clipboard"
 * instead of sending directly to Claude.  Handled in runLevel before any
 * content-option logic runs.
 */
export const CLIPBOARD_ONLY = '__NEXPATH_CLIP__';

/**
 * Prefix for blank visual separator items injected between option groups.
 * TtySelectFn retries (Windows) or skips numbering (Unix) for these items.
 * runLevel treats any separator value as 'skip' as a safety fallback.
 */
export const OPTION_SEPARATOR = '__nexpath_sep__';

/**
 * Result of running a decision session.
 *   selectedPrompt  : the text to fill into the terminal (user made a selection)
 *   clipboard_only  : user chose to copy to clipboard; do not block Claude
 *   skipped         : user chose "Skip for now" or pressed Ctrl+C / Escape
 */
export type DecisionSessionResult =
  | { outcome: 'selected';       selectedPrompt: string }
  | { outcome: 'clipboard_only' }
  | { outcome: 'skipped' };

// ── Message builder ────────────────────────────────────────────────────────────

/**
 * Build the `message` string for @clack/prompts' select prompt.
 * Combines: pinch label, optional subtitle, question line.
 */
export function buildSelectMessage(
  pinchLabel: string,
  question:   string,
  level:      1 | 2 | 3,
): string {
  const subtitle = getLevelSubtitle(level);
  const parts: string[] = [formatPinchLabel(pinchLabel)];
  if (subtitle) parts.push(formatSubtitle(subtitle));
  parts.push(formatQuestion(question));
  return parts.join('\n');
}

// ── Core logic ─────────────────────────────────────────────────────────────────

/**
 * Run a single level of the cascade.
 *
 * @returns 'skip'           — user skipped / Ctrl+C
 *          'next'           — user selected "Show simpler options →"
 *          'clipboard_only' — user chose copy-to-clipboard path (no Claude block)
 *          string           — a content option was selected (the pre-filled prompt text)
 */
export async function runLevel(
  input:     DecisionSessionInput,
  level:     1 | 2 | 3,
  selectFn:  SelectFn,
): Promise<'skip' | 'next' | 'clipboard_only' | string> {
  const content  = resolveDecisionContent(input.stage, input.flagType);
  const { options } = buildOptionList(content, level);
  const message  = buildSelectMessage(input.pinchLabel, content.question, level);

  // Inject blank separator items between visual groups:
  //   content options → 2 blank lines → SHOW_SIMPLER (if present) → 1 blank line → SKIP_NOW
  //   when SHOW_SIMPLER absent: content options → 2 blank lines → SKIP_NOW
  const hasShowSimpler = options.some((o) => o === SHOW_SIMPLER);
  const clackOptions: Array<{ value: string; label: string }> = [];
  let sepIdx = 0;
  for (const opt of options) {
    if (opt === SHOW_SIMPLER) {
      clackOptions.push({ value: `${OPTION_SEPARATOR}${sepIdx++}`, label: '' });
      clackOptions.push({ value: `${OPTION_SEPARATOR}${sepIdx++}`, label: '' });
    } else if (opt === SKIP_NOW) {
      clackOptions.push({ value: `${OPTION_SEPARATOR}${sepIdx++}`, label: '' });
      if (!hasShowSimpler) {
        clackOptions.push({ value: `${OPTION_SEPARATOR}${sepIdx++}`, label: '' });
      }
    }
    clackOptions.push({ value: opt, label: opt });
  }

  const result = await selectFn({ message, options: clackOptions });

  if (isCancel(result) || typeof result === 'symbol') return 'skip';
  if (typeof result === 'string' && result.startsWith(OPTION_SEPARATOR)) return 'skip';
  if (result === CLIPBOARD_ONLY) return 'clipboard_only';
  if (result === SKIP_NOW) return 'skip';
  if (result === SHOW_SIMPLER) return 'next';

  return result as string;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run the full decision session (up to 3 cascade levels).
 *
 * - Renders Level 1; if user selects "Show simpler options →", renders Level 2, then Level 3.
 * - On any "skip" or Ctrl+C / Escape: records the event in skipped_sessions and returns { outcome: 'skipped' }.
 * - On selection: returns { outcome: 'selected', selectedPrompt }.
 *
 * @param input     Session context + pinch label
 * @param store     SQLite store for recording skips (optional — if omitted, skips are not persisted)
 * @param selectFn  Injectable select function (defaults to @clack/prompts select)
 */
export async function runDecisionSession(
  input:    DecisionSessionInput,
  store?:   Store,
  selectFn: SelectFn = select as SelectFn,
): Promise<DecisionSessionResult> {
  let level: 1 | 2 | 3 = 1;

  while (true) {
    const levelResult = await runLevel(input, level, selectFn);

    if (levelResult === 'skip') {
      if (store) {
        insertSkippedSession(store, {
          projectRoot:          input.projectRoot,
          sessionId:            input.sessionId,
          flagType:             input.flagType,
          stage:                input.stage,
          levelReached:         level,
          skippedAtPromptCount: input.promptCount,
        });
      }
      return { outcome: 'skipped' };
    }

    if (levelResult === 'clipboard_only') {
      return { outcome: 'clipboard_only' };
    }

    if (levelResult === 'next') {
      if (level < 3) {
        level = (level + 1) as 2 | 3;
        continue;
      }
      // Defensive: "Show simpler options →" should not appear on level 3
      // If it somehow fires, treat as skip
      if (store) {
        insertSkippedSession(store, {
          projectRoot:          input.projectRoot,
          sessionId:            input.sessionId,
          flagType:             input.flagType,
          stage:                input.stage,
          levelReached:         level,
          skippedAtPromptCount: input.promptCount,
        });
      }
      return { outcome: 'skipped' };
    }

    // A content option was selected
    return { outcome: 'selected', selectedPrompt: levelResult };
  }
}
