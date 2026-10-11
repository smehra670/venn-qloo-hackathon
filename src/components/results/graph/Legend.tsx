import { PARTNER_KINDS, type Partner, type PartnerKind } from "@shared/types";
import { KIND_META } from "@/lib/kinds";

export function Legend({
  partners,
  active,
  onToggle,
}: {
  partners: Partner[];
  active: Set<PartnerKind>;
  onToggle: (kind: PartnerKind) => void;
}) {
  const present = PARTNER_KINDS.filter((kind) => partners.some((partner) => partner.kind === kind));
  return (
    <div aria-label="Types" className="min-w-0 flex-1 rounded-[20px] border border-line bg-card/95 px-3 py-2 shadow-soft">
      <ul className="flex flex-wrap gap-1">
        {present.map((kind) => {
          const count = partners.filter((partner) => partner.kind === kind).length;
          const on = active.has(kind);
          return (
            <li key={kind}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(kind)}
                className="flex items-center gap-2 rounded-full px-2 py-1 text-left text-sm"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_META[kind].color, opacity: on ? 1 : 0.3 }} />
                <span className={on ? "text-ink" : "text-ink-soft"}>{KIND_META[kind].label}</span>
                <span className="ml-auto font-mono text-xs text-ink-soft">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
