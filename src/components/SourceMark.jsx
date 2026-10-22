import { useEffect, useState } from 'react';
import './SourceMark.css';

/**
 * The mark of whatever a panel is a window into — Obsidian on the vault,
 * and whatever else earns one later.
 *
 * Same route as the finance link tiles: the icon comes from the site's own
 * domain and is cached on disk, so no icon service in the middle learns
 * what they use. A site with nothing usable renders **nothing** rather than
 * a broken square — a missing logo should cost the panel a logo, not its
 * layout.
 */
export default function SourceMark({ url, iconUrl, size = 15 }) {
  const [icon, setIcon] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!window.cc || !url) return undefined;
    window.cc.links.favicon(url, iconUrl)
      .then((found) => { if (!cancelled && typeof found === 'string') setIcon(found); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url, iconUrl]);

  if (!icon) return null;

  return (
    <img
      className="cc-source-mark"
      style={{ width: size, height: size }}
      src={icon}
      alt=""
      aria-hidden="true"
    />
  );
}
