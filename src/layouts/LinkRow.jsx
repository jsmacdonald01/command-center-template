import { useState } from 'react';
import LinkTile from '../components/LinkTile.jsx';

/** "https://www.chase.com/personal" → "Chase". */
function nameFrom(address) {
  try {
    const host = new URL(address).hostname.replace(/^(www|online|secure|login)\./, '');
    const word = host.split('.')[0] || host;
    return word.charAt(0).toUpperCase() + word.slice(1);
  } catch (e) {
    return address;
  }
}

/**
 * A row of quick buttons to banks and accounts, each showing the site's own
 * logo. Paste a website and it becomes a tile; a fresh "add" tile always
 * sits at the end. Hover a tile for its × to remove it.
 *
 * Stored as rows of the box `widgetId` (text = name, link = address).
 * The app never sees or stores a password; a tile only opens the site.
 */
export default function LinkRow({ widgetId, rows, actions, addLabel }) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const path = `items.${widgetId}`;

  const save = async (e) => {
    e.preventDefault();
    let address = url.trim();
    if (!address) return;
    if (!/^https?:\/\//i.test(address)) address = 'https://' + address;
    await actions.add('item', path, widgetId, { text: nameFrom(address), link: address });
    setUrl('');
    setAdding(false);
  };

  return (
    <div className="cc-links cc-links--editable">
      {rows.map((r) => (
        <div key={r.id} className="cc-link-wrap">
          <LinkTile institution={{ id: r.id, name: r.text, url: r.link }} />
          <button
            type="button"
            className="cc-link-remove"
            title={`Remove ${r.text}`}
            onClick={() => actions.remove('item', path, r.id)}
          >
            ×
          </button>
        </div>
      ))}

      {!adding && (
        <button
          type="button"
          className="cc-link-tile cc-link-add"
          onClick={() => setAdding(true)}
        >
          <span className="cc-link-name">+ {addLabel || 'Add a link'}</span>
        </button>
      )}

      {adding && (
        <form className="cc-link-form" onSubmit={save}>
          <input
            className="cc-key-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste the website, like chase.com"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Escape') setAdding(false); }}
          />
          <button type="submit" className="cc-pill cc-pill--tiny" disabled={!url.trim()}>Add</button>
          <button type="button" className="cc-pill cc-pill--tiny" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      )}
    </div>
  );
}
