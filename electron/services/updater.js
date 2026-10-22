// New versions, from the GitHub repo this app came from.
//
// The owner never has to do anything clever: the app looks for a new
// version when it starts and every six hours, downloads it in the
// background, and the screen shows "A new version is ready" with one button.
// Their data lives in the data folder, never in the app's own folder, so an
// update cannot touch it. Their own pages (my-pages.json) live there too.
//
// Only the installed app checks — `npm start` from the project folder
// never does. If the repo is private or unreachable, it stays quiet and
// says so only when they press "Check for updates".

const { app } = require('electron');

const SIX_HOURS = 6 * 60 * 60 * 1000;

let updater = null;
let notify = () => {};
let timer = null;

const state = {
  phase: 'idle', // idle | checking | none | downloading | ready | error | unavailable
  version: null,
  percent: 0,
  error: null
};

function set(patch) {
  Object.assign(state, patch);
  notify({ ...state, current: app.getVersion() });
}

function status() {
  return { ...state, current: app.getVersion() };
}

/** Starts the checks. onChange receives the status whenever it moves. */
function start(onChange) {
  notify = onChange || (() => {});
  if (!app.isPackaged) {
    set({ phase: 'unavailable', error: 'Updates only work in the installed app.' });
    return;
  }
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch (e) {
    console.error('Command Center: updater missing —', e.message);
    set({ phase: 'unavailable', error: 'The updater is missing from this build.' });
    return;
  }
  updater.autoDownload = true;
  // A new version waiting when they close the app goes in as it closes.
  updater.autoInstallOnAppQuit = true;
  updater.logger = null;

  updater.on('checking-for-update', () => set({ phase: 'checking', error: null }));
  updater.on('update-not-available', () => set({ phase: 'none' }));
  updater.on('update-available', (info) => set({ phase: 'downloading', version: info.version, percent: 0 }));
  updater.on('download-progress', (p) => set({ percent: Math.round(p.percent || 0) }));
  updater.on('update-downloaded', (info) => set({ phase: 'ready', version: info.version, percent: 100 }));
  updater.on('error', (e) => {
    console.error('Command Center: update check failed —', e && e.message);
    set({ phase: 'error', error: plain(e) });
  });

  check();
  timer = setInterval(check, SIX_HOURS);
}

/** The reason in words a person can act on. */
function plain(e) {
  const msg = String((e && e.message) || e || '');
  if (/404|not found|Unable to find latest version/i.test(msg)) {
    return 'No published versions found yet (or the project is still private).';
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|net::/i.test(msg)) return 'Could not reach GitHub. Check the internet connection.';
  return 'Could not check for updates.';
}

async function check() {
  if (!updater) return status();
  // Already downloaded: nothing to look for until they restart.
  if (state.phase === 'ready' || state.phase === 'downloading') return status();
  try {
    await updater.checkForUpdates();
  } catch (e) {
    // Reported through the 'error' event as well.
  }
  return status();
}

/** Closes the app, installs the waiting version, and opens it again. */
function install() {
  if (!updater || state.phase !== 'ready') return { ok: false, error: 'No update is ready yet.' };
  // Silent install, then reopen. Done on the next tick so the reply reaches the screen first.
  setImmediate(() => updater.quitAndInstall(true, true));
  return { ok: true };
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, check, install, status, stop };
