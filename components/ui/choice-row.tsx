import { Chip } from "./chip";

/** A labelled single-choice row of chips. */
export function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  render?: (v: T) => string;
}) {
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      <p className="text-body text-stone">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o} selected={value === o} onClick={() => onChange(o)}>
            <span className={render ? "" : "capitalize"}>{render ? render(o) : o}</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}
