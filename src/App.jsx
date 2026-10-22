import { useCallback, useEffect, useMemo, useState } from 'react';
import '@fontsource/ibm-plex-sans/200.css';
import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/tokens.css';
import './styles/common.css';
import './App.css';

import Environment from './components/Environment.jsx';
import StatusBar from './components/StatusBar.jsx';
import SectionRail from './components/SectionRail.jsx';
import Section from './components/Section.jsx';
import Page from './components/Page.jsx';
import MarketsOverlay from './components/MarketsOverlay.jsx';
import AtlasOverlay from './components/AtlasOverlay.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';

import { PAGES } from './config.js';
import useActiveSection from './hooks/useActiveSection.js';
import useCommandCenterData from './hooks/useCommandCenterData.js';
import useLiveData from './hooks/useLiveData.js';
import useAtlas from './hooks/useAtlas.js';

const SECTIONS = PAGES.map((p) => ({ id: p.id, label: p.title }));
const SECTION_IDS = SECTIONS.map((s) => s.id);

/**
 * The whole app: one scrolling column of pages, each drawn from the
 * layout (config/command-center.json plus the owner's my-pages.json).
 * Nothing here knows what any page is for — change the layout and this follows.
 */
export default function App() {
  const [scrollEl, setScrollEl] = useState(null);
  const { data, error, add, update, remove, attach, reorder, setSetting, setField } = useCommandCenterData();
  const { active, scrollTo } = useActiveSection(scrollEl, SECTION_IDS);
  const live = useLiveData(data);

  const [aiReady, setAiReady] = useState(false);
  const [marketsOpen, setMarketsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const atlas = useAtlas({ open: aiOpen, live });

  useEffect(() => {
    if (!window.cc) return;
    window.cc.ai.hasKey().then(setAiReady).catch(() => setAiReady(false));
  }, []);

  // Crossing off a calendar item is a Command Center note — the calendar
  // is only read, so completion is stored here, never sent to Google.
  const completedEvents = useMemo(() => {
    if (!data || !data.completedEvents) return [];
    try { return JSON.parse(data.completedEvents); } catch (e) { return []; }
  }, [data && data.completedEvents]);

  const toggleEvent = useCallback((eventId) => {
    const next = completedEvents.includes(eventId)
      ? completedEvents.filter((id) => id !== eventId)
      : [...completedEvents, eventId].slice(-200);
    setSetting('completed_events', JSON.stringify(next), 'completedEvents');
  }, [completedEvents, setSetting]);

  // Coursework ticked off on the Home page. The school feed is only read,
  // so this is a note kept here, never sent back to the school.
  const completedCoursework = useMemo(() => {
    if (!data || !data.completedCoursework) return [];
    try { return JSON.parse(data.completedCoursework); } catch (e) { return []; }
  }, [data && data.completedCoursework]);

  const toggleCoursework = useCallback((id) => {
    const next = completedCoursework.includes(id)
      ? completedCoursework.filter((x) => x !== id)
      : [...completedCoursework, id].slice(-300);
    setSetting('completed_coursework', JSON.stringify(next), 'completedCoursework');
  }, [completedCoursework, setSetting]);

  const connectGmail = useCallback(async () => {
    const res = await window.cc.gmail.connect();
    if (res && res.ok) live.refreshEmail();
  }, [live]);

  const saveKey = useCallback(async (key) => {
    await window.cc.ai.setKey(key);
    setAiReady(true);
  }, []);

  /**
   * One string that changes whenever any document anywhere is attached,
   * renamed or removed — it tells the library to re-read its list.
   */
  const docsKey = data ? [
    ...(data.libraryDocuments || []),
    ...Object.values(data.items || {}).flat().filter((r) => r.filePath)
  ].map((d) => d.id + ':' + d.name).join('|') : '';

  /** The writes every box can make. listPath is always "items.<box id>". */
  const actions = useMemo(() => ({
    add,
    update,
    remove,
    reorder,
    attach,
    setSetting,
    setField
  }), [add, update, remove, reorder, attach, setSetting, setField]);

  const ctx = {
    aiReady,
    saveKey,
    docsKey,
    completedEvents,
    toggleEvent,
    completedCoursework,
    toggleCoursework,
    connectGmail,
    openAgent: () => setAiOpen(true),
    openMarkets: () => setMarketsOpen(true),
    openClaudeDesktop: () => window.cc && window.cc.shell.openClaudeDesktop()
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAiOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Environment />
      <StatusBar
        weather={live.weather}
        syncLabel={live.syncedAt ? `Synced ${live.syncedAt}` : 'Syncing'}
        syncing={live.syncing}
        onSync={live.refreshAll}
      />
      <SectionRail sections={SECTIONS} active={active} onSelect={scrollTo} />

      <main className="cc-scroll" ref={setScrollEl}>
        {!data && SECTIONS.map((section) => (
          <Section key={section.id} id={section.id}>
            <div className="cc-placeholder">
              <div className="cc-eyebrow">{section.label}</div>
              <div className="cc-placeholder-note">{error || 'Loading…'}</div>
            </div>
          </Section>
        ))}

        {data && PAGES.map((page) => (
          <Page
            key={page.id}
            page={page}
            data={data}
            live={live}
            actions={actions}
            ctx={ctx}
          />
        ))}
      </main>

      {marketsOpen && <MarketsOverlay onClose={() => setMarketsOpen(false)} />}
      {aiOpen && <AtlasOverlay atlas={atlas} onClose={() => setAiOpen(false)} />}
      <UpdateBanner />
    </>
  );
}
