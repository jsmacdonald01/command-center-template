import './Panel.css';

/**
 * The four surface states in the design system. Everything that sits on
 * the environment uses one of these — there is no fifth kind of box.
 *
 *   primary   — dominant content (Daily Brief, ledgers)
 *   secondary — supporting widgets and cards
 *   dormant   — dashed "not yet activated"
 *   critical  — genuine hard deadlines only, at most one per screen
 *   accent    — quiet tinted block for AI affordances
 */
export default function Panel({
  variant = 'secondary',
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}) {
  return (
    <Tag className={`cc-panel cc-panel--${variant} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}

export function PanelLabel({ children, dot }) {
  return (
    <div className="cc-panel-label cc-label">
      {dot && <span className="cc-panel-label-dot" />}
      {children}
    </div>
  );
}
