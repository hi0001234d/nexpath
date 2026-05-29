import pc from 'picocolors';

const GOAL_EMPHASIS = 'WHAT YOUR GOAL IS';

/** The four predefined project roles, in display order. `num` is the key the user types. */
export const ROLE_OPTIONS = [
  { num: 1, value: 'founder',      label: 'founder / product creator' },
  { num: 2, value: 'vibe_coder',   label: 'vibe coder' },
  { num: 3, value: 'indie_hacker', label: 'indie hacker' },
  { num: 4, value: 'pm',           label: 'product manager' },
] as const;

/**
 * Plain (un-styled) explanatory lines for the project role. Single source of
 * truth so both the numbered /dev/tty menu and the new-window radio prompt show
 * the same text. The goal phrase is emphasised in styled renderings because it
 * is the single biggest factor in how nexpath guides the user.
 */
export const ROLE_DESCRIPTION_LINES = [
  'Why a project role?',
  "Your role tells nexpath what kind of project you're building",
  'and your level of involvement, so it can assume your dev flow',
  'and tailor its advisories. Most importantly, it tells nexpath',
  `${GOAL_EMPHASIS} — the biggest factor in how it guides you.`,
] as const;

/** The role description as a single multi-line string (for prompt messages). */
export const ROLE_DESCRIPTION_TEXT = ROLE_DESCRIPTION_LINES.join('\n');

/**
 * Framed, gray explanatory block shown beneath the project-role options. Opens
 * with a question so the reader recognises it as the role's description; the
 * goal phrase is emphasised. `colors` is injectable so a spawned window can
 * force ANSI output regardless of the parent process's color detection.
 */
export function buildRoleDescriptionLines(colors: ReturnType<typeof pc.createColors> = pc): string[] {
  const bar = colors.cyan('│');
  return ROLE_DESCRIPTION_LINES.map((line, i) => {
    if (i === 0) {
      // First line is the heading — style it like the "Project role" title (bold).
      return `${bar}  ${colors.bold(line)}`;
    }
    if (line.startsWith(GOAL_EMPHASIS)) {
      return `${bar}  ${colors.bold(GOAL_EMPHASIS)}${colors.gray(line.slice(GOAL_EMPHASIS.length))}`;
    }
    return `${bar}  ${colors.gray(line)}`;
  });
}

/** Numbered "Project role" menu: header, options (current value tagged), then the description. */
export function buildRoleMenuLines(currentValue: string, colors: ReturnType<typeof pc.createColors> = pc): string[] {
  const bar = colors.cyan('│');
  return [
    bar,
    `${colors.cyan('◆')}  ${colors.bold('Project role')}`,
    ...ROLE_OPTIONS.map((o) => {
      const suffix = o.value === currentValue ? colors.dim(' (current)') : '';
      return `${bar}  ${colors.green(`${o.num})`)} ${o.label}${suffix}`;
    }),
    bar,
    ...buildRoleDescriptionLines(colors),
    bar,
  ];
}
