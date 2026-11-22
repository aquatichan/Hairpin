import Link from "next/link";
import { HairpinMark } from "./icons";

// Only routes that exist in the app.
const PRODUCT = [
  { href: "/discover", label: "Discover" },
  { href: "/try", label: "Try-On" },
  { href: "/brief", label: "Barber Brief" },
  { href: "/saved", label: "Saved Boards" },
];

const LEGAL = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
];

export function LandingFooter() {
  return (
    <footer className="hp-footer">
      <div className="hp-footer__inner">
        <div>
          <p className="hp-wordmark">
            <HairpinMark />
            Hairpin
          </p>
          <p className="hp-small">Hairstyle discovery and AI try-on.</p>
        </div>
        <nav aria-label="Product">
          <ul className="hp-footer__links">
            {PRODUCT.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="hp-footer__bottom">
        <p className="hp-footer__copy">© Hairpin</p>
        <nav aria-label="Legal">
          <ul className="hp-footer__legal">
            {LEGAL.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
