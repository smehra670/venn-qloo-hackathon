export function AmbientCircles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="ambient-circle absolute -left-24 top-10 h-[420px] w-[420px] rounded-full bg-coral/25 blur-3xl" />
      <div className="ambient-circle absolute right-[-80px] top-24 h-[460px] w-[460px] rounded-full bg-blue/20 blur-3xl" />
      <div className="ambient-circle absolute bottom-[-120px] left-1/3 h-[380px] w-[380px] rounded-full bg-plum/15 blur-3xl" />
      <div className="ambient-circle absolute left-1/4 top-1/2 h-[240px] w-[240px] rounded-full bg-coral/10 blur-2xl" />
    </div>
  );
}
