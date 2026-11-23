import "./landing.css";
import Link from "next/link";
import { display } from "./fonts";
import { LandingFooter } from "./footer";
import { HairpinMark } from "./icons";

/** Contact for legal requests. Replace before launch. */
export const LEGAL_CONTACT = "aaronhanqin@gmail.com";
export const LEGAL_UPDATED = "November 22, 2026";

/** Shared frame for the privacy policy and terms of service. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`hp ${display.variable}`}>
      <header className="hp-legal-nav">
        <Link href="/" className="hp-wordmark" aria-label="Hairpin, back to home">
          <HairpinMark />
          Hairpin
        </Link>
        <Link href="/">Back to home</Link>
      </header>
      <main className="hp-legal">
        <div className="hp-legal__head">
          <p className="hp-eyebrow hp-eyebrow--rule">Legal</p>
          <h1 className="hp-display hp-display--sm">{title}</h1>
          <p className="hp-small">Last updated {LEGAL_UPDATED}</p>
        </div>
        <div className="hp-prose">{children}</div>
      </main>
      <LandingFooter />
    </div>
  );
}
