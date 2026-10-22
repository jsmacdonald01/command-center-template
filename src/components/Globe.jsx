/**
 * A slowly turning globe with an aircraft on an arc above it.
 *
 * Drawn rather than imported so it obeys the palette — grey only, no
 * second accent, nothing that competes with a red deadline elsewhere on
 * the screen. It reuses `cc-spin`, the rotation the ring mark already
 * uses, so this adds no new motion to the four the design allows.
 *
 * Only the meridians turn. Spinning the outline as well would make the
 * edge shimmer, and a globe whose horizon stays put reads as a globe
 * rather than a spinning disc.
 */
export default function Globe({ size = 62 }) {
  return (
    <span className="cc-globe" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="cc-globe-svg">
        <defs>
          {/* Keeps the meridians inside the sphere as they sweep round. */}
          <clipPath id="cc-globe-clip">
            <circle cx="50" cy="50" r="33" />
          </clipPath>
        </defs>

        <circle className="cc-globe-edge" cx="50" cy="50" r="33" />

        <g clipPath="url(#cc-globe-clip)">
          {/* Parallels are fixed — latitude does not move when a planet
              turns, and holding them still is what sells the rotation. */}
          <g className="cc-globe-parallels">
            <ellipse cx="50" cy="50" rx="33" ry="33" />
            <ellipse cx="50" cy="50" rx="33" ry="11" />
            <line x1="17" y1="50" x2="83" y2="50" />
            <ellipse cx="50" cy="35" rx="30" ry="9" />
            <ellipse cx="50" cy="65" rx="30" ry="9" />
          </g>

          <g className="cc-globe-meridians">
            <ellipse cx="50" cy="50" rx="11" ry="33" />
            <ellipse cx="50" cy="50" rx="24" ry="33" />
            <line x1="50" y1="17" x2="50" y2="83" />
          </g>
        </g>

        {/* The flight path, and the aircraft riding it. Kept inside the
            viewBox so the plane never clips at the edge of the frame. */}
        <path className="cc-globe-arc" d="M11 70 Q50 4 89 44" />
        <g className="cc-globe-plane">
          <path d="M0 0 L11 4.2 L0 8.4 L3.2 4.2 Z" />
        </g>
      </svg>
    </span>
  );
}
