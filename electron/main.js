const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const db = require('./services/db');
const notifications = require('./services/notifications');
const telegram = require('./services/telegram');
const backup = require('./services/backup');
const morningBrief = require('./services/morning-brief');
const library = require('./services/library');
const remoteMcp = require('./services/remote-mcp');
const vault = require('./services/vault');
const config = require('./services/config');
const updater = require('./services/updater');
const { registerHandlers } = require('./ipc');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
let mainWindow = null;

// Started with --minimized (by a scheduled task, say, so the 8am Telegram
// brief goes out), it opens without taking the screen.
const STARTED_QUIETLY = process.argv.includes('--minimized');

/**
 * One copy at a time. A second launch while one is running would mean two
 * copies racing over the same data.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 640,
    title: 'Command Center',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    backgroundColor: '#05070A',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.once('ready-to-show', () => {
    // Opens filling the screen, maximised rather than true fullscreen so
    // the taskbar stays.
    mainWindow.maximize();

    // showInactive then minimise: the window still renders, so live data is
    // fetched as normal, but nothing steals focus.
    if (STARTED_QUIETLY) {
      mainWindow.showInactive();
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  // Chromium spellchecks the editable fields, but only if it knows which
  // language to check against.
  mainWindow.webContents.session.setSpellCheckerLanguages(['en-US']);

  // Electron gives editable fields no context menu by default, which reads
  // as "paste is broken". Cost two bug reports in V1.
  //
  // Misspellings go at the top, because that is what the right-click is
  // usually for once a field is open — the edit commands stay underneath
  // so the menu is never a surprise.
  mainWindow.webContents.on('context-menu', (event, params) => {
    if (!params.isEditable) return;

    const template = [];

    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length) {
        params.dictionarySuggestions.forEach((word) => template.push({
          label: word,
          click: () => mainWindow.webContents.replaceMisspelling(word)
        }));
      } else {
        template.push({ label: 'No suggestions', enabled: false });
      }
      template.push(
        { type: 'separator' },
        {
          // Names and case numbers get flagged too. Teaching it once beats
          // seeing the red line on every visit.
          label: `Add "${params.misspelledWord}" to dictionary`,
          click: () => mainWindow.webContents.session
            .addWordToSpellCheckerDictionary(params.misspelledWord)
        },
        { type: 'separator' }
      );
    }

    template.push(
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll' }
    );

    Menu.buildFromTemplate(template).popup();
  });

  // External links open in the real browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  Menu.setApplicationMenu(null);

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  }
}

app.whenReady().then(async () => {
  await db.init(path.join(app.getPath('userData'), 'command-center.sqlite'));
  registerHandlers(() => mainWindow);
  // A notebook from day one: the starter one is created if none exists,
  // and added to Obsidian's list once Obsidian is installed.
  try { vault.ensureNotebook(); } catch (e) { console.error('Command Center: notebook setup failed —', e.message); }
  // Somewhere for their own pages, kept apart from the app so updates never touch it.
  config.ensureUserFile();
  createWindow();
  // New versions from GitHub. Quiet unless one is found.
  updater.start((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updates:changed', status);
  });
  notifications.start();
  // No-op unless a token has been saved.
  telegram.start();
  // No-op unless a phone is paired, and at most once a morning.
  morningBrief.start();
  // The database and their paperwork are the only things here that cannot be
  // rebuilt.
  backup.start();

  // Answers Claude chat's questions, once a tunnel is pointed at it.
  // Listens on this machine only — installing this exposes nothing.
  remoteMcp.start();

  // Read any document the library has never read, so their existing
  // paperwork is searchable without them asking for it. Deliberately not
  // awaited: the window opens now and this finishes behind it, because a
  // folder of five hundred imported files must never hold up the app.
  library.indexMissing(db.loadAll(), false)
    .then((got) => {
      if (got.read || got.failed) {
        console.log('Command Center: library read ' + got.read + ' new document(s), '
          + got.photos + ' with no text, ' + got.failed + ' failed');
      }
    })
    .catch((e) => console.error('Command Center: library indexing failed —', e.message));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // A second launch means the wake task fired while the app was already
  // running. Deliberately does nothing — surfacing the window at 7:57am
  // would be the opposite of the point.
  app.on('second-instance', () => {});
});

app.on('before-quit', () => {
  notifications.stop();
  telegram.stop();
  backup.stop();
  remoteMcp.stop();
  morningBrief.stop();
  updater.stop();
  // Force any debounced write to land before the process exits.
  try { db.flush(); } catch (e) { /* nothing useful to do at exit */ }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
