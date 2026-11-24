export function Chip({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`press ripple-host h-9 shrink-0 rounded-full border px-4 text-body font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-light ${
        selected ? "border-champagne bg-linear-to-b/oklch from-champagne-light to-champagne text-onyx" : "border-hairline bg-graphite text-stone hover:border-stone/50 hover:text-ivory"
      }`}
    >
      {children}
    </button>
  );
}
