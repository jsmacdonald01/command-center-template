import Panel, { PanelLabel } from '../components/Panel.jsx';
import EditableValue from '../components/EditableValue.jsx';

/**
 * A handful of labelled values that change now and then — a school's
 * name, a policy number, a savings goal. The labels come from the config
 * file; the values are typed in on screen.
 *
 * Config:
 *   { "type": "facts", "title": "Car",
 *     "fields": [
 *       { "key": "plate", "label": "Plate" },
 *       { "key": "insurer", "label": "Insurance", "headline": true }
 *     ] }
 *
 * A field marked "headline" is shown large, as the box's main number.
 * Changing a field's `key` later loses what was typed under the old one;
 * changing its `label` is safe.
 */
export default function FactsWidget({ widget, values, actions }) {
  const fields = widget.fields || [];

  return (
    <Panel className="cc-w cc-w-facts">
      <div className="cc-widget-head">
        <PanelLabel>{widget.title}</PanelLabel>
      </div>

      {fields.length === 0 && (
        <div className="cc-widget-empty">No fields yet — add some to this box in the config file.</div>
      )}

      <div className="cc-w-facts-grid">
        {fields.map((f) => (
          <div key={f.key} className={`cc-w-fact${f.headline ? ' is-headline' : ''}`}>
            <div className="cc-field-label">{f.label || f.key}</div>
            <div className="cc-w-fact-value">
              <EditableValue
                label={f.label || f.key}
                value={values[f.key] || ''}
                placeholder="—"
                onCommit={(v) => actions.setField(widget.id, f.key, v)}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
