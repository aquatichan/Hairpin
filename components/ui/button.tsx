import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-linear-to-b/oklch from-champagne-light via-champagne to-champagne-deep/90 text-onyx shadow-[inset_0_1px_0_#fff0d2a0,0_8px_24px_-12px_var(--color-champagne)] hover:brightness-110",
  secondary: "bg-ivory text-onyx hover:bg-ivory/90",
  ghost: "border border-hairline bg-onyx/40 text-ivory backdrop-blur-sm hover:border-champagne/40 hover:bg-graphite",
};

/** One size, one shape. Do not add size props; change the token instead. */
export const buttonClass = (variant: Variant = "primary") =>
  `inline-flex h-12 items-center justify-center gap-3 rounded-full px-6 text-body font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-light press ripple-host disabled:pointer-events-none disabled:opacity-50 ${variants[variant]}`;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`${buttonClass(variant)} ${className}`} {...props} />;
}
