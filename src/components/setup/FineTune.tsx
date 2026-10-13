import { PARTNER_KINDS, type BusinessInput, type Goals, type PartnerKind } from "@shared/types";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Segmented } from "@/components/ui/Segmented";
import { KIND_META } from "@/lib/kinds";

const BUDGET_OPTIONS: { value: NonNullable<Goals["budget"]>; label: string }[] = [
  { value: "low", label: "Low-key" },
  { value: "medium", label: "Middle of the road" },
  { value: "flexible", label: "Flexible" },
];

function cleanGoals(goals: Goals): Goals | undefined {
  const next: Goals = {};
  if (goals.preferLocal) next.preferLocal = true;
  if (goals.preferSurprising) next.preferSurprising = true;
  if (goals.budget) next.budget = goals.budget;
  if (goals.avoidKinds && goals.avoidKinds.length > 0) next.avoidKinds = goals.avoidKinds;
  if (goals.notes && goals.notes.trim().length > 0) next.notes = goals.notes;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function FineTune({
  input,
  onChange,
}: {
  input: BusinessInput;
  onChange: (input: BusinessInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const goals = input.goals ?? {};

  const setGoals = (next: Goals) => {
    onChange({ ...input, goals: cleanGoals(next) });
  };

  const toggleAvoid = (kind: PartnerKind) => {
    const current = new Set(goals.avoidKinds ?? []);
    if (current.has(kind)) current.delete(kind);
    else current.add(kind);
    setGoals({ ...goals, avoidKinds: [...current] });
  };

  return (
    <section className="rounded-2xl border border-line">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Fine-tune (optional)
        <span className="text-ink-soft">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="space-y-4 px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            <Chip pressed={Boolean(goals.preferLocal)} onClick={() => setGoals({ ...goals, preferLocal: !goals.preferLocal })}>
              Prefer local partners
            </Chip>
            <Chip
              pressed={Boolean(goals.preferSurprising)}
              onClick={() => setGoals({ ...goals, preferSurprising: !goals.preferSurprising })}
            >
              Prefer surprising wildcards
            </Chip>
          </div>
          <div>
            <p className="mb-2 text-xs tracking-wide text-ink-soft">Budget feel</p>
            <Segmented
              value={goals.budget ?? "flexible"}
              onChange={(value) => setGoals({ ...goals, budget: value })}
              options={BUDGET_OPTIONS}
              label="Budget feel"
            />
          </div>
          <div>
            <p className="mb-2 text-xs tracking-wide text-ink-soft">Avoid these partner types</p>
            <div className="flex flex-wrap gap-2">
              {PARTNER_KINDS.map((kind) => (
                <Chip key={kind} pressed={(goals.avoidKinds ?? []).includes(kind)} onClick={() => toggleAvoid(kind)}>
                  {KIND_META[kind].label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-xs tracking-wide text-ink-soft" htmlFor="fine-tune-notes">
              Notes for Venn (optional)
            </label>
            <textarea
              id="fine-tune-notes"
              value={goals.notes ?? ""}
              onChange={(event) => setGoals({ ...goals, notes: event.target.value })}
              placeholder="e.g. keep it low-key, no big chains"
              maxLength={200}
              rows={2}
              className="w-full resize-none rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm outline-none"
            />
          </div>
          <p className="text-xs text-ink-soft">
            These are soft preferences — Venn uses them to break ties between close matches and flag notes. They never change a
            partner's match score.
          </p>
        </div>
      ) : null}
    </section>
  );
}
