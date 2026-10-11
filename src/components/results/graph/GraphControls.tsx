import { Minus, Plus, RotateCcw } from "lucide-react";

export function GraphControls({
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  const item = "grid h-9 w-9 place-items-center rounded-full bg-card text-ink shadow-soft";
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
      <button type="button" className={item} aria-label="Zoom in" onClick={onZoomIn}>
        <Plus size={16} />
      </button>
      <button type="button" className={item} aria-label="Zoom out" onClick={onZoomOut}>
        <Minus size={16} />
      </button>
      <button type="button" className={item} aria-label="Reset view" onClick={onReset}>
        <RotateCcw size={16} />
      </button>
    </div>
  );
}
