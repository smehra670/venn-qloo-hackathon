import type { AnchorResolution } from "@shared/types";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";

const STATUS_NOTE: Record<AnchorResolution["status"], string> = {
  auto: "Matched automatically",
  ambiguous: "Could mean more than one thing — pick one, or keep it as typed",
  unresolved: "No close match in the demo dataset — Venn will use a stand-in taste profile",
};

/**
 * "Check your anchors" confirm step: shown between the setup form and starting a run whenever
 * `POST /api/anchors/resolve` finds at least one ambiguous/unresolved anchor. Lets the user
 * pick which entity an ambiguous anchor means (or keep their own text) before the search runs.
 */
export function AnchorConfirm({
  resolutions,
  busy,
  onConfirm,
  onBack,
}: {
  resolutions: AnchorResolution[];
  busy: boolean;
  onConfirm: (anchors: string[]) => void;
  onBack: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const resolution of resolutions) {
      initial[resolution.input] = resolution.candidates[0]?.entityName ?? resolution.input;
    }
    return initial;
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-3xl tracking-tight">Check your anchors</h2>
        <p className="mt-2 text-sm text-ink-soft">
          A couple of things you typed could mean more than one brand, artist or place. Pick the one you meant, or keep it as typed.
        </p>
      </div>
      <ul className="flex flex-col gap-4">
        {resolutions.map((resolution) => (
          <li key={resolution.input} className="rounded-2xl border border-line p-4">
            <p className="text-sm font-medium">
              "{resolution.input}" <span className="ml-1 font-normal text-ink-soft">— {STATUS_NOTE[resolution.status]}</span>
            </p>
            {resolution.status !== "auto" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {resolution.candidates.map((candidate) => (
                  <Chip
                    key={candidate.entityId}
                    pressed={choices[resolution.input] === candidate.entityName}
                    onClick={() => setChoices((prev) => ({ ...prev, [resolution.input]: candidate.entityName }))}
                  >
                    {candidate.entityName}
                  </Chip>
                ))}
                <Chip
                  pressed={choices[resolution.input] === resolution.input}
                  onClick={() => setChoices((prev) => ({ ...prev, [resolution.input]: resolution.input }))}
                >
                  {`Keep "${resolution.input}"`}
                </Chip>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button
          type="button"
          onClick={() => onConfirm(resolutions.map((resolution) => choices[resolution.input] ?? resolution.input))}
          disabled={busy}
        >
          {busy ? "Starting…" : "Looks good, find my partners"}
        </Button>
      </div>
    </div>
  );
}
