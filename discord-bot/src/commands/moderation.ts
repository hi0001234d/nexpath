import {
  MessageFlags,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { command, memberHasPermission } from '../types';
import type { BotCommand } from '../types';

export const MODERATION_COMMANDS: BotCommand[] = [
  command(
    new SlashCommandBuilder()
      .setName('announce')
      .setDescription('Send an official announcement embed to a channel.')
      .addStringOption((opt) => opt.setName('title').setDescription('Title of the announcement').setRequired(true))
      .addStringOption((opt) => opt.setName('message').setDescription('The content of the announcement').setRequired(true))
      .addChannelOption((opt) =>
        opt.setName('channel').setDescription('The channel where the announcement should be posted')
          .addChannelTypes(ChannelType.GuildText),
      )
      .addBooleanOption((opt) => opt.setName('mention_everyone').setDescription('Whether to ping @everyone'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async (interaction) => {
      if (!memberHasPermission(interaction.member, PermissionFlagsBits.ManageMessages)) {
        await interaction.reply({ content: '❌ You lack `Manage Messages` permissions.', flags: MessageFlags.Ephemeral });
        return;
      }

      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      const title = interaction.options.getString('title', true);
      const message = interaction.options.getString('message', true);
      const mentionEveryone = interaction.options.getBoolean('mention_everyone') ?? false;

      if (!channel || !('send' in channel)) {
        await interaction.reply({ content: '❌ Invalid channel.', flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📢 ${title}`)
        .setDescription(message.replace(/\\n/g, '\n'))
        .setColor(0x465bc5)
        .setAuthor({
          name: `Announced by ${interaction.user.displayName}`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setFooter({ text: 'NexPath Community Announcement' });

      await channel.send({ content: mentionEveryone ? '@everyone' : undefined, embeds: [embed] });
      await interaction.reply({ content: `✅ Announcement sent to <#${channel.id}>!`, flags: MessageFlags.Ephemeral });
    },
  ),

  command(
    new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Bulk delete messages in the current channel.')
      .addIntegerOption((opt) =>
        opt.setName('amount').setDescription('Number of messages to delete (1-100)').setRequired(true),
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async (interaction) => {
      if (!memberHasPermission(interaction.member, PermissionFlagsBits.ManageMessages)) {
        await interaction.reply({ content: '❌ You lack `Manage Messages` permissions.', flags: MessageFlags.Ephemeral });
        return;
      }

      const amount = interaction.options.getInteger('amount', true);
      if (amount < 1 || amount > 100) {
        await interaction.reply({ content: '❌ Please enter a number between 1 and 100.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const channel = interaction.channel;
      if (!channel || !('bulkDelete' in channel)) {
        await interaction.editReply('❌ This command only works in text channels.');
        return;
      }
      const deleted = await channel.bulkDelete(amount, true);
      await interaction.editReply(`🧹 Successfully deleted ${deleted.size} messages.`);
    },
  ),

  command(
    new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Set slowmode delay in seconds for this channel.')
      .addIntegerOption((opt) =>
        opt.setName('seconds').setDescription('Slowmode duration in seconds (0 to disable)').setRequired(true),
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async (interaction) => {
      if (!memberHasPermission(interaction.member, PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({ content: '❌ You lack `Manage Channels` permissions.', flags: MessageFlags.Ephemeral });
        return;
      }

      const seconds = interaction.options.getInteger('seconds', true);
      if (seconds < 0 || seconds > 21600) {
        await interaction.reply({ content: '❌ Seconds must be between 0 and 21600 (6 hours).', flags: MessageFlags.Ephemeral });
        return;
      }

      const channel = interaction.channel;
      if (!channel || !('setRateLimitPerUser' in channel)) {
        await interaction.reply({ content: '❌ This command only works in text channels.', flags: MessageFlags.Ephemeral });
        return;
      }
      await channel.setRateLimitPerUser(seconds);
      await interaction.reply(
        seconds === 0
          ? '⏱️ Slowmode has been disabled for this channel.'
          : `⏱️ Slowmode set to \`${seconds}\` seconds for <#${channel.id}>.`,
      );
    },
  ),
];
