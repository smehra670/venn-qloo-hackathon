import type { EvidenceItem, ProviderName } from "@shared/types";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** Collapsible evidence list in the partner drawer: Qloo data first, then Venn's own read. */
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
    <section className="dw-sec dw-evidence">
      <button type="button" className="dw-evidence-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <h3>Evidence</h3>
        <span>
          {open ? "Hide" : `Show ${items.length}`}
          <ChevronDown size={14} className={cn("dw-chev", open && "open")} aria-hidden="true" />
        </span>
      </button>
      {open ? (
        <div className="dw-evidence-body">
          <Group title={`From ${source}`} items={data} />
          <Group title="Venn's read" items={interpretation} />
          {limits.slice(0, 2).map((limit) => (
            <p key={limit} className="ov-why-note">
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
      <h4>{title}</h4>
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
