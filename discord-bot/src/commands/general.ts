import {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import { command } from '../types';
import type { BotCommand } from '../types';

export const GENERAL_COMMANDS: BotCommand[] = [
  command(
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription("Check the bot's latency and responsiveness."),
    async (interaction, { client }) => {
      const latencyMs = Math.round(client.ws.ping);
      const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
      const h = Math.floor(uptimeSec / 3600);
      const m = Math.floor((uptimeSec % 3600) / 60);
      const s = uptimeSec % 60;

      const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor(0x57f287)
        .addFields(
          { name: 'Gateway Latency', value: `\`${latencyMs} ms\``, inline: true },
          { name: 'Uptime', value: `\`${h}h ${m}m ${s}s\``, inline: true },
        )
        .setFooter({
          text: 'NexPath Bot',
          iconURL: client.user?.displayAvatarURL() ?? undefined,
        });
      await interaction.reply({ embeds: [embed] });
    },
  ),

  command(
    new SlashCommandBuilder()
      .setName('serverinfo')
      .setDescription('Get high-level details about the NexPath server.'),
    async (interaction) => {
      const guild = interaction.guild;
      if (!guild) {
        await interaction.reply({ content: 'Must be run inside a guild.', flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`ℹ️ Server Info: ${guild.name}`)
        .setColor(0x465bc5)
        .setThumbnail(guild.iconURL() ?? null)
        .addFields(
          { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
          { name: 'Members', value: `Total: **${guild.memberCount ?? 'unknown'}**`, inline: true },
          {
            name: 'Channels',
            value: `Text: **${guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size}**`,
            inline: true,
          },
          { name: 'Roles', value: `**${guild.roles.cache.size}**`, inline: true },
          {
            name: 'Created',
            value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: 'Boost Level',
            value: `Tier ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`,
            inline: true,
          },
        )
        .setFooter({ text: `Guild ID: ${guild.id}` });
      await interaction.reply({ embeds: [embed] });
    },
  ),

  command(
    new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('View user profile and membership information.')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('The member to inspect (leave blank for yourself)'),
      ),
    async (interaction) => {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const member = interaction.guild?.members.cache.get(user.id);
      const roles = member
        ? member.roles.cache.filter((r) => r.name !== '@everyone').map((r) => r.toString())
        : [];

      const embed = new EmbedBuilder()
        .setTitle(`👤 User Profile: ${member?.displayName ?? user.username}`)
        .setColor(0x5865f2)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: 'Username', value: `\`${user.username}\``, inline: true },
          { name: 'ID', value: `\`${user.id}\``, inline: true },
          {
            name: 'Account Created',
            value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`,
            inline: true,
          },
        );
      if (member?.joinedTimestamp) {
        embed.addFields({
          name: 'Joined Server',
          value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`,
          inline: true,
        });
      }
      embed.addFields({
        name: `Roles (${roles.length})`,
        value: roles.slice(0, 10).join(' ') || 'No custom roles',
        inline: false,
      });
      await interaction.reply({ embeds: [embed] });
    },
  ),

  command(
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('List all available NexPath Bot slash commands.'),
    async (interaction, { client }) => {
      const embed = new EmbedBuilder()
        .setTitle('📖 NexPath Bot Command Menu')
        .setDescription('Here are the available slash commands for NexPath:')
        .setColor(0x465bc5)
        .addFields(
          {
            name: '🐙 GitHub Notifications',
            value:
              '• `/set_github_channel` - Set channel for Stars, Issues & PRs\n' +
              '• `/github_status` - Inspect webhook listener status\n' +
              '• `/test_github_event` - Test simulate Star/Issue/PR embeds',
            inline: false,
          },
          {
            name: '⚡ NexPath & Community',
            value: '• `/nexpath` - Overview, buttons & links\n• `/rules` - Community rules\n• `/study` - Full architectural audit & report',
            inline: false,
          },
          {
            name: '💻 Developer & Humor',
            value: '• `/joke` - Random programming joke for `#programming-humor`\n• `/quote` - Tech quotes\n• `/formatcode` - Guide for syntax highlighting',
            inline: false,
          },
          {
            name: '🛠️ Utility',
            value: '• `/ping` - Latency & uptime\n• `/serverinfo` - Server statistics\n• `/userinfo` - User information',
            inline: false,
          },
          {
            name: '🛡️ Moderation (Admins)',
            value: '• `/announce` - Post rich announcement\n• `/purge` - Bulk delete messages\n• `/slowmode` - Set channel chat delay',
            inline: false,
          },
        )
        .setFooter({
          text: 'NexPath Bot • Built for Developers',
          iconURL: client.user?.displayAvatarURL() ?? undefined,
        });
      await interaction.reply({ embeds: [embed] });
    },
  ),
];

const startedAt = Date.now();
