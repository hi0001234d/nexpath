import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN ?? '',
  guildId: process.env.GUILD_ID ?? '',
  githubChannelId: process.env.GITHUB_CHANNEL_ID ?? '',
  webhookPort: parseInt(process.env.GITHUB_WEBHOOK_PORT ?? '5000', 10),
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || null,
  autoStudy: ['true', '1', 'yes'].includes((process.env.AUTO_STUDY ?? 'true').toLowerCase()),
};
