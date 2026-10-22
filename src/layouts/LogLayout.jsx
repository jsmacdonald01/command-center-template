import Section, { SectionHeader } from '../components/Section.jsx';
import GlyphMark from '../components/GlyphMark.jsx';
import SettingsStrip from '../components/SettingsStrip.jsx';
import LogWidget from '../widgets/LogWidget.jsx';
import LibraryPanel from '../widgets/LibraryPanel.jsx';

/**
 * The Log page, laid out the same way every time:
 *
 *   the log — every change, newest first
 *   the library — search inside every document
 *   settings — only as tall as what is in it
 *
 * The log and the library share the height left after Settings evenly.
 */
export default function LogLayout({ page, data, actions, ctx }) {
  return (
    <Section id={page.id} fit>
      <SectionHeader
        title={page.title || 'Log'}
        mark={<GlyphMark name="log" title={page.title || 'Log'} />}
      />
      <LogWidget widget={{ id: 'history', title: 'Log' }} data={data} />
      <LibraryPanel title="Library" onUpdate={actions.update} docsKey={ctx.docsKey} />
      <SettingsStrip aiReady={ctx.aiReady} onSetKey={ctx.saveKey} />
    </Section>
  );
}
