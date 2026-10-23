import { QLOO_CAPABILITIES } from "@shared/constants";
import { useEffect, type ReactNode } from "react";
import { AmbientCircles } from "@/components/brand/AmbientCircles";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  version?: string;
}

const HIGHLIGHTS: { label: string; tone: BadgeTone }[] = [
  { label: "Powered by Qloo", tone: "sky" },
  { label: "Public taste only", tone: "coral" },
  { label: "Group-level scores", tone: "blue" },
  { label: "Collab brief", tone: "plum" },
  { label: "MIT licence", tone: "mint" },
  { label: "Hackathon 2026", tone: "sand" },
];

const STEPS = [
  { n: "01", title: "Tell Venn your tastes", body: "Business, city, and brands / artists / places your customers love." },
  { n: "02", title: "Find shared crowds", body: "Qloo taste data ranks partners whose audiences overlap with yours." },
  { n: "03", title: "Send the pitch", body: "Get a shortlist, map, graph, and a draft collab brief ready to copy." },
];

const SURFACE_TONES: BadgeTone[] = ["coral", "blue", "plum", "mint"];

export function AboutDialog({ open, onClose, version }: AboutDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        id="about"
        className="relative z-10 max-h-[85dvh] w-full max-w-xl overflow-hidden rounded-[24px] border border-line bg-paper"
        onClick={(event) => event.stopPropagation()}
      >
        <AmbientCircles subtle className="opacity-90" />
        <div className="relative z-10 max-h-[85dvh] overflow-y-auto p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">Taste collaboration agent</p>
        <h2 id="about-title" className="mt-2 text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-tight text-ink">
          About Venn
        </h2>
        <p className="mt-3 text-base leading-relaxed text-ink-soft">
          Venn helps a small business find collab partners whose audiences already share the same tastes — then drafts the message to send them.
        </p>

        <div className="mt-5 flex flex-wrap gap-2" aria-label="Highlights">
          {HIGHLIGHTS.map((item) => (
            <Badge key={item.label} tone={item.tone}>
              {item.label}
            </Badge>
          ))}
        </div>

        <ol className="mt-8 space-y-4">
          {STEPS.map((step) => (
            <li key={step.n} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-paper tabular">
                {step.n}
              </span>
              <div>
                <p className="font-bold text-ink">{step.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 grid gap-2 sm:grid-cols-3">
          <MetaCell label="Licence" value="MIT" />
          <MetaCell label="Version" value={version ?? "0.1.0"} />
          <MetaCell
            label="Source"
            value={
              <a className="link-underline font-bold" href="https://github.com/smehra670/venn-qloo-hackathon" target="_blank" rel="noreferrer">
                GitHub
              </a>
            }
          />
        </div>

        <h3 className="mt-8 text-sm font-bold text-ink">Qloo surfaces used</h3>
        <p className="mt-1 text-sm text-ink-soft">Live calls (or saved snapshots) go through these endpoints.</p>
        <ul className="mt-4 space-y-2">
          {QLOO_CAPABILITIES.map((row, index) => (
            <li
              key={row.path}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line px-3 py-3"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs text-ink">{row.path}</p>
                <p className="mt-0.5 text-sm text-ink-soft">{row.usedFor}</p>
              </div>
              <Badge tone={SURFACE_TONES[index % SURFACE_TONES.length]}>{row.label}</Badge>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-sm leading-relaxed text-ink-soft">
          Match scores are relative to each search and describe group-level patterns — not individual customers.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Swipe cards come from Qloo, a taste database. Only the tastes you keep are used.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Taste magnets pull the partners that share a taste toward it. Positions while you hold one show that taste, not overlap.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Badge tone="sky">Qloo Agentic Hackathon 2026 Entry</Badge>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        </div>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}
