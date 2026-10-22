import './SectionRail.css';

/**
 * Ticks only — the section name already appears as the page title, and
 * labelling it twice reads as clutter. The title attribute keeps it
 * discoverable on hover and for screen readers.
 */
export default function SectionRail({ sections, active, onSelect }) {
  return (
    <nav className="cc-rail" aria-label="Sections">
      {sections.map((section, i) => (
        <button
          key={section.id}
          type="button"
          className={`cc-rail-item${i === active ? ' is-active' : ''}`}
          onClick={() => onSelect(i)}
          title={section.label}
          aria-label={section.label}
          aria-current={i === active ? 'true' : undefined}
        >
          <span className="cc-rail-tick" />
        </button>
      ))}
    </nav>
  );
}
