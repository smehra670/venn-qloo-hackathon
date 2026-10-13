import type { Partner } from "@shared/types";
import { useMemo, useState } from "react";
import { MatchRing } from "@/components/results/MatchRing";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { downloadText, partnersToCsv } from "@/lib/format";
import { KIND_META } from "@/lib/kinds";
import { useVenn } from "@/store/useVenn";

type SortKey = "score" | "surprise" | "name";

export function ShortlistView() {
  const result = useVenn((state) => state.result);
  const pinned = useVenn((state) => state.pinnedIds);
  const togglePin = useVenn((state) => state.togglePin);
  const select = useVenn((state) => state.select);
  const openBrief = useVenn((state) => state.openBrief);
  const [sort, setSort] = useState<SortKey>("score");
  const ordered = useMemo(() => {
    const empty = { pinnedRows: [] as Partner[], rest: [] as Partner[] };
    if (!result) return empty;
    const list = [...result.partners];
    list.sort((a, b) => compare(a, b, sort));
    const pinnedRows = list.filter((partner) => pinned.has(partner.id));
    const rest = list.filter((partner) => !pinned.has(partner.id));
    return { pinnedRows, rest };
  }, [result, pinned, sort]);

  if (!result) return null;
  const download = () => {
    const rows = [...ordered.pinnedRows, ...ordered.rest];
    downloadText("venn-shortlist.csv", partnersToCsv(rows), "text/csv");
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-auto px-4 py-4 pb-28 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm text-ink-soft">
          Sort
          <select className="ml-2 rounded-full bg-card px-3 py-1 text-ink" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            <option value="score">Match</option>
            <option value="surprise">Surprise</option>
            <option value="name">Name</option>
          </select>
        </label>
        <Button type="button" variant="secondary" onClick={download}>Download CSV</Button>
      </div>
      {ordered.pinnedRows.length > 0 ? (
        <section>
          <h2 className="mb-2 font-serif text-2xl">Your shortlist</h2>
          <List partners={ordered.pinnedRows} pinned={pinned} onPin={togglePin} onOpen={select} onBrief={(id) => void openBrief(id)} />
        </section>
      ) : null}
      <section>
        <h2 className="mb-2 font-serif text-2xl">All partners</h2>
        <List partners={ordered.rest} pinned={pinned} onPin={togglePin} onOpen={select} onBrief={(id) => void openBrief(id)} offset={ordered.pinnedRows.length} />
      </section>
    </div>
  );
}

function compare(a: Partner, b: Partner, sort: SortKey): number {
  if (sort === "name") return a.name.localeCompare(b.name);
  if (sort === "surprise") return b.surprise - a.surprise || b.matchScore - a.matchScore;
  return b.matchScore - a.matchScore || a.name.localeCompare(b.name);
}

function List({
  partners,
  pinned,
  onPin,
  onOpen,
  onBrief,
  offset = 0,
}: {
  partners: Partner[];
  pinned: Set<string>;
  onPin: (id: string) => void;
  onOpen: (id: string) => void;
  onBrief: (id: string) => void;
  offset?: number;
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-card">
      {partners.map((partner, index) => (
        <li key={partner.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(partner.id)}>
            <span className="w-6 font-mono text-xs text-ink-soft">{offset + index + 1}</span>
            <MatchRing score={partner.matchScore} size={56} />
            <span className="min-w-0">
              <span className="block truncate font-medium">{partner.name}</span>
              <span className="mt-1 flex flex-wrap gap-2">
                <Chip>{KIND_META[partner.kind].label}</Chip>
                <Chip>{partner.local ? "Local" : "Brand"}</Chip>
                {partner.userAdded ? <Chip>Your pick</Chip> : null}
              </span>
              <span className="mt-1 block text-sm text-ink-soft">{partner.reasons[0] ?? partner.blurb}</span>
            </span>
          </button>
          <span className="font-mono text-xs text-ink-soft">surprise {partner.surprise.toFixed(1)}</span>
          <Button type="button" variant="ghost" onClick={() => onPin(partner.id)}>{pinned.has(partner.id) ? "Unpin" : "Pin"}</Button>
          <Button type="button" variant="secondary" onClick={() => onBrief(partner.id)}>Brief</Button>
        </li>
      ))}
    </ul>
  );
}
