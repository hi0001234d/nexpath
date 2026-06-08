// R4 bookend constants + CA-facing substitution helper.
//
// Two register classes of bookend land in this module:
//
//   - CA-facing (single string-pair) — used inside the desc-base content
//     that is sent to the agent. The placeholders `{R4_OPEN}` and
//     `{R4_CLOSE}` inside an authored desc-base are substituted by these
//     constants at option-generation time, AFTER Pass 1 / Pass 2 / R5
//     injection have all run (per the locked substitution order).
//
//   - User-facing (per-register pair) — used at popup-render time to
//     wrap the rendered why-help block. The open string is common across
//     all 3 registers; the close strings are register-specific.
//
// Initial wording is verbatim from the locked R4 strings. The
// substitution helper performs simple replacement and is called from the
// option-generation pipeline.

/** CA-facing bookend open — single locked string. */
export const R4_CA_OPEN  = "(I'm flagging this because:)";

/** CA-facing bookend close — locked as empty. */
export const R4_CA_CLOSE = '';

/** User-facing bookend open — common across all 3 registers. */
export const R4_USER_OPEN = "You're seeing this because";

/** User-facing bookend close — register-specific. */
export const R4_USER_CLOSE = {
  formal:   '— review the options below to determine the next step.',
  casual:   '— pick from the options below to keep moving.',
  beginner: "— let's pick one below.",
} as const;

/** Register key used by R4_USER_CLOSE. */
export type R4UserRegister = keyof typeof R4_USER_CLOSE;

/**
 * Substitute the `{R4_OPEN}` and `{R4_CLOSE}` placeholders in a CA-facing
 * desc-base template with the locked CA-facing bookend strings.
 *
 * Called from the option-generation pipeline after upstream substitutions
 * (Pass 1 / Pass 2 / R5 injection) have completed, so the bookend wording
 * is the last text added and is never paraphrased by the upstream steps.
 */
export function substituteCAFacingBookend(descBase: string): string {
  return descBase
    .replaceAll('{R4_OPEN}',  R4_CA_OPEN)
    .replaceAll('{R4_CLOSE}', R4_CA_CLOSE);
}
