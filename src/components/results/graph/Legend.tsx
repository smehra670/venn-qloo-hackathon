import { PARTNER_KINDS, type Partner, type PartnerKind } from "@shared/types";
import { KIND_META, kindTint } from "@/lib/kinds";
import { cn } from "@/lib/cn";

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
    <div aria-label="Types" className="min-w-0 flex-1 rounded-[16px] border border-line bg-paper px-2.5 py-2">
      <ul className="flex flex-wrap gap-1.5">
        {present.map((kind) => {
          const count = partners.filter((partner) => partner.kind === kind).length;
          const on = active.has(kind);
          const color = KIND_META[kind].color;
          return (
            <li key={kind}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(kind)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-sm transition",
                  on ? "border-transparent text-ink" : "border-line text-ink-soft opacity-55",
                )}
                style={on ? { background: kindTint(kind, 0.28), boxShadow: `inset 0 0 0 1px ${color}55` } : undefined}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="font-medium">{KIND_META[kind].label}</span>
                <span className="font-mono text-xs tabular-nums opacity-70">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
