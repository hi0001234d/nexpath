import {
  ChatInputCommandInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import type { Client } from 'discord.js';
import type { PermissionResolvable } from 'discord.js';

export type SlashCommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder;

export interface BotContext {
  client: Client;
}

export interface BotCommand {
  data: ReturnType<SlashCommandBuilder['toJSON']>;
  execute: (interaction: ChatInputCommandInteraction, ctx: BotContext) => Promise<void>;
}

export function command(
  builder: SlashCommandData,
  execute: BotCommand['execute'],
): BotCommand {
  return { data: builder.toJSON(), execute };
}

/** Safely checks a guild member's permissions (handles APIInteractionGuildMember string form). */
export function memberHasPermission(member: unknown, permission: PermissionResolvable): boolean {
  if (!member || typeof member !== 'object' || !('permissions' in member)) return false;
  const perms = (member as { permissions: unknown }).permissions;
  return perms instanceof PermissionsBitField && perms.has(permission);
}
