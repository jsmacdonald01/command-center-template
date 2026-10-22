import { useCallback, useEffect, useState } from 'react';
import Panel, { PanelLabel } from './Panel.jsx';
import GoogleSettings from './GoogleSettings.jsx';
import TelegramSettings from './TelegramSettings.jsx';
import RemoteAccessSettings from './RemoteAccessSettings.jsx';
import SourceMark from './SourceMark.jsx';
import UpdateSettings from './UpdateSettings.jsx';
import { PAGES } from '../config.js';
import './SettingsStrip.css';

// The school calendar only matters if some page has a Coursework box.
const HAS_COURSEWORK = PAGES.some((p) => (p.widgets || []).some((w) => w.type === 'coursework'));

/**
 * Settings: the things that are set once and then left alone — keys,
 * connections, the notebook folder and the weather town. Shown wherever a
 * "settings" box is placed in the config file (by default, the Log page).
 *
 * Every add-on starts off. Each one says what it needs, and the step-by-step
 * guide for each lives in docs/integrations/.
 */
export default function SettingsStrip({ aiReady, onSetKey, title }) {
  const [keyDraft, setKeyDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const [vault, setVault] = useState(null);
  const [placeDraft, setPlaceDraft] = useState('');
  const [placeNote, setPlaceNote] = useState('');
  const [backup, setBackup] = useState(null);
  const [school, setSchool] = useState(null);
  const [feedDraft, setFeedDraft] = useState('');
  const [feedNote, setFeedNote] = useState('');
  const [open, setOpen] = useState(null);

  const refreshVault = useCallback(async () => {
    if (!window.cc) return;
    try { setVault(await window.cc.vault.status()); } catch (e) { /* leave as is */ }
    try { setBackup(await window.cc.backup.status()); } catch (e) { /* leave as is */ }
    try { setSchool(await window.cc.school.status()); } catch (e) { /* leave as is */ }
  }, []);

  const saveFeed = async (e) => {
    e.preventDefault();
    if (!feedDraft.trim()) return;
    setFeedNote('Checking the link…');
    const res = await window.cc.school.setSource(feedDraft.trim());
    if (res && res.ok) {
      setFeedNote(`Connected — ${res.count} coming up. The Coursework box updates when you click back into the app.`);
      setFeedDraft('');
    } else {
      setFeedNote(`That link did not work: ${(res && res.error) || 'no answer'}.`);
    }
    refreshVault();
  };

  const clearFeed = async () => {
    await window.cc.school.clearSource();
    setFeedNote('');
    refreshVault();
  };

  useEffect(() => { refreshVault(); }, [refreshVault]);

  const toggleOnedrive = async () => {
    await window.cc.backup.setOnedrive(!(backup && backup.onedrive));
    refreshVault();
  };

  useEffect(() => {
    if (!saved) return undefined;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  const saveKey = async (e) => {
    e.preventDefault();
    if (!keyDraft.trim()) return;
    await onSetKey(keyDraft.trim());
    setKeyDraft('');
    setSaved(true);
  };

  const chooseVault = async () => {
    const res = await window.cc.vault.choose();
    if (res && res.ok) {
      await refreshVault();
      window.dispatchEvent(new Event('cc-vault-changed'));
    }
  };

  const savePlace = async (e) => {
    e.preventDefault();
    if (!placeDraft.trim()) return;
    setPlaceNote('Looking it up…');
    const res = await window.cc.weather.setPlace(placeDraft.trim());
    if (res && res.ok) {
      setPlaceNote(`Set to ${res.place}. The weather updates in a moment.`);
      setPlaceDraft('');
      // The weather reads its town from the saved data, so reload it.
      setTimeout(() => window.location.reload(), 1200);
    } else {
      setPlaceNote((res && res.error) || 'Could not find that place.');
    }
  };

  // One row of names; the chosen one opens underneath. Nine settings laid
  // out at once made the box taller than the log above it, for things that
  // are set once and left alone.
  const items = [
    { key: 'claude', label: 'Claude key', on: aiReady },
    { key: 'notebook', label: 'Notebook', on: !!(vault && vault.found) },
    { key: 'weather', label: 'Weather town' },
    ...(HAS_COURSEWORK ? [{ key: 'school', label: 'School calendar', on: !!(school && school.hasSource) }] : []),
    { key: 'backups', label: 'Backups', on: true },
    { key: 'google', label: 'Google' },
    { key: 'telegram', label: 'Telegram' },
    { key: 'claudechat', label: 'Claude chat' },
    { key: 'updates', label: 'Updates' }
  ];

  return (
    <Panel className="cc-settings">
      <PanelLabel>{title || 'Settings'}</PanelLabel>

      <div className="cc-settings-tabs" role="tablist">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={open === it.key}
            className={`cc-settings-tab${open === it.key ? ' is-open' : ''}`}
            onClick={() => setOpen(open === it.key ? null : it.key)}
          >
            {it.on && <span className="cc-settings-dot" aria-hidden="true" />}
            {it.label}
          </button>
        ))}
      </div>

      {open && (
      <div className="cc-settings-grid">
        {open === 'claude' && (
        <div className="cc-setting">
          <div className="cc-field-label">
            <SourceMark url="https://www.anthropic.com" size={13} />
            Claude API key
          </div>
          <div className="cc-field-note">
            {aiReady ? 'Stored, encrypted by Windows.' : 'Not set — the agent is off.'}
          </div>
          <form className="cc-key-form" onSubmit={saveKey}>
            <input
              type="password"
              className="cc-key-input"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={aiReady ? 'Replace key…' : 'Paste your key'}
              autoComplete="off"
            />
            <button type="submit" className="cc-pill cc-pill--tiny" disabled={!keyDraft.trim()}>
              {saved ? 'Saved' : 'Save'}
            </button>
          </form>
        </div>
        )}

        {open === 'notebook' && (
        <div className="cc-setting">
          <div className="cc-field-label">
            <SourceMark url="https://obsidian.md" size={13} />
            Obsidian notebook
          </div>
          <div className="cc-field-note">
            {!vault ? 'Checking…' : vault.found ? vault.path : 'No notebook folder chosen yet.'}
          </div>
          <div className="cc-setting-actions">
            <button type="button" className="cc-pill cc-pill--tiny" onClick={chooseVault}>
              {vault && vault.found ? 'Change folder' : 'Choose folder'}
            </button>
          </div>
        </div>
        )}

        {open === 'weather' && (
        <div className="cc-setting">
          <div className="cc-field-label">Weather town</div>
          <div className="cc-field-note">{placeNote || 'Type a town, like "Austin, TX".'}</div>
          <form className="cc-key-form" onSubmit={savePlace}>
            <input
              className="cc-key-input"
              value={placeDraft}
              onChange={(e) => setPlaceDraft(e.target.value)}
              placeholder="Town, State"
              autoComplete="off"
            />
            <button type="submit" className="cc-pill cc-pill--tiny" disabled={!placeDraft.trim()}>
              Set
            </button>
          </form>
        </div>
        )}

        {open === 'school' && (
        <div className="cc-setting">
          <div className="cc-field-label">School calendar</div>
          <div className="cc-field-note">
            {feedNote || (school && school.hasSource
              ? 'Connected. The link is stored encrypted and never shown.'
              : 'Paste your school\'s calendar feed link (iCal) to fill Coursework.')}
          </div>
          {!(school && school.hasSource) && (
            <form className="cc-key-form" onSubmit={saveFeed}>
              <input
                type="password"
                className="cc-key-input"
                value={feedDraft}
                onChange={(e) => setFeedDraft(e.target.value)}
                placeholder="https://…/calendar/feed…"
                autoComplete="off"
              />
              <button type="submit" className="cc-pill cc-pill--tiny" disabled={!feedDraft.trim()}>Save</button>
            </form>
          )}
          {school && school.hasSource && (
            <div className="cc-setting-actions">
              <button type="button" className="cc-pill cc-pill--tiny" onClick={clearFeed}>Remove</button>
            </div>
          )}
        </div>
        )}

        {open === 'backups' && (
        <div className="cc-setting">
          <div className="cc-field-label">Backups</div>
          <div className="cc-field-note">
            Daily, to {backup ? backup.folder : 'your Documents folder'}.
          </div>
          <div className="cc-field-note">
            {backup && backup.inOnedrive
              ? 'That folder is synced by OneDrive, so backups already reach the cloud.'
              : backup && backup.onedrive ? 'Also copied to OneDrive.' : 'Not copied off this computer.'}
          </div>
          {!(backup && backup.inOnedrive) && (
            <div className="cc-setting-actions">
              <button type="button" className="cc-pill cc-pill--tiny" onClick={toggleOnedrive} disabled={!backup}>
                {backup && backup.onedrive ? 'Stop OneDrive copy' : 'Copy to OneDrive too'}
              </button>
            </div>
          )}
        </div>
        )}

        {open === 'google' && <GoogleSettings />}

        {open === 'telegram' && <TelegramSettings />}

        {open === 'claudechat' && <RemoteAccessSettings />}

        {open === 'updates' && <UpdateSettings />}
      </div>
      )}
    </Panel>
  );
}
