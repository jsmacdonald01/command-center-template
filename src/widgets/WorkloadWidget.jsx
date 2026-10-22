import Panel, { PanelLabel } from '../components/Panel.jsx';

const JOBS = 'jobs';

/**
 * Workload on the Home page: the jobs still open on the Business page,
 * so the day's work is the first thing seen. Ticking one here ticks it
 * there too — it is the same list, shown in two places.
 *
 * Adding and editing jobs happens on the Business page.
 */
export default function WorkloadWidget({ data, actions, title }) {
  const jobs = (data.items && data.items[JOBS]) || [];
  const open = jobs.filter((j) => !j.done);
  const path = `items.${JOBS}`;

  const goToBusiness = () => {
    const el = document.getElementById('cc-section-business');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <Panel variant="primary" className="cc-coursework cc-workload">
      <div className="cc-widget-head">
        <PanelLabel>{title || 'Workload'}</PanelLabel>
        <span className="cc-field-note">{jobs.length ? `${open.length} open` : ''}</span>
      </div>

      <div className="cc-coursework-body">
        {open.length === 0 && (
          <div className="cc-hint">
            {jobs.length
              ? 'Everything is done.'
              : 'Your open jobs show up here. Add them under Jobs on the Business page.'}
          </div>
        )}

        {open.map((j) => (
          <button
            key={j.id}
            type="button"
            className="cc-due-row"
            onClick={() => actions.update('item', path, j.id, { done: true })}
            title="Mark as done"
          >
            <span className="cc-check" />
            <span className="cc-due-title">{j.text}</span>
          </button>
        ))}

        {jobs.length > 0 && (
          <button type="button" className="cc-workload-more" onClick={goToBusiness}>
            Go to Business →
          </button>
        )}
      </div>
    </Panel>
  );
}
