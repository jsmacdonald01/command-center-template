import Panel, { PanelLabel } from '../components/Panel.jsx';
import EditableValue from '../components/EditableValue.jsx';

/**
 * A list of records: each row has text, an optional date and an optional
 * note. For appointments, contacts, goals, places to go — anything that is
 * a list but not a to-do.
 *
 * Config: { "type": "list", "title": "Appointments", "dates": true, "notes": true }
 *   dates — show a date column (default true)
 *   notes — show a note under each row (default true)
 */
export default function ListWidget({ widget, rows, actions }) {
  const path = `items.${widget.id}`;
  const showDates = widget.dates !== false;
  const showNotes = widget.notes !== false;

  return (
    <Panel className="cc-w cc-w-list">
      <div className="cc-widget-head">
        <PanelLabel>{widget.title}</PanelLabel>
        <button
          type="button"
          className="cc-pill cc-pill--tiny"
          onClick={() => actions.add('item', path, widget.id, {
            text: widget.placeholder || 'New entry', note: '', date: ''
          })}
        >
          Add
        </button>
      </div>

      <div className="cc-w-rows">
        {rows.length === 0 && <div className="cc-hint">{widget.hint || 'Nothing yet.'}</div>}
        {rows.map((row) => (
          <div key={row.id} className="cc-w-row cc-w-row--record">
            {showDates && (
              <span className="cc-mono cc-w-date">
                <EditableValue
                  label="Date"
                  value={row.date}
                  placeholder="date"
                  onCommit={(v) => actions.update('item', path, row.id, { date: v })}
                />
              </span>
            )}
            <span className="cc-w-main">
              <EditableValue
                label={widget.title}
                value={row.text}
                onCommit={(v) => actions.update('item', path, row.id, { text: v })}
              />
              {showNotes && (
                <span className="cc-field-note">
                  <EditableValue
                    label="Note"
                    value={row.note}
                    placeholder="add note"
                    onCommit={(v) => actions.update('item', path, row.id, { note: v })}
                  />
                </span>
              )}
            </span>
            <button
              type="button"
              className="cc-row-remove"
              title="Remove"
              onClick={() => actions.remove('item', path, row.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
