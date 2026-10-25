import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * For a scroll container with its scrollbar hidden: whether there's more
 * before or after what's showing, so the caller can show an arrow, and a
 * way to scroll by most of a screenful. Re-checks on scroll and resize.
 */
export function useScrollEdges<T extends HTMLElement>(axis: 'x' | 'y') {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ before: false, after: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = axis === 'y' ? el.scrollTop : el.scrollLeft;
    const size = axis === 'y' ? el.clientHeight : el.clientWidth;
    const total = axis === 'y' ? el.scrollHeight : el.scrollWidth;
    setEdges({ before: pos > 2, after: pos + size < total - 2 });
  }, [axis]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach(c => ro.observe(c));
    return () => { el.removeEventListener('scroll', measure); ro.disconnect(); };
  }, [measure]);

  const scrollBy = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const amount = (axis === 'y' ? el.clientHeight : el.clientWidth) * 0.7 * direction;
    el.scrollBy(axis === 'y' ? { top: amount, behavior: 'smooth' } : { left: amount, behavior: 'smooth' });
  };

  return { ref, edges, scrollBy, measure };
}
