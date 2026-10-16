import { DECISION_ORIGIN_LABELS, FEASIBILITY_LABELS, MAX_PARTNERS } from "@shared/constants";
import { ExternalLink, MapPin, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { AudienceCompare } from "@/components/results/AudienceCompare";
import { EvidencePanel } from "@/components/results/EvidencePanel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { goalFitLabel } from "@/lib/goals";
import { KIND_META, kindTint } from "@/lib/kinds";
import { useVenn } from "@/store/useVenn";

export function PartnerDrawer() {
  const result = useVenn((state) => state.result);
  const selectedId = useVenn((state) => state.selectedId);
  const select = useVenn((state) => state.select);
  const pinned = useVenn((state) => state.pinnedIds);
  const togglePin = useVenn((state) => state.togglePin);
  const openBrief = useVenn((state) => state.openBrief);
  const expandPartner = useVenn((state) => state.expandPartner);
  const loadCompare = useVenn((state) => state.loadCompare);
  const closeCompare = useVenn((state) => state.closeCompare);
  const compareOpenId = useVenn((state) => state.compareOpenId);
  const compareLoading = useVenn((state) => state.compareLoading);
  const compare = useVenn((state) => state.compare);
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
  const goalChip = goalFitLabel(partner, result.input.goals);
  const color = KIND_META[partner.kind].color;
  const tint = kindTint(partner.kind, 0.22);

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-title"
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[20px] border border-ink bg-paper md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[400px] md:rounded-none md:border-y-0 md:border-l md:border-r-0"
    >
      {/* Kind colour accent */}
      <div className="h-1.5 w-full shrink-0" style={{ background: color }} aria-hidden="true" />

      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink/15 md:hidden" aria-hidden="true" />

      <div className="min-h-0 flex-1 overflow-auto px-5 pb-4 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">Partner</p>
            <h2 id="partner-title" className="mt-1 text-2xl font-bold tracking-tight text-ink md:text-[1.65rem]">
              {partner.name}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => select(null)}
            className="min-h-10 min-w-10 shrink-0 rounded-full border border-line p-2 text-ink-soft transition hover:border-ink hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* Score + meta row */}
        <div className="mt-4 flex items-center gap-4 rounded-[14px] border border-line p-3" style={{ background: tint }}>
          <div
            className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full"
            style={{ background: `conic-gradient(${color} ${partner.matchScore * 3.6}deg, #eef0f4 0)` }}
            aria-hidden="true"
          >
            <div className="absolute inset-[5px] grid place-items-center rounded-full bg-paper">
              <span className="font-mono text-xl font-extrabold tabular-nums leading-none text-ink">{partner.matchScore}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-soft">Match · this search</p>
            <p className="mt-1 text-sm font-bold text-ink">{KIND_META[partner.kind].label}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {partner.local
                ? partner.locationLabel
                  ? `Local · ${partner.locationLabel}`
                  : "Local partner"
                : "Brand partner"}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {partner.feasibility ? (
            <MetaPill
              label={
                partner.feasibility.origin === "ai"
                  ? `${FEASIBILITY_LABELS[partner.feasibility.level]} · ${DECISION_ORIGIN_LABELS.ai}`
                  : FEASIBILITY_LABELS[partner.feasibility.level]
              }
              tone={partner.feasibility.level === "easy" ? "good" : partner.feasibility.level === "long_shot" ? "warn" : "neutral"}
            />
          ) : null}
          {partner.userAdded ? <MetaPill label="Your pick" tone="neutral" /> : null}
          {goalChip ? <MetaPill label={goalChip} tone="neutral" /> : null}
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink">{partner.blurb}</p>
        {partner.feasibility ? (
          <p className="mt-2 border-l-2 pl-3 text-sm leading-relaxed text-ink-soft" style={{ borderColor: color }}>
            {partner.feasibility.reason}
          </p>
        ) : null}

        <section className="mt-6">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">Why this fits</h3>
          <ul className="mt-2 space-y-2">
            {partner.reasons.map((reason) => (
              <li key={reason} className="flex gap-2 text-sm leading-relaxed text-ink">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">Shared taste</h3>
          {partner.sharedTags.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No strong shared tags in this search.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {partner.sharedTags.map((tag, index) => (
                <span
                  key={tag}
                  className="rounded-full border border-transparent px-2.5 py-1 text-xs font-bold text-ink"
                  style={{ background: kindTint(partner.kind, 0.2 + (index % 3) * 0.08) }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </section>

        {partner.venueFacts ? (
          <section className="mt-6 rounded-[14px] border border-line p-3">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">Venue</h3>
            <div className="mt-2 space-y-1.5 text-sm text-ink">
              {partner.venueFacts.address ? (
                <p className="flex items-start gap-2">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden="true" />
                  <span>{partner.venueFacts.address}</span>
                </p>
              ) : null}
              {partner.venueFacts.distanceM !== undefined ? (
                <p className="pl-6 text-ink-soft">{Math.round(partner.venueFacts.distanceM)}m from your search centre</p>
              ) : null}
              {partner.venueFacts.website ? (
                <a
                  href={partner.venueFacts.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 pl-6 font-medium text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
                >
                  Website
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="mt-6">
          <EvidencePanel items={partner.evidence} provider={result.provider} limits={result.limits} />
        </div>

        {compareOpenId === partner.id ? (
          <AudienceCompare payload={compare[partner.id]} loading={compareLoading && !compare[partner.id]} />
        ) : null}

        {partner.relatedIds.length > 0 ? (
          <section className="mt-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">Also pairs well with</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {partner.relatedIds.map((id) => {
                const related = result.partners.find((item) => item.id === id);
                if (!related) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => select(id)}
                    className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-bold text-ink transition hover:border-ink"
                  >
                    {related.name}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      {/* Sticky actions */}
      <div className="shrink-0 border-t border-ink bg-paper px-5 py-3">
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={() => void openBrief(partner.id)}>
            Create partner brief
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => togglePin(partner.id)}>
              {pinned.has(partner.id) ? "Unpin" : "Pin"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (compareOpenId === partner.id) closeCompare();
                else void loadCompare(partner.id);
              }}
            >
              {compareOpenId === partner.id ? "Hide compare" : "Compare"}
            </Button>
          </div>
          <Button type="button" variant="ghost" disabled={atCap} onClick={() => void expandPartner(partner.id)}>
            Expand connections
          </Button>
          {atCap ? <p className="text-xs text-ink-soft">This map already has 28 partners (the limit).</p> : null}
        </div>
      </div>
    </aside>
  );
}

function MetaPill({ label, tone }: { label: string; tone: "good" | "warn" | "neutral" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-bold",
        tone === "good" && "border-transparent bg-[#d8f3ec] text-ink",
        tone === "warn" && "border-transparent bg-coral-soft text-ink",
        tone === "neutral" && "border-line bg-paper text-ink-soft",
      )}
    >
      {label}
    </span>
  );
}
