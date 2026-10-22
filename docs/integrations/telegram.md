# Telegram — a morning brief on your phone

**What it gives you:** every morning at 8, a short message: the weather,
what's on your calendar, what's still open on your checklists, and unread
email. Any time, you can text it:

- `/brief` — the same summary, right now
- `/add call the dentist` — adds to your list (the first checklist, or the
  one named in `telegramInbox` in the config)
- `/agent what's due this week?` — ask the agent (needs a Claude key)

**What it shares:** messages go through Telegram's servers. So the bot never
sends money amounts, account numbers, documents or notes — those stay on the
computer. It only answers you; messages from anyone else are ignored.

**Cost:** free (the `/agent` command uses your Claude key).

**Note:** your computer has to be on, with the app running, for the bot to
answer and for the 8am brief to go out.

---

## Make your bot

1. Install **Telegram** on your phone and sign up.
2. In Telegram, search for **@BotFather** (it has a blue check mark) and
   open it.
3. Send `/newbot`. It asks for a name (anything, like `My Command Center`)
   and then a username that ends in `bot` (like `sam_cc_bot`).
4. BotFather replies with a **token** — a long line like
   `123456789:ABCdef...`. Copy it. Treat it like a password.

## Connect it to the app

1. In the app, go to **Settings** → **Telegram bot**.
2. Paste the token → **Save**. It should say the bot is connected.
3. Click **Pair my phone**. A six-digit code appears.
4. In Telegram, open your new bot (search its username), and send it that
   code. It replies **"Paired."**

That's it. Try sending `/brief`.
