import Panel, { PanelLabel } from '../components/Panel.jsx';

/** Top stories. A short list to stay in the loop, never an endless feed. */
export default function NewsWidget({ news, title }) {
  const open = (url) => url && window.cc && window.cc.shell.openExternal(url);

  return (
    <Panel className="cc-widget">
      <PanelLabel>{title || 'Top stories'}</PanelLabel>

      {(!news || !news.ok) && <div className="cc-widget-empty">Unavailable</div>}

      {news && news.ok && (
        <div className="cc-news-items">
          {news.items.map((item, i) => (
            <button
              key={`${item.link}-${i}`}
              type="button"
              className="cc-news-item"
              onClick={() => open(item.link)}
              title={item.title}
            >
              <span className="cc-mono cc-news-source">{item.source}</span>
              <span className="cc-news-title">{item.title}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}
