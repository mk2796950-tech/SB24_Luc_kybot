# Simple Assistant Bot

A Telegram bot that chats with users using Claude. Keeps a short rolling
conversation history per chat so replies stay in context. No database —
history lives in memory and resets on restart/redeploy (intentional, for
simplicity).

## Files

- `bot.js` — the bot itself
- `package.json` — dependencies (`telegraf`)
- `railway.json` — Railway deploy config
- `.env.example` — template for required environment variables
- `.gitignore` — keeps `node_modules` and `.env` out of git

## 1. Create the Telegram bot

1. Open Telegram, message **@BotFather**
2. Send `/newbot`, follow the prompts
3. Copy the token it gives you — that's your `BOT_TOKEN`

## 2. Get an Anthropic API key

1. Go to https://console.anthropic.com/settings/keys
2. Create a key — that's your `ANTHROPIC_API_KEY`
3. This is a paid API — check current pricing at
   https://docs.claude.com before deploying, and keep an eye on usage

## 3. Push to GitHub

\`\`\`bash
cd simple-assistant-bot
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/simple-assistant-bot.git
git push -u origin main
\`\`\`

## 4. Deploy on Railway

1. In Railway, **New Project → Deploy from GitHub repo** → pick this repo
2. Railway auto-detects Node via Nixpacks and reads `railway.json`
3. Go to the service's **Variables** tab and add:
   - `BOT_TOKEN` — from BotFather
   - `ANTHROPIC_API_KEY` — from the Anthropic console
   - `CLAUDE_MODEL` — optional, defaults to `claude-sonnet-5`
4. Deploy. Check the **Deployments → Logs** tab for:
   \`\`\`
   Simple Assistant Bot is up and polling for updates.
   Health check server listening on port 3000
   \`\`\`

## 5. Try it

Open your bot in Telegram, send `/start`, then just chat. Send `/reset`
any time to clear the conversation history and start fresh.

## Notes

- **No persistence**: conversation history is in-memory (a `Map`), so it's
  wiped on every restart or redeploy. Fine for a personal/small-scale bot;
  swap in Redis or a database if you need it to survive restarts.
- **Long replies**: Telegram caps messages at 4096 characters, so replies
  longer than that are automatically split into multiple messages.
- **Errors**: missing/invalid API key, and rate limits, are caught and
  reported back to the user as a friendly message instead of crashing.
