import * as Slider from "@radix-ui/react-slider";

export function SurpriseSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="w-44">
      <div className="mb-2 flex items-center justify-between text-xs text-ink-soft">
        <span>Safe fits</span>
        <span>Wildcards</span>
      </div>
      <Slider.Root
        value={[value]}
        min={0}
        max={1}
        step={0.01}
        onValueChange={(next) => {
          const first = next[0];
          if (first !== undefined) onChange(first);
        }}
        className="relative flex h-5 w-full touch-none items-center"
        aria-label="Surprise"
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-gradient-to-r from-coral to-blue">
          <Slider.Range className="absolute h-full rounded-full bg-transparent" />
        </Slider.Track>
        <Slider.Thumb className="block h-4 w-4 rounded-full border border-line bg-card shadow-soft" />
      </Slider.Root>
    </div>
  );
}
