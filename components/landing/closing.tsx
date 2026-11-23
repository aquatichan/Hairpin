import { ASSETS } from "./assets";
import { Botanical } from "./botanical";
import { GoldArcs } from "./icons";
import { Reveal } from "./reveal";
import { StartButton } from "./start-button";

export function Closing() {
  return (
    <section className="hp-closing" aria-labelledby="hp-closing-title">
      <GoldArcs variant="closing" className="hp-closing__arcs" />
      <Botanical assetId={ASSETS.peonyBL.id} className="hp-bot--close-bl" rotate={10} strength={26} />
      <Botanical assetId={ASSETS.peonyBR.id} variant="bloom" className="hp-bot--close-br" rotate={-160} strength={28} flip />
      <Botanical assetId="botanical-bloom-01" variant="bloom" className="hp-bot--close-tl" rotate={160} strength={20} />
      <Botanical assetId="botanical-bloom-02" variant="bloom" className="hp-bot--close-tr" rotate={-150} flip strength={20} />
      <Botanical assetId="botanical-petal-02" variant="petal" className="hp-petal hp-petal--4" rotate={20} strength={14} drift />
      <Reveal className="hp-closing__copy">
        <h2 id="hp-closing-title" className="hp-display hp-display--sm">
          Your <em>next look</em>
          <br />
          starts here.
        </h2>
        <StartButton label="Start exploring" />
      </Reveal>
    </section>
  );
}
