/**
 * A soft, slowly drifting gradient with film grain over it (a React Bits-style "Grainient", in CSS so it costs almost
 * nothing). Fill a positioned parent with it. Variants set the palette; reduced motion freezes the drift.
 */
export type GrainientTone = "gold" | "ember" | "mist";

export function Grainient({ tone = "gold", className = "", grain = true }: { tone?: GrainientTone; className?: string; grain?: boolean }) {
  return (
    <div aria-hidden className={`gr gr--${tone} pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <span className="gr__a" />
      <span className="gr__b" />
      <span className="gr__c" />
      {grain && <span className="gr__grain" />}
    </div>
  );
}
