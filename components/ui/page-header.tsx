import { LogoMark } from "./logo";

/**
 * Heading for app routes: an eyebrow with the monogram, a big serif title (use <em className="accent-word"> for the gold
 * italic word), a short intro and a slot for actions.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  as: Tag = "h1",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex max-w-3xl flex-col gap-3">
        {eyebrow && (
          <p className="flex items-center gap-3 text-caption font-medium tracking-[0.28em] text-champagne uppercase">
            <LogoMark className="size-5" />
            {eyebrow}
            <span aria-hidden className="h-px w-12 bg-linear-to-r/oklch from-champagne/60 to-transparent" />
          </p>
        )}
        <Tag className="font-serif text-display leading-[1.02] text-balance">{title}</Tag>
        {description && <p className="max-w-2xl text-lead text-stone">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </header>
  );
}
