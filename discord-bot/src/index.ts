import {
  MessageFlags,
  ActivityType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} from 'discord.js';
import { config } from './config';
import { GENERAL_COMMANDS } from './commands/general';
import { NEXPATH_COMMANDS, nexpathViewRow, RULES_TEXT, START_TEXT } from './commands/nexpath';
import { PROGRAMMING_COMMANDS } from './commands/programming';
import { MODERATION_COMMANDS } from './commands/moderation';
import { STUDY_COMMANDS, generateStudyReport } from './commands/study';
import { GITHUB_COMMANDS } from './commands/github';
import { startWebhookServer } from './webhook';
import type { BotCommand } from './types';

const commands: BotCommand[] = [
  ...GENERAL_COMMANDS,
  ...NEXPATH_COMMANDS,
  ...PROGRAMMING_COMMANDS,
  ...MODERATION_COMMANDS,
  ...STUDY_COMMANDS,
  ...GITHUB_COMMANDS,
];
const commandMap = new Map(commands.map((c) => [c.data.name, c]));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (c) => {
  console.log('='.repeat(50));
  console.log('🚀 NexPath Bot is Online!');
  console.log(`Logged in as: ${c.user.tag} (ID: ${c.user.id})`);
  console.log(`Connected Guilds: ${c.guilds.cache.size}`);
  for (const g of c.guilds.cache.values()) {
    console.log(` - ${g.name} (ID: ${g.id}) | Members: ${g.memberCount ?? 'unknown'}`);
  }
  console.log('='.repeat(50));

  await c.user.setPresence({
    activities: [{ name: 'NexPath Community • /help', type: ActivityType.Watching }],
    status: 'online',
  });

  // Register slash commands (instant when GUILD_ID is set)
  const rest = new REST().setToken(config.token);
  const body = commands.map((cmd) => cmd.data);
  try {
    if (config.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(c.user.id, config.guildId),
        { body },
      );
      console.log(`Synced ${body.length} slash commands to Guild ${config.guildId} (instant).`);
    } else {
      await rest.put(Routes.applicationCommands(c.user.id), { body });
      console.log(`Synced ${body.length} global slash commands.`);
    }
  } catch (err) {
    console.error('Failed to sync slash commands:', err);
  }

  // GitHub webhook listener
  startWebhookServer(c);

  // Auto-study on startup
  if (config.autoStudy && config.guildId) {
    const guild = c.guilds.cache.get(config.guildId);
    if (guild) {
      const report = generateStudyReport(guild);
      const filename = `nexpath_study_report_${guild.id}.md`;
      const { writeFileSync } = await import('fs');
      writeFileSync(filename, report, 'utf-8');
      console.log(`📊 Auto-Study complete! Server report generated at ${filename}`);
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commandMap.get(interaction.commandName);
      if (!cmd) {
        console.warn(`Unknown command: ${interaction.commandName}`);
        return;
      }
      await cmd.execute(interaction, { client });
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'nexpath_rules') {
        await interaction.reply({ content: RULES_TEXT, flags: MessageFlags.Ephemeral });
      } else if (interaction.customId === 'nexpath_start') {
        await interaction.reply({ content: START_TEXT, flags: MessageFlags.Ephemeral });
      }
    }
  } catch (err) {
    console.error(`Error handling interaction ${interaction.id}:`, err);
    if (!interaction.isRepliable()) return;
    const reply = { content: '❌ Something went wrong while running that command.', flags: MessageFlags.Ephemeral as const };
    if ('replied' in interaction && interaction.replied || 'deferred' in interaction && interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  const guild = member.guild;
  const channel =
    guild.systemChannel ??
    guild.channels.cache.find(
      (c) =>
        c.isTextBased() &&
        /welcome|general|programming-humor/i.test(c.name),
    );
  if (!channel || !channel.isTextBased() || !channel.permissionsFor(guild.members.me!)?.has('SendMessages')) {
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎉 Welcome to NexPath, ${member.user.username}!`)
    .setDescription(
      `Welcome ${member} to the **NexPath** community!\nWe are excited to have you here. Check the buttons below to get started.`,
    )
    .setColor(0x1abc9c)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: 'Member Count', value: `You are member #${guild.memberCount ?? 'unknown'}!`, inline: true })
    .setFooter({ text: 'NexPath Community Bot' });

  await channel.send({ embeds: [embed], components: [nexpathViewRow()] });
});

async function main() {
  if (!config.token || config.token === 'your_bot_token_here') {
    console.error('\n[ERROR] Bot cannot start without DISCORD_TOKEN in .env.');
    console.error('1. Copy .env.example to .env');
    console.error('2. Insert your Bot Token from Discord Developer Portal');
    console.error('3. Run: npm run dev\n');
    process.exit(1);
  }

  await client.login(config.token);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
