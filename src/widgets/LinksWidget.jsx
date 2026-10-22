import Panel, { PanelLabel } from '../components/Panel.jsx';
import LinkTile from '../components/LinkTile.jsx';

/**
 * Quick buttons to websites, each with the site's own icon. The links are
 * listed in the config file, so they change with the layout, not by
 * typing on screen.
 *
 * Config:
 *   { "type": "links", "title": "Quick links",
 *     "links": [ { "name": "Bank", "url": "https://www.example-bank.com" } ] }
 */
export default function LinksWidget({ widget }) {
  const links = (widget.links || []).filter((l) => l && l.url);

  return (
    <Panel className="cc-w cc-w-links">
      <PanelLabel>{widget.title}</PanelLabel>
      {links.length === 0 && (
        <div className="cc-widget-empty">No links yet — add them to this box in the config file.</div>
      )}
      <div className="cc-links cc-links--compact">
        {links.map((l) => (
          <LinkTile key={l.url} institution={{ name: l.name || l.url, url: l.url, iconUrl: l.iconUrl }} />
        ))}
      </div>
    </Panel>
  );
}
