import { AssetSlot } from "./asset-slot";
import { ASSETS } from "./assets";
import { Botanical } from "./botanical";
import { GoldArcs } from "./icons";
import { StartButton } from "./start-button";

export function LandingHero() {
  return (
    <section id="top" className="hp-hero" aria-labelledby="hp-hero-title">
      <div className="hp-hero__glow" aria-hidden />
      <div className="hp-hero__portrait">
        <AssetSlot asset={ASSETS.heroPortrait} priority sizes="(max-width: 767px) 100vw, 62vw" pose="profile" />
      </div>
      <GoldArcs className="hp-hero__arcs" />

      <Botanical assetId={ASSETS.peonyTL.id} className="hp-bot--hero-tl" rotate={160} strength={26} />
      <Botanical assetId={ASSETS.peonyTR.id} className="hp-bot--hero-tr" rotate={-30} strength={30} />
      <Botanical assetId={ASSETS.peonyBL.id} variant="bloom" className="hp-bot--hero-bl" rotate={20} strength={24} />
      <Botanical assetId="botanical-petal-04" variant="petal" className="hp-petal hp-petal--1" rotate={12} strength={16} drift />
      <Botanical assetId="botanical-petal-06" variant="petal" className="hp-petal hp-petal--2" rotate={-30} strength={16} drift />
      <Botanical assetId="botanical-petal-08" variant="leaf" className="hp-petal hp-petal--3" rotate={8} strength={14} drift />

      <div className="hp-hero__copy">
        <p className="hp-eyebrow hp-eyebrow--rule hp-enter" style={{ "--hp-delay": "80ms" } as React.CSSProperties}>
          Hairstyle discovery &amp; AI try-on
        </p>
        <h1 id="hp-hero-title" className="hp-display hp-enter" style={{ "--hp-delay": "160ms" } as React.CSSProperties}>
          Discover
          <br />
          your <em className="hp-shimmer">next</em>
          <br />
          hairstyle.
        </h1>
        <p className="hp-hero__lede hp-enter" style={{ "--hp-delay": "320ms" } as React.CSSProperties}>
          Browse cuts for every length and texture, then preview any of them on your own photo before you sit in the chair.
        </p>
        <ul className="hp-hero__steps hp-enter" style={{ "--hp-delay": "400ms" } as React.CSSProperties} aria-label="How it works">
          <li>Explore</li>
          <li>Try</li>
          <li>Transform</li>
        </ul>
        <div className="hp-hero__actions hp-enter" style={{ "--hp-delay": "500ms" } as React.CSSProperties}>
          <StartButton />
          <a href="#discover" className="hp-scrollcue">
            <span className="hp-scrollcue__mouse" aria-hidden>
              <span />
            </span>
            Scroll to explore
          </a>
        </div>
      </div>
    </section>
  );
}
