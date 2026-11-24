import { writeFileSync } from 'fs';
import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Guild } from 'discord.js';
import { command } from '../types';
import type { BotCommand, BotContext } from '../types';

export function generateStudyReport(guild: Guild): string {
  const lines: string[] = [];
  lines.push(`# 📊 Discord Server Study Report: ${guild.name}`);
  lines.push(`*Generated on: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC*\n`);

  lines.push('## 🏢 Server Overview');
  lines.push(`- **Server Name:** ${guild.name}`);
  lines.push(`- **Guild ID:** \`${guild.id}\``);
  lines.push(`- **Owner:** <@${guild.ownerId}> (\`${guild.ownerId}\`)`);
  lines.push(`- **Created At:** ${guild.createdAt.toISOString().slice(0, 19)}`);
  lines.push(`- **Total Members:** ${guild.memberCount ?? guild.members.cache.size}`);

  const members = guild.members.cache;
  const humans = members.filter((m) => !m.user.bot).size;
  const bots = members.filter((m) => m.user.bot).size;
  lines.push(`  - **Humans:** ${humans}`);
  lines.push(`  - **Bots:** ${bots}`);
  lines.push(`- **Verification Level:** ${guild.verificationLevel}`);
  lines.push(`- **Boost Level:** Tier ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`);
  lines.push(`- **Features Enabled:** ${guild.features.length ? guild.features.join(', ') : 'None'}\n`);

  lines.push('## 📁 Channel Architecture');
  const categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory);
  const uncategorized = guild.channels.cache.filter(
    (c) => c.parentId === null && c.type !== ChannelType.GuildCategory,
  );

  if (uncategorized.size) {
    lines.push('### 📌 Uncategorized Channels');
    for (const c of uncategorized.values()) {
      lines.push(`- \`#${c.name ?? c.id}\` (\`${c.id}\`) | Type: ${c.type}`);
    }
    lines.push('');
  }

  for (const cat of categories.values()) {
    lines.push(`### 📂 Category: **${cat.name}** (\`${cat.id}\`)`);
    const children = guild.channels.cache.filter((c) => c.parentId === cat.id);
    if (!children.size) lines.push('  *(No channels)*');
    for (const ch of children.values()) {
      let details = `Type: ${ch.type}`;
      if ('topic' in ch && ch.topic) {
        details += ` | Topic: *${ch.topic.length > 60 ? ch.topic.slice(0, 60) + '...' : ch.topic}*`;
      }
      lines.push(`  - \`#${ch.name ?? ch.id}\` (\`${ch.id}\`) [${details}]`);
    }
    lines.push('');
  }

  lines.push('## 🛡️ Roles & Permissions');
  lines.push('| Role Name | Role ID | Color | Members | Hoisted | Mentionable | Key Permissions |');
  lines.push('|-----------|---------|-------|---------|---------|-------------|-----------------|');
  const roles = [...guild.roles.cache.values()].sort((a, b) => b.position - a.position);
  for (const role of roles) {
    const perms: string[] = [];
    if (role.permissions.has(PermissionFlagsBits.Administrator)) perms.push('Admin');
    if (role.permissions.has(PermissionFlagsBits.ManageGuild)) perms.push('ManageServer');
    if (role.permissions.has(PermissionFlagsBits.ManageChannels)) perms.push('ManageChannels');
    if (role.permissions.has(PermissionFlagsBits.ManageRoles)) perms.push('ManageRoles');
    if (role.permissions.has(PermissionFlagsBits.KickMembers) || role.permissions.has(PermissionFlagsBits.BanMembers)) {
      perms.push('Moderator');
    }
    const permStr = perms.length ? perms.join(', ') : 'Standard';
    lines.push(
      `| ${role.name} | \`${role.id}\` | ${role.hexColor} | ${role.members.size} | ${role.hoist} | ${role.mentionable} | ${permStr} |`,
    );
  }
  lines.push('');

  lines.push('## 😀 Emojis & Assets');
  const emojiNames = guild.emojis.cache.map((e) => `:${e.name}:`).slice(0, 20);
  lines.push(
    `- **Custom Emojis (${guild.emojis.cache.size}):** ` +
      (emojiNames.length ? emojiNames.join(', ') + (guild.emojis.cache.size > 20 ? '...' : '') : 'None'),
  );
  lines.push(`- **Custom Stickers (${guild.stickers.cache.size}):** ${guild.stickers.cache.size}\n`);

  return lines.join('\n');
}

async function runStudy(interaction: any, ctx: BotContext) {
  await interaction.deferReply();
  const guild = interaction.guild as Guild | null;
  if (!guild) {
    await interaction.editReply('This command must be run inside a server.');
    return;
  }

  const report = generateStudyReport(guild);
  const filename = `nexpath_study_report_${guild.id}.md`;
  writeFileSync(filename, report, 'utf-8');

  const embed = new EmbedBuilder()
    .setTitle(`📊 Server Study: ${guild.name}`)
    .setDescription(`Comprehensive architectural study of **${guild.name}** (\`${guild.id}\`).`)
    .setColor(0x3498db)
    .setThumbnail(guild.iconURL() ?? null)
    .addFields(
      { name: '👥 Members', value: `Total: **${guild.memberCount ?? guild.members.cache.size}**`, inline: true },
      {
        name: '📂 Channels',
        value: `Total: **${guild.channels.cache.size}** (Categories: ${guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size})`,
        inline: true,
      },
      { name: '🛡️ Roles', value: `Total: **${guild.roles.cache.size}**`, inline: true },
      { name: '🚀 Boosts', value: `Tier ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`, inline: true },
      { name: '🔒 Verification', value: String(guild.verificationLevel), inline: true },
      { name: '📑 Full Report', value: `Saved locally to \`${filename}\` and attached below.`, inline: false },
    )
    .setFooter({
      text: 'NexPath Bot Analyzer',
      iconURL: ctx.client.user?.displayAvatarURL() ?? undefined,
    });

  const file = new AttachmentBuilder(Buffer.from(report, 'utf-8'), { name: 'NexPath_Server_Report.md' });
  await interaction.editReply({ embeds: [embed], files: [file] });
}

export const STUDY_COMMANDS: BotCommand[] = [
  command(
    new SlashCommandBuilder()
      .setName('study')
      .setDescription('Inspect and generate a full architecture report of the server.'),
    runStudy,
  ),
];
