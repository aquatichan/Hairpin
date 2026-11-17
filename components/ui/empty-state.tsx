export function EmptyState({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-serif text-headline">{title}</h1>
      <p className="max-w-sm text-body text-stone">{body}</p>
      {children}
    </div>
  );
}
