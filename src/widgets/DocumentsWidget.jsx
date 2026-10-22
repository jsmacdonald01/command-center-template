import Panel, { PanelLabel } from '../components/Panel.jsx';
import DocumentList from '../components/DocumentList.jsx';

/**
 * Files attached to this box. Each one is copied into the app's own
 * storage, read once so the library and the agent can search inside it,
 * and backed up with everything else. Removing a row never deletes the
 * original file.
 *
 * Config: { "type": "documents", "title": "Paperwork" }
 */
export default function DocumentsWidget({ widget, rows, actions }) {
  const path = `items.${widget.id}`;

  return (
    <Panel className="cc-w cc-w-documents">
      <PanelLabel>{widget.title}</PanelLabel>
      <DocumentList
        items={rows}
        entityType="item"
        emptyLabel={widget.hint || 'No documents yet.'}
        onRemove={(type, id) => actions.remove(type, path, id)}
        onRename={(type, id, name) => actions.update(type, path, id, { name })}
        onAttach={() => actions.attach('item', path, widget.id)}
      />
    </Panel>
  );
}
