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
      className={`h-8 shrink-0 rounded-full px-4 text-body font-medium transition-colors duration-200 ease-out ${
        selected ? "bg-ivory text-onyx" : "bg-graphite text-stone hover:text-ivory"
      }`}
    >
      {children}
    </button>
  );
}
