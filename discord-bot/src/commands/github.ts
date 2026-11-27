import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { command, memberHasPermission } from '../types';
import type { BotCommand } from '../types';
import { formatEvent, loadGithubConfig, saveGithubConfig, sendToChannel } from '../github';
import { config } from '../config';

export const GITHUB_COMMANDS: BotCommand[] = [
  command(
    new SlashCommandBuilder()
      .setName('set_github_channel')
      .setDescription('Set which Discord channel receives GitHub Stars, Issues, and PRs.')
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('The channel where GitHub notifications should be posted').setRequired(true),
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async (interaction) => {
      if (!memberHasPermission(interaction.member, PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({ content: '❌ You lack `Manage Channels` permission.', flags: MessageFlags.Ephemeral });
        return;
      }

      const channel = interaction.options.getChannel('channel', true);
      if (!channel || !('id' in channel)) {
        await interaction.reply({ content: '❌ Invalid channel.', flags: MessageFlags.Ephemeral });
        return;
      }

      const githubConfig = loadGithubConfig();
      githubConfig.channel_id = channel.id;
      saveGithubConfig(githubConfig);

      const embed = new EmbedBuilder()
        .setTitle('✅ GitHub Updates Channel Set!')
        .setDescription(
          `All GitHub events (**Stars, Issues, PR Open, PR Merged**) will now be sent to <#${channel.id}>.`,
        )
        .setColor(0x57f287)
        .addFields({
          name: 'Webhook Endpoint',
          value: `\`POST http://<your-server-ip>:${config.webhookPort}/github-webhook\``,
          inline: false,
        })
        .setFooter({ text: 'NexPath GitHub System' });
      await interaction.reply({ embeds: [embed] });
    },
  ),

  command(
    new SlashCommandBuilder()
      .setName('github_status')
      .setDescription('Check GitHub webhook server status and target channel.'),
    async (interaction) => {
      const githubConfig = loadGithubConfig();
      const channelId = githubConfig.channel_id;
      const channelMention = channelId ? `<#${channelId}>` : '*Not configured yet (use `/set_github_channel`)*';

      const embed = new EmbedBuilder()
        .setTitle('🐙 GitHub Webhook Status')
        .setColor(0x465bc5)
        .addFields(
          { name: 'Target Channel', value: channelMention, inline: false },
          { name: 'Listener Port', value: `\`${config.webhookPort}\``, inline: true },
          {
            name: 'Secret Verification',
            value: config.webhookSecret ? '`Enabled`' : '`Disabled (optional)`',
            inline: true,
          },
          { name: 'Webhook Path', value: '`/github-webhook`', inline: false },
        )
        .setFooter({ text: 'NexPath GitHub Integration' });
      await interaction.reply({ embeds: [embed] });
    },
  ),

  command(
    new SlashCommandBuilder()
      .setName('test_github_event')
      .setDescription('Simulate a GitHub Star, Issue, or PR event for testing.')
      .addStringOption((opt) =>
        opt
          .setName('event_type')
          .setDescription('Select which event to simulate')
          .setRequired(true)
          .addChoices(
            { name: '⭐ New Star', value: 'star' },
            { name: '🐛 New Issue Opened', value: 'issue_open' },
            { name: '🔀 New Pull Request Opened', value: 'pr_open' },
            { name: '🎉 Pull Request Merged', value: 'pr_merge' },
          ),
      ),
    async (interaction, { client }) => {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const eventType = interaction.options.getString('event_type', true);

      const repoData = {
        full_name: 'NexPath/nexpath',
        html_url: 'https://github.com/hi0001234d/nexpath',
        stargazers_count: 42,
      };
      const senderData = {
        login: interaction.user.username,
        avatar_url: interaction.user.displayAvatarURL(),
        html_url: 'https://github.com',
      };

      let event: string;
      let data: any;
      switch (eventType) {
        case 'star':
          event = 'watch';
          data = { action: 'started', repository: repoData, sender: senderData };
          break;
        case 'issue_open':
          event = 'issues';
          data = {
            action: 'opened',
            repository: repoData,
            sender: senderData,
            issue: {
              number: 101,
              title: 'Add dark mode support to NexPath dashboard',
              html_url: 'https://github.com/hi0001234d/nexpath/issues/101',
              body: 'It would be great to have dark mode enabled by default.',
            },
          };
          break;
        case 'pr_open':
          event = 'pull_request';
          data = {
            action: 'opened',
            repository: repoData,
            sender: senderData,
            pull_request: {
              number: 211,
              title: 'Context Engineering delivery & prompt section ceiling',
              html_url: 'https://github.com/hi0001234d/nexpath/pull/211',
            },
          };
          break;
        case 'pr_merge':
          event = 'pull_request';
          data = {
            action: 'closed',
            repository: repoData,
            sender: senderData,
            pull_request: {
              number: 211,
              title: 'Context Engineering delivery & prompt section ceiling',
              html_url: 'https://github.com/hi0001234d/nexpath/pull/211',
              merged: true,
            },
          };
          break;
        default:
          await interaction.followUp({ content: 'Unknown event type', flags: MessageFlags.Ephemeral });
          return;
      }

      const formatted = formatEvent(event, data);
      const githubConfig = loadGithubConfig();
      const sent = await sendToChannel(client, githubConfig, {
        content: formatted?.content ?? undefined,
      });
      await interaction.followUp({
        content: sent
          ? `✅ Dispatched test **${eventType}** message to configured channel!`
          : '❌ Failed to deliver — check `/github_status` and that the channel is configured correctly.',
        flags: MessageFlags.Ephemeral,
      });
    },
  ),
];
