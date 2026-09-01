import { readPendingPromptEnhancement } from './pe-store-reader.js';

/**
 * Decide whether the most recent `auto` call for `projectRoot` parked a
 * pending Prompt Enhancement, as opposed to a Decision Session advisory
 * (the PE-origin routing decision).
 *
 * Typed store evidence only — reads `pending_prompt_enhancements` via P3's
 * `pe-store-reader.ts`. Never inspects the text `nexpath stop` returns; a DS
 * selection and a PE body currently arrive through the exact same
 * `{decision:'block', reason:<text>}` shape (`ipc.ts`), so text is not a
 * reliable signal and the handoff explicitly forbids using it as one.
 *
 * Called BEFORE `spawnStop` runs (right after `spawnAuto`, mirroring
 * `onAfterCapture`'s existing timing in `chat-pipeline.ts`) — not after. By
 * the time `spawnStop` returns a delivered result, the CLI has already
 * flipped the row to `status:'shown'` (`markPromptEnhancementShown` runs on
 * the `inject`/`shown` decision, before the process exits — a documented CLI ordering),
 * so a post-Stop `status:'pending'` check would race and silently miss every
 * real delivery. Checking here, while the row is still genuinely pending,
 * avoids that race entirely instead of working around it.
 *
 * Read-only, never throws: any failure means "treat as DS-origin" (fail-safe
 * — a PE-detection failure never breaks the pre-existing DS path).
 */
export interface PeOriginDeps {
  dbPath?:      string;
  readPendingPe?: typeof readPendingPromptEnhancement;
}

export async function isPeOriginTurn(
  projectRoot: string,
  deps: PeOriginDeps = {},
): Promise<boolean> {
  const readPendingPe = deps.readPendingPe ?? readPendingPromptEnhancement;
  try {
    const pe = await readPendingPe(projectRoot, { dbPath: deps.dbPath });
    return pe !== null;
  } catch {
    return false;
  }
}
