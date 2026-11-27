import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EmbedBuilder } from 'discord.js';
import type { Client, MessageCreateOptions } from 'discord.js';
import { config } from './config';

const CONFIG_FILE = path.join(process.cwd(), 'github_config.json');

export interface GithubConfig {
  // Discord snowflake IDs exceed Number.MAX_SAFE_INTEGER — always store as string
  channel_id?: string | null;
}

export function loadGithubConfig(): GithubConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as GithubConfig;
    }
  } catch {
    // fall through to env default
  }
  const id = config.githubChannelId;
  return { channel_id: /^\d+$/.test(id) ? id : null };
}

export function saveGithubConfig(cfg: GithubConfig): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

export function verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!config.webhookSecret) return true;
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', config.webhookSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface FormattedEvent {
  content?: string;
  embed?: EmbedBuilder;
}

export function formatEvent(event: string, data: any): FormattedEvent | null {
  const repo = data.repository ?? {};
  const repoName = repo.full_name ?? 'Repository';
  const repoUrl = repo.html_url ?? '';
  const sender = data.sender ?? {};
  const senderName = sender.login ?? 'Someone';

  if (event === 'watch' && data.action === 'started') {
    return { content: `⭐ **${senderName}** starred [${repoName}](${repoUrl})` };
  }

  if (event === 'pull_request') {
    const pr = data.pull_request ?? {};
    const prTitle = pr.title ?? 'No Title';
    const prUrl = pr.html_url ?? repoUrl;
    const num = pr.number ?? '';
    if (data.action === 'opened') {
      return { content: `🔀 **PR opened** in [${repoName}](${repoUrl}): #${num} ${prTitle} (${prUrl})` };
    }
    if (data.action === 'closed') {
      const merged = pr.merged === true;
      const emoji = merged ? '🎉 **PR merged**' : '🚫 **PR closed**';
      return { content: `${emoji} in [${repoName}](${repoUrl}): #${num} ${prTitle} (${prUrl})` };
    }
  }

  if (event === 'issues') {
    const issue = data.issue ?? {};
    const issueTitle = issue.title ?? 'No Title';
    const issueNumber = issue.number ?? 0;
    const issueUrl = issue.html_url ?? repoUrl;
    if (data.action === 'opened') {
      return { content: `🐛 **Issue opened** in [${repoName}](${repoUrl}): #${issueNumber} ${issueTitle} (${issueUrl})` };
    }
    if (data.action === 'closed') {
      return { content: `✅ **Issue closed** in [${repoName}](${repoUrl}): #${issueNumber} ${issueTitle} (${issueUrl})` };
    }
  }

  if (event === 'ping') {
    return { content: `🔔 **GitHub Webhook Connected** successfully to [${repoName}](${repoUrl})!` };
  }

  return null;
}

export async function sendToChannel(
  client: Client,
  githubConfig: GithubConfig,
  payload: MessageCreateOptions,
): Promise<boolean> {
  const channelId = githubConfig.channel_id;
  if (!channelId) {
    console.warn('No channel configured for GitHub events! Use /set_github_channel.');
    return false;
  }

  const channel =
    client.channels.cache.get(String(channelId)) ??
    (await client.channels.fetch(String(channelId)).catch(() => null));

  if (!channel || !('send' in channel)) {
    console.error(`Could not find or fetch Discord channel ${channelId}`);
    return false;
  }

  try {
    await channel.send(payload);
    console.log(`Posted GitHub event to #${'name' in channel ? channel.name : channelId} (${channelId})`);
    return true;
  } catch (err) {
    console.error(`Failed to send to channel ${channelId}:`, err);
    return false;
  }
}
