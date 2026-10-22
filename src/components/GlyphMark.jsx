import './GlyphMark.css';

/**
 * A drawn mark for a section that has no website behind it.
 *
 * A page that is a window onto a real website can carry that site's own
 * icon — see SourceMark. Pages that point at nothing but themselves get
 * glyphs instead: same size, same weight, same restraint, so a row of
 * page titles reads as one set.
 *
 * Line work only, in the current text colour. No fills and no colour of
 * their own — these sit beside a headline, not on a letterhead.
 */
const GLYPHS = {
  /* Workshop: a hammer.
   *
   * The first attempt drew a claw and a tapered head and came out as a
   * smudge — at 26px there is room for two shapes, not five. This is the
   * head as one solid bar and the handle as one line. */
  hammer: (
    <>
      {/* Head and claw as one shape: a bar with a wedge bitten out of the
          left end. A symmetrical head with a centred handle is a letter T,
          which is what the first two attempts drew. */}
      <path
        d="M4 4.2 L19 4.2 L19 10.2 L4 10.2 L6.6 7.2 Z"
        fill="currentColor"
        stroke="none"
      />
      {/* Handle off to the right, where a claw hammer carries it. */}
      <rect x="13.4" y="10" width="3.4" height="10.6" rx="1.1" fill="currentColor" stroke="none" />
    </>
  ),

  // Finance: a chart. Three bars and the line that crosses them, which is
  // the only shape that reads as "money over time" at this size.
  chart: (
    <>
      <rect x="4" y="13" width="4" height="7" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="10" y="9" width="4" height="11" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="16" y="5" width="4" height="15" rx="0.8" fill="currentColor" stroke="none" />
    </>
  ),

  /* The Log: entries down a spine.
   *
   * A clock would have said "time", a page would have said "document".
   * What this page actually is is a run of dated entries, each one a
   * thing that happened — so: a line, and events hanging off it. */
  log: (
    <>
      <path d="M5 4.5 L5 19.5" />
      <circle cx="5" cy="7.5" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="5" cy="16.5" r="1.9" fill="currentColor" stroke="none" />
      <path d="M10 7.5 L20 7.5" />
      <path d="M10 12 L17 12" />
      <path d="M10 16.5 L19 16.5" />
    </>
  )
};

export default function GlyphMark({ name, size = 26, title }) {
  const glyph = GLYPHS[name];
  if (!glyph) return null;

  return (
    <svg
      className="cc-glyph-mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      {glyph}
    </svg>
  );
}
