import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import { command } from '../types';
import type { BotCommand } from '../types';

export const NEXPATH_GITHUB_URL = 'https://github.com/hi0001234d/nexpath';

export function nexpathViewRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('nexpath_rules')
      .setLabel('Server Guidelines')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📜'),
    new ButtonBuilder()
      .setCustomId('nexpath_start')
      .setLabel('Getting Started')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setLabel('NexPath GitHub')
      .setURL(NEXPATH_GITHUB_URL)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🔗'),
  );
}

export const RULES_TEXT =
  '**📋 NexPath Community Rules:**\n\n' +
  '1. **Be Respectful & Constructive**: Encourage helpful discussions and constructive feedback.\n' +
  '2. **Keep Channels On-Topic**: Post programming humor in `#programming-humor`, dev discussions in tech channels.\n' +
  '3. **No Spam or Self-Promotion**: Avoid unsolicited DMs, repetitive links, or unauthorized ads.\n' +
  '4. **Format Your Code**: Use triple backticks (```python ... ```) when sharing snippets.\n' +
  '5. **Have Fun & Build Together**!';

export const START_TEXT =
  '**🚀 Welcome to NexPath!**\n\n' +
  '• Check out pinned messages for server roadmaps and upcoming features.\n' +
  '• Introduce yourself and share what projects you are building!\n' +
  '• Use `/joke` or `/quote` to engage with other developers.\n' +
  '• Need help? Ask in the support channels or mention an admin.';

export const NEXPATH_COMMANDS: BotCommand[] = [
  command(
    new SlashCommandBuilder()
      .setName('nexpath')
      .setDescription('Learn about NexPath and access community links.'),
    async (interaction, { client }) => {
      const embed = new EmbedBuilder()
        .setTitle('⚡ NexPath Developer Community')
        .setDescription(
          'Welcome to **NexPath** — empowering developer workflows with AI guidance and community collaboration.',
        )
        .setColor(0x465bc5)
        .addFields(
          {
            name: '🌟 Mission',
            value: 'Empowering developers with smart workflows, real-time guidance, and an active builder community.',
            inline: false,
          },
          {
            name: '💬 Discussions',
            value: 'Discuss engineering, share projects, and share laughs in `#programming-humor`!',
            inline: false,
          },
        )
        .setFooter({
          text: 'NexPath • Building the next path for developers',
          iconURL: client.user?.displayAvatarURL() ?? undefined,
        });
      await interaction.reply({ embeds: [embed], components: [nexpathViewRow()] });
    },
  ),

  command(
    new SlashCommandBuilder()
      .setName('rules')
      .setDescription('View the NexPath community rules and code of conduct.'),
    async (interaction) => {
      const embed = new EmbedBuilder()
        .setTitle('📜 NexPath Community Rules')
        .setDescription(
          '**1. Be Respectful:** Treat everyone with kindness and professional courtesy.\n' +
            '**2. Keep Channels Clean:** Use appropriate channels for programming, memes, and general chat.\n' +
            '**3. No Spam / Self-Promo:** Keep promotional links strictly inside dedicated showcase areas.\n' +
            '**4. Code Sharing:** Use markdown blocks (`\\`\\`\\`language ... \\`\\`\\`) when pasting code.\n' +
            '**5. Follow Discord TOS:** All members must adhere to Discord Community Guidelines.',
        )
        .setColor(0xf1c40f);
      await interaction.reply({ embeds: [embed] });
    },
  ),
];
