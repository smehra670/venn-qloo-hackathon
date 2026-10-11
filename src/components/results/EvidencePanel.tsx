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
  const [open, setOpen] = useState(true);
  const data = items.filter((item) => item.origin === "data");
  const interpretation = items.filter((item) => item.origin === "interpretation");
  const source = provider === "qloo" ? "Qloo" : "Demo dataset";
  return (
    <section className="rounded-2xl border border-line">
      <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Evidence
        <span className="text-ink-soft">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="space-y-4 px-4 pb-4">
          <Group title={`From the taste data · ${source}`} items={data} />
          <Group title="Venn's interpretation" items={interpretation} />
          {limits.map((limit) => (
            <p key={limit} className="text-xs leading-relaxed text-ink-soft">{limit}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Group({ title, items }: { title: string; items: EvidenceItem[] }) {
  return (
    <div>
      <h3 className="text-xs tracking-wide text-ink-soft">{title}</h3>
      <dl className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-sm">{item.label}</dt>
            <dd className="font-mono text-[12px] text-ink-soft">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
