// Runs under Electron, not node.
//
// The database is opened by a native module compiled for Electron's ABI
// (128 on Electron 32); plain node cannot load it. Claude Code launches
// this with ELECTRON_RUN_AS_NODE=1, which makes Electron behave as Node —
// no Chromium, no window, clean stdio for the protocol — while keeping
// that ABI. Registration lives in ~/.claude.json.
//
// If this ever fails to start, check that first.

// Standalone MCP server. Separate process from the Electron app, opening
// the same SQLite file, so any Claude session can read and update Command
// Center without the app being open.
//
// The tools themselves live in electron/agent/tools/registry.js, shared
// with the agent, the in-app agent. **The two have different permissions and
// that is deliberate**: this server executes writes directly, because it
// is only reachable from Claude Desktop or Claude Code, with the owner there.
// The agent may not — it can only propose a write for them to approve. See the
// note at the top of the registry.
//
// Writes go through the granular db mutations, so every change made from
// here shows up on the app's Log page too.

const path = require('path');
const os = require('os');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const db = require('../electron/services/db');
const tools = require('../electron/agent/tools/registry');

const DB_PATH = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'my-command-center',
  'command-center.sqlite'
);

function text(payload) {
  return {
    content: [{
      type: 'text',
      text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
    }]
  };
}

async function main() {
  await db.init(DB_PATH);
  const server = new McpServer({ name: 'command-center', version: '2.0.0' });

  /**
   * Every tool reloads first and checkpoints after.
   *
   * Both are close to free now and neither is load-bearing. Under the old
   * sql.js engine they were the only thing standing between this server
   * and data loss: it is long-lived and mostly idle, so its in-memory copy
   * went stale by the hour, and a save rewrote the whole file — an idle
   * copy did not merely miss the app's work, it erased it. That is what
   * happened on 2026-07-31.
   *
   * Since 2026-08-03 the database is real SQLite with WAL, so every
   * statement already sees the current committed state and writes are
   * transactions. `reloadIfChanged()` is a no-op kept for the call sites;
   * `flush()` is a checkpoint, still worth doing because this process
   * exits often and it keeps the sidecar log small.
   */
  /*
   * Google-backed tools are not offered here at all.
   *
   * This process is Electron running as Node: it has the database, but no
   * `app` and no `safeStorage` — and the Google tokens are encrypted with
   * the second of those. Advertising a tool that cannot work invites a
   * session to promise the owner a calendar event and fail afterwards; leaving
   * it out puts the honest answer first. Calling one anyway still says so
   * in words — see execute() in the registry.
   */
  const offered = tools.TOOLS.filter((tool) => !tool.needsApp || tools.insideApp());

  offered.forEach((tool) => {
    server.tool(tool.name, tool.description, tool.schema, async (args) => {
      db.reloadIfChanged();
      try {
        const { result, verified } = await tools.execute(tool.name, args);
        db.flush();
        // Say so rather than reporting a success nobody checked.
        if (tool.risk === 'write' && !verified) {
          return text({
            warning: 'The write ran but could not be verified afterwards.',
            result
          });
        }
        return text(result);
      } catch (e) {
        db.flush();
        return text('Error: ' + e.message);
      }
    });
  });

  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  process.stderr.write('command-center MCP server failed to start: ' + e.message + '\n');
  process.exit(1);
});
