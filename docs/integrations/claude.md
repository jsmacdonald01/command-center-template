# Claude — the agent, and Claude Desktop

There are two ways to bring Claude in. You can use either or both.

## 1. The agent, inside the app

**What it gives you:** click the glowing sphere on the Home page (or press
**Ctrl + K**) and ask anything about your dashboard: "what bills are due?",
"what does my lease say about pets?", "add milk to my list". It reads your
boxes, documents and notes to answer. When it wants to change something, it
shows a card with an **Approve** button — nothing changes until you click it.

**What it shares:** your question and the parts of your dashboard it needs
are sent to Anthropic to get an answer, as with any Claude conversation.

**Cost:** pay-as-you-go through your own Claude API account — usually a few
cents a question. The app has a built-in monthly ceiling of $10; ask Claude
Code to change it (`electron/agent/models.js`).

### Set it up

1. Go to **console.anthropic.com** and sign in (or sign up).
2. Add a little credit under **Billing** (for example $5).
3. Go to **API keys** → **Create key**. Name it `Command Center`. Copy the
   key — it starts with `sk-ant-`. It is shown only once.
4. In the app: **Settings** → **Claude API key** → paste → **Save**.
5. Click the sphere on the Home page and say hello.

## 2. Claude Desktop (no extra cost)

**What it gives you:** the Claude Desktop app on this computer can read
*and update* your Command Center directly, covered by your normal Claude
subscription instead of per question.

### Set it up

1. Install **Claude Desktop** from claude.ai/download and sign in.
2. In Claude Desktop: **Settings** → **Developer** → **Edit Config**. A
   file called `claude_desktop_config.json` opens.
3. Add this, replacing the folder with where this project lives (use
   double backslashes `\\` in the paths):

```json
{
  "mcpServers": {
    "command-center": {
      "command": "C:\\path\\to\\this\\project\\node_modules\\electron\\dist\\electron.exe",
      "args": ["C:\\path\\to\\this\\project\\mcp\\mcp-server.js"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

   If the file already has an `mcpServers` section, add the
   `"command-center": {…}` part inside it instead.
4. Save, then fully quit Claude Desktop (right-click its icon by the clock
   → Quit) and open it again.
5. Ask it: "What's on my Command Center to-do list?"

Claude Code can do steps 2 and 3 for you — just ask it to "connect Claude
Desktop to my Command Center".
