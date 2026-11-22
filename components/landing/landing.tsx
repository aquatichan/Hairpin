import { LandingDefs } from "./asset-slot";
import { Closing } from "./closing";
import { DiscoveryCarousel } from "./discovery-carousel";
import { Features } from "./features";
import { display } from "./fonts";
import { LandingFooter } from "./footer";
import { LandingHero } from "./hero";
import { LandingNav } from "./landing-nav";
import { Showcase } from "./showcase";
import { Transformation } from "./transformation";
import "./landing.css";

/** The public landing page: a sequence of editorial chapters. */
export function Landing() {
  return (
    <div className={`hp ${display.variable}`}>
      <LandingDefs />
      <a href="#hp-main" className="hp-skip">
        Skip to content
      </a>
      <LandingNav />
      <main id="hp-main">
        <LandingHero />
        <DiscoveryCarousel />
        <Features />
        <Showcase />
        <Transformation />
        <Closing />
      </main>
      <LandingFooter />
      <div className="hp-grain" aria-hidden data-asset-id="texture-dark-grain-01" />
    </div>
  );
}
