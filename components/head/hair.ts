import * as THREE from "three";

export const SEGMENTS = 12;

/** Hairline height (model space) for a given depth: high at the forehead, low at the nape. Mirrored in GLSL below. */
export const hairline = (z: number) => (z < 0 ? 0.55 + 1.7 * Math.min(1, Math.max(0, (z + 1.9) / 1.9)) : 2.25 + 0.9 * Math.min(1, z / 1.9));

export const HAIRLINE_GLSL = /* glsl */ `
float hairline(float z) {
  return z < 0.0 ? 0.55 + 1.7 * clamp((z + 1.9) / 1.9, 0.0, 1.0) : 2.25 + 0.9 * clamp(z / 1.9, 0.0, 1.0);
}`;

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * Scatters strand roots over the scalp of the head mesh and builds one ribbon
 * per strand. The ribbon vertices only carry the root, its normal, a random
 * seed and how far along the strand they are; the vertex shader does the rest.
 */
export function buildStrands(head: THREE.BufferGeometry, count: number) {
  const pos = head.getAttribute("position");
  const nor = head.getAttribute("normal");
  const index = head.index!;
  const rand = seeded(11);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = new THREE.Triangle();

  // Cumulative area of the triangles that sit above the hairline.
  const faces: number[] = [];
  const cdf: number[] = [];
  let total = 0;
  for (let f = 0; f < index.count; f += 3) {
    a.fromBufferAttribute(pos, index.getX(f));
    b.fromBufferAttribute(pos, index.getX(f + 1));
    c.fromBufferAttribute(pos, index.getX(f + 2));
    const cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
    const cx = (a.x + b.x + c.x) / 3;
    if (cy < hairline(cz) - 0.05) continue;
    if (Math.abs(cx + 0.08) > 1.6 && cy < 2.35) continue; // ears
    total += tri.set(a, b, c).getArea();
    faces.push(f);
    cdf.push(total);
  }

  const perStrand = (SEGMENTS + 1) * 2;
  const root = new Float32Array(count * perStrand * 3);
  const normal = new Float32Array(count * perStrand * 3);
  const seed = new Float32Array(count * perStrand * 4);
  const along = new Float32Array(count * perStrand * 2);
  const indices = new Uint32Array(count * SEGMENTS * 6);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();

  for (let s = 0; s < count; s++) {
    // Pick a triangle by area, then a uniform point inside it.
    const r = rand() * total;
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cdf[m] < r) lo = m + 1;
      else hi = m;
    }
    const f = faces[lo];
    const [i0, i1, i2] = [index.getX(f), index.getX(f + 1), index.getX(f + 2)];
    let u = rand(), v = rand();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    na.fromBufferAttribute(nor, i0); nb.fromBufferAttribute(nor, i1); nc.fromBufferAttribute(nor, i2);
    p.set(0, 0, 0).addScaledVector(a, u).addScaledVector(b, v).addScaledVector(c, w);
    n.set(0, 0, 0).addScaledVector(na, u).addScaledVector(nb, v).addScaledVector(nc, w).normalize();
    const seeds = [rand(), rand(), rand(), rand()];

    for (let k = 0; k <= SEGMENTS; k++) {
      for (let side = 0; side < 2; side++) {
        const vi = s * perStrand + k * 2 + side;
        root.set([p.x, p.y, p.z], vi * 3);
        normal.set([n.x, n.y, n.z], vi * 3);
        seed.set(seeds, vi * 4);
        along.set([k, side * 2 - 1], vi * 2);
      }
      if (k < SEGMENTS) {
        const v0 = s * perStrand + k * 2;
        indices.set([v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2], (s * SEGMENTS + k) * 6);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(root, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  geometry.setAttribute("aAlong", new THREE.BufferAttribute(along, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  // Strands move in the shader, so give culling a generous fixed bound.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 12);
  return geometry;
}

export const hairVertex = /* glsl */ `
attribute vec4 aSeed;
attribute vec2 aAlong;
uniform float uGroom[12];
uniform vec3 uSweep;
uniform float uTime;
uniform float uGrow;
varying vec3 vTangent;
varying vec3 vRootNormal;
varying vec3 vWorld;
varying float vT;
varying float vShade;

const vec3 HEAD_C = vec3(-0.08, 1.85, 0.12);
const vec3 HEAD_R = vec3(1.84, 2.2, 2.12);
const vec3 BODY_C = vec3(0.0, -3.6, -0.75);
const vec3 BODY_R = vec3(4.5, 2.5, 2.0);

void collide(inout vec3 p, inout vec3 d, vec3 c, vec3 r, float pad) {
  vec3 q = (p - c) / r;
  float l = length(q);
  if (l < 1.0 + pad) {
    vec3 n = normalize(q / r);
    p = c + q / l * r * (1.0 + pad);
    float dn = dot(d, n);
    if (dn < 0.0) d = normalize(d - dn * n);
  }
}

void main() {
  float top = uGroom[0], side = uGroom[1], back = uGroom[2], front = uGroom[3], mid = uGroom[4];
  float stiff = uGroom[5], gravity = uGroom[6], part = uGroom[7], curl = uGroom[8], curlF = uGroom[9], frizz = uGroom[10], volume = uGroom[11];

  vec3 root = position;
  vec3 n = normalize(normal);
  vec3 h = normalize((root - HEAD_C) / HEAD_R);

  // Length by region of the scalp.
  float crown = smoothstep(0.25, 0.75, h.y);
  float nape = (1.0 - crown) * smoothstep(0.1, -0.6, h.z);
  float len = mix(mix(side, back, nape), top, crown);
  len += front * crown * smoothstep(0.15, 0.75, h.z);
  float ridge = 1.0 - smoothstep(0.16, 0.3, abs(h.x));
  len = mix(len, max(len * ridge, 0.1), mid);
  len *= (0.72 + 0.56 * aSeed.x) * uGrow;

  float sideSign = mix(1.0, h.x < 0.0 ? -1.0 : 1.0, part);
  vec3 comb = vec3(uSweep.x * sideSign, uSweep.y, uSweep.z);
  vec3 d = normalize(n * (0.25 + stiff) + comb * crown + vec3(0.0, -0.9, 0.0) * (1.0 - crown) * (1.0 - mid) + (aSeed.yzw - 0.5) * frizz * 0.6);

  float idx = aAlong.x;
  float ds = len / ${SEGMENTS}.0;
  float pad = 0.015 + volume * aSeed.y;
  vec3 p = root;
  for (int i = 0; i < ${SEGMENTS}; i++) {
    if (float(i) >= idx) break;
    d = normalize(d + vec3(0.0, -1.0, 0.0) * gravity * ds * (1.15 - stiff));
    p += d * ds;
    collide(p, d, HEAD_C, HEAD_R, pad);
    collide(p, d, BODY_C, BODY_R, pad);
  }

  float t = idx / ${SEGMENTS}.0;
  float s = t * len;
  vec3 b1 = normalize(cross(d, vec3(0.31, 0.9, 0.3)));
  vec3 b2 = cross(d, b1);
  float phase = aSeed.z * 6.2832 + s * curlF;
  float ramp = smoothstep(0.0, 0.25, t);
  p += (b1 * cos(phase) + b2 * sin(phase)) * curl * ramp;
  // A little life: tips sway.
  p += b1 * sin(uTime * 1.3 + aSeed.w * 6.2832 + s) * 0.012 * len * t * t * (1.0 - stiff * 0.8);

  vec3 tangent = normalize(d + (b2 * cos(phase) - b1 * sin(phase)) * curl * curlF * ramp);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 tv = normalize(mat3(modelViewMatrix) * tangent);
  vec3 across = normalize(cross(tv, normalize(-mv.xyz)));
  float unit = length(modelViewMatrix[0].xyz);
  float width = 0.021 * (1.0 - 0.75 * t * t) * (0.7 + 0.6 * aSeed.w);
  mv.xyz += across * aAlong.y * width * unit;

  vTangent = normalize(mat3(modelMatrix) * tangent);
  vRootNormal = normalize(mat3(modelMatrix) * normalize(mix(n, normalize(p - HEAD_C), 0.6)));
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  vT = t;
  vShade = 0.7 + 0.5 * aSeed.x;
  gl_Position = projectionMatrix * mv;
}`;

export const hairFragment = /* glsl */ `
varying vec3 vTangent;
varying vec3 vRootNormal;
varying vec3 vWorld;
varying float vT;
varying float vShade;

void main() {
  vec3 T = normalize(vTangent);
  vec3 N = normalize(vRootNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 key = normalize(vec3(-3.0, 5.0, 6.0));
  vec3 rim = normalize(vec3(5.0, 1.0, -4.0));

  vec3 base = vec3(0.36, 0.003, 0.024) * vShade;
  float wrap = clamp(dot(N, key) * 0.6 + 0.4, 0.0, 1.0);
  float occlusion = mix(0.2, 1.0, smoothstep(0.0, 0.6, vT));
  vec3 col = base * (0.12 + 1.1 * wrap * wrap) * occlusion;

  // Kajiya-Kay strand highlights.
  vec3 H = normalize(key + V);
  float th = dot(T, H);
  col += vec3(1.0, 0.5, 0.5) * pow(sqrt(max(0.0, 1.0 - th * th)), 80.0) * 0.16 * wrap * occlusion;
  vec3 H2 = normalize(rim + V);
  float th2 = dot(T, H2);
  col += vec3(1.0, 0.12, 0.2) * pow(sqrt(max(0.0, 1.0 - th2 * th2)), 18.0) * 0.3 * clamp(dot(N, rim) * 0.5 + 0.5, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
