import type { EvidenceItem, ProviderName } from "@shared/types";
import { useState } from "react";

export function EvidencePanel({
  items,
  provider,
  limits,
}: {
  items: EvidenceItem[];
  provider: ProviderName;
  limits: string[];
}) {
  const [open, setOpen] = useState(false);
  const data = items.filter((item) => item.origin === "data");
  const interpretation = items.filter((item) => item.origin === "interpretation");
  const source = provider === "qloo" ? "Qloo" : "Demo dataset";

  return (
    <section className="border-t border-ink pt-4">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">Evidence</span>
        <span className="text-xs font-medium text-ink-soft">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-4">
          <Group title={`Taste data · ${source}`} items={data} />
          <Group title="Venn's read" items={interpretation} />
          {limits.slice(0, 2).map((limit) => (
            <p key={limit} className="text-xs leading-relaxed text-ink-soft">
              {limit}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Group({ title, items }: { title: string; items: EvidenceItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-bold text-ink">{title}</h3>
      <dl className="mt-2 space-y-2.5">
        {items.map((item) => (
          <div key={item.label} className="grid gap-0.5 border-l-2 border-line pl-3">
            <dt className="text-sm font-medium text-ink">{item.label}</dt>
            <dd className="text-xs leading-relaxed text-ink-soft">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
