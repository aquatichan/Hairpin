import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-champagne text-onyx hover:opacity-90",
  secondary: "bg-ivory text-onyx hover:opacity-90",
  ghost: "border border-hairline text-ivory hover:bg-slate",
};

/** One size, one shape. Do not add size props; change the token instead. */
export const buttonClass = (variant: Variant = "primary") =>
  `inline-flex h-12 items-center justify-center gap-3 rounded-full px-6 text-body font-medium transition-opacity duration-200 ease-out disabled:opacity-50 ${variants[variant]}`;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`${buttonClass(variant)} ${className}`} {...props} />;
}
