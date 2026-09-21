import { describe, it, expect } from 'vitest';
import { resolveAgentFromHostname, resolveProjectRootFromLocation } from './agent-hosts.js';

describe('resolveAgentFromHostname', () => {
  it('maps replit.com and its subdomains to replit', () => {
    expect(resolveAgentFromHostname('replit.com')).toBe('replit');
    expect(resolveAgentFromHostname('firewalledreplit.com')).toBe('replit');
  });

  it('maps bolt.new to bolt', () => {
    expect(resolveAgentFromHostname('bolt.new')).toBe('bolt');
  });

  it('maps stackblitz.com subdomains to bolt', () => {
    expect(resolveAgentFromHostname('abc.stackblitz.com')).toBe('bolt');
  });

  it('maps lovable.dev to lovable', () => {
    expect(resolveAgentFromHostname('lovable.dev')).toBe('lovable');
  });

  it('returns unknown for anything else', () => {
    expect(resolveAgentFromHostname('example.com')).toBe('unknown');
    expect(resolveAgentFromHostname('localhost')).toBe('unknown');
  });
});

describe('resolveProjectRootFromLocation (per-project session roots — CLI parity)', () => {
  it('bolt project page → origin + /~/<slug>', () => {
    expect(resolveProjectRootFromLocation('bolt.new', '/~/sb1-acwdroy6', 'https://bolt.new'))
      .toBe('https://bolt.new/~/sb1-acwdroy6');
  });

  it('bolt project sub-path still resolves to the project slug only', () => {
    expect(resolveProjectRootFromLocation('bolt.new', '/~/sb1-acwdroy6/settings', 'https://bolt.new'))
      .toBe('https://bolt.new/~/sb1-acwdroy6');
  });

  it('bolt.new landing page → null (capture must be skipped; the prompt re-arrives on the project page)', () => {
    expect(resolveProjectRootFromLocation('bolt.new', '/', 'https://bolt.new')).toBeNull();
  });

  it('stackblitz subdomain uses the same /~/<slug> shape', () => {
    expect(resolveProjectRootFromLocation('abc.stackblitz.com', '/~/xyz', 'https://abc.stackblitz.com'))
      .toBe('https://abc.stackblitz.com/~/xyz');
  });

  it('replit project page → origin + /@user/project', () => {
    expect(resolveProjectRootFromLocation('replit.com', '/@vedansi18/Hello-World', 'https://replit.com'))
      .toBe('https://replit.com/@vedansi18/Hello-World');
  });

  it('replit non-project pages → null', () => {
    expect(resolveProjectRootFromLocation('replit.com', '/~', 'https://replit.com')).toBeNull();
    expect(resolveProjectRootFromLocation('replit.com', '/', 'https://replit.com')).toBeNull();
  });

  // Team workspaces put the project under /t/<team>/ — before these shapes were
  // recognised, every prompt typed there was skipped and no popup could show.
  const replitRoot = (pathname: string): string | null =>
    resolveProjectRootFromLocation('replit.com', pathname, 'https://replit.com');

  it('replit team project page → origin + /t/<team>/repls/<project>', () => {
    expect(replitRoot('/t/my-team/repls/Invoice-App')).toBe('https://replit.com/t/my-team/repls/Invoice-App');
  });

  it('replit team chat page → origin + /t/<team>/chats/<chat-id>', () => {
    expect(replitRoot('/t/my-team/chats/chat-cnv_0abc123def456ghi789'))
      .toBe('https://replit.com/t/my-team/chats/chat-cnv_0abc123def456ghi789');
  });

  it('replit team sub-paths and a trailing slash still resolve to the project / chat only', () => {
    expect(replitRoot('/t/my-team/repls/Invoice-App/')).toBe('https://replit.com/t/my-team/repls/Invoice-App');
    expect(replitRoot('/t/my-team/repls/Invoice-App/files/src')).toBe('https://replit.com/t/my-team/repls/Invoice-App');
    expect(replitRoot('/t/my-team/chats/chat-cnv_0abc/')).toBe('https://replit.com/t/my-team/chats/chat-cnv_0abc');
  });

  it('replit team roots never merge — each project, chat and team is its own session', () => {
    const roots = [
      '/t/my-team/repls/Invoice-App',
      '/t/my-team/repls/Tip-Calculator',
      '/t/other-team/repls/Invoice-App',
      '/t/my-team/chats/chat-cnv_0abc',
      '/t/my-team/chats/chat-cnv_0def',
      '/t/my-team/chats/Invoice-App',
    ].map(replitRoot);
    expect(roots.every((r) => r !== null)).toBe(true);
    expect(new Set(roots).size).toBe(roots.length);
  });

  it('replit team pages without a project or chat → null (capture stays skipped there)', () => {
    for (const p of [
      '/t', '/t/', '/t/my-team', '/t/my-team/',
      '/t/my-team/repls', '/t/my-team/repls/', '/t/my-team/chats', '/t/my-team/chats/',
      '/t//repls/Invoice-App',
    ]) {
      expect(replitRoot(p), p).toBeNull();
    }
  });

  it('replit shapes not recognised yet stay skipped, exactly as before', () => {
    for (const p of ['/t/my-team/deployments/Invoice-App', '/team/my-team/repls/Invoice-App', '/x/t/my-team/repls/Invoice-App']) {
      expect(replitRoot(p), p).toBeNull();
    }
  });

  it('the /@user/project shape is read first and is unchanged', () => {
    expect(replitRoot('/@some-user/Some-Project/files')).toBe('https://replit.com/@some-user/Some-Project');
  });

  it('lovable project page → origin + /projects/<uuid> (B5 recon confirmed 2026-07-06)', () => {
    expect(resolveProjectRootFromLocation('lovable.dev', '/projects/21239a50-17b8-4fa3-a8ca-03ab8d24d0c3', 'https://lovable.dev'))
      .toBe('https://lovable.dev/projects/21239a50-17b8-4fa3-a8ca-03ab8d24d0c3');
  });

  it('lovable project sub-path still resolves to the project id only', () => {
    expect(resolveProjectRootFromLocation('lovable.dev', '/projects/abc-123/settings', 'https://lovable.dev'))
      .toBe('https://lovable.dev/projects/abc-123');
  });

  it('lovable dashboard and marketing home → null (no project context)', () => {
    expect(resolveProjectRootFromLocation('lovable.dev', '/dashboard', 'https://lovable.dev')).toBeNull();
    expect(resolveProjectRootFromLocation('lovable.dev', '/', 'https://lovable.dev')).toBeNull();
  });

  it('unknown hosts → null', () => {
    expect(resolveProjectRootFromLocation('example.com', '/anything', 'https://example.com')).toBeNull();
  });
});
