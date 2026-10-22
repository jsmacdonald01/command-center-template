// Every channel the screen can reach, in one place. Kept separate from
// main.js so window lifecycle and the API surface stay independent.

const { app, ipcMain, dialog, shell } = require('electron');

const db = require('./services/db');
const calendarService = require('./services/calendar-service');
const gmailService = require('./services/gmail-service');
const favicons = require('./services/favicons');
const telegram = require('./services/telegram');
const atlas = require('./agent/atlas');
const approvals = require('./agent/approvals');
const memory = require('./agent/memory');
const models = require('./agent/models');
const conversation = require('./services/conversation');
const weather = require('./services/weather');
const markets = require('./services/markets');
const news = require('./services/news');
const attachments = require('./services/attachments');
const vault = require('./services/vault');
const library = require('./services/library');
const remoteMcp = require('./services/remote-mcp');
const config = require('./services/config');
const backup = require('./services/backup');
const schoolFeed = require('./services/school-feed');
const updater = require('./services/updater');

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(`IPC ${channel} failed:`, e);
      return { ok: false, error: e.message };
    }
  });
}

function registerHandlers(getWindow) {
  /* ------------------------------ data ------------------------------ */
  handle('data:load', () => db.loadAll());
  handle('data:setting', (key, value) => db.setSetting(key, value));
  handle('data:add', (type, scope, fields) => db.addEntity(type, scope, fields));
  handle('data:update', (type, id, patch) => db.updateEntity(type, id, patch));
  handle('data:delete', (type, id) => db.deleteEntity(type, id));
  handle('data:reorder', (type, ids) => db.reorderEntity(type, ids));
  handle('data:events', (limit) => db.getEvents(limit));
  handle('data:log', (category, label, entity) => db.logEvent(category, label, entity));

  /* ----------------------------- google ----------------------------- */
  handle('calendar:status', () => ({
    connected: calendarService.isConnected(),
    hasConfig: calendarService.hasClientConfig(),
    // Connected is not the same as allowed to change anything.
    canWrite: calendarService.canWrite()
  }));
  handle('calendar:connect', async () => {
    await calendarService.connect();
    db.logEvent('Sync', 'Google Calendar connected');
    return { ok: true };
  });
  handle('calendar:disconnect', () => {
    calendarService.disconnect();
    db.logEvent('Sync', 'Google Calendar disconnected');
    return { ok: true };
  });
  handle('calendar:month', (year, month) => calendarService.getMonth(year, month));
  handle('calendar:upcoming', (days, keywords) => calendarService.getUpcoming(days, keywords));

  handle('gmail:status', () => ({
    connected: gmailService.isConnected(),
    hasConfig: gmailService.hasClientConfig(),
    canWrite: gmailService.canWrite()
  }));
  handle('gmail:connect', async () => {
    await gmailService.connect();
    db.logEvent('Sync', 'Gmail connected');
    return { ok: true };
  });
  handle('gmail:disconnect', () => {
    gmailService.disconnect();
    db.logEvent('Sync', 'Gmail disconnected');
    return { ok: true };
  });
  handle('gmail:recent', () => gmailService.getRecent(10));

  /* --------------------------- live boxes --------------------------- */
  handle('weather:get', (opts) => weather.get(opts));
  // A town typed in Settings, turned into coordinates and saved.
  handle('weather:setPlace', async (query) => {
    const found = await weather.geocode(query);
    if (!found) return { ok: false, error: 'Could not find that place. Try "Town, State".' };
    db.setSetting('weather_place', found.place);
    db.setSetting('weather_lat', String(found.lat));
    db.setSetting('weather_lon', String(found.lon));
    db.logEvent('System', 'Weather location set', found.place);
    return { ok: true, ...found };
  });
  handle('markets:get', (range, watchlist) => markets.get(range, watchlist));
  handle('news:get', (feeds) => news.get(feeds));

  /* -------------------------- school feed --------------------------- */
  // The feed link is a password in all but name — anyone holding it can
  // read the schedule — so it is write-only from the screen: settable and
  // clearable, never read back.
  handle('school:status', () => ({
    hasSource: schoolFeed.hasSource(),
    live: schoolFeed.hasSource() ? schoolFeed.isUrl(schoolFeed.loadSource()) : false
  }));
  handle('school:setSource', async (value) => {
    schoolFeed.saveSource(value);
    const res = await schoolFeed.get(30);
    if (res.ok) db.logEvent('Sync', 'School calendar connected', res.events.length + ' upcoming');
    return res.ok ? { ok: true, count: res.events.length, live: res.live } : res;
  });
  handle('school:clearSource', () => {
    schoolFeed.saveSource('');
    db.logEvent('Sync', 'School calendar removed');
    return { ok: true };
  });
  handle('school:upcoming', (days) => schoolFeed.get(days || 45));

  /* ---------------------------- telegram ---------------------------- */
  handle('telegram:status', () => ({
    hasToken: telegram.hasToken(),
    running: telegram.isRunning(),
    paired: !!telegram.boundChatId(),
    fromEnv: !!process.env.CC_TELEGRAM_BOT_TOKEN
  }));
  handle('telegram:setToken', async (token) => {
    telegram.stop();
    telegram.saveToken(String(token || '').trim());
    const check = await telegram.verify();
    if (!check.ok) return check;
    telegram.start();
    db.logEvent('System', 'Telegram bot connected', check.username);
    return check;
  });
  handle('telegram:clearToken', () => {
    telegram.stop();
    telegram.clearToken();
    telegram.unpair();
    return { ok: true };
  });
  handle('telegram:pair', () => ({ code: telegram.startPairing() }));
  handle('telegram:unpair', () => ({ ok: telegram.unpair() }));

  /* ------------------------------- ai ------------------------------- */
  handle('ai:hasKey', () => conversation.hasApiKey());
  handle('ai:setKey', (key) => { conversation.saveApiKey(key); return true; });
  handle('ai:clearKey', () => { conversation.clearApiKey(); return true; });
  handle('ai:history', (limit) => db.getMessages(limit));
  handle('ai:clearHistory', () => db.clearMessages());

  /* ----------------------------- agent ------------------------------ */
  handle('atlas:ask', async (question, live) => {
    const history = db.getMessages(12);
    const result = await atlas.run(question, { surface: 'app', history, live });

    if (result.ok) {
      db.addMessage('me', question);
      db.addMessage('ai', result.text);
      db.logEvent('AI', 'Agent', question.slice(0, 80));

      // Learning happens after the answer, on the cheap model, and never
      // blocks it. Nothing to learn from a reply that never arrived.
      if (!result.empty) {
        const who = config.owner() || 'Owner';
        memory.extract(
          `${who}: ${question}\n\nAgent: ${result.text}`,
          async (system, content) => {
            const out = await conversation.chatWith(models.MODELS.fast.id, system, content);
            return out.ok ? out.text : null;
          }
        ).catch(() => {});
      }
    }
    return result;
  });

  handle('atlas:proposals', () => approvals.pending());
  handle('atlas:approve', async (id) => approvals.approve(id));
  handle('atlas:reject', (id) => approvals.reject(id));
  handle('atlas:spend', () => models.status());

  handle('atlas:memories', () => db.listMemories());
  handle('atlas:memoryUpdate', (id, patch) => db.updateMemory(id, patch));
  handle('atlas:memoryDelete', (id) => db.deleteMemory(id));

  /* --------------------------- attachments -------------------------- */
  handle('files:pick', async (entityType, scope) => {
    const result = await dialog.showOpenDialog(getWindow(), { properties: ['openFile'] });
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
    const stored = attachments.store(result.filePaths[0]);
    const record = db.addEntity(entityType, scope, {
      name: stored.name,
      filePath: stored.filePath,
      size: stored.size,
      link: ''
    });

    // Read it now, so it is searchable straight away. Awaited, so the
    // library refreshing behind this already knows whether it has text. A
    // failure here must not lose the attachment, which is already saved.
    try {
      const got = await library.indexOne(record);
      if (got.state === 'failed') {
        console.error('Command Center: could not read ' + stored.name + ' — ' + (got.error || ''));
      }
    } catch (e) {
      console.error('Command Center: indexing ' + stored.name + ' failed —', e.message);
    }

    return { ok: true, record };
  });
  // A picture chosen for a box — the business logo. Copied into the app's
  // own storage, so moving or deleting the original never breaks it, and
  // backed up with everything else.
  handle('files:chooseImage', async (widgetId, fieldKey) => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Choose a picture',
      properties: ['openFile'],
      filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
    const stored = attachments.store(result.filePaths[0]);
    db.setSetting(`field:${widgetId}:${fieldKey}`, stored.filePath);
    return { ok: true, filePath: stored.filePath };
  });

  // An image from disk as a data URL. The screen cannot load file:// under
  // this app's isolation. Small files only — a logo, not a photo album.
  handle('files:image', (filePath) => {
    const types = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml'
    };
    try {
      const ext = require('path').extname(String(filePath || '')).toLowerCase();
      if (!types[ext]) return null;
      const buf = require('fs').readFileSync(filePath);
      if (buf.length > 3 * 1024 * 1024) return null;
      return `data:${types[ext]};base64,${buf.toString('base64')}`;
    } catch (e) {
      return null;
    }
  });

  handle('files:open', (filePath) => attachments.open(filePath));
  handle('files:reveal', (filePath) => attachments.reveal(filePath));

  /* ------------------------------ vault ----------------------------- */
  // Reading only. Obsidian does the editing, one button away.
  handle('vault:status', () => ({ path: vault.vaultDir(), found: vault.configured() }));
  handle('vault:choose', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Choose your Obsidian notebook folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
    db.setSetting('vault_path', result.filePaths[0]);
    db.logEvent('System', 'Notebook folder chosen', result.filePaths[0]);
    return { ok: true, path: result.filePaths[0] };
  });
  handle('vault:tree', () => vault.tree());
  // Returns the name it actually landed on — a link says [[Next Session]]
  // and the note may be Handoffs/Next Session.
  handle('vault:read', (name) => {
    try {
      return { ok: true, name: vault.canonical(name) || name, body: vault.read(name) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  handle('vault:open', (name) => vault.openInObsidian(name));

  /* ------------------------- remote access -------------------------- */
  // The key is handed to the screen only when asked for, so it is not
  // sitting in the page's data the rest of the time.
  handle('remoteMcp:status', () => remoteMcp.status());
  handle('remoteMcp:key', () => ({ key: remoteMcp.token() }));
  handle('remoteMcp:connectorUrl', () => ({ url: remoteMcp.connectorUrl() }));
  handle('remoteMcp:headerValue', () => ({ value: remoteMcp.headerValue() }));
  handle('remoteMcp:setEnabled', (on) => remoteMcp.setEnabled(!!on));
  handle('remoteMcp:setAddressCheck', (on) => remoteMcp.setAddressCheck(!!on));
  handle('remoteMcp:setPublicUrl', (url) => { remoteMcp.setPublicBase(url); return remoteMcp.status(); });

  /* ----------------------------- backups ---------------------------- */
  handle('backup:status', () => {
    const folder = backup.backupDir();
    const od = process.env.OneDrive || '';
    return {
      folder,
      // Many PCs let OneDrive sync the Documents folder itself, in which
      // case the daily backups are already in the cloud with no extra copy.
      inOnedrive: !!od && folder.toLowerCase().startsWith(od.toLowerCase()),
      onedrive: db.getSetting('backup_onedrive', 'no') === 'yes',
      onedriveFolder: backup.offsiteDir()
    };
  });
  handle('backup:setOnedrive', async (on) => {
    db.setSetting('backup_onedrive', on ? 'yes' : 'no');
    db.logEvent('System', on ? 'Backups now also copy to OneDrive' : 'OneDrive backup copy turned off');
    if (on) await backup.runOnce();
    return { onedrive: !!on };
  });

  /* ----------------------------- library ---------------------------- */
  // Reading and adding only. Nothing is taken out of the library here.
  handle('library:list', () => library.list());
  handle('library:summary', () => library.summary());
  handle('library:search', (query) => library.search(query, 25));

  handle('library:addFiles', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Add documents to the library',
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
    const report = await library.importPaths(result.filePaths);
    return Object.assign({ ok: true }, report);
  });

  handle('library:addFolder', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Add a whole folder to the library',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
    const report = await library.importFolder(result.filePaths[0]);
    return Object.assign({ ok: true, folder: result.filePaths[0] }, report);
  });

  handle('library:reread', async () => library.indexMissing(db.loadAll(), true));

  /* ------------------------------ shell ----------------------------- */
  handle('shell:openExternal', (url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return true;
  });

  // Site icons come from each site's own domain and are cached on disk,
  // so no third-party icon service learns which sites are linked.
  handle('links:favicon', (url, directUrl) => favicons.get(url, directUrl));

  // Claude Desktop reads Command Center through mcp/mcp-server.js once it
  // is connected (see docs/integrations/claude.md). Launched by protocol.
  handle('shell:openClaudeDesktop', async () => {
    try {
      await shell.openExternal('claude://');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'Could not open Claude Desktop.' };
    }
  });

  handle('app:version', () => app.getVersion());

  /* ----------------------------- layout ----------------------------- */
  // Synchronous on purpose: the screen needs its pages before it draws.
  ipcMain.on('layout:get', (event) => {
    try {
      event.returnValue = config.load();
    } catch (e) {
      console.error('IPC layout:get failed:', e);
      event.returnValue = null;
    }
  });

  /* ----------------------------- updates ---------------------------- */
  handle('updates:status', () => updater.status());
  handle('updates:check', () => updater.check());
  handle('updates:install', () => updater.install());
}

module.exports = { registerHandlers };
