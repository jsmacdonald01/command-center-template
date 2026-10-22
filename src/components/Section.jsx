import './Section.css';

/**
 * One content region inside the single scroll container. These are not
 * routes — the whole environment is one page, and the background never
 * changes between them.
 */
/**
 * `fit` makes the section's content fill exactly one screen instead of
 * growing with its content, so panels inside scroll rather than pushing
 * the page taller.
 */
export default function Section({ id, fit = false, children }) {
  return (
    <section id={`cc-section-${id}`} className={`cc-section${fit ? ' cc-section--fit' : ''}`}>
      <div className="cc-section-inner">{children}</div>
    </section>
  );
}

/**
 * No description line — the sections speak for themselves.
 *
 * `mark` is for a section that is a window onto somewhere real — a
 * school's site, a bank, an agency. It sits beside the title
 * rather than above it, so the eye still lands on the word first.
 */
export function SectionHeader({ eyebrow, title, aside, mark }) {
  return (
    <header className="cc-section-header">
      <div className="cc-section-header-left">
        {eyebrow && <div className="cc-eyebrow cc-section-eyebrow">{eyebrow}</div>}
        <div className="cc-section-titleline">
          {mark}
          <h2 className="cc-section-title">{title}</h2>
        </div>
      </div>
      {aside}
    </header>
  );
}
