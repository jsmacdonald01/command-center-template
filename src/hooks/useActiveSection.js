import { useCallback, useEffect, useState } from 'react';

// The active section is the last one whose top has passed 45% of the
// viewport — the rail behavior specified in the design.
const THRESHOLD = 0.45;

/**
 * Takes the scroll element itself rather than a ref. A ref's .current is
 * not a reactive dependency, so if the effect ever runs before the node
 * mounts it would bind nothing and never retry. Passing the node through
 * state means the effect re-runs the moment it exists.
 */
export default function useActiveSection(scrollEl, sectionIds) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!scrollEl) return undefined;

    let frame = null;
    const measure = () => {
      frame = null;
      const line = scrollEl.scrollTop + scrollEl.clientHeight * THRESHOLD;
      let next = 0;
      sectionIds.forEach((id, i) => {
        const node = document.getElementById(`cc-section-${id}`);
        if (node && node.offsetTop <= line) next = i;
      });
      setActive(next);
    };

    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };

    measure();
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      scrollEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [scrollEl, sectionIds]);

  const scrollTo = useCallback((index) => {
    const node = document.getElementById(`cc-section-${sectionIds[index]}`);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [sectionIds]);

  return { active, scrollTo };
}
