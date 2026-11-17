"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { palettes, type PaletteName } from "./palettes";
import { HAIRLINE_GLSL, buildStrands, hairFragment, hairVertex } from "./hair";
import { GROOM_SIZE, blendGroom, hairStyles } from "./styles";
import { useTilt } from "./use-tilt";

const IVORY = "#f4efe6";

const backdropFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uPointer;
uniform vec3 uAccentDark;
uniform vec3 uAccentLight;
uniform float uAccentOn;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  p += uPointer * 0.05;
  float t = uTime * 0.11;

  // Domain-warped noise, thresholded into paint-like splotches.
  vec2 w = p * 1.3 + 1.6 * vec2(fbm(p * 1.1 + t), fbm(p * 1.1 + 5.2 - t));
  float g = fbm(w * 1.2 + vec2(0.0, t * 1.4));
  float g2 = fbm(w * 2.1 + vec2(3.1, -t * 1.1));
  float c = fbm(w * 0.95 + vec2(7.3 + t * 1.7, 2.9 - t));

  vec3 col = vec3(0.043, 0.043, 0.047);
  col = mix(col, vec3(0.086, 0.086, 0.094), smoothstep(0.42, 0.44, g));
  col = mix(col, vec3(0.16, 0.16, 0.17), smoothstep(0.55, 0.565, g));
  col = mix(col, vec3(0.30, 0.30, 0.31), smoothstep(0.66, 0.67, g2) * smoothstep(0.5, 0.56, g));
  float crim = smoothstep(0.545, 0.555, c) * uAccentOn;
  vec3 accent = mix(uAccentDark, uAccentLight, smoothstep(0.55, 0.7, c));
  col = mix(col, accent, crim);

  col *= 1.0 - 0.55 * smoothstep(0.35, 1.15, length(p));
  col += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
}`;

const backdropVertex = /* glsl */ `void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`;

export type SceneProps = {
  /** Lock one hairstyle instead of cycling. */
  fixedStyle?: number;
  /** Lock the head's turn (radians) instead of spinning. */
  fixedTurn?: number;
  /** Freeze the backdrop at this time, for still renders. */
  fixedTime?: number;
  /** Where the head sits: "hero" moves it aside for the sign-in copy. */
  framing?: "hero" | "center";
  /** Colour treatment for the hair, light and backdrop. */
  palette?: PaletteName;
  /** Called with the style index each time the hair starts changing. */
  onStyle?: (index: number) => void;
};

type Tilt = ReturnType<typeof useTilt>;

function Backdrop({ speed, fixedTime, tilt, palette }: { speed: number; fixedTime?: number; tilt: Tilt; palette: PaletteName }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => {
    const accent = palettes[palette].accent;
    return {
      uTime: { value: fixedTime ?? 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2() },
      uAccentDark: { value: new THREE.Vector3(...(accent?.dark ?? [0, 0, 0])) },
      uAccentLight: { value: new THREE.Vector3(...(accent?.light ?? [0, 0, 0])) },
      uAccentOn: { value: accent ? 1 : 0 },
    };
  }, [fixedTime, palette]);
  useFrame((state, dt) => {
    const u = material.current?.uniforms;
    if (!u) return;
    if (fixedTime === undefined) u.uTime.value += dt * speed;
    state.gl.getDrawingBufferSize(u.uRes.value);
    const t = tilt.current;
    u.uPointer.value.lerp(t.active ? new THREE.Vector2(t.x, -t.y) : state.pointer, 0.05);
  });
  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={backdropVertex} fragmentShader={backdropFragment} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

/** Soft studio reflections so the sculpted head has form without extra lights. */
function Environment() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene } = get();
    const pmrem = new THREE.PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = texture;
    scene.environmentIntensity = 0.3;
    return () => {
      scene.environment = null;
      texture.dispose();
      pmrem.dispose();
    };
  }, [get]);
  return null;
}

/** The order the hero plays styles in, chosen for contrast between neighbours. */
const HERO_ORDER = [0, 1, 5, 3, 4, 7, 6, 8, 11, 2, 10, 9];
const HOLD_SECONDS = 2.6;
const MORPH_SECONDS = 1.0;
const ease = (t: number) => t * t * (3 - 2 * t);

function Head({ fixedStyle, fixedTurn, framing = "hero", speed, onStyle, tilt, palette = "oxblood" }: SceneProps & { speed: number; tilt: Tilt }) {
  const root = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const hair = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>>(null);
  const gltf = useLoader(GLTFLoader, "/models/head.glb");
  const normalMap = useLoader(THREE.TextureLoader, "/models/head-normal.jpg");
  const colorMap = useLoader(THREE.TextureLoader, "/models/head-color.jpg");
  const viewport = useThree((s) => s.viewport);
  const size3 = useThree((s) => s.size);

  const headGeometry = useMemo(() => {
    let found: THREE.BufferGeometry | null = null;
    gltf.scene.traverse((o) => {
      if (!found && (o as THREE.Mesh).isMesh) found = (o as THREE.Mesh).geometry;
    });
    return found as unknown as THREE.BufferGeometry;
  }, [gltf]);

  // Fewer strands on small or low-powered devices.
  const strandCount = size3.width < 700 || (typeof navigator !== "undefined" && navigator.hardwareConcurrency <= 4) ? 8000 : 15000;
  const strands = useMemo(() => buildStrands(headGeometry, strandCount), [headGeometry, strandCount]);
  useEffect(() => () => strands.dispose(), [strands]);

  const headMaterial = useMemo(() => {
    // The colour map is sRGB. These maps ship with the scan, which expects the default flipY.

    const skin = colorMap.clone();
    skin.colorSpace = THREE.SRGBColorSpace;

    const hair = palettes[palette].hair;
    const material = new THREE.MeshPhysicalMaterial({
      map: skin,
      roughness: 0.52,
      metalness: 0,
      normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      // A touch of sheen stands in for skin's soft, fuzzy reflection.
      sheen: 0.35,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color("#ffd9c4"),
    });
    // Shade the scalp under the hair so short cuts read as hair, not paint.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nvarying vec3 vObj;\n${HAIRLINE_GLSL}`)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float grain = fract(sin(dot(floor(vObj.xz * 60.0), vec2(12.9898, 78.233))) * 43758.5453);
          float scalp = smoothstep(-0.05, 0.07, vObj.y - hairline(vObj.z) + (grain - 0.5) * 0.09);
          scalp *= 1.0 - step(1.6, abs(vObj.x + 0.08)) * step(vObj.y, 2.35);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${hair.map((v) => (v * 0.8).toFixed(4)).join(", ")}), scalp * 0.9);`,
        );
    };
    return material;
  }, [normalMap, colorMap, palette]);

  const hairMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: hairVertex,
        fragmentShader: hairFragment,
        side: THREE.DoubleSide,
        uniforms: {
          uGroom: { value: new Float32Array(GROOM_SIZE) },
          uSweep: { value: new THREE.Vector3() },
          uTime: { value: 0 },
          uGrow: { value: fixedStyle === undefined ? 0 : 1 },
          uHair: { value: new THREE.Vector3(...palettes[palette].hair) },
          uHighlight: { value: new THREE.Vector3(...palettes[palette].highlight) },
        },
      }),
    [fixedStyle, palette],
  );
  useEffect(() => () => { headMaterial.dispose(); hairMaterial.dispose(); }, [headMaterial, hairMaterial]);

  const clock = useRef({ t: 0, step: 0, sinceChange: 10, drag: 0, dragging: false, lastX: 0 });

  useEffect(() => {
    document.documentElement.dataset.headReady = "1";
    if (fixedTurn !== undefined) return;
    const c = clock.current;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("a,button,input,label")) return;
      c.dragging = true;
      c.lastX = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (!c.dragging) return;
      c.drag += (e.clientX - c.lastX) * 0.012;
      c.lastX = e.clientX;
    };
    const up = () => { c.dragging = false; };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [fixedTurn]);

  const wide = viewport.aspect > 1.15;
  const size = framing === "center" ? Math.min(viewport.width / 3.3, viewport.height / 4.6) : wide ? viewport.height / 4.4 : Math.min(viewport.width / 3.4, viewport.height / 7.6);
  const x = framing === "hero" && wide ? viewport.width * 0.2 : 0;
  const y = framing === "center" ? size * 0.35 : wide ? size * 0.1 : viewport.height * 0.2;

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05) * speed;
    const c = clock.current;
    c.t += dt;
    c.sinceChange += dt;
    if (!hair.current) return;
    const u = hair.current.material.uniforms;
    u.uTime.value = c.t;
    u.uGrow.value = Math.min(1, u.uGrow.value + dt * 1.4);

    if (fixedStyle !== undefined) {
      const groom = hairStyles[fixedStyle % hairStyles.length].groom;
      blendGroom(groom, groom, 0, u.uGroom.value, u.uSweep.value);
    } else {
      const step = Math.floor(c.t / HOLD_SECONDS);
      if (step !== c.step) {
        c.step = step;
        c.sinceChange = 0;
        onStyle?.(HERO_ORDER[step % HERO_ORDER.length]);
      }
      const from = hairStyles[HERO_ORDER[(c.step + HERO_ORDER.length - 1) % HERO_ORDER.length]].groom;
      const to = hairStyles[HERO_ORDER[c.step % HERO_ORDER.length]].groom;
      const mix = c.step === 0 ? 1 : ease(Math.min(1, c.sinceChange / MORPH_SECONDS));
      blendGroom(from, to, mix, u.uGroom.value, u.uSweep.value);
    }

    if (turn.current) {
      if (fixedTurn !== undefined) turn.current.rotation.y = fixedTurn;
      else {
        // Slow turn, a quick spin as the cut changes, plus whatever the finger adds.
        if (!c.dragging) turn.current.rotation.y += dt * (0.45 + 4.2 * Math.exp(-3.0 * c.sinceChange));
        turn.current.rotation.y += c.drag;
        c.drag = 0;
      }
    }
    if (root.current) {
      const t = tilt.current;
      const px = t.active ? t.x : state.pointer.x;
      const py = t.active ? -t.y : state.pointer.y;
      root.current.position.y = y + Math.sin(c.t * 0.9) * size * 0.04;
      root.current.rotation.x += (-py * 0.2 - root.current.rotation.x) * 0.06;
      root.current.rotation.z += (-px * 0.07 - root.current.rotation.z) * 0.06;
      if (fixedTurn === undefined) root.current.rotation.y += (px * 0.35 - root.current.rotation.y) * 0.06;
    }
  });

  return (
    <group ref={root} position={[x, y, 0]} scale={size}>
      <group ref={turn}>
        <group scale={0.5} position={[0.04, -0.95, -0.05]}>
          <mesh geometry={headGeometry} material={headMaterial} />
          <mesh ref={hair} geometry={strands} material={hairMaterial} frustumCulled={false} />
        </group>
      </group>
    </group>
  );
}

export default function HeadScene(props: SceneProps) {
  const [speed, setSpeed] = useState(1);
  const tilt = useTilt();
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setSpeed(query.matches ? 0.2 : 1);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return (
    <Canvas dpr={[1, 1.75]} camera={{ fov: 32, position: [0, 0, 10] }} gl={{ antialias: true, powerPreference: "high-performance" }} eventSource={typeof document === "undefined" ? undefined : document.body} eventPrefix="client">
      <Backdrop speed={speed} fixedTime={props.fixedTime} tilt={tilt} palette={props.palette ?? "oxblood"} />
      <Environment />
      <ambientLight intensity={0.15} />
      <directionalLight position={[-3, 5, 6]} intensity={2.4} color={IVORY} />
      <directionalLight position={[5, 1, -4]} intensity={2.4} color={palettes[props.palette ?? "oxblood"].rimLight} />
      <directionalLight position={[-5, -2, -3]} intensity={0.5} color="#8a8a92" />
      <Suspense fallback={null}>
        <Head {...props} speed={speed} tilt={tilt} />
      </Suspense>
    </Canvas>
  );
}
