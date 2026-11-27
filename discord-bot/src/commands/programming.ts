import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { command } from '../types';
import type { BotCommand } from '../types';

const PROGRAMMING_JOKES: [string, string][] = [
  ['Why do programmers prefer dark mode?', 'Because light attracts bugs! 🪲'],
  ['Why do Java developers wear glasses?', 'Because they don\'t C#! 👓'],
  ['How many programmers does it take to change a light bulb?', 'None. It\'s a hardware problem. 💡'],
  ['There are only 10 kinds of people in the world:', 'Those who understand binary, and those who don\'t. 🔢'],
  ['A SQL query walks into a bar, walks up to two tables and asks...', "'Can I join you?' 🍺"],
  ['Why was the JavaScript developer sad?', 'Because they didn\'t know how to \'null\' their feelings. 😢'],
  ["What is a programmer's favorite hangout place?", 'Foo Bar! 🍸'],
  ['Why did the functions stop calling each other?', 'Because they had too many arguments! 🗣️'],
  ['What do you call 8 hobbits?', 'A hobbyte! 🧙‍♂️'],
  ['Real programmers count from:', '0! 🚀'],
];

const DEV_QUOTES: [string, string][] = [
  ['Any fool can write code that a computer can understand. Good programmers write code that humans can understand.', 'Martin Fowler'],
  ['Talk is cheap. Show me the code.', 'Linus Torvalds'],
  ['First, solve the problem. Then, write the code.', 'John Johnson'],
  ['Simplicity is prerequisite for reliability.', 'Edsger W. Dijkstra'],
  ['The most dangerous phrase in the language is, \'We\'ve always done it this way.\'', 'Grace Hopper'],
  ['Make it work, make it right, make it fast.', 'Kent Beck'],
];

export const PROGRAMMING_COMMANDS: BotCommand[] = [
  command(
    new SlashCommandBuilder()
      .setName('joke')
      .setDescription('Get a random programming joke for #programming-humor!'),
    async (interaction) => {
      const [setup, punchline] = PROGRAMMING_JOKES[Math.floor(Math.random() * PROGRAMMING_JOKES.length)];
      const embed = new EmbedBuilder()
        .setTitle('😂 Programming Humor')
        .setDescription(`**${setup}**\n\n||${punchline}||`)
        .setColor(Math.floor(Math.random() * 0xffffff))
        .setFooter({ text: 'Click the spoiler to reveal punchline! • NexPath Humor' });
      await interaction.reply({ embeds: [embed] });
    },
  ),

  command(
    new SlashCommandBuilder()
      .setName('quote')
      .setDescription('Get an inspiring quote from tech legends.'),
    async (interaction) => {
      const [quoteText, author] = DEV_QUOTES[Math.floor(Math.random() * DEV_QUOTES.length)];
      const embed = new EmbedBuilder()
        .setDescription(`*“${quoteText}”*`)
        .setColor(0x465bc5)
        .setAuthor({ name: author });
      await interaction.reply({ embeds: [embed] });
    },
  ),

  command(
    new SlashCommandBuilder()
      .setName('formatcode')
      .setDescription('Tips on formatting code syntax nicely in Discord.'),
    async (interaction) => {
      const embed = new EmbedBuilder()
        .setTitle('💻 How to Format Code in Discord')
        .setDescription(
          'Use **triple backticks** with language syntax highlighting:\n\n' +
            '```\n' +
            'def hello_nexpath():\n' +
            "    print('Welcome!')\n" +
            '```\n\n' +
            '**Rendered Result:**\n' +
            '```python\n' +
            'def hello_nexpath():\n' +
            "    print('Welcome!')\n" +
            '```\n\n' +
            'Supported tags: `python`, `js`, `ts`, `go`, `rust`, `cpp`, `json`, `html`, `css`, `sql`, `bash`.',
        )
        .setColor(0x57f287);
      await interaction.reply({ embeds: [embed] });
    },
  ),
];
