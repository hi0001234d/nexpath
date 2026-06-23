/**
 * Framework-fingerprint registry — a declarative allowlist mapping a dependency
 * marker to a canonical framework name (array-literal, one entry per marker; add
 * a framework = append one entry).
 *
 * The DETECTION table is a closed allowlist: only these dependency names are
 * treated as framework markers. The VALUE axis, however, is OPEN-NOMINAL — a
 * matched marker resolves to its canonical alias when one exists, otherwise the
 * marker name is kept verbatim. `project_framework` is the only open-valued fact
 * in the model; everything else is boolean or a closed enum.
 */

/** One fingerprint: a package-dependency name that marks a framework. */
export interface FrameworkFingerprint {
  /** Exact dependency name to look for in dependencies / devDependencies. */
  dependency: string;
  /** Canonical framework name this dependency resolves to. */
  framework: string;
}

/**
 * Ordered allowlist. Earlier entries win when several markers are present (e.g.
 * a Next.js app also depends on `react` — Next.js is the more specific frame and
 * is listed first). Extend by appending; keep most-specific markers above their
 * underlying libraries.
 */
export const FRAMEWORK_FINGERPRINTS: readonly FrameworkFingerprint[] = [
  // Meta-frameworks first (they sit on top of a base library).
  { dependency: 'next', framework: 'nextjs' },
  { dependency: 'nuxt', framework: 'nuxtjs' },
  { dependency: '@remix-run/react', framework: 'remix' },
  { dependency: 'gatsby', framework: 'gatsby' },
  { dependency: 'astro', framework: 'astro' },
  { dependency: '@sveltejs/kit', framework: 'sveltekit' },
  { dependency: '@nestjs/core', framework: 'nestjs' },
  { dependency: '@angular/core', framework: 'angular' },
  { dependency: 'expo', framework: 'expo' },
  { dependency: 'react-native', framework: 'react-native' },
  // Base UI libraries / app frameworks.
  { dependency: 'react', framework: 'react' },
  { dependency: 'vue', framework: 'vue' },
  { dependency: 'svelte', framework: 'svelte' },
  { dependency: '@angular/cli', framework: 'angular' },
  { dependency: 'solid-js', framework: 'solidjs' },
  { dependency: 'preact', framework: 'preact' },
  // Server frameworks.
  { dependency: 'express', framework: 'express' },
  { dependency: 'fastify', framework: 'fastify' },
  { dependency: 'koa', framework: 'koa' },
  { dependency: '@hapi/hapi', framework: 'hapi' },
  { dependency: 'hono', framework: 'hono' },
  // Build tooling that meaningfully shapes a project.
  { dependency: 'vite', framework: 'vite' },
];

/**
 * Resolve the framework value from a project's merged dependency names.
 *
 * Walks the fingerprint allowlist in order and returns the first canonical match
 * (open-nominal: a matched marker without a distinct alias keeps its own name).
 * Returns `null` when no marker is present (UNKNOWN — never a guess).
 */
export function resolveFramework(dependencyNames: readonly string[]): string | null {
  const present = new Set(dependencyNames);
  for (const fp of FRAMEWORK_FINGERPRINTS) {
    if (present.has(fp.dependency)) return fp.framework;
  }
  return null;
}
