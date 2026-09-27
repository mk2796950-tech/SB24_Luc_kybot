const http = require('http');
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const PORT = process.env.PORT || 3000;
const MAX_HISTORY_MESSAGES = 12; // 6 user/assistant turns kept for context

if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN environment variable. Get one from @BotFather and set it in Railway → Variables.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ---------------------------------------------------------------------------
// In-memory conversation history, per chat. Not persisted — resets on
// restart/redeploy. That's an intentional simplicity tradeoff; see README.
// ---------------------------------------------------------------------------
const conversations = new Map();

function getHistory(chatId) {
  if (!conversations.has(chatId)) conversations.set(chatId, []);
  return conversations.get(chatId);
}
function pushToHistory(chatId, role, content) {
  const history = getHistory(chatId);
  history.push({ role, content });
  while (history.length > MAX_HISTORY_MESSAGES) history.shift();
}

const SYSTEM_PROMPT =
  'You are a helpful, friendly everyday assistant chatting with someone on Telegram. ' +
  'Help with quick questions, writing, brainstorming, translations, and everyday tasks. ' +
  'Keep replies clear and reasonably concise by default — expand only when the person ' +
  'asks for more detail or the task genuinely needs it. Use plain text suited to a chat ' +
  "app rather than heavy markdown formatting, since Telegram's rendering is limited.";

async function askClaude(chatId, userMessage) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('NO_API_KEY');
  }

  pushToHistory(chatId, 'user', userMessage);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: getHistory(chatId)
    })
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    if (res.status === 429) throw new Error('RATE_LIMITED');
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude API responded ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  const reply = textBlock ? textBlock.text.trim() : "I couldn't come up with a reply just now.";

  pushToHistory(chatId, 'assistant', reply);
  return reply;
}

// Telegram caps messages at 4096 characters — split long replies rather than
// letting the send fail outright.
function chunkForTelegram(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let breakAt = remaining.lastIndexOf('\n', maxLen);
    if (breakAt < maxLen * 0.5) breakAt = remaining.lastIndexOf(' ', maxLen);
    if (breakAt <= 0) breakAt = maxLen;
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

// ---------------------------------------------------------------------------
// Bot
// ---------------------------------------------------------------------------
const WELCOME_TEXT =
  '🤖 Simple Assistant Bot\n\n' +
  'Your everyday AI assistant on Telegram. Get quick answers, help with writing, ' +
  'ideas, translations, and everyday tasks — all in one place.\n\n' +
  'Just send me a message to get started. Use /reset any time to clear our ' +
  "conversation history and start fresh.";

bot.start((ctx) => ctx.reply(WELCOME_TEXT));
bot.help((ctx) => ctx.reply(WELCOME_TEXT));

bot.command('reset', (ctx) => {
  conversations.delete(ctx.chat.id);
  ctx.reply('🔄 Conversation cleared — starting fresh.');
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return; // let bot.command() handlers deal with commands

  try {
    await ctx.sendChatAction('typing');
    const reply = await askClaude(ctx.chat.id, text);
    const chunks = chunkForTelegram(reply);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  } catch (err) {
    console.error('askClaude failed:', err.message);
    await ctx.reply(assistantErrorText(err));
  }
});

function assistantErrorText(err) {
  if (err.message === 'NO_API_KEY') {
    return "⚠️ I'm not fully set up yet — missing ANTHROPIC_API_KEY on the server.";
  }
  if (err.message === 'UNAUTHORIZED') {
    return '⚠️ The configured Anthropic API key was rejected. Double-check the key.';
  }
  if (err.message === 'RATE_LIMITED') {
    return '⚠️ Hit a rate limit just now. Give it a moment and try again.';
  }
  return "⚠️ Something went wrong on my end. Try again in a moment.";
}

bot.catch((err, ctx) => {
  console.error(`Unhandled error for ${ctx.updateType}:`, err);
});

bot.launch().then(() => {
  console.log('Simple Assistant Bot is up and polling for updates.');
});

http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Simple Assistant Bot is running.');
  })
  .listen(PORT, () => console.log(`Health check server listening on port ${PORT}`));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
