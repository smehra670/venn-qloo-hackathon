import { APPETITE_LABELS, GOAL_LABELS, REACH_LABELS } from "@shared/constants";
import { APPETITE_OPTIONS, GOAL_IDS, REACH_OPTIONS, type AppetiteOption, type BusinessInput, type GoalId, type Goals, type ReachOption } from "@shared/types";
import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Segmented } from "@/components/ui/Segmented";

const DEFAULT_GOALS: Goals = { wants: [], reach: "local_and_brands", appetite: "medium", avoid: [] };

function cleanGoals(goals: Goals): Goals | undefined {
  const isDefault =
    goals.wants.length === 0 && goals.reach === "local_and_brands" && goals.appetite === "medium" && goals.avoid.length === 0;
  return isDefault ? undefined : goals;
}

export function FineTune({
  input,
  onChange,
}: {
  input: BusinessInput;
  onChange: (input: BusinessInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [avoidDraft, setAvoidDraft] = useState("");
  const goals = input.goals ?? DEFAULT_GOALS;

  const setGoals = (next: Goals) => {
    onChange({ ...input, goals: cleanGoals(next) });
  };

  const toggleWant = (id: GoalId) => {
    if (goals.wants.includes(id)) {
      setGoals({ ...goals, wants: goals.wants.filter((item) => item !== id) });
      return;
    }
    if (goals.wants.length >= 2) return;
    setGoals({ ...goals, wants: [...goals.wants, id] });
  };

  const addAvoid = (raw: string) => {
    const value = raw.trim();
    setAvoidDraft("");
    if (!value || goals.avoid.length >= 10) return;
    if (goals.avoid.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setGoals({ ...goals, avoid: [...goals.avoid, value] });
  };

  const removeAvoid = (value: string) => setGoals({ ...goals, avoid: goals.avoid.filter((item) => item !== value) });

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
          <div>
            <p className="mb-2 text-xs tracking-wide text-ink-soft">What do you want from a collaboration? (up to 2)</p>
            <div className="flex flex-wrap gap-2">
              {GOAL_IDS.map((id) => (
                <Chip key={id} pressed={goals.wants.includes(id)} onClick={() => toggleWant(id)}>
                  {GOAL_LABELS[id]}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs tracking-wide text-ink-soft">How far should Venn look?</p>
            <Segmented
              value={goals.reach}
              onChange={(value: ReachOption) => setGoals({ ...goals, reach: value })}
              options={REACH_OPTIONS.map((value) => ({ value, label: REACH_LABELS[value] }))}
              label="Reach"
            />
          </div>
          <div>
            <p className="mb-2 text-xs tracking-wide text-ink-soft">Appetite for a collaboration</p>
            <Segmented
              value={goals.appetite}
              onChange={(value: AppetiteOption) => setGoals({ ...goals, appetite: value })}
              options={APPETITE_OPTIONS.map((value) => ({ value, label: APPETITE_LABELS[value] }))}
              label="Appetite"
            />
          </div>
          <div>
            <p className="mb-2 text-xs tracking-wide text-ink-soft">Avoid (partner types or names)</p>
            <div className="flex flex-wrap items-center gap-2">
              {goals.avoid.map((item) => (
                <Chip key={item} onRemove={() => removeAvoid(item)}>
                  {item}
                </Chip>
              ))}
              {goals.avoid.length < 10 ? (
                <input
                  value={avoidDraft}
                  aria-label="Something to avoid"
                  onChange={(event) => setAvoidDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addAvoid(avoidDraft);
                    }
                  }}
                  onBlur={() => {
                    if (avoidDraft.trim()) addAvoid(avoidDraft);
                  }}
                  placeholder="e.g. fitness, big chains"
                  className="min-w-28 rounded-full border border-line bg-paper-2 px-3 py-1 text-sm outline-none"
                />
              ) : null}
            </div>
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
