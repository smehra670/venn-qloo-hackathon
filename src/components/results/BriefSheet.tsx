import type { Brief, BriefSource } from "@shared/types";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton } from "@/components/ui/Skeleton";
import { briefAsText } from "@/lib/format";
import { useVenn } from "@/store/useVenn";

const TONE_OPTIONS = [
  { value: "warm", label: "Warm" },
  { value: "direct", label: "Direct" },
  { value: "playful", label: "Playful" },
] as const;

const LENGTH_OPTIONS = [
  { value: "short", label: "Short" },
  { value: "standard", label: "Standard" },
] as const;

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
  const reduced = useReducedMotion();
  if (!open || !partnerId) return null;
  const brief = briefs[`${partnerId}:${variant}:${tone}:${length}`];
  const dataLabel = health?.provider === "qloo" ? "Powered by Qloo" : "Demo data";

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch {
      toast("Could not copy. Select the text instead.");
    }
  };

  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-ink/30 p-4 md:p-10" role="dialog" aria-modal="true" aria-labelledby="brief-title">
      <div className="mx-auto mb-4 flex max-w-[760px] flex-wrap items-center gap-2 print:hidden">
        <Segmented value={tone} onChange={(value) => void setTone(value)} options={[...TONE_OPTIONS]} label="Tone" />
        <Segmented value={length} onChange={(value) => void setLength(value)} options={[...LENGTH_OPTIONS]} label="Length" />
        <Button type="button" variant="secondary" disabled={loading} onClick={() => void regenerate()}>Regenerate</Button>
        <Button type="button" variant="secondary" disabled={!brief} onClick={() => brief && void copy(briefAsText(brief), "Copied the brief.")}>Copy as text</Button>
        <Button type="button" variant="secondary" onClick={() => window.print()}>Print / Save as PDF</Button>
        <Button type="button" variant="ghost" onClick={() => void next()}>Try another concept</Button>
        <Button type="button" variant="ghost" onClick={close}>Close</Button>
      </div>
      {brief ? (
        <motion.article
          id="brief-print"
          key={`${brief.generatedBy}-${brief.variant}-${brief.tone ?? "warm"}-${brief.length ?? "standard"}`}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mx-auto max-w-[760px] rounded-[20px] bg-card px-8 py-10 shadow-soft md:px-14"
        >
          <BriefBody brief={brief} dataLabel={dataLabel} />
        </motion.article>
      ) : (
        <Skeleton className="mx-auto h-[70dvh] max-w-[760px]" />
      )}
    </div>
  );
}

/** Renders evidence ids as footnote-style superscripts linking into the Sources list. */
function Citations({ evidence, sources }: { evidence: string[]; sources: BriefSource[] | undefined }) {
  if (evidence.length === 0) return null;
  const indexById = new Map((sources ?? []).map((source, index) => [source.id, index + 1]));
  const numbered = evidence.filter((id) => indexById.has(id));
  if (numbered.length === 0) {
    // Template briefs cite plain-language labels, not source ids; show them as a caption instead.
    return <p className="mt-1 font-mono text-[12px] text-ink-soft">{evidence.join(" · ")}</p>;
  }
  return (
    <sup className="ml-0.5 font-sans text-[11px] font-medium text-blue">
      {numbered.map((id, i) => (
        <span key={id}>
          {i > 0 ? "," : ""}
          <a href={`#source-${id}`} className="hover:underline">{indexById.get(id)}</a>
        </span>
      ))}
    </sup>
  );
}

function GeneratorChip({ brief }: { brief: Brief }) {
  return <Badge>{brief.generatedBy === "llm" ? "OpenAI" : "Template"}</Badge>;
}

function BriefBody({ brief, dataLabel }: { brief: Brief; dataLabel: string }) {
  const [subject, setSubject] = useState(brief.outreach.subject);
  const [body, setBody] = useState(brief.outreach.body);

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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm tracking-wide text-ink-soft">{brief.format}</p>
        <GeneratorChip brief={brief} />
      </div>
      <h2 id="brief-title" className="mt-2 font-serif text-4xl tracking-tight">{brief.title}</h2>
      <section className="brief-section mt-8">
        <h3 className="font-serif text-2xl">Concept</h3>
        <p className="mt-3 leading-relaxed">{brief.concept}</p>
      </section>
      <section className="brief-section mt-8">
        <h3 className="font-serif text-2xl">Why it fits</h3>
        <ul className="mt-3 space-y-3">
          {brief.whyItFits.map((item) => (
            <li key={item.text}>
              <p>
                {item.text}
                <Citations evidence={item.evidence} sources={brief.sources} />
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className="brief-section mt-8">
        <h3 className="font-serif text-2xl">First step</h3>
        <p className="mt-3">{brief.firstStep}</p>
      </section>
      <section className="brief-section mt-8">
        <h3 className="font-serif text-2xl">Two-week plan</h3>
        <table className="mt-3 w-full text-left text-sm">
          <tbody>
            {brief.plan.map((row) => (
              <tr key={row.when} className="align-top">
                <th className="w-28 py-2 pr-3 font-medium">{row.when}</th>
                <td className="py-2">{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="brief-section mt-8">
        <h3 className="font-serif text-2xl">What to measure</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {brief.measure.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
      <section className="brief-section mt-8">
        <h3 className="font-serif text-2xl">Risks</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {brief.risks.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
      <section className="brief-section mt-8">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-serif text-2xl">Outreach email</h3>
          <Button
            type="button"
            variant="secondary"
            className="print:hidden"
            onClick={() => void copy(`${subject}\n\n${body}`, "Copied the outreach email.")}
          >
            Copy outreach email
          </Button>
        </div>
        <div className="mt-3 rounded-2xl bg-paper px-4 py-4">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            aria-label="Outreach subject"
            className="w-full bg-transparent font-medium text-ink outline-none"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-label="Outreach body"
            rows={8}
            className="mt-3 w-full resize-y bg-transparent leading-relaxed text-ink outline-none"
          />
        </div>
      </section>
      {brief.sources && brief.sources.length > 0 ? (
        <section className="brief-section mt-8">
          <h3 className="font-serif text-2xl">Sources</h3>
          <ol className="mt-3 space-y-1 text-sm text-ink-soft">
            {brief.sources.map((source, index) => (
              <li key={source.id} id={`source-${source.id}`}>
                [{index + 1}] {source.label}: {source.value}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <p className="mt-8 text-sm text-ink-soft">{brief.limits}</p>
      <footer className="mt-8 flex items-center justify-between text-sm text-ink-soft">
        <span>Made with Venn</span>
        <span>{dataLabel}</span>
      </footer>
    </>
  );
}
