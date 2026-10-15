import { APPETITE_LABELS, GOAL_LABELS, REACH_LABELS } from "@shared/constants";
import {
  APPETITE_OPTIONS,
  GOAL_IDS,
  REACH_OPTIONS,
  type AppetiteOption,
  type BusinessInput,
  type GoalId,
  type Goals,
  type ReachOption,
} from "@shared/types";
import { useState, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const DEFAULT_GOALS: Goals = { wants: [], reach: "local_and_brands", appetite: "medium", avoid: [] };

const GOAL_ACTIVE: Record<GoalId, string> = {
  footfall: "border-transparent bg-coral-soft text-ink",
  new_audience: "border-transparent bg-blue-soft text-ink",
  content: "border-transparent bg-[#efe6f7] text-ink",
  events: "border-transparent bg-[#d8f3ec] text-ink",
  bundles: "border-transparent bg-[#f3e8d4] text-ink",
  shared_costs: "border-transparent bg-[#d7eef7] text-ink",
  stockists: "border-transparent bg-coral-soft text-ink",
};

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
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [avoidDraft, setAvoidDraft] = useState("");
  const goals = input.goals ?? DEFAULT_GOALS;
  const activeCount =
    goals.wants.length +
    (goals.reach !== "local_and_brands" ? 1 : 0) +
    (goals.appetite !== "medium" ? 1 : 0) +
    goals.avoid.length;

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
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition",
          open ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:border-ink",
        )}
      >
        <span aria-hidden="true">{open ? "−" : "+"}</span>
        {open ? "Hide fine-tune" : "Fine-tune the search"}
        {!open && activeCount > 0 ? (
          <Badge tone="sky" className="min-h-6 px-2 py-0 text-[10px] font-bold text-ink">
            {activeCount} set
          </Badge>
        ) : null}
      </button>

      {open ? (
        <div className="mt-4 space-y-6 rounded-[20px] border border-line bg-paper p-4 sm:p-5">
          <Field
            title="Collaboration goals"
            hint="Pick up to 2"
            tone="coral"
            trailing={
              <Badge tone="coral" className="tabular min-h-7 px-2.5 py-0 font-bold">
                {goals.wants.length}/2
              </Badge>
            }
          >
            <div className="flex flex-wrap gap-2">
              {GOAL_IDS.map((id) => {
                const pressed = goals.wants.includes(id);
                const locked = !pressed && goals.wants.length >= 2;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={pressed}
                    disabled={locked}
                    onClick={() => toggleWant(id)}
                    className={cn(
                      "min-h-10 rounded-full border px-3.5 text-sm font-bold transition",
                      pressed && GOAL_ACTIVE[id],
                      !pressed && !locked && "border-line bg-paper text-ink hover:border-ink",
                      locked && "cursor-not-allowed border-line bg-surface text-ink-soft opacity-50",
                    )}
                  >
                    {GOAL_LABELS[id]}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field title="How far should Venn look?" hint="Search radius" tone="sky">
            <OptionRow
              label="Reach"
              value={goals.reach}
              activeClass="border-transparent bg-[#d7eef7] text-ink"
              options={REACH_OPTIONS.map((value) => ({ value, label: REACH_LABELS[value] }))}
              onChange={(value) => setGoals({ ...goals, reach: value })}
            />
          </Field>

          <Field title="Appetite for a collaboration" hint="How bold" tone="plum">
            <OptionRow
              label="Appetite"
              value={goals.appetite}
              activeClass="border-transparent bg-[#efe6f7] text-ink"
              options={APPETITE_OPTIONS.map((value) => ({ value, label: APPETITE_LABELS[value] }))}
              onChange={(value) => setGoals({ ...goals, appetite: value })}
            />
          </Field>

          <Field title="Avoid" hint="Partner types or names" tone="sand">
            <div className="rounded-2xl border border-line bg-surface/60 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {goals.avoid.map((item) => (
                  <span
                    key={item}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[#ffe3dd] px-3 text-xs font-bold text-ink"
                  >
                    {item}
                    <button
                      type="button"
                      aria-label={`Remove ${item}`}
                      onClick={() => removeAvoid(item)}
                      className="text-ink-soft hover:text-ink"
                    >
                      ×
                    </button>
                  </span>
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
                    className="min-h-9 min-w-[10rem] flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
                  />
                ) : null}
              </div>
            </div>
          </Field>

          <p className="rounded-2xl bg-[#d7eef7] px-3 py-2.5 text-xs leading-relaxed text-ink">
            Soft preferences only — they help break ties and write notes. They never change a partner&apos;s match score.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  title,
  hint,
  tone,
  trailing,
  children,
}: {
  title: string;
  hint: string;
  tone: BadgeTone;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-ink">{title}</p>
          <Badge tone={tone}>{hint}</Badge>
        </div>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function OptionRow<T extends string>({
  label,
  value,
  options,
  onChange,
  activeClass = "border-ink bg-ink text-paper",
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  activeClass?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-3">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-12 rounded-2xl border px-3 py-2.5 text-left text-sm font-bold transition",
              active ? activeClass : "border-line bg-paper text-ink hover:border-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
