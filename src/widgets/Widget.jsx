import Panel, { PanelLabel } from '../components/Panel.jsx';
import CalendarPanel from '../components/CalendarPanel.jsx';
import SettingsStrip from '../components/SettingsStrip.jsx';
import ChecklistWidget from './ChecklistWidget.jsx';
import ListWidget from './ListWidget.jsx';
import MoneyWidget from './MoneyWidget.jsx';
import FactsWidget from './FactsWidget.jsx';
import NotesWidget from './NotesWidget.jsx';
import DocumentsWidget from './DocumentsWidget.jsx';
import LinksWidget from './LinksWidget.jsx';
import LogWidget from './LogWidget.jsx';
import EmailWidget from './EmailWidget.jsx';
import TodoPanel from './TodoPanel.jsx';
import WeatherWidget from './WeatherWidget.jsx';
import NewsWidget from './NewsWidget.jsx';
import MarketsWidget from './MarketsWidget.jsx';
import VaultPanel from './VaultPanel.jsx';
import LibraryPanel from './LibraryPanel.jsx';
import CourseworkWidget from './CourseworkWidget.jsx';
import './widgets.css';
import './home.css';
import './vault.css';

/**
 * Every box type, in one place. To add a new type: build a component in
 * this folder, add it to the switch below, and document it in CLAUDE.md
 * under "Box types" so the next person (or Claude) knows it exists.
 *
 *   checklist  to-dos you tick off                    stores rows
 *   list       records with a date and a note          stores rows
 *   money      names with amounts, and a total         stores rows
 *   documents  attached files, searchable              stores rows
 *   facts      a few labelled values                   stores values
 *   notes      a free-text scratchpad                  stores values
 *   links      quick buttons to websites               from config
 *   calendar   the next three days (Google)            live
 *   month      a month grid (Google)                   live
 *   email      newest Gmail messages                   live
 *   weather    today and the week ahead                live
 *   news       headlines from RSS feeds                live
 *   markets    a few stock indexes                     live
 *   vault      the Obsidian notebook, read-only        live
 *   library    search inside every document            live
 *   log        the history of every change             live
 *   settings   keys and connections                    —
 */
export default function Widget({ widget, data, live, actions, ctx }) {
  const rows = (data.items && data.items[widget.id]) || [];
  const values = (data.fields && data.fields[widget.id]) || {};
  const common = { widget, rows, values, actions };

  switch (widget.type) {
    case 'checklist': return <ChecklistWidget {...common} />;
    case 'list': return <ListWidget {...common} />;
    case 'money': return <MoneyWidget {...common} />;
    case 'facts': return <FactsWidget {...common} />;
    case 'notes': return <NotesWidget {...common} />;
    case 'documents': return <DocumentsWidget {...common} />;
    case 'links': return <LinksWidget widget={widget} />;
    case 'log': return <LogWidget widget={widget} data={data} />;
    case 'email': return <EmailWidget widget={widget} live={live} />;

    case 'calendar':
      return (
        <TodoPanel
          title={widget.title}
          calendar={live.calendar}
          expired={live.calendarExpired}
          completedIds={ctx.completedEvents}
          onToggleEvent={ctx.toggleEvent}
        />
      );
    case 'month': return <CalendarPanel onConnected={live.refreshAll} />;
    case 'coursework':
      return (
        <CourseworkWidget
          title={widget.title}
          completed={ctx.completedCoursework}
          onToggle={ctx.toggleCoursework}
        />
      );
    case 'weather': return <WeatherWidget title={widget.title} weather={live.weather} />;
    case 'news': return <NewsWidget title={widget.title} news={live.news} />;
    case 'markets': return <MarketsWidget title={widget.title} onExpand={ctx.openMarkets} />;
    case 'vault': return <VaultPanel title={widget.title} />;
    case 'library':
      return <LibraryPanel title={widget.title} onUpdate={actions.update} docsKey={ctx.docsKey} />;
    case 'settings':
      return <SettingsStrip aiReady={ctx.aiReady} onSetKey={ctx.saveKey} title={widget.title} />;

    default:
      return (
        <Panel className="cc-w">
          <PanelLabel>{widget.title || widget.id}</PanelLabel>
          <div className="cc-widget-empty">
            Unknown box type "{widget.type}". Check config/command-center.json.
          </div>
        </Panel>
      );
  }
}
