import Section from '../components/Section.jsx';
import Sphere from '../components/Sphere.jsx';
import CalendarPanel from '../components/CalendarPanel.jsx';
import EmailPeek from '../components/EmailPeek.jsx';
import EditableValue from '../components/EditableValue.jsx';
import WorkloadWidget from '../widgets/WorkloadWidget.jsx';
import TodoPanel from '../widgets/TodoPanel.jsx';
import WeatherWidget from '../widgets/WeatherWidget.jsx';
import MarketsWidget from '../widgets/MarketsWidget.jsx';
import NewsWidget from '../widgets/NewsWidget.jsx';
import '../widgets/home.css';

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The Home page, laid out the same way every time:
 *
 *   hello, and the sphere that opens the agent
 *   Workload | To do (next three days) | Month calendar
 *   Weather  | Markets                 | Top stories
 *
 * Workload is the open jobs from the Business page.
 *
 * A fixed layout on purpose — it is the page opened most, and it should not
 * need arranging. The name in the greeting is typed right on the page:
 * click it to change it.
 */
export default function HomeLayout({ page, data, live, actions, ctx }) {
  return (
    <Section id={page.id} fit>
      <header className="cc-home-head">
        <div className="cc-home-mark">
          <button
            type="button"
            className="cc-home-agent"
            onClick={() => ctx.openAgent()}
            aria-label="Talk to the agent"
            title={ctx.aiReady ? 'Talk to the agent' : 'Add a Claude key in Settings to talk to the agent'}
          >
            <Sphere size="full" ambientMotion />
          </button>
          <div className="cc-home-title">
            <h1 className="cc-home-greeting">
              {greetingWord()},{' '}
              <span className="cc-home-name">
                <EditableValue
                  label="Your name"
                  value={data.owner}
                  placeholder="(name)"
                  onCommit={(v) => actions.setSetting('owner_name', v, 'owner')}
                />
              </span>
              .
            </h1>
          </div>
        </div>
        <div className="cc-home-actions">
          <button
            type="button"
            className="cc-pill cc-pill--tiny"
            onClick={ctx.openClaudeDesktop}
            title="Opens Claude Desktop, which can read Command Center once it is connected"
          >
            Claude Desktop
          </button>
          <EmailPeek
            email={live.email}
            unreadCount={live.unreadCount}
            connected={live.gmailConnected}
            onConnect={ctx.connectGmail}
          />
        </div>
      </header>

      {/* Workload, the next three days, and the month — three equal
          columns, each scrolling its own list so the page stays one screen. */}
      <div className="cc-home-grid">
        <WorkloadWidget data={data} actions={actions} />
        <TodoPanel
          title="To do"
          calendar={live.calendar}
          expired={live.calendarExpired}
          completedIds={ctx.completedEvents}
          onToggleEvent={ctx.toggleEvent}
        />
        <CalendarPanel onConnected={live.refreshAll} />
      </div>

      <div className="cc-widget-row">
        <WeatherWidget weather={live.weather} />
        <MarketsWidget onExpand={ctx.openMarkets} />
        <NewsWidget news={live.news} />
      </div>
    </Section>
  );
}
