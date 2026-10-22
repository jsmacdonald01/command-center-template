// The layout, as the screen sees it. Two files decide the pages: the
// built-in config/command-center.json, and the owner's own my-pages.json in
// their data folder, which updates never touch. The app merges them and
// hands the result over once, as the screen starts; see CLAUDE.md for how
// to change either. After editing, restart the app.
//
// The built-in file is also bundled here, so the screen still draws if it
// is opened outside the app.
import bundled from '../config/command-center.json';

function fromApp() {
  try {
    const got = window.cc && window.cc.layout && window.cc.layout();
    if (got && Array.isArray(got.pages)) return got;
  } catch (e) { /* fall back to the bundled layout */ }
  return bundled;
}

const config = fromApp();

export const PAGES = (config.pages || []).filter((p) => p && p.id);

export const OWNER = String(config.owner || '').trim();

export default config;
