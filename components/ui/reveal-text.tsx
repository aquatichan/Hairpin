/** Headline that rises in word by word. Pure CSS, so it works before hydration and respects reduced motion. */
export function RevealText({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <span aria-label={text}>
      {text.split(" ").map((word, i) => (
        <span key={i} aria-hidden className="inline-block animate-rise whitespace-pre" style={{ animationDelay: `${delay + i * 70}ms` }}>
          {word}{" "}
        </span>
      ))}
    </span>
  );
}
