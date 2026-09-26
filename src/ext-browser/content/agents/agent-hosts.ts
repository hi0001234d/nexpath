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
    // Chats and team workspaces — three shapes that do not start with "/@", so a
    // prompt typed on any of them used to be skipped as "no project context" and
    // no popup could ever show:
    //   /chats/<id>                 an agent chat (seen live on a personal account,
    //                               2026-09-25: a prompt from the home page lands
    //                               here before any project exists)
    //   /t/<team>/chats/<id>        the same chat inside a team workspace
    //   /t/<team>/repls/<project>   a team workspace's project
    // Each chat and each project is its own root — one session per project, as
    // above. A chat cannot be tied to its project from the URL alone, so when a
    // chat turns into a project the session starts fresh there; nothing is lost,
    // because the prompt held for a page with no project is delivered under the
    // new root (see main-world-injector's stash).
    // List pages (/chats, /t/<team>/repls) and any shape not seen yet stay null.
    const t = pathname.match(/^\/(t\/[^/]+\/(?:repls|chats)\/[^/]+|chats\/[^/]+)/);
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
