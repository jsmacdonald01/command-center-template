# Claude chat on your phone and the web

**What it gives you:** Claude on claude.ai and in the Claude phone app can
read your Command Center — "what's my savings goal?", "search my documents
for the warranty" — from anywhere.

**How it's kept safe:** this is the most open add-on, so it has four locks.

1. **Read-only.** Claude chat can look, never change anything.
2. **A secret key** that every request must carry.
3. **Only Anthropic's servers** may ask — everyone else is turned away.
4. **Everything is logged.** Every question shows on your Log page.

It starts **switched off**.

**What it shares:** the parts of your dashboard Claude reads to answer, the
same as any Claude conversation. Your computer must be on, with the app
running.

**Cost:** free (Tailscale's personal plan is free).

---

## Part 1 — Give your computer a public address (Tailscale)

1. Install **Tailscale** from tailscale.com/download and sign in.
2. In the Tailscale website (login.tailscale.com), go to **DNS** and make
   sure **MagicDNS** and **HTTPS Certificates** are turned on.
3. Open PowerShell (**Windows key + X**, then **I**) and paste:
   ```
   tailscale funnel --bg 8787
   ```
   The first time, it prints a link to approve Funnel — open it, approve,
   and run the command again.
4. It prints an address like `https://your-pc.your-tailnet.ts.net`. Copy it.

## Part 2 — Turn on the doorway in the app

1. **Settings** → **Claude chat access**.
2. Paste the address into the box → **Save**.
3. Click **Turn on**.

## Part 3 — Add it to Claude

1. On claude.ai: **Settings** → **Connectors** → **Add custom connector**.
2. Name: `Command Center`. For the URL, click **Copy address** in the app
   and paste it.
3. If Claude says it couldn't check the server, click **Continue anyway**
   — that's the lock working (it refuses anyone without the key).
4. Choose **No sign-in**, then add a header:
   - Name: `authorization`
   - Value: click **Copy key** in the app and paste. (It starts with
     `Bearer`. Never post it anywhere.)
5. Save. In a new chat, turn on the Command Center connector from the
   tools menu and ask it something.

**Tip:** in the connector's settings you can set each tool to **Always
allow**, so Claude stops asking permission every time.

**If it stops answering:** check the computer is awake and the app is open,
then look at the Log page — refusals say why. `tailscale funnel status`
in PowerShell shows whether the address is still up.
