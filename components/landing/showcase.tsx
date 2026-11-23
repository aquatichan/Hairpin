import { AssetSlot } from "./asset-slot";
import { ASSETS, LOOKS } from "./assets";
import { Botanical } from "./botanical";
import { Reveal } from "./reveal";

// A spread of lengths and textures across the gallery references.
const PICKS = [LOOKS[3], LOOKS[1], LOOKS[6], LOOKS[7], LOOKS[9]];

export function Showcase() {
  return (
    <section id="showcase" className="hp-showcase" aria-labelledby="hp-showcase-title">
      <div className="hp-showcase__banner">
        <AssetSlot asset={ASSETS.editorialWide} sizes="100vw" silhouette={false} />
        <div className="hp-showcase__bannerfade" aria-hidden />
        <Botanical assetId="botanical-peony-bl" className="hp-bot--show-r" rotate={-18} flip strength={26} />
        <Botanical assetId="botanical-bloom-01" variant="bloom" className="hp-bot--show-m" rotate={24} strength={22} />
        <Botanical assetId="botanical-bloom-04" variant="bloom" className="hp-bot--show-s" rotate={-30} flip strength={18} />
        <Botanical assetId="botanical-petal-01" variant="petal" className="hp-petal hp-petal--s1" rotate={20} strength={14} drift />
        <Botanical assetId="botanical-petal-07" variant="petal" className="hp-petal hp-petal--s2" rotate={-40} strength={14} drift />
        <Reveal className="hp-showcase__copy">
          <p className="hp-eyebrow">The library</p>
          <h2 id="hp-showcase-title" className="hp-h2">
            Every length.
            <br />
            Every <em>texture.</em>
          </h2>
          <p className="hp-body">Straight, wavy, curly and coily — from close crops to long layers, styled for everyone. Filter by what your hair actually does.</p>
        </Reveal>
      </div>
      <Botanical assetId="botanical-bloom-03" variant="bloom" className="hp-bot--show-bl" rotate={-12} strength={20} />
      <Botanical assetId="botanical-peony-tl" className="hp-bot--show-br" rotate={150} flip strength={24} />
      <Botanical assetId="botanical-petal-08" variant="petal" className="hp-petal hp-petal--s3" rotate={12} strength={14} drift />
      <ul className="hp-showcase__row" aria-label="Range of references">
        {PICKS.map((l, i) => (
          <Reveal as="li" key={l.asset.id} delay={i * 70} className={`hp-showcase__item hp-showcase__item--${i}`}>
            <AssetSlot asset={l.asset} sizes="(max-width: 767px) 45vw, 20vw" />
            <p className="hp-showcase__label">
              <span>{l.texture}</span>
              <span>{l.length}</span>
            </p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
