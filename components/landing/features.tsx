import { AssetSlot } from "./asset-slot";
import { ASSETS, LOOKS, TRANSFORMS, type LandingAsset } from "./assets";
import { Botanical } from "./botanical";
import { ArrowRight, BookmarkIcon } from "./icons";
import { Reveal } from "./reveal";

const FEATURES = [
  { key: "discover", title: "Discover", body: "Browse curated hairstyles and references by length and texture.", href: "#showcase", asset: ASSETS.featureDiscover },
  { key: "tryon", title: "Try-On", body: "Preview a style on your own photo with AI before you commit.", href: "#try-on", asset: ASSETS.featureTryon },
  { key: "brief", title: "Barber Brief", body: "Assemble an editable brief with reference images and clear notes.", href: "/brief", asset: ASSETS.featureBrief },
  { key: "boards", title: "Saved Boards", body: "Organize favorite looks and inspiration into boards.", href: "/saved", asset: ASSETS.featureBoards },
] as const;

export function Features() {
  return (
    <section id="features" className="hp-features" aria-labelledby="hp-features-title">
      <Reveal className="hp-features__intro">
        <h2 id="hp-features-title" className="hp-h2">
          More than
          <br />
          just a <em>hairstyle.</em>
        </h2>
        <p className="hp-body">Discover, visualize, and plan your next look — all in one place.</p>
        <span className="hp-rule" aria-hidden />
      </Reveal>
      <Botanical assetId="botanical-bloom-02" variant="bloom" className="hp-bot--feat-bl" rotate={-14} strength={20} />
      <Botanical assetId="botanical-petal-03" variant="petal" className="hp-petal hp-petal--f1" rotate={30} strength={14} drift />
      <Botanical assetId="botanical-bloom-04" variant="bloom" className="hp-bot--feat-br" rotate={28} flip strength={20} />
      <Botanical assetId="botanical-petal-06" variant="petal" className="hp-petal hp-petal--f2" rotate={-20} strength={14} drift />
      <ul className="hp-features__grid">
        {FEATURES.map((f, i) => (
          <Reveal as="li" key={f.key} delay={i * 90} className={`hp-feature hp-feature--${f.key}`}>
            <a href={f.href} className="hp-feature__link">
              <div className="hp-feature__art">
                <AssetSlot asset={f.asset} decorative silhouette={false} showTag={false} />
                <FeatureVignette kind={f.key} />
              </div>
              <div className="hp-feature__text">
                <h3 className="hp-h3">
                  {f.title}
                  <ArrowRight className="hp-icon hp-feature__arrow" />
                </h3>
                <p className="hp-small">{f.body}</p>
              </div>
            </a>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

const Photo = ({ asset }: { asset: LandingAsset }) => <AssetSlot asset={asset} decorative silhouette={false} showTag={false} sizes="220px" />;

/** CSS/SVG compositions that read as each feature even before artwork exists. */
function FeatureVignette({ kind }: { kind: (typeof FEATURES)[number]["key"] }) {
  if (kind === "discover") {
    return (
      <div className="hp-vig hp-vig--grid" aria-hidden>
        {LOOKS.slice(0, 6).map((l) => (
          <span key={l.asset.id} className="hp-vig__tile">
            <Photo asset={l.asset} />
          </span>
        ))}
      </div>
    );
  }
  if (kind === "tryon") {
    return (
      <div className="hp-vig hp-vig--split" aria-hidden>
        <span className="hp-vig__half">
          <Photo asset={TRANSFORMS[0].before} />
        </span>
        <span className="hp-vig__half hp-vig__half--after">
          <Photo asset={TRANSFORMS[0].after} />
        </span>
        <span className="hp-vig__seam" />
      </div>
    );
  }
  if (kind === "brief") {
    return (
      <div className="hp-vig hp-vig--brief" aria-hidden>
        <span className="hp-vig__note">
          <span className="hp-vig__notehead">Barber Brief</span>
          <span>Textured fringe</span>
          <span>Low taper, #2 sides</span>
          <span>Natural matte finish</span>
        </span>
        <span className="hp-vig__thumb">
          <Photo asset={LOOKS[4].asset} />
        </span>
      </div>
    );
  }
  return (
    <div className="hp-vig hp-vig--boards" aria-hidden>
      {[LOOKS[1], LOOKS[0], LOOKS[5]].map((l, i) => (
        <span key={l.asset.id} className={`hp-vig__pin hp-vig__pin--${i}`}>
          <Photo asset={l.asset} />
        </span>
      ))}
      <span className="hp-vig__save">
        <BookmarkIcon />
      </span>
    </div>
  );
}
