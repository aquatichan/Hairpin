"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { buildHead, hairStyles } from "./geometry";

const IVORY = "#f4efe6";
const CRIMSON = "#dc143c";

const backdropFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uPointer;

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
  p += uPointer * 0.04;
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
  float crim = smoothstep(0.545, 0.555, c);
  vec3 crimson = mix(vec3(0.45, 0.03, 0.10), vec3(0.863, 0.078, 0.235), smoothstep(0.55, 0.7, c));
  col = mix(col, crimson, crim);

  col *= 1.0 - 0.55 * smoothstep(0.35, 1.15, length(p));
  col += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
}`;

const backdropVertex = /* glsl */ `void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`;

type SceneProps = {
  /** Lock one hairstyle instead of cycling. */
  fixedStyle?: number;
  /** Lock the head's turn (radians) instead of spinning. */
  fixedTurn?: number;
  /** Freeze the backdrop at this time, for still renders. */
  fixedTime?: number;
  /** Where the head sits: "hero" moves it aside for the sign-in copy. */
  framing?: "hero" | "center";
};

function Backdrop({ speed, fixedTime }: { speed: number; fixedTime?: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: fixedTime ?? 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uPointer: { value: new THREE.Vector2() } }),
    [fixedTime],
  );
  useFrame((state, dt) => {
    const u = material.current?.uniforms;
    if (!u) return;
    if (fixedTime === undefined) u.uTime.value += dt * speed;
    state.gl.getDrawingBufferSize(u.uRes.value);
    u.uPointer.value.lerp(state.pointer, 0.05);
  });
  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={backdropVertex} fragmentShader={backdropFragment} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

const CYCLE_SECONDS = 2.4;

function Head({ fixedStyle, fixedTurn, framing = "hero", speed }: SceneProps & { speed: number }) {
  const root = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const hair = useRef<(THREE.Mesh | null)[]>([]);
  const head = useMemo(() => buildHead(), []);
  const styles = useMemo(() => hairStyles.map((s) => s.build()), []);
  const clock = useRef({ t: 0, active: fixedStyle ?? 0, sinceChange: 10, scales: hairStyles.map((_, i) => (i === (fixedStyle ?? 0) ? 1 : 0)) });
  const viewport = useThree((s) => s.viewport);

  useEffect(() => () => { head.dispose(); styles.forEach((g) => g.dispose()); }, [head, styles]);

  const wide = viewport.aspect > 1.15;
  const size = framing === "center" ? Math.min(viewport.width / 3.1, viewport.height / 4.9) : wide ? viewport.height / 4.6 : Math.min(viewport.width / 4.4, viewport.height / 8.5);
  const x = framing === "hero" && wide ? viewport.width * 0.2 : 0;
  const y = framing === "center" ? 0 : wide ? -size * 0.2 : viewport.height * 0.2;

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05) * speed;
    const c = clock.current;
    c.t += dt;
    c.sinceChange += dt;
    if (fixedStyle === undefined) {
      const next = Math.floor(c.t / CYCLE_SECONDS) % hairStyles.length;
      if (next !== c.active) { c.active = next; c.sinceChange = 0; }
    }
    hairStyles.forEach((_, i) => {
      const target = i === c.active ? 1 : 0;
      c.scales[i] += (target - c.scales[i]) * (1 - Math.exp(-11 * dt));
      const mesh = hair.current[i];
      if (!mesh) return;
      mesh.visible = c.scales[i] > 0.02;
      // A small overshoot as the new cut grows out of the scalp.
      mesh.scale.setScalar(c.scales[i] * (1 + 0.12 * Math.sin(Math.PI * Math.min(1, c.sinceChange * 2.2)) * target));
    });
    if (turn.current) {
      if (fixedTurn !== undefined) turn.current.rotation.y = fixedTurn;
      else turn.current.rotation.y += dt * (0.55 + 5.5 * Math.exp(-3.2 * c.sinceChange));
    }
    if (root.current) {
      root.current.position.y = y + Math.sin(c.t * 0.9) * size * 0.06;
      root.current.rotation.x += (-state.pointer.y * 0.18 - root.current.rotation.x) * 0.06;
      root.current.rotation.z += (-state.pointer.x * 0.06 - root.current.rotation.z) * 0.06;
    }
  });

  return (
    <group ref={root} position={[x, y, 0]} scale={size}>
      <group ref={turn}>
        <mesh geometry={head}>
          <meshStandardMaterial color="#d9d3c8" roughness={0.82} metalness={0.05} flatShading />
        </mesh>
        {styles.map((geometry, i) => (
          <mesh key={hairStyles[i].id} geometry={geometry} ref={(m) => { hair.current[i] = m; }} visible={false}>
            <meshStandardMaterial color={CRIMSON} roughness={0.55} metalness={0.1} flatShading side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export default function HeadScene(props: SceneProps) {
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setSpeed(query.matches ? 0.2 : 1);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return (
    <Canvas dpr={[1, 1.75]} camera={{ fov: 32, position: [0, 0, 10] }} gl={{ antialias: true, powerPreference: "high-performance" }} eventSource={typeof document === "undefined" ? undefined : document.body} eventPrefix="client">
      <Backdrop speed={speed} fixedTime={props.fixedTime} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-3, 5, 6]} intensity={2.2} color={IVORY} />
      <directionalLight position={[5, 1, -4]} intensity={2.4} color={CRIMSON} />
      <directionalLight position={[-5, -2, -3]} intensity={0.6} color="#8a8a92" />
      <Head {...props} speed={speed} />
    </Canvas>
  );
}
