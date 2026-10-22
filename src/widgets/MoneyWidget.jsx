import Panel, { PanelLabel } from '../components/Panel.jsx';
import EditableValue from '../components/EditableValue.jsx';
import { money } from '../lib/format.js';

/**
 * Names with amounts and a running total — bills, income, savings, a
 * budget. The total sits in the corner so the box answers "how much" at a
 * glance.
 *
 * Config: { "type": "money", "title": "Bills" }
 */
export default function MoneyWidget({ widget, rows, actions }) {
  const path = `items.${widget.id}`;
  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);

  return (
    <Panel className="cc-w cc-w-money">
      <div className="cc-widget-head">
        <PanelLabel>{widget.title}</PanelLabel>
        <span className="cc-w-head-side">
          <span className="cc-mono cc-w-total">{money(total)}</span>
          <button
            type="button"
            className="cc-pill cc-pill--tiny"
            onClick={() => actions.add('item', path, widget.id, { text: 'New item', amount: 0 })}
          >
            Add
          </button>
        </span>
      </div>

      <div className="cc-w-rows">
        {rows.length === 0 && <div className="cc-hint">{widget.hint || 'Nothing yet.'}</div>}
        {rows.map((row) => (
          <div key={row.id} className="cc-w-row">
            <span className="cc-w-text">
              <EditableValue
                label="Name"
                value={row.text}
                onCommit={(v) => actions.update('item', path, row.id, { text: v })}
              />
            </span>
            <span className="cc-mono cc-w-amount">
              <EditableValue
                type="money"
                label="Amount"
                value={row.amount}
                onCommit={(v) => actions.update('item', path, row.id, { amount: v })}
              />
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
