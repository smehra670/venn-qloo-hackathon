import { QLOO_CAPABILITIES } from "@shared/constants";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  version?: string;
}

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        id="about"
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-card p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="about-title" className="font-serif text-3xl tracking-tight">
          About Venn
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Venn finds businesses whose audiences overlap with yours using public taste signals — brands, artists, and places — then drafts a collab brief. Match scores are relative to each search and describe group-level patterns, not individuals.
        </p>
        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between gap-4 border-b border-line py-2">
            <dt className="text-ink-soft">Licence</dt>
            <dd>MIT</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line py-2">
            <dt className="text-ink-soft">Version</dt>
            <dd>{version ?? "0.1.0"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line py-2">
            <dt className="text-ink-soft">Source</dt>
            <dd>
              <a className="underline underline-offset-2" href="https://github.com/smehra670/venn-inhouse" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </dd>
          </div>
        </dl>
        <h3 className="mt-6 text-sm font-medium">Qloo surfaces used</h3>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="text-ink-soft">
              <th className="py-1 font-normal">Path</th>
              <th className="py-1 font-normal">Role</th>
            </tr>
          </thead>
          <tbody>
            {QLOO_CAPABILITIES.map((row) => (
              <tr key={row.path} className="border-t border-line">
                <td className="py-2 font-mono text-xs">{row.path}</td>
                <td className="py-2 text-ink-soft">{row.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
