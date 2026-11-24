# NexPath Discord Bot

TypeScript (discord.js v14 + Express) Discord bot for the NexPath community — slash commands, welcome messages, server study reports, moderation tools, and a GitHub webhook listener.

GitHub → Discord notifications (stars/issues/PRs) are handled serverlessly by `.github/workflows/discord-notify.yml` at the repo root — no bot required for those.

## Setup

```bash
npm install
cp .env.example .env   # add DISCORD_TOKEN (and GUILD_ID for instant command sync)
npm run dev            # tsx watch mode
# or: npm run build && npm start
```

## Discord Developer Portal

1. Create app → **Bot** → enable **Server Members Intent** + **Message Content Intent**
2. Copy token into `.env` as `DISCORD_TOKEN`
3. Invite with scopes `bot` + `applications.commands`

## GitHub webhook listener (optional)

The bot serves `POST /github-webhook` on port `5000` (HMAC-verified). GitHub cannot reach `localhost` — expose via tunnel (`cloudflared`, `ngrok http 5000`) or a VPS, then point the repo webhook at `http://<public-ip>:5000/github-webhook`.

If you only need Stars/Issues/PRs in Discord, use the root `discord-notify.yml` GitHub Action instead — zero infra.

## Commands

`/ping` `/serverinfo` `/userinfo` `/help` · `/nexpath` `/rules` · `/joke` `/quote` `/formatcode` · `/study` · `/announce` `/purge` `/slowmode` · `/set_github_channel` `/github_status` `/test_github_event`
