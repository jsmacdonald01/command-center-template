import { useState } from 'react';
import Section, { SectionHeader } from '../components/Section.jsx';
import GlyphMark from '../components/GlyphMark.jsx';
import Panel, { PanelLabel } from '../components/Panel.jsx';
import EditableValue from '../components/EditableValue.jsx';
import TickerTape from '../components/TickerTape.jsx';
import LinkRow from './LinkRow.jsx';
import { money } from '../lib/format.js';
import './finance.css';

/*
 * The Finance page, laid out the same way every time:
 *
 *   market ticker
 *   links to banks and accounts (paste a website; its logo appears)
 *   Bills (tall, left)  | Income
 *                       | Savings & investments   (equal halves)
 *
 * Every box starts empty; everything is typed or added right on the page.
 * The boxes' ids are fixed — the agent, the library and Telegram find them
 * by these names — so they are listed in config/command-center.json too.
 */
export const FINANCE_BOXES = {
  bills: 'bills',
  income: 'income',
  savings: 'savings',
  links: 'finance-links'
};

// A bill's payment method cycles on click. Stored in the row's note.
const STATUS_CYCLE = { '': 'Autopay', Autopay: 'Manual', Manual: '' };

function total(rows) {
  return (rows || []).reduce((a, r) => a + (Number(r.amount) || 0), 0);
}

/** Drag-to-reorder for one list. One order is written for the whole list. */
function useListDrag(widgetId, rows, actions) {
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const drop = (beforeId) => {
    const id = dragId;
    setDragId(null);
    setOverId(null);
    if (!id || id === beforeId) return;
    const order = rows.map((r) => r.id).filter((x) => x !== id);
    const at = beforeId ? order.indexOf(beforeId) : -1;
    order.splice(at === -1 ? order.length : at, 0, id);
    actions.reorder('item', `items.${widgetId}`, order);
  };
  return { dragId, setDragId, overId, setOverId, drop };
}

/**
 * One row of a money list. Declared at module scope on purpose: a
 * component declared inside its parent is a new type on every render, which
 * tears the row out from under a drag that is still in progress.
 */
function MoneyRow({ row, widgetId, actions, drag, withStatus }) {
  const path = `items.${widgetId}`;
  return (
    <div
      className={[
        'cc-row', 'cc-row--tight', 'cc-row--drag',
        drag.dragId === row.id ? 'is-dragging' : '',
        drag.overId === row.id ? 'is-over' : ''
      ].filter(Boolean).join(' ')}
      draggable
      onDragStart={(e) => {
        drag.setDragId(row.id);
        e.dataTransfer.effectAllowed = 'move';
        // Firefox needs data set for a drag to begin at all.
        e.dataTransfer.setData('text/plain', row.id);
      }}
      onDragEnd={() => { drag.setDragId(null); drag.setOverId(null); }}
      onDragOver={(e) => { e.preventDefault(); drag.setOverId(row.id); }}
      onDragLeave={() => drag.setOverId((v) => (v === row.id ? null : v))}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drag.drop(row.id); }}
    >
      <span className="cc-grip" aria-hidden="true" />
      <span className="cc-row-name">
        <EditableValue
          label="Name"
          value={row.text}
          onCommit={(v) => actions.update('item', path, row.id, { text: v })}
        />
      </span>
      <span className="cc-row-value">
        <EditableValue
          label={`${row.text} amount`}
          type="money"
          value={row.amount}
          placeholder="—"
          className="is-right"
          onCommit={(v) => actions.update('item', path, row.id, { amount: v })}
        />
      </span>
      {withStatus && (
        <button
          type="button"
          className={`cc-row-status${row.note === 'Manual' ? ' is-manual' : ''}`}
          title="Cycle autopay / manual"
          onClick={() => actions.update('item', path, row.id, {
            note: STATUS_CYCLE[row.note || ''] ?? 'Autopay'
          })}
        >
          {row.note || '—'}
        </button>
      )}
      <button
        type="button"
        className="cc-row-remove"
        title="Remove"
        onClick={() => actions.remove('item', path, row.id)}
      >
        ×
      </button>
    </div>
  );
}

function MoneyList({ title, widgetId, rows, actions, addLabel, withStatus, className, hint }) {
  const drag = useListDrag(widgetId, rows, actions);
  return (
    <Panel className={className}>
      <div className="cc-widget-head">
        <PanelLabel>{title}</PanelLabel>
        <div className="cc-head-right">
          <span className="cc-mono cc-count">{money(total(rows))}</span>
          <button
            type="button"
            className="cc-pill cc-pill--tiny"
            onClick={() => actions.add('item', `items.${widgetId}`, widgetId, { text: addLabel, amount: 0 })}
          >
            Add
          </button>
        </div>
      </div>
      {/* The whole list is a drop zone, so a row can go to the end. */}
      <div
        className="cc-bill-group"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); drag.drop(null); }}
      >
        {/* The hint only shows while the box is empty, so it goes away on
            its own once there is something to see. */}
        {rows.length === 0 && <div className="cc-hint">{hint || 'Nothing here yet.'}</div>}
        {rows.map((r) => (
          <MoneyRow key={r.id} row={r} widgetId={widgetId} actions={actions}
            drag={drag} withStatus={withStatus} />
        ))}
      </div>
    </Panel>
  );
}

export default function FinanceLayout({ page, data, actions }) {
  const rows = (id) => (data.items && data.items[id]) || [];

  return (
    <Section id={page.id} fit>
      <SectionHeader
        title={page.title || 'Finance'}
        mark={<GlyphMark name="chart" title={page.title || 'Finance'} />}
      />

      <TickerTape />

      <LinkRow
        widgetId={FINANCE_BOXES.links}
        rows={rows(FINANCE_BOXES.links)}
        actions={actions}
        addLabel="Add a link to a financial institution"
      />

      <div className="cc-finance-grid">
        <div className="cc-finance-main">
          <MoneyList
            title="Bills"
            widgetId={FINANCE_BOXES.bills}
            rows={rows(FINANCE_BOXES.bills)}
            actions={actions}
            addLabel="New bill"
            withStatus
            className="cc-bills-panel"
            hint="Click Add for each bill you pay — rent, phone, car, subscriptions. Click its name or amount to change it, and the dash beside it to mark it Autopay or Manual."
          />
        </div>

        {/* Two equal panels beside the bills list. */}
        <div className="cc-finance-side">
          <MoneyList
            title="Income"
            widgetId={FINANCE_BOXES.income}
            rows={rows(FINANCE_BOXES.income)}
            actions={actions}
            addLabel="New source"
            hint="Add what comes in each month — a paycheck, benefits, side work."
          />
          <MoneyList
            title="Savings & investments"
            widgetId={FINANCE_BOXES.savings}
            rows={rows(FINANCE_BOXES.savings)}
            actions={actions}
            addLabel="New account"
            hint="Add your savings and investment accounts and what is in each."
          />
        </div>
      </div>
    </Section>
  );
}
