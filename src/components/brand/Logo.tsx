export function Logo({ wordmark = true }: { wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <svg width="28" height="20" viewBox="0 0 64 40" aria-hidden="true">
        <circle cx="22" cy="20" r="14" fill="#FF6B57" fillOpacity="0.8" />
        <circle cx="42" cy="20" r="14" fill="#4F5BFF" fillOpacity="0.8" />
        <clipPath id="logo-lens">
          <circle cx="22" cy="20" r="14" />
        </clipPath>
        <circle cx="42" cy="20" r="14" fill="#6B3FA0" fillOpacity="0.75" clipPath="url(#logo-lens)" />
      </svg>
      {wordmark ? <span className="font-serif text-xl tracking-tight">Venn</span> : null}
    </span>
  );
}
