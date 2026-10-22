import { useEffect, useState } from 'react';

/**
 * A quick link to an institution. Shows the site's own icon once it has
 * been fetched and cached; falls back to the monogram, which is also
 * what shows while the icon is still loading or if the site has none.
 */
export default function LinkTile({ institution }) {
  const [icon, setIcon] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!window.cc) return undefined;
    window.cc.links.favicon(institution.url, institution.iconUrl)
      .then((url) => { if (!cancelled && typeof url === 'string') setIcon(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [institution.url, institution.iconUrl]);

  return (
    <button
      type="button"
      className="cc-link-tile"
      onClick={() => window.cc && window.cc.shell.openExternal(institution.url)}
      title={institution.url}
    >
      {icon
        ? <img className="cc-link-icon" src={icon} alt="" />
        : <span className="cc-mono cc-link-monogram">{institution.monogram}</span>}
      <span className="cc-link-name">{institution.name}</span>
    </button>
  );
}
