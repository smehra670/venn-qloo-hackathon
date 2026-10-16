import { useState, type ReactNode } from "react";
import { useReveal } from "@/components/results/overview/useReveal";
import { cn } from "@/lib/cn";

export function ChartCard({
  id,
  title,
  subtitle,
  note,
  legend,
  chart,
  table,
  className,
  revealClass,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  note?: string;
  legend?: ReactNode;
  chart: ReactNode;
  table?: ReactNode;
  className?: string;
  revealClass?: string;
}) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const hasTable = Boolean(table);
  const revealRef = useReveal<HTMLElement>();

  return (
    <article
      ref={revealRef}
      id={id}
      className={cn("ov-card reveal", revealClass, mode === "table" && "table", className)}
    >
      <header className="ov-ch">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="ov-sub">{subtitle}</p> : null}
        </div>
        {hasTable ? (
          <div className="ov-vt" role="group" aria-label="View">
            <button
              type="button"
              className={mode === "chart" ? "on" : undefined}
              onClick={() => setMode("chart")}
            >
              Chart
            </button>
            <button
              type="button"
              className={mode === "table" ? "on" : undefined}
              onClick={() => setMode("table")}
            >
              Table
            </button>
          </div>
        ) : null}
      </header>
      <div className="ov-cb">
        <div className="ov-plot">
          {chart}
          {legend}
          {note ? <p className="ov-note">{note}</p> : null}
        </div>
        {hasTable ? <div className="ov-tv">{table}</div> : null}
      </div>
    </article>
  );
}

export function DataTable({
  head,
  rows,
  onRowFocus,
  onRowSelect,
  selectedId,
  hoverId,
  rowIds,
}: {
  head: string[];
  rows: string[][];
  rowIds?: string[];
  selectedId?: string | null;
  hoverId?: string | null;
  onRowFocus?: (id: string | null) => void;
  onRowSelect?: (id: string) => void;
}) {
  return (
    <table>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const id = rowIds?.[i];
          const interactive = Boolean(id && onRowSelect);
          return (
            <tr
              key={id ?? `${row[0]}-${i}`}
              data-id={id}
              className={cn(
                id && id === selectedId && "sel",
                id && id === hoverId && "hl",
                interactive && "cursor-pointer",
              )}
              tabIndex={interactive ? 0 : undefined}
              onMouseEnter={() => id && onRowFocus?.(id)}
              onMouseLeave={() => onRowFocus?.(null)}
              onFocus={() => id && onRowFocus?.(id)}
              onBlur={() => onRowFocus?.(null)}
              onClick={() => id && onRowSelect?.(id)}
              onKeyDown={(e) => {
                if (!id || !onRowSelect) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowSelect(id);
                }
              }}
            >
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
