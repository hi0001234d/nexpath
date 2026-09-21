/**
 * Hostname → agent id mapping, shared by every context that needs to know which
 * agent a page belongs to (content scripts, MAIN-world fetch rules, inject-back
 * dispatch). Single source of truth — must stay in sync with the manifests'
 * content-script `matches` blocks. Zero side effects, safe to import anywhere.
 */
export function resolveAgentFromHostname(hostname: string): string {
  if (hostname.endsWith('replit.com')) return 'replit';
  if (hostname === 'bolt.new' || hostname.endsWith('stackblitz.com')) return 'bolt';
  if (hostname === 'lovable.dev') return 'lovable';
  return 'unknown';
}

/**
 * URL → per-PROJECT session root, mirroring the CLI where the session is keyed to
 * the project directory. The B2 skeleton used the bare origin as a proxy ("B3–B5
 * will refine") — which silently merged EVERY project on a site into one shared
 * session: one project's advisory marked the dedup key / burned the cooldown /
 * inflated promptCount for all of them, and a tester could only get a fresh session
 * by waiting out the 30-minute reset instead of just opening a new project like the
 * CLI allows. Confirmed live on Bolt 2026-07-06.
 *
 * Returns null when the page has no project context (e.g. the bolt.new landing
 * page) — capture must be SKIPPED there: a landing-submitted prompt re-arrives in
 * the new project page's own /api/chat/v2 POST and is captured there under the
 * correct project root, so nothing is lost (this also removes the landing
 * double-count at its source).
 */
export function resolveProjectRootFromLocation(hostname: string, pathname: string, origin: string): string | null {
  const agent = resolveAgentFromHostname(hostname);
  if (agent === 'bolt') {
    // bolt.new/~/<slug> (confirmed live); same shape assumed for *.stackblitz.com
    const m = pathname.match(/^\/~\/([^/]+)/);
    return m ? `${origin}/~/${m[1]}` : null;
  }
  if (agent === 'replit') {
    // replit.com/@<user>/<project> (confirmed in B3 recon)
    const m = pathname.match(/^\/(@[^/]+\/[^/]+)/);
    if (m) return `${origin}/${m[1]}`;
    // Team workspaces: replit.com/t/<team>/repls/<project> and
    // replit.com/t/<team>/chats/<chat-id> (both on a tester's pages, 2026-09-18).
    // Neither starts with "/@", so every prompt typed there was skipped as "no
    // project context" and no popup could show. Each project and each chat is its
    // own root — one session per project, as above; a chat cannot be tied to its
    // project from the URL alone. The team's list pages and any shape not seen
    // yet still have no project context → null.
    const t = pathname.match(/^\/(t\/[^/]+\/(?:repls|chats)\/[^/]+)/);
    return t ? `${origin}/${t[1]}` : null;
  }
  if (agent === 'lovable') {
    // lovable.dev/projects/<uuid> (confirmed live in B5 recon 2026-07-06);
    // /dashboard and the marketing home have no project context → null.
    const m = pathname.match(/^\/projects\/([^/]+)/);
    return m ? `${origin}/projects/${m[1]}` : null;
  }
  return null;
}
