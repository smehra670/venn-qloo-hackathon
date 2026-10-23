import type { Partner, RunResult } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import type { TasteFocus } from "@/components/results/overview/tasteFocus";
import { allTastes, membersOf, runHasStrength, selectTastes, tasteAnnouncement } from "@/lib/tastes";
import { useVenn } from "@/store/useVenn";

/**
 * Builds the Overview's taste focus from the visible partners (after the filter row): the tray,
 * the pinned taste and its members, the press / pin / clear actions with their live-region
 * sentences, Escape to clear, `?taste=<id>` on load, and clearing a taste whose members were
 * all filtered away.
 */
export function useOverviewTasteFocus(ranked: Partner[], result: RunResult | null) {
  const tasteIdPinned = useVenn((s) => s.tasteId);
  const setTaste = useVenn((s) => s.setTaste);
  const live = runHasStrength(result);
  const everyTaste = useMemo(() => allTastes(ranked, live), [ranked, live]);
  const trayTastes = useMemo(() => selectTastes(ranked, live), [ranked, live]);
  const pinnedTaste = tasteIdPinned ? (everyTaste.find((t) => t.id === tasteIdPinned) ?? null) : null;
  const [demoAt, setDemoAt] = useState(0);
  const [announce, setAnnounce] = useState("");

  const focus = useMemo<TasteFocus>(() => {
    const members = new Set(pinnedTaste ? membersOf(pinnedTaste, ranked).map((p) => p.id) : []);
    const say = (id: string | null) => setAnnounce(tasteAnnouncement(id ? (everyTaste.find((t) => t.id === id) ?? null) : null, ranked));
    return {
      tastes: trayTastes,
      taste: pinnedTaste,
      members,
      toggle: (id) => {
        const next = useVenn.getState().tasteId === id ? null : id;
        setTaste(next);
        say(next);
        if (next) setDemoAt((n) => n + 1);
      },
      pin: (id) => {
        if (useVenn.getState().tasteId === id) return;
        setTaste(id);
        say(id);
      },
      clear: () => {
        if (!useVenn.getState().tasteId) return;
        setTaste(null);
        say(null);
      },
      demoAt,
    };
  }, [pinnedTaste, trayTastes, everyTaste, ranked, setTaste, demoAt]);

  // A filter change that leaves the pinned taste with no visible member clears it.
  useEffect(() => {
    if (tasteIdPinned && !focus.members.size && ranked.length) {
      setTaste(null);
      setAnnounce("Taste focus cleared.");
    }
  }, [tasteIdPinned, focus.members.size, ranked.length, setTaste]);

  // `?taste=<id>` pins a taste on load (handy for screenshots).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("taste");
    if (wanted && everyTaste.some((t) => t.id === wanted)) setTaste(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the tastes first exist
  }, [everyTaste.length > 0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useVenn.getState().tasteId) focus.clear();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focus]);

  return { focus, announce, everyTaste, pinnedTaste };
}
