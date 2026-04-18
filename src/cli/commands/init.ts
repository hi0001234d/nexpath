import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { intro, text, select, outro, isCancel } from '@clack/prompts';
import { openStore, closeStore, upsertProject, DEFAULT_DB_PATH } from '../../store/index.js';

// ── Project type options ───────────────────────────────────────────────────────

export const PROJECT_TYPES = [
  { value: 'web-app',  label: 'Web App' },
  { value: 'api',      label: 'API / Backend' },
  { value: 'cli',      label: 'CLI Tool' },
  { value: 'mobile',   label: 'Mobile App' },
  { value: 'desktop',  label: 'Desktop App' },
  { value: 'library',  label: 'Library / Package' },
  { value: 'other',    label: 'Other' },
] as const;

export type ProjectTypeValue = (typeof PROJECT_TYPES)[number]['value'];

// ── Questionnaire types ────────────────────────────────────────────────────────

export type ProjectInput = {
  name: string;
  projectType: string;
  language: string;
  description: string;
};

/**
 * Injectable prompt function — real code uses @clack/prompts;
 * tests pass a mock that returns predetermined answers.
 * Return null to signal cancellation.
 */
export type PromptFn = (defaults: { name: string }) => Promise<ProjectInput | null>;

// ── Default name detection ─────────────────────────────────────────────────────

/** Read project name from package.json if present; fall back to folder name. */
export function detectProjectName(cwd: string): string {
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (typeof pkg.name === 'string' && pkg.name.trim()) {
        return pkg.name.trim();
      }
    } catch {
      // fall through
    }
  }
  return basename(cwd);
}

// ── Default prompt function (uses @clack/prompts) ──────────────────────────────

const defaultPromptFn: PromptFn = async ({ name: defaultName }) => {
  intro('nexpath init — project onboarding');

  const name = await text({
    message: 'Project name',
    initialValue: defaultName,
    validate: (v) => (v.trim() ? undefined : 'Name cannot be empty'),
  });
  if (isCancel(name)) { outro('Cancelled.'); return null; }

  const projectType = await select({
    message: 'Project type',
    options: PROJECT_TYPES as unknown as Array<{ value: string; label: string }>,
  });
  if (isCancel(projectType)) { outro('Cancelled.'); return null; }

  const language = await text({
    message: 'Primary language (optional)',
    placeholder: 'e.g. TypeScript, Python',
  });
  if (isCancel(language)) { outro('Cancelled.'); return null; }

  const description = await text({
    message: 'Brief description (optional)',
    placeholder: '1-2 sentences about what this project does',
  });
  if (isCancel(description)) { outro('Cancelled.'); return null; }

  outro('Project initialised.');
  return {
    name:        (name as string).trim(),
    projectType: projectType as string,
    language:    (language as string).trim(),
    description: (description as string).trim(),
  };
};

// ── initAction ─────────────────────────────────────────────────────────────────

export async function initAction(
  cwd     = process.cwd(),
  dbPath  = DEFAULT_DB_PATH,
  promptFn: PromptFn = defaultPromptFn,
): Promise<void> {
  const defaultName = detectProjectName(cwd);
  const input = await promptFn({ name: defaultName });

  if (!input) return; // cancelled

  const store = await openStore(dbPath);
  upsertProject(store, {
    projectRoot: cwd,
    name:        input.name,
    projectType: input.projectType || undefined,
    language:    input.language    || undefined,
    description: input.description || undefined,
  });
  closeStore(store);

  console.log(`Project "${input.name}" saved to store.`);
  console.log(`Run: nexpath status  to view all registered projects.`);
}
