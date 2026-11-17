/** Inline status line. `tone="error"` is announced to screen readers immediately. */
export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: React.ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-card border px-4 py-3 text-body ${tone === "error" ? "border-ivory text-ivory" : "border-hairline text-stone"}`}>
      {children}
    </p>
  );
}
