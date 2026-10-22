import './Sphere.css';

/**
 * The app mark, and the way into Claude.
 *
 * An orbital form — a bright core with three inclined rings turning at
 * different rates and a few points of light riding them. Drawn from
 * scratch in the environment's silver palette rather than borrowed from
 * anywhere, and slow enough to stay inside the motion budget.
 */
export default function Sphere({ size = 'compact', onClick, ambientMotion = true, label }) {
  const className = [
    'cc-sphere',
    `cc-sphere--${size}`,
    ambientMotion ? '' : 'is-still',
    onClick ? 'is-interactive' : ''
  ].filter(Boolean).join(' ');

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={className}
      onClick={onClick}
      aria-label={onClick ? (label || 'Talk to Claude') : undefined}
    >
      <span className="cc-sphere-aura" />
      <svg className="cc-sphere-svg" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="ccCore">
            <stop offset="0%" stopColor="rgba(255,255,255,.98)" />
            <stop offset="45%" stopColor="rgba(226,232,240,.75)" />
            <stop offset="100%" stopColor="rgba(139,151,166,0)" />
          </radialGradient>
          <linearGradient id="ccOrbit" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,.85)" />
            <stop offset="50%" stopColor="rgba(203,213,225,.45)" />
            <stop offset="100%" stopColor="rgba(139,151,166,.7)" />
          </linearGradient>
        </defs>

        <g className="cc-orbit cc-orbit--a">
          <ellipse cx="50" cy="50" rx="44" ry="17" fill="none"
                   stroke="url(#ccOrbit)" strokeWidth="2.4" />
          <circle cx="94" cy="50" r="3.6" fill="rgba(255,255,255,.95)" />
        </g>

        <g className="cc-orbit cc-orbit--b">
          <ellipse cx="50" cy="50" rx="44" ry="17" fill="none"
                   stroke="url(#ccOrbit)" strokeWidth="2.4"
                   transform="rotate(60 50 50)" />
          <circle cx="28" cy="12" r="3" fill="rgba(226,232,240,.9)" />
        </g>

        <g className="cc-orbit cc-orbit--c">
          <ellipse cx="50" cy="50" rx="44" ry="17" fill="none"
                   stroke="url(#ccOrbit)" strokeWidth="2.4"
                   transform="rotate(-60 50 50)" />
          <circle cx="72" cy="12" r="2.6" fill="rgba(203,213,225,.85)" />
        </g>

        <circle className="cc-core-glow" cx="50" cy="50" r="20" fill="url(#ccCore)" />
        <circle className="cc-core" cx="50" cy="50" r="7.5" fill="rgba(255,255,255,.96)" />
      </svg>
    </Tag>
  );
}
