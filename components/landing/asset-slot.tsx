import Image from "next/image";
import type { Hair, LandingAsset } from "./assets";

/**
 * One image position on the landing page. Renders the production image when the
 * asset is marked ready, otherwise a designed placeholder: a warm studio glow,
 * a rim-lit head-and-shoulders silhouette, and the manifest ID in small type.
 */
export function AssetSlot({
  asset,
  className = "",
  sizes = "100vw",
  priority = false,
  silhouette = true,
  // Manifest IDs are a development aid only; production placeholders stay clean.
  showTag = process.env.NODE_ENV === "development",
  pose = "front",
  decorative = false,
}: {
  asset: LandingAsset;
  className?: string;
  sizes?: string;
  priority?: boolean;
  silhouette?: boolean;
  showTag?: boolean;
  pose?: "front" | "profile";
  decorative?: boolean;
}) {
  const label = decorative || !asset.alt ? undefined : asset.alt;
  if (asset.ready) {
    return (
      <div
        className={`hp-slot ${className}`}
        data-asset-id={asset.id}
        style={{ "--hp-focal": asset.focal, "--hp-focal-m": asset.focalMobile, "--hp-fit": asset.fit } as React.CSSProperties}
      >
        <Image className="hp-slot__img" src={asset.path} alt={label ?? ""} fill sizes={sizes} priority={priority} />
      </div>
    );
  }
  return (
    <div
      className={`hp-slot hp-slot--placeholder ${className}`}
      data-asset-id={asset.id}
      {...(label ? { role: "img", "aria-label": `${label} (placeholder)` } : { "aria-hidden": true })}
    >
      {silhouette && <Silhouette hair={asset.hair ?? "short"} pose={pose} />}
      {showTag && <span className="hp-slot__tag">{asset.id}</span>}
    </div>
  );
}

/* ---------- silhouette ---------- */

// Deterministic curl clusters, so server and client render identical markup.
function ring(cx: number, cy: number, rx: number, ry: number, n: number, r: number, from = 180, to = 360) {
  return Array.from({ length: n }, (_, i) => {
    const t = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180;
    const jitter = ((i * 37) % 7) - 3;
    return { x: +(cx + Math.cos(t) * rx).toFixed(1), y: +(cy + Math.sin(t) * ry).toFixed(1), r: r + jitter * 0.6 };
  });
}

const HAIR: Record<Hair, { back?: React.ReactNode; front: React.ReactNode }> = {
  short: {
    front: <path d="M97 172c-6-52 22-80 55-80 36 0 60 26 52 80-6-26-24-40-52-40-30 0-47 14-55 40Z" />,
  },
  crop: {
    front: <path d="M98 168c-4-48 20-74 54-74 34 0 58 24 52 74-4-14-10-22-18-28-6 4-20 6-34 6-16 0-30-4-38-10-8 8-14 18-16 32Z" />,
  },
  curly: {
    front: (
      <>
        <ellipse cx="152" cy="128" rx="60" ry="44" />
        {[...ring(152, 140, 66, 52, 13, 15), ...ring(152, 132, 44, 34, 8, 13)].map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={c.r} />
        ))}
      </>
    ),
  },
  coily: {
    back: <ellipse cx="152" cy="146" rx="96" ry="88" />,
    front: (
      <>
        {ring(152, 148, 92, 84, 18, 12, 160, 380).map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={c.r} />
        ))}
      </>
    ),
  },
  long: {
    back: <path d="M88 178c-6-66 26-92 64-92s72 26 64 92l12 150c-18 14-40 10-50-14l-8-40h-36l-8 40c-10 24-32 28-50 14l12-150Z" />,
    front: <path d="M96 176c-2-50 24-78 56-78 34 0 60 24 58 78-14-30-34-44-58-46-10 18-34 34-56 46Z" />,
  },
  wavy: {
    back: <path d="M90 180c-8-62 24-88 62-88s70 26 62 88c4 22 14 40 6 60-12 6-22-2-26-12l-6-30H116l-6 30c-4 10-14 18-26 12-8-20 2-38 6-60Z" />,
    front: <path d="M96 172c-2-48 24-74 56-74s60 24 56 74c-10-18-20-26-34-30 4 10 2 18-4 24-6-16-22-26-44-26-14 8-24 18-30 32Z" />,
  },
  straight: {
    back: <path d="M92 176c-4-60 26-86 60-86s66 26 60 86v74h-28l-4-40h-56l-4 40H92Z" />,
    front: <path d="M96 172c0-46 24-72 56-72s58 26 56 72l-6-2c-2-18-6-26-14-32H120c-10 8-14 18-16 34Z" />,
  },
  bun: {
    front: (
      <>
        <circle cx="152" cy="80" r="26" />
        <path d="M98 170c-4-50 22-76 54-76s58 26 54 76c-8-28-28-42-54-42s-46 14-54 42Z" />
      </>
    ),
  },
};

export function Silhouette({ hair, pose = "front" }: { hair: Hair; pose?: "front" | "profile" }) {
  const h = HAIR[hair];
  return (
    <svg className="hp-silhouette" viewBox="0 0 300 400" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <g transform={pose === "profile" ? "translate(300 0) scale(-1 1) rotate(-4 150 200)" : undefined}>
        <g fill="url(#hp-hair)">{h.back}</g>
        <path d="M24 400c8-62 52-92 128-96 76 4 120 34 128 96Z" fill="url(#hp-body)" />
        <path d="M132 236h40v74c-12 8-28 8-40 0Z" fill="url(#hp-skin)" />
        <ellipse cx="152" cy="184" rx="52" ry="66" fill="url(#hp-skin)" />
        <g fill="url(#hp-hair)">{h.front}</g>
        {/* rim light */}
        <path d="M204 160c6 36-2 72-30 92M24 400c8-62 52-92 128-96" fill="none" stroke="url(#hp-rim)" strokeWidth="1.4" opacity=".7" />
      </g>
    </svg>
  );
}

/** Shared SVG paint servers, rendered once per page and referenced by id. */
export function LandingDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        <linearGradient id="hp-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2c1d" />
          <stop offset=".6" stopColor="#1a130c" />
          <stop offset="1" stopColor="#0d0a07" />
        </linearGradient>
        <linearGradient id="hp-skin" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a3726" />
          <stop offset=".55" stopColor="#24190f" />
          <stop offset="1" stopColor="#120d08" />
        </linearGradient>
        <linearGradient id="hp-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e1710" />
          <stop offset="1" stopColor="#0a0806" />
        </linearGradient>
        <linearGradient id="hp-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e4c58d" stopOpacity="0" />
          <stop offset=".5" stopColor="#e4c58d" />
          <stop offset="1" stopColor="#c9a46a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="hp-petal" cx=".5" cy=".9" r=".9">
          <stop offset="0" stopColor="#f1d9a8" />
          <stop offset=".45" stopColor="#c9a46a" />
          <stop offset="1" stopColor="#5a4128" />
        </radialGradient>
        <linearGradient id="hp-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9b679" />
          <stop offset=".6" stopColor="#80603d" />
          <stop offset="1" stopColor="#3a2a19" />
        </linearGradient>
        <linearGradient id="hp-arc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c9a46a" stopOpacity="0" />
          <stop offset=".45" stopColor="#e4c58d" stopOpacity=".85" />
          <stop offset="1" stopColor="#c9a46a" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
