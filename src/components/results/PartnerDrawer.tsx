import { MAX_PARTNERS } from "@shared/constants";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { EvidencePanel } from "@/components/results/EvidencePanel";
import { MatchRing } from "@/components/results/MatchRing";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { KIND_META } from "@/lib/kinds";
import { useVenn } from "@/store/useVenn";

export function PartnerDrawer() {
  const result = useVenn((state) => state.result);
  const selectedId = useVenn((state) => state.selectedId);
  const select = useVenn((state) => state.select);
  const pinned = useVenn((state) => state.pinnedIds);
  const togglePin = useVenn((state) => state.togglePin);
  const openBrief = useVenn((state) => state.openBrief);
  const expandPartner = useVenn((state) => state.expandPartner);
  const ref = useRef<HTMLElement>(null);
  const partner = result?.partners.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!partner) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    const focusable = dialog?.querySelector<HTMLElement>("button, [href], input, select, textarea");
    focusable?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea")];
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [partner]);

  if (!result || !partner) return null;
  const atCap = result.partners.length >= MAX_PARTNERS;

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-title"
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[85dvh] flex-col overflow-auto rounded-t-[20px] border border-line bg-card p-5 shadow-soft md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[380px] md:rounded-none md:border-y-0 md:border-r-0"
    >
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-paper-2 md:hidden" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="partner-title" className="font-serif text-3xl tracking-tight">{partner.name}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip>{KIND_META[partner.kind].label}</Chip>
            <Chip>{partner.local ? `Local${partner.locationLabel ? ` · ${partner.locationLabel}` : ""}` : "Brand"}</Chip>
            {partner.userAdded ? <Chip>Your pick</Chip> : null}
          </div>
        </div>
        <button type="button" aria-label="Close" onClick={() => select(null)} className="rounded-full p-2 hover:bg-paper-2">
          <X size={18} />
        </button>
      </div>
      <div className="mt-5">
        <MatchRing score={partner.matchScore} size={120} caption />
      </div>
      <p className="mt-2 text-sm text-ink-soft">{partner.blurb}</p>
      <section className="mt-5">
        <h3 className="text-sm font-medium">Why this fits</h3>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed">
          {partner.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>
      <section className="mt-5">
        <h3 className="text-sm font-medium">Shared taste</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {partner.sharedTags.length === 0 ? <p className="text-sm text-ink-soft">No strong shared tags in this search.</p> : null}
          {partner.sharedTags.map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </div>
      </section>
      <div className="mt-5">
        <EvidencePanel items={partner.evidence} provider={result.provider} limits={result.limits} />
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <Button type="button" onClick={() => void openBrief(partner.id)}>Create partner brief</Button>
        <Button type="button" variant="secondary" onClick={() => togglePin(partner.id)}>
          {pinned.has(partner.id) ? "Unpin from shortlist" : "Pin to shortlist"}
        </Button>
        <Button type="button" variant="ghost" disabled={atCap} onClick={() => void expandPartner(partner.id)}>
          Expand connections
        </Button>
        {atCap ? <p className="text-xs text-ink-soft">This map already has 28 partners, which is the limit.</p> : null}
      </div>
      {partner.relatedIds.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-sm font-medium">Also pairs well with</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {partner.relatedIds.map((id) => {
              const related = result.partners.find((item) => item.id === id);
              if (!related) return null;
              return (
                <Chip key={id} onClick={() => select(id)}>
                  {related.name}
                </Chip>
              );
            })}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
