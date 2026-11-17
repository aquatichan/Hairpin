import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Procedural low-poly mannequin head and hairstyles. Everything is generated
 * in code, so there are no model files to download: the whole scene is a few
 * thousand triangles and runs comfortably on phones.
 */

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const hash = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Maps a point on the unit sphere to the head surface. `taper` narrows the jaw. */
function shape(v: THREE.Vector3, taper: number) {
  const t = smooth(0.15, -1, v.y);
  // Eye line: a shallow shelf under the brow so the face reads as a face.
  const eyes = taper * smooth(0.45, 0.8, v.z) * smooth(-0.12, 0.05, v.y) * smooth(0.36, 0.2, v.y);
  v.x *= 0.84 * (1 - 0.42 * taper * t);
  v.z *= (v.z > 0 ? 0.94 : 1.06) * (1 - 0.18 * taper * t);
  v.z += 0.16 * taper * t - 0.09 * eyes;
  v.y *= 1.24;
  return v;
}

function plain(g: THREE.BufferGeometry) {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute("uv");
  out.deleteAttribute("normal");
  return out;
}

type Keep = (x: number, y: number, z: number) => boolean;

/** A head-shaped shell, kept only where `keep` is true (in unit-sphere space). */
function shell(opts: { scale: number; taper: number; jitter?: number; detail?: number; keep: Keep }) {
  const src = plain(new THREE.IcosahedronGeometry(1, opts.detail ?? 2));
  const pos = src.getAttribute("position");
  const out: number[] = [];
  const a = new THREE.Vector3();
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < pos.count; i += 3) {
    a.set(0, 0, 0);
    for (let k = 0; k < 3; k++) a.add(tri[k].fromBufferAttribute(pos, i + k));
    a.divideScalar(3);
    if (!opts.keep(a.x, a.y, a.z)) continue;
    for (let k = 0; k < 3; k++) {
      const v = tri[k];
      const j = 1 + (opts.jitter ?? 0) * (hash(v.x, v.y, v.z) - 0.5);
      shape(v, opts.taper).multiplyScalar(opts.scale * j);
      out.push(v.x, v.y, v.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  return g;
}

function blob(opts: {
  radius: number;
  scale?: [number, number, number];
  at: [number, number, number];
  tilt?: number;
  jitter?: number;
  detail?: number;
  keep?: Keep;
}) {
  const g = plain(new THREE.IcosahedronGeometry(opts.radius, opts.detail ?? 1));
  const pos = g.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + (opts.jitter ?? 0.12) * (hash(v.x, v.y, v.z) - 0.5));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  if (opts.scale) g.scale(...opts.scale);
  if (opts.tilt) g.rotateX(opts.tilt);
  g.translate(...opts.at);
  if (!opts.keep) return g;
  const kept: number[] = [];
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    if (!opts.keep(cx, cy, cz)) continue;
    for (let k = 0; k < 3; k++) kept.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(kept, 3));
  return out;
}

function finish(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts.map(plain));
  g.computeVertexNormals();
  return g;
}

// Hairlines, in unit-sphere space: higher at the forehead, lower at the nape.
const cropLine: Keep = (_x, y, z) => y > -0.42 + (z + 1) * 0.6;
const bowlLine: Keep = (_x, y, z) => y > (z > 0.45 ? 0.42 : 0.12);
const curtain = (bottom: number): Keep => (x, y, z) =>
  z > 0.38 ? y > 0.62 || (Math.abs(x) > 0.62 && y > bottom) : y > bottom;

const crop = (scale = 1.045, jitter = 0.03) => shell({ scale, taper: 1, jitter, keep: cropLine });

export function buildHead() {
  const skull = shell({ scale: 1, taper: 1, keep: () => true });
  const neck = new THREE.CylinderGeometry(0.44, 0.58, 1.0, 8).translate(0, -1.3, -0.14);
  const bust = blob({ radius: 1, scale: [2.0, 0.8, 0.95], at: [0, -2.3, -0.18], jitter: 0, detail: 2, keep: (_x, y) => y > -2.5 });
  const nose = new THREE.ConeGeometry(0.13, 0.36, 4).rotateX(0.5).translate(0, -0.08, 0.99);
  const earL = blob({ radius: 0.2, scale: [0.4, 1, 0.75], at: [-0.84, -0.05, -0.02], jitter: 0, detail: 0 });
  const earR = earL.clone().scale(-1, 1, 1);
  // Mirroring flips the winding, so flip it back.
  const p = earR.getAttribute("position");
  for (let i = 0; i < p.count; i += 3) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    p.setXYZ(i, p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1));
    p.setXYZ(i + 1, x, y, z);
  }
  return finish([skull, neck, bust, nose, earL, earR]);
}

export type HairStyle = { id: string; name: string; length: "short" | "medium" | "long"; texture: "straight" | "wavy" | "curly" | "coily"; build: () => THREE.BufferGeometry };

function spikes(count: number, height: number, from: number, to: number) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = from + ((to - from) * i) / (count - 1);
    const cone = new THREE.ConeGeometry(0.2, height, 4).scale(0.5, 1, 1.25).translate(0, height / 2, 0);
    cone.rotateX(a).translate(0, Math.cos(a) * 1.24, Math.sin(a) * 0.98);
    parts.push(cone);
  }
  return parts;
}

function curls(count: number, size: number, keep: Keep, lift: number, seed: number) {
  const rand = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  const v = new THREE.Vector3();
  let guard = 0;
  while (parts.length < count && guard++ < 4000) {
    v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 0.05) continue;
    v.normalize();
    if (!keep(v.x, v.y, v.z)) continue;
    shape(v, 0.6).multiplyScalar(lift);
    parts.push(blob({ radius: size * (0.75 + rand() * 0.5), at: [v.x, v.y, v.z], detail: 0, jitter: 0.2 }));
  }
  return parts;
}

export const hairStyles: HairStyle[] = [
  { id: "buzz", name: "Buzz cut", length: "short", texture: "straight", build: () => finish([crop(1.03, 0.015)]) },
  {
    id: "quiff",
    name: "Textured quiff",
    length: "short",
    texture: "wavy",
    build: () => finish([crop(), blob({ radius: 0.62, scale: [0.85, 0.62, 1.05], at: [0, 1.32, 0.42], tilt: -0.35, jitter: 0.3 })]),
  },
  {
    id: "bob",
    name: "Blunt bob",
    length: "medium",
    texture: "straight",
    build: () => finish([shell({ scale: 1.15, taper: 0.15, jitter: 0.03, keep: curtain(-0.72) })]),
  },
  {
    id: "afro",
    name: "Rounded afro",
    length: "medium",
    texture: "coily",
    build: () =>
      finish([
        crop(),
        blob({ radius: 1.5, at: [0, 0.55, -0.12], detail: 2, jitter: 0.14, keep: (x, y, z) => !(z > 0.15 && y < 0.72 && Math.abs(x) < 0.95) && y > -0.7 }),
      ]),
  },
  { id: "mohawk", name: "Mohawk", length: "short", texture: "straight", build: () => finish([crop(1.03, 0.015), ...spikes(7, 0.85, 0.75, -1.25)]) },
  {
    id: "long",
    name: "Long layers",
    length: "long",
    texture: "straight",
    build: () =>
      finish([
        shell({ scale: 1.13, taper: 0.1, jitter: 0.03, keep: curtain(-0.2) }),
        blob({ radius: 1, scale: [1.02, 1.5, 0.95], at: [0, -0.95, -0.22], jitter: 0.1, detail: 2, keep: (x, y, z) => z < 0.12 && y < 0.2 && y > -2.2 }),
      ]),
  },
  {
    id: "topknot",
    name: "Top knot",
    length: "long",
    texture: "straight",
    build: () => finish([crop(1.06), blob({ radius: 0.4, at: [0, 1.62, -0.28], jitter: 0.2 })]),
  },
  {
    id: "curls",
    name: "Loose curls",
    length: "medium",
    texture: "curly",
    build: () => finish([crop(), ...curls(46, 0.3, (_x, y, z) => y > -0.5 + (z + 1) * 0.55, 1.14, 7)]),
  },
  {
    id: "bowl",
    name: "Bowl cut",
    length: "short",
    texture: "straight",
    build: () => finish([shell({ scale: 1.13, taper: 0.1, jitter: 0.02, keep: bowlLine })]),
  },
  {
    id: "sidepart",
    name: "Side part",
    length: "short",
    texture: "straight",
    build: () => finish([crop(), blob({ radius: 0.6, scale: [0.95, 0.42, 1.3], at: [0.22, 1.2, 0.12], tilt: -0.12, jitter: 0.18 })]),
  },
  {
    id: "fauxhawk",
    name: "Faux hawk",
    length: "short",
    texture: "wavy",
    build: () => finish([crop(1.06, 0.05), blob({ radius: 0.5, scale: [0.5, 0.75, 1.9], at: [0, 1.22, -0.05], jitter: 0.35, detail: 1 })]),
  },
  {
    id: "coils",
    name: "Tight coils",
    length: "short",
    texture: "coily",
    build: () => finish([crop(), ...curls(90, 0.17, cropLine, 1.08, 23)]),
  },
];
