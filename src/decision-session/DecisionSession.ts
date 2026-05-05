import { select, isCancel } from '@clack/prompts';
import type { Stage, UserProfile } from '../classifier/types.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';
import type { Store } from '../store/db.js';
import { insertSkippedSession } from '../store/skipped-sessions.js';
import { incrementDecisionSessionCount } from '../store/projects.js';
import { setConfig } from '../store/config.js';
import {
  resolveDecisionContent,
  buildOptionList,
  getLevelSubtitle,
  SHOW_SIMPLER,
  SKIP_NOW,
} from './options.js';
import type { GeneratedOptions } from './OptionGenerator.js';
import { writeTelemetry } from '../telemetry/index.js';

/**
 * Decision session terminal UI (per decision-session-ux-research.md).
 *
 * Renders a 3-level cascade of pre-filled agent prompts using @clack/prompts.
 * When the user selects an option, that text is returned ready for the agent.
 * When the user selects "Skip for now" or presses Ctrl+C / Escape, the event
 * is recorded in the skipped_sessions table and null is returned.
 *
 * Color / styling applied to the header pair only (ANSI 8-color, universally safe):
 *   Pinch label    : bold + bright cyan (\x1b[1;96m)
 *   Question line  : bold white          (\x1b[1;97m)
 *   Level subtitle : dim yellow          (\x1b[2;33m)
 * Option labels (SKIP_NOW, SHOW_SIMPLER, HELP) carry their own ANSI styling —
 * G() in @clack/core uses ansi-regex to strip sequences before measuring width,
 * so nested ANSI does not affect restoreCursor() line-count calculation.
 *
 * Back-navigation is NOT supported (per research decision).
 * Ctrl+C / Escape at any level → treated as "Skip for now".
 */

// ── ANSI helpers ───────────────────────────────────────────────────────────────

const BOLD_CYAN    = '\x1b[1;96m';
const BOLD_WHITE   = '\x1b[1;97m';
const DIM_YELLOW   = '\x1b[2;33m';
const RESET        = '\x1b[0m';
const DIM_GRAY     = '\x1b[2m';
const ITALIC_DIM   = '\x1b[3;2m';
const ITALIC_AMBER = '\x1b[3;33m';
const BOLD         = '\x1b[1m';

const SKIP_NOW_LABEL =
  `${BOLD}Skip for now${RESET}${DIM_GRAY}  — nexpath optimize will remind you${RESET}`;
const SHOW_SIMPLER_LABEL =
  `${DIM_GRAY}Show simpler options →${RESET}`;

export function formatOptionLabel(text: string): string {
  if (!text.includes('\n')) return text;
  const lines = text.split('\n');
  return lines[0] + lines.slice(1).map(l => '\n\u2502    ' + l).join('');
}

const MOD_KEY = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';

const HELP_LABEL =
  `${ITALIC_DIM}  don't need nexpath here?  press ${RESET}${ITALIC_AMBER}${MOD_KEY}+X${RESET}${ITALIC_DIM} to disable for this project` +
  `  ·  press ${RESET}${ITALIC_AMBER}${MOD_KEY}+T${RESET}${ITALIC_DIM} to adjust frequency${RESET}`;

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
  stage:                Stage;
  flagType:             FlagType;
  /** 2-3 word pinch label from PinchGenerator (or fallback static label). */
  pinchLabel:           string;
  sessionId:            string;
  projectRoot:          string;
  /** Current prompt count in session — stored on skip for optimize queue ordering. */
  promptCount:          number;
  /** Total decision sessions shown for this project — gates help line display. */
  decisionSessionCount: number;
  /** Personalised option text from OptionGenerator. When present, overrides static L1/L2/L3. */
  generatedOptions?:    GeneratedOptions;
  /** User profile — used to route beginner/cool_geek to BEGINNER content blocks. */
  profile?:             UserProfile | null;
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
 * Sentinel returned by the Windows TtySelectFn when the user pressed Ctrl+X
 * (opt-out forever) during the decision session UI.
 * runDecisionSession writes advisory_frequency:<projectRoot>=off and returns skipped.
 */
export const OPT_OUT_SENTINEL = '__NEXPATH_OPT_OUT__';

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
  const content  = resolveDecisionContent(input.stage, input.flagType, input.profile);
  const gen      = input.generatedOptions;
  const effective = gen
    ? { ...content, L1: gen.l1, L2: gen.l2, L3: gen.l3 }
    : content;
  const { options } = buildOptionList(effective, level);
  const message  = buildSelectMessage(input.pinchLabel, content.question, level);

  // Inject blank separator items between visual groups:
  //   content options → 2 blank lines → SHOW_SIMPLER (if present) → 1 blank line → SKIP_NOW
  //   when SHOW_SIMPLER absent: content options → 2 blank lines → SKIP_NOW
  //   after SKIP_NOW: 2 blank lines → help hint (first 3 appearances only)
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
    clackOptions.push({
      value: opt,
      label: opt === SKIP_NOW    ? SKIP_NOW_LABEL    :
             opt === SHOW_SIMPLER ? SHOW_SIMPLER_LABEL :
             formatOptionLabel(opt),
    });
  }
  // Help hint — 2 blank lines of breathing room then the styled hint row
  if (input.decisionSessionCount < 3) {
    clackOptions.push({ value: `${OPTION_SEPARATOR}${sepIdx++}`, label: '' });
    clackOptions.push({ value: `${OPTION_SEPARATOR}${sepIdx++}`, label: '' });
    clackOptions.push({ value: `${OPTION_SEPARATOR}help`, label: HELP_LABEL });
  }

  writeTelemetry(input.projectRoot, 'level_rendered', {
    level,
    optionCount: clackOptions.filter(o => !o.value.startsWith(OPTION_SEPARATOR)).length,
  });

  if (process.env['NEXPATH_SIM'] === '1') {
    const first = clackOptions.find(o => !o.value.startsWith(OPTION_SEPARATOR));
    const label = first?.label ?? '—';
    const value = first?.value ?? SKIP_NOW;
    const optionKind = input.generatedOptions ? 'LLM-generated' : 'static';
    const allOptions = clackOptions
      .filter(o => !o.value.startsWith(OPTION_SEPARATOR) || o.label !== '')
      .map(o => `  ${o.label}`)
      .join('\n');
    process.stdout.write(`\n[SIM] level:${level} options:${optionKind}\n${message}\n${allOptions}\n[SIM] Auto-selecting: ${label}\n`);
    await new Promise<void>(r => setTimeout(r, 400));
    writeTelemetry(input.projectRoot, 'decision_session_sim_dismissed', {
      level, autoSelectedText: label.slice(0, 120),
    });
    return value as string;
  }

  const result = await selectFn({ message, options: clackOptions });

  if (isCancel(result) || typeof result === 'symbol') {
    writeTelemetry(input.projectRoot, 'decision_session_dismissed', { level, reason: 'cancel' });
    return 'skip';
  }
  if (typeof result === 'string' && result.startsWith(OPTION_SEPARATOR)) {
    writeTelemetry(input.projectRoot, 'decision_session_dismissed', { level, reason: 'skip' });
    return 'skip';
  }
  if (result === CLIPBOARD_ONLY) return 'clipboard_only';
  if (result === SKIP_NOW) {
    writeTelemetry(input.projectRoot, 'decision_session_dismissed', { level, reason: 'skip' });
    return 'skip';
  }
  if (result === SHOW_SIMPLER) return 'next';

  writeTelemetry(input.projectRoot, 'option_selected', { level, selectedText: (result as string).slice(0, 120) });
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
  // Increment per-project counter once per UI appearance, regardless of outcome.
  if (store) {
    incrementDecisionSessionCount(store, input.projectRoot);
  }

  writeTelemetry(input.projectRoot, 'decision_session_started', {
    flagType:   input.flagType,
    stage:      input.stage,
    pinchLabel: input.pinchLabel,
    sessionId:  input.sessionId,
  });

  let level: 1 | 2 | 3 = 1;

  while (true) {
    const levelResult = await runLevel(input, level, selectFn);

    // Windows sentinel: Ctrl+X opt-out — write config and skip (no skipped_sessions entry)
    if (levelResult === OPT_OUT_SENTINEL) {
      if (store) setConfig(store, `advisory_frequency:${input.projectRoot}`, 'off');
      return { outcome: 'skipped' };
    }
    // Windows sentinel: Ctrl+T frequency change — write config and skip
    if (typeof levelResult === 'string' && levelResult.startsWith('__FREQ__:')) {
      const newFreq = levelResult.slice('__FREQ__:'.length);
      if (store) setConfig(store, `advisory_frequency:${input.projectRoot}`, newFreq);
      return { outcome: 'skipped' };
    }

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
