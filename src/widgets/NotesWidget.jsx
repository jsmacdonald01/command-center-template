import { useEffect, useState } from 'react';
import Panel, { PanelLabel } from '../components/Panel.jsx';

/**
 * Free text — a scratchpad. Saves when the box loses focus, and a second
 * or so after typing stops, so nothing is lost if the app is closed.
 *
 * Config: { "type": "notes", "title": "Scratchpad", "placeholder": "Anything…" }
 */
export default function NotesWidget({ widget, values, actions }) {
  const saved = values.text || '';
  const [draft, setDraft] = useState(saved);

  // Follow changes made elsewhere (the agent, Claude Desktop) when the box
  // is not being edited.
  useEffect(() => { setDraft(saved); }, [saved]);

  useEffect(() => {
    if (draft === saved) return undefined;
    const t = setTimeout(() => actions.setField(widget.id, 'text', draft), 1200);
    return () => clearTimeout(t);
  }, [draft, saved, widget.id, actions]);

  return (
    <Panel className="cc-w cc-w-notes">
      <div className="cc-widget-head">
        <PanelLabel>{widget.title}</PanelLabel>
      </div>
      <textarea
        className="cc-w-notes-area"
        value={draft}
        placeholder={widget.placeholder || 'Anything you want to keep in view…'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== saved) actions.setField(widget.id, 'text', draft); }}
        spellCheck
      />
    </Panel>
  );
}
