import { useState } from 'react';
import Panel, { PanelLabel } from '../components/Panel.jsx';
import EditableValue from '../components/EditableValue.jsx';

/**
 * A checklist: things to tick off. Rows can be added, edited in place,
 * ticked, dragged into a new order and removed.
 *
 * Config: { "type": "checklist", "title": "To do", "placeholder": "Something to do" }
 */
export default function ChecklistWidget({ widget, rows, actions }) {
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const path = `items.${widget.id}`;

  // Drops the dragged row in front of `beforeId`, or at the end. One order
  // written for the whole list, not a swap.
  const drop = (beforeId) => {
    const id = dragId;
    setDragId(null);
    setOverId(null);
    if (!id || id === beforeId) return;
    const order = rows.map((r) => r.id).filter((x) => x !== id);
    const at = beforeId ? order.indexOf(beforeId) : -1;
    order.splice(at === -1 ? order.length : at, 0, id);
    actions.reorder('item', path, order);
  };

  const open = rows.filter((r) => !r.done).length;

  return (
    <Panel className="cc-w cc-w-checklist">
      <div className="cc-widget-head">
        <PanelLabel>{widget.title}</PanelLabel>
        <span className="cc-w-head-side">
          {rows.length > 0 && <span className="cc-field-note">{open} open</span>}
          <button
            type="button"
            className="cc-pill cc-pill--tiny"
            onClick={() => actions.add('item', path, widget.id, {
              text: widget.placeholder || 'New item', done: false
            })}
          >
            Add
          </button>
        </span>
      </div>

      <div
        className="cc-w-rows"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); drop(null); }}
      >
        {rows.length === 0 && <div className="cc-hint">{widget.hint || 'Nothing yet.'}</div>}
        {rows.map((row) => (
          <div
            key={row.id}
            className={[
              'cc-w-row',
              row.done ? 'is-done' : '',
              dragId === row.id ? 'is-dragging' : '',
              overId === row.id ? 'is-over' : ''
            ].filter(Boolean).join(' ')}
            draggable
            onDragStart={(e) => { setDragId(row.id); e.dataTransfer.setData('text/plain', row.id); }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDragOver={(e) => { e.preventDefault(); setOverId(row.id); }}
            onDragLeave={() => setOverId((v) => (v === row.id ? null : v))}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(row.id); }}
          >
            <span className="cc-grip" aria-hidden="true" />
            <button
              type="button"
              className={`cc-check${row.done ? ' is-checked' : ''}`}
              title={row.done ? 'Mark as not done' : 'Mark as done'}
              onClick={() => actions.update('item', path, row.id, { done: !row.done })}
            />
            <span className="cc-w-text">
              <EditableValue
                label={widget.title}
                value={row.text}
                onCommit={(v) => actions.update('item', path, row.id, { text: v })}
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
