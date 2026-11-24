import { Bloom } from "../fx/bloom";
import { Grainient } from "../fx/grainient";

/** A full-page or in-panel empty state with a bloom and a soft gradient, so "nothing here yet" still feels designed. */
export function EmptyState({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="relative isolate mx-auto my-12 flex w-full max-w-2xl flex-col items-center gap-4 overflow-hidden rounded-card border border-hairline px-8 py-16 text-center">
      <Grainient tone="mist" className="-z-10" />
      <Bloom name="bloom-4" className="absolute -top-8 -left-8 -z-10 w-40 opacity-60" rotate={-20} />
      <Bloom name="petal-3" className="absolute right-12 bottom-8 -z-10 w-10 opacity-70" rotate={30} delay={2} />
      <h1 className="font-serif text-headline">{title}</h1>
      <p className="max-w-sm text-body text-stone">{body}</p>
      {children}
    </div>
  );
}
