import type { Brief } from "@shared/types";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { briefAsText } from "@/lib/format";
import { useVenn } from "@/store/useVenn";

export function BriefSheet() {
  const open = useVenn((state) => state.briefOpen);
  const partnerId = useVenn((state) => state.briefPartnerId);
  const variant = useVenn((state) => state.briefVariant);
  const briefs = useVenn((state) => state.briefs);
  const close = useVenn((state) => state.closeBrief);
  const next = useVenn((state) => state.nextBriefVariant);
  const health = useVenn((state) => state.health);
  const reduced = useReducedMotion();
  if (!open || !partnerId) return null;
  const brief = briefs[`${partnerId}:${variant}`];
  const label = health?.provider === "qloo" ? "Powered by Qloo" : "Demo data";

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
      <div className="mx-auto mb-4 flex max-w-[760px] flex-wrap gap-2 print:hidden">
        <Button type="button" variant="secondary" disabled={!brief} onClick={() => brief && void copy(briefAsText(brief), "Copied the brief.")}>Copy as text</Button>
        <Button type="button" variant="secondary" onClick={() => window.print()}>Print / Save as PDF</Button>
        <Button type="button" variant="secondary" disabled={!brief} onClick={() => brief && void copy(`${brief.outreach.subject}\n\n${brief.outreach.body}`, "Copied the outreach email.")}>Copy outreach email</Button>
        <Button type="button" variant="ghost" onClick={() => void next()}>Try another concept</Button>
        <Button type="button" variant="ghost" onClick={close}>Close</Button>
      </div>
      {brief ? (
        <motion.article
          id="brief-print"
          key={brief.variant}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mx-auto max-w-[760px] rounded-[20px] bg-card px-8 py-10 shadow-soft md:px-14"
        >
          <BriefBody brief={brief} label={label} />
        </motion.article>
      ) : (
        <Skeleton className="mx-auto h-[70dvh] max-w-[760px]" />
      )}
    </div>
  );
}

function BriefBody({ brief, label }: { brief: Brief; label: string }) {
  return (
    <>
      <p className="text-sm tracking-wide text-ink-soft">{brief.format}</p>
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
              <p>{item.text}</p>
              <p className="mt-1 font-mono text-[12px] text-ink-soft">{item.evidence.join(" · ")}</p>
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
        <h3 className="font-serif text-2xl">Outreach email</h3>
        <div className="mt-3 rounded-2xl bg-paper px-4 py-4">
          <p className="font-medium">{brief.outreach.subject}</p>
          <p className="mt-3 whitespace-pre-wrap leading-relaxed">{brief.outreach.body}</p>
        </div>
      </section>
      <p className="mt-8 text-sm text-ink-soft">{brief.limits}</p>
      <footer className="mt-8 flex items-center justify-between text-sm text-ink-soft">
        <span>Made with Venn</span>
        <span>{label}</span>
      </footer>
    </>
  );
}
