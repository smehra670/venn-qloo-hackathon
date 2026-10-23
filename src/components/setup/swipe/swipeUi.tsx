import type { CardKind, SwipeCard } from "@shared/schemas";
import type { BusinessInput, TasteAnchor } from "@shared/types";
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPE_PLURALS } from "@shared/constants";
import { useEffect, useState } from "react";

export const KIND_LABEL: Record<CardKind, string> = { brand: "Brand", artist: "Artist", place: "Place", topic: "Topic" };

const KIND_PATHS: Record<CardKind, React.ReactNode> = {
  brand: (
    <>
      <path d="M3.5 12.2V4.5h7.7l8.3 8.3-7.7 7.7z" />
      <circle cx="8" cy="9" r="1.3" />
    </>
  ),
  artist: (
    <>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  place: (
    <>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  topic: <path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16" />,
};

/** The four line icons from the reference (tag, note, pin, hash). */
export function KindIcon({ kind, size = 15 }: { kind: CardKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {KIND_PATHS[kind]}
    </svg>
  );
}

/** Which glyph a chip gets: topics are tags; entities by their Qloo type. */
export function kindOfAnchor(anchor: Pick<TasteAnchor, "kind" | "type">): CardKind {
  if (anchor.kind === "tag") return "topic";
  if (anchor.type.includes("artist")) return "artist";
  if (anchor.type.includes("place") || anchor.type.includes("destination")) return "place";
  return "brand";
}

/** Two outline circles seeded from the name (decoration only), as `watermark()` in the reference. */
export function Watermark({ seed }: { seed: string }) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const dx = 60 + (h % 50);
  const r = 88 + ((h >> 3) % 24);
  return (
    <svg className="sw-wm" viewBox="0 0 300 300" aria-hidden="true" overflow="visible">
      <circle cx={130 - dx / 3} cy={150} r={r} fill="none" stroke="currentColor" strokeWidth={2} />
      <circle cx={130 + dx / 1.6} cy={150} r={r - 8} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

export const nameSize = (name: string): string =>
  name.length <= 7 ? "is-s1" : name.length <= 12 ? "is-s2" : name.length <= 18 ? "is-s3" : "is-s4";

/** "café" (singular, lower case) for the question; plural for "Suggested for cafés". */
export function businessNoun(input: BusinessInput, plural = false): string {
  if (input.businessType === "other" && input.businessTypeCustom?.trim()) {
    const custom = input.businessTypeCustom.trim().toLowerCase();
    return plural ? `${custom}s` : custom;
  }
  return (plural ? BUSINESS_TYPE_PLURALS : BUSINESS_TYPE_LABELS)[input.businessType].toLowerCase();
}

/** The provenance line under a card's name, chosen by the server's `card.provenance`. A sample
 * card never says it came from Qloo. */
export function Provenance({ card, input }: { card: SwipeCard; input: BusinessInput }) {
  const city = input.city.trim();
  switch (card.provenance) {
    case "qloo_local":
      return (
        <>
          Popular near {city}
          <i />
          <b>From Qloo</b>
        </>
      );
    case "qloo_seed":
      return (
        <>
          Suggested for {businessNoun(input, true)}
          <i />
          <b>Checked on Qloo</b>
        </>
      );
    case "qloo_refill":
      return card.because ? (
        <>
          Because you said yes to <b>{card.because}</b>
        </>
      ) : (
        <>
          Picked from your yeses
          <i />
          <b>From Qloo</b>
        </>
      );
    case "snapshot":
      return (
        <>
          Recorded example
          <i />
          <b>From Qloo</b>
        </>
      );
    case "sample":
    default:
      return (
        <>
          Sample card
          <i />
          <b>Not from Qloo</b>
        </>
      );
  }
}

/** True for `prefers-reduced-motion` or `?static=1`: no tilt, flight or fly-to-chip. */
export function useStaticMotion(): boolean {
  const [still, setStill] = useState(() => isStaticMotion());
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setStill(isStaticMotion());
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return still;
}

export function isStaticMotion(): boolean {
  if (typeof window === "undefined") return true;
  return new URLSearchParams(window.location.search).has("static") || Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** True at the width where the deck becomes a bottom sheet. */
export function useSheetLayout(): boolean {
  const query = "(max-width: 1023px)";
  const [sheet, setSheet] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return;
    const update = () => setSheet(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, []);
  return sheet;
}
