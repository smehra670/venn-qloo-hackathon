import { useEffect, useRef } from "react";
import { prefersStaticMotion } from "@/lib/overviewModel";

/**
 * Marks the element `data-in` when it scrolls into view (or immediately when static).
 * A data attribute, not a class: React rewrites `className` on every re-render that changes it
 * (e.g. the Chart/Table toggle), which used to wipe an imperatively added class and hide the card.
 */
export function useReveal<T extends HTMLElement = HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    if (prefersStaticMotion()) {
      el.dataset.in = "1";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.in = "1";
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  return ref;
}
