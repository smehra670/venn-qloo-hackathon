import { useEffect, useRef } from "react";
import { prefersStaticMotion } from "@/lib/overviewModel";

/** Adds `.in` when the element scrolls into view (or immediately when static). */
export function useReveal<T extends HTMLElement = HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    if (prefersStaticMotion()) {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
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
