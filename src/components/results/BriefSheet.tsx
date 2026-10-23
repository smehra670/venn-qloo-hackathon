import type { Brief, BriefSource, PartnerKind } from "@shared/types";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CalendarRange, CheckCircle2, Compass, Mail, Sparkles, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton } from "@/components/ui/Skeleton";
import { briefAsText } from "@/lib/format";
import { kindLabel } from "@/lib/overviewModel";
import { useVenn } from "@/store/useVenn";

/** Shown while the brief is being written — a branded, content-shaped placeholder instead of
 * one flat box, so a several-second LLM call reads as "working on it", not a blank/broken
 * screen. */
function BriefLoading() {
  return (
    <div className="page-shell overflow-hidden rounded-[20px] border border-line bg-paper shadow-[0_24px_60px_rgba(20,21,26,0.1)]">
      <div className="flex items-center gap-3 border-b border-line bg-[#F8F8FA] px-6 py-8 sm:px-10">
        <span className="animate-pulse">
          <Logo wordmark={false} size="lg" />
        </span>
        <div>
          <p className="font-bold text-lg text-ink">Drafting your pitch…</p>
          <p className="text-sm text-ink-soft">Writing from this search's real evidence — a few seconds.</p>
        </div>
      </div>
      <div className="space-y-5 px-6 py-8 sm:px-10">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    </div>
  );
}

const TONE_OPTIONS = [
  { value: "warm", label: "Warm" },
  { value: "direct", label: "Direct" },
  { value: "playful", label: "Playful" },
] as const;

const LENGTH_OPTIONS = [
  { value: "short", label: "Short" },
  { value: "standard", label: "Standard" },
] as const;

/** Guards against an old cached brief (or a stray model slip) surfacing an internal name
 * like "venn_brief" where a human label belongs. */
function cleanFormat(format: string): string {
  return /venn_brief|\bjson\b|\bschema\b/i.test(format) ? "Collaboration idea" : format;
}

export function BriefSheet() {
  const open = useVenn((state) => state.briefOpen);
  const partnerId = useVenn((state) => state.briefPartnerId);
  const variant = useVenn((state) => state.briefVariant);
  const tone = useVenn((state) => state.briefTone);
  const length = useVenn((state) => state.briefLength);
  const loading = useVenn((state) => state.briefLoading);
  const briefs = useVenn((state) => state.briefs);
  const close = useVenn((state) => state.closeBrief);
  const next = useVenn((state) => state.nextBriefVariant);
  const setTone = useVenn((state) => state.setBriefTone);
  const setLength = useVenn((state) => state.setBriefLength);
  const regenerate = useVenn((state) => state.regenerateBrief);
  const health = useVenn((state) => state.health);
  const input = useVenn((state) => state.input);
  const partner = useVenn((state) => state.result?.partners.find((item) => item.id === partnerId));
  const reduced = useReducedMotion();
  if (!open || !partnerId) return null;
  const brief = briefs[`${partnerId}:${variant}:${tone}:${length}`];
  const dataLabel = health?.provider === "qloo" ? "Powered by Qloo" : "Demo data";
  const youLabel = input.businessName || input.businessTypeCustom || input.businessType || "You";

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch {
      toast("Could not copy. Select the text instead.");
    }
  };

  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-ink/35 p-4 md:p-10" role="dialog" aria-modal="true" aria-labelledby="brief-title">
      <div className="page-shell mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper/90 px-4 py-3 shadow-[0_8px_24px_rgba(20,21,26,0.08)] backdrop-blur print:hidden">
        <div className="flex flex-wrap items-center gap-4">
          <Segmented value={tone} onChange={(value) => void setTone(value)} options={[...TONE_OPTIONS]} label="Tone" />
          <span className="hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          <Segmented value={length} onChange={(value) => void setLength(value)} options={[...LENGTH_OPTIONS]} label="Length" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void regenerate()}>Regenerate</Button>
          <Button type="button" variant="secondary" disabled={!brief} onClick={() => brief && void copy(briefAsText(brief), "Copied the brief.")}>Copy as text</Button>
          <Button type="button" variant="secondary" onClick={() => window.print()}>Print / Save as PDF</Button>
          <Button type="button" variant="ghost" onClick={() => void next()}>Try another concept</Button>
          <Button type="button" variant="ghost" onClick={close}>Close</Button>
        </div>
      </div>
      {brief ? (
        <motion.article
          id="brief-print"
          key={`${brief.generatedBy}-${brief.variant}-${brief.tone ?? "warm"}-${brief.length ?? "standard"}`}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="page-shell overflow-hidden rounded-[20px] border border-line bg-paper shadow-[0_24px_60px_rgba(20,21,26,0.1)]"
        >
          <BriefBody brief={brief} dataLabel={dataLabel} youLabel={youLabel} matchScore={partner?.matchScore} kind={partner?.kind} />
        </motion.article>
      ) : (
        <BriefLoading />
      )}
    </div>
  );
}

/** Renders evidence ids as small numbered footnote badges linking into the Sources list. */
function Citations({ evidence, sources }: { evidence: string[]; sources: BriefSource[] | undefined }) {
  if (evidence.length === 0) return null;
  const indexById = new Map((sources ?? []).map((source, index) => [source.id, index + 1]));
  const numbered = evidence.filter((id) => indexById.has(id));
  if (numbered.length === 0) {
    // Template briefs cite plain-language labels, not source ids; show them as a caption instead.
    return <p className="mt-1.5 font-mono text-[12px] text-ink-soft">{evidence.join(" · ")}</p>;
  }
  return (
    <span className="ml-1.5 inline-flex gap-1 align-middle">
      {numbered.map((id) => (
        <a
          key={id}
          href={`#source-${id}`}
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-soft px-1 font-mono text-[10px] font-bold text-blue no-underline hover:bg-blue hover:text-paper"
        >
          {indexById.get(id)}
        </a>
      ))}
    </span>
  );
}

/** A little "you ∩ them" lens, echoing the brand mark, with the overlap score in the shared
 * sliver — a quick visual read of the match before anyone reads a word. */
function FitLens({ youLabel, partnerName, matchScore }: { youLabel: string; partnerName: string; matchScore: number }) {
  const clip = "brief-lens-clip";
  return (
    <div className="flex shrink-0 items-center gap-3">
      <svg viewBox="0 0 108 72" className="h-[4.1rem] w-[6.1rem]" aria-hidden="true">
        <circle cx="38" cy="36" r="26" fill="#FF6B57" fillOpacity="0.9" />
        <circle cx="70" cy="36" r="26" fill="#4F5BFF" fillOpacity="0.88" />
        <clipPath id={clip}>
          <circle cx="38" cy="36" r="26" />
        </clipPath>
        <circle cx="70" cy="36" r="26" fill="#6B3FA0" clipPath={`url(#${clip})`} />
        <text x="54" y="41" textAnchor="middle" fontSize="16" fontWeight="700" fill="#ffffff" fontFamily="var(--font-sans)">
          {matchScore}
        </text>
      </svg>
      <div className="text-sm leading-tight">
        <p className="font-bold text-ink">{youLabel}</p>
        <p className="text-ink-soft">+ {partnerName}</p>
        <p className="mt-0.5 font-mono text-[11px] text-ink-soft">{matchScore}/100 overlap</p>
      </div>
    </div>
  );
}

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-bold text-2xl tracking-tight">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper">{icon}</span>
      {children}
    </h3>
  );
}

function BriefBody({
  brief,
  dataLabel,
  youLabel,
  matchScore,
  kind,
}: {
  brief: Brief;
  dataLabel: string;
  youLabel: string;
  matchScore?: number;
  kind?: PartnerKind;
}) {
  const [subject, setSubject] = useState(brief.outreach.subject);
  const [body, setBody] = useState(brief.outreach.body);
  const format = useMemo(() => cleanFormat(brief.format), [brief.format]);

  useEffect(() => {
    setSubject(brief.outreach.subject);
    setBody(brief.outreach.body);
  }, [brief]);

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch {
      toast("Could not copy. Select the text instead.");
    }
  };

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line bg-[#F8F8FA] px-6 py-8 sm:px-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">{format}</Badge>
            {kind ? <Badge tone="neutral">{kindLabel(kind)}</Badge> : null}
          </div>
          <h2 id="brief-title" className="mt-3 font-bold text-4xl tracking-tight text-balance">{brief.title}</h2>
        </div>
        {typeof matchScore === "number" ? (
          <FitLens youLabel={youLabel} partnerName={brief.partnerName} matchScore={matchScore} />
        ) : null}
      </header>

      <div className="px-6 py-8 sm:px-10">
        <section className="brief-section rounded-2xl bg-[#F8F8FA] p-6">
          <SectionHeading icon={<Sparkles size={16} />}>Concept</SectionHeading>
          <p className="mt-3 leading-relaxed">{brief.concept}</p>
        </section>

        <section className="brief-section mt-8">
          <SectionHeading icon={<CheckCircle2 size={16} />}>Why it fits</SectionHeading>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {brief.whyItFits.map((item) => (
              <li key={item.text} className="rounded-2xl border border-line p-4">
                <p className="leading-relaxed">
                  {item.text}
                  <Citations evidence={item.evidence} sources={brief.sources} />
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="brief-section mt-8 rounded-2xl border-l-4 border-ink bg-[#F8F8FA] p-6">
          <SectionHeading icon={<Compass size={16} />}>First step</SectionHeading>
          <p className="mt-3 leading-relaxed">{brief.firstStep}</p>
        </section>

        <section className="brief-section mt-8">
          <SectionHeading icon={<CalendarRange size={16} />}>Two-week plan</SectionHeading>
          <ol className="mt-4 space-y-0">
            {brief.plan.map((row, index) => (
              <li key={row.when} className="relative flex gap-4 pb-6 pl-1 last:pb-0">
                {index < brief.plan.length - 1 ? (
                  <span className="absolute left-[7px] top-4 h-full w-px bg-line" aria-hidden="true" />
                ) : null}
                <span className="relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-ink bg-paper" aria-hidden="true" />
                <div>
                  <p className="font-bold text-sm uppercase tracking-wide text-ink-soft">{row.when}</p>
                  <p className="mt-1 leading-relaxed">{row.action}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <section className="brief-section rounded-2xl border border-line p-5">
            <SectionHeading icon={<Target size={16} />}>What to measure</SectionHeading>
            <ul className="mt-3 space-y-2">
              {brief.measure.map((item) => (
                <li key={item} className="flex items-start gap-2 leading-relaxed">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
          <section className="brief-section rounded-2xl border border-line p-5">
            <SectionHeading icon={<AlertTriangle size={16} />}>Risks</SectionHeading>
            <ul className="mt-3 space-y-2">
              {brief.risks.map((item) => (
                <li key={item} className="flex items-start gap-2 leading-relaxed">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="brief-section mt-8">
          <div className="flex items-center justify-between gap-3">
            <SectionHeading icon={<Mail size={16} />}>Outreach email</SectionHeading>
            <Button
              type="button"
              variant="secondary"
              className="print:hidden"
              onClick={() => void copy(`${subject}\n\n${body}`, "Copied the outreach email.")}
            >
              Copy outreach email
            </Button>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-[#F8F8FA] px-5 py-5">
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              aria-label="Outreach subject"
              className="w-full bg-transparent font-bold text-lg text-ink outline-none"
            />
            <div className="my-3 h-px bg-line" aria-hidden="true" />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              aria-label="Outreach body"
              rows={8}
              className="w-full resize-y bg-transparent leading-relaxed text-ink outline-none"
            />
          </div>
        </section>

        {brief.sources && brief.sources.length > 0 ? (
          <section className="brief-section mt-8 rounded-2xl border border-line p-5">
            <h3 className="font-bold text-lg tracking-tight">Sources</h3>
            <ol className="mt-3 space-y-1.5 text-sm text-ink-soft">
              {brief.sources.map((source, index) => (
                <li key={source.id} id={`source-${source.id}`} className="flex gap-2">
                  <span className="font-mono text-[11px]">[{index + 1}]</span>
                  <span>{source.label}: {source.value}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <p className="mt-8 text-sm text-ink-soft">{brief.limits}</p>
        <footer className="mt-8 flex items-center justify-between border-t border-line pt-4 text-sm text-ink-soft">
          <span>Made with Venn</span>
          <span>{dataLabel}</span>
        </footer>
      </div>
    </>
  );
}
