/**
 * Real-time 3D town: orthographic isometric camera, warm daylight that turns to dusk
 * during the panel review, soft shadows, ambient occlusion and a touch of bloom.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls, Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import { Maximize2, Minus, Plus, Tag } from "lucide-react";
import * as THREE from "three";
import { useStore } from "../store";
import World from "./World";
import Characters from "./Characters";
import { DISTRICT_BY_ID, ISLAND_BOX } from "./layout";
import { applyDusk, htmlPortal, live } from "./shared";

const VIEW_DIR = new THREE.Vector3(1, 0.92, 1).normalize();
const HOME = new THREE.Vector3(0, 0, -3.6);

/** Handle the overlay buttons use to talk to the camera. */
const cam = {
  controls: null as CameraControls | null,
  fitZoom: 10,
  /** true once the user zooms, pans or flies somewhere; a resize then keeps their view */
  moved: false,
  fit: (_animate?: boolean, _keepView?: boolean) => {},
};

function Rig() {
  const ref = useRef<CameraControls>(null);
  const { size, camera } = useThree();
  const selection = useStore((s) => s.selection);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    cam.controls = c;
    cam.fit = (animate = true, keepView = false) => {
      const right = new THREE.Vector3(1, 0, -1).normalize();
      const up = new THREE.Vector3().crossVectors(right, VIEW_DIR.clone().negate()).normalize();
      let ex = 0;
      let ey = 0;
      const { min, max } = ISLAND_BOX;
      for (const x of [min.x, max.x])
        for (const y of [min.y, max.y])
          for (const z of [min.z, max.z]) {
            const v = new THREE.Vector3(x, y, z).sub(HOME);
            ex = Math.max(ex, Math.abs(v.dot(right)));
            ey = Math.max(ey, Math.abs(v.dot(up)));
          }
      if (size.width < 10 || size.height < 10) return;
      const zoom = Math.min(size.width / (ex * 2), size.height / (ey * 2)) * (size.width < 520 ? 1.18 : 1.06);
      cam.fitZoom = zoom;
      live.fitZoom = zoom;
      c.minZoom = zoom * 0.7;
      c.maxZoom = zoom * 7;
      if (keepView) return;
      cam.moved = false;
      const eye = HOME.clone().addScaledVector(VIEW_DIR, 120);
      c.setLookAt(eye.x, eye.y, eye.z, HOME.x, HOME.y, HOME.z, animate);
      c.zoomTo(zoom, animate);
    };
    cam.fit(false, cam.moved);
  }, [size.width, size.height]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const onStart = () => (cam.moved = true);
    c.addEventListener("controlstart", onStart);
    return () => c.removeEventListener("controlstart", onStart);
  }, []);

  // Fly to whoever was focused from the log or inspector.
  useEffect(() => {
    const c = ref.current;
    if (!c || !selection?.focus) return;
    let p: THREE.Vector3 | undefined;
    if (selection.kind === "resident") p = live.positions.get(selection.id)?.clone();
    else {
      const d = DISTRICT_BY_ID[selection.id];
      if (d) p = new THREE.Vector3(d.spot[0], 0, d.spot[1]);
    }
    if (!p) return;
    cam.moved = true;
    c.moveTo(p.x, p.y + 0.6, p.z, true);
    c.zoomTo(Math.max(camera.zoom, cam.fitZoom * 2.6), true);
  }, [selection?.focus]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minPolarAngle={0.35}
      maxPolarAngle={1.2}
      smoothTime={0.35}
      draggingSmoothTime={0.12}
      dollyToCursor
    />
  );
}

const DAY = { sun: new THREE.Color("#FFE7C7"), sky: new THREE.Color("#FFF7EA"), ground: new THREE.Color("#C2AD8C"), bg: new THREE.Color("#FFFFFF") };
const DUSK = { sun: new THREE.Color("#FF9A6A"), sky: new THREE.Color("#7C86C6"), ground: new THREE.Color("#3E3552"), bg: new THREE.Color("#2B3150") };

/** Dev-only console handle: __town3d.gl.info.render for draw calls, __town3d.store to fake events. */
function DebugHandle() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __town3d: unknown }).__town3d = { gl, store: useStore };
  }, [gl]);
  return null;
}

function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const phase = useStore((s) => s.phase);
  const { scene } = useThree();
  const target = phase === "review" || phase === "done" ? 1 : 0;
  useFrame((_, dt) => {
    live.dusk += (target - live.dusk) * Math.min(1, dt * 0.9);
    const d = live.dusk;
    applyDusk(d);
    if (sun.current) {
      sun.current.color.copy(DAY.sun).lerp(DUSK.sun, d);
      sun.current.intensity = 2.7 - d * 1.6;
      sun.current.position.set(-20 + d * 6, 34 - d * 20, 16);
    }
    if (hemi.current) {
      hemi.current.color.copy(DAY.sky).lerp(DUSK.sky, d);
      hemi.current.groundColor.copy(DAY.ground).lerp(DUSK.ground, d);
      hemi.current.intensity = 1.25 - d * 0.3;
    }
    if (scene.background instanceof THREE.Color) scene.background.copy(DAY.bg).lerp(DUSK.bg, d);
    scene.environmentIntensity = 0.45 - d * 0.32;
  });
  return (
    <>
      <color attach="background" args={["#FFFFFF"]} />
      <hemisphereLight ref={hemi} args={["#FFF7EA", "#C2AD8C", 1.5]} />
      <directionalLight
        ref={sun}
        position={[-20, 34, 16]}
        intensity={2.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
        shadow-camera-near={1}
        shadow-camera-far={120}
      />
      <Environment resolution={64} frames={1}>
        <Lightformer intensity={2} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[30, 30, 1]} color="#FFF4E2" />
        <Lightformer intensity={1.2} position={[-10, 4, 10]} scale={[20, 6, 1]} color="#CFE6FF" />
        <Lightformer intensity={0.8} position={[10, 2, -10]} scale={[20, 6, 1]} color="#FFE2C4" />
      </Environment>
    </>
  );
}

function Controls() {
  const labels = useStore((s) => s.labels);
  const setLabels = useStore((s) => s.setLabels);
  const btn = "grid h-9 w-9 cursor-pointer place-items-center text-ink transition hover:bg-paper";
  const zoom = (k: number) => {
    const c = cam.controls;
    if (!c) return;
    cam.moved = true;
    c.zoomTo(c.camera.zoom * k, true);
  };
  return (
    <div className="absolute bottom-3 left-3 z-[4000] flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm" onClick={(e) => e.stopPropagation()}>
      <button className={btn} onClick={() => zoom(1.4)} aria-label="Zoom in" title="Zoom in"><Plus size={16} /></button>
      <button className={btn} onClick={() => zoom(1 / 1.4)} aria-label="Zoom out" title="Zoom out"><Minus size={16} /></button>
      <button className={btn} onClick={() => cam.fit(true)} aria-label="Fit town" title="Fit town"><Maximize2 size={15} /></button>
      <button
        className={`${btn} ${labels ? "text-teal" : "text-muted"}`}
        onClick={() => setLabels(!labels)}
        aria-label={labels ? "Hide labels" : "Show labels"}
        aria-pressed={labels}
        title="Labels"
      >
        <Tag size={15} />
      </button>
    </div>
  );
}

export default function Scene() {
  const select = useStore((s) => s.select);
  const dusk = useStore((s) => s.phase === "review" || s.phase === "done");
  const [dpr, setDpr] = useState(1.5);
  return (
    <div className="absolute inset-0 isolate">
      <Canvas
        orthographic
        shadows
        dpr={dpr}
        camera={{ position: [110, 100, 106], zoom: 10, near: 1, far: 500 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        onPointerMissed={() => select(undefined)}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} flipflops={3} />
        <DebugHandle />
        <Lighting />
        <Suspense fallback={null}>
          <World />
          <Characters />
        </Suspense>
        <Rig />
        <EffectComposer multisampling={0}>
          <N8AO aoRadius={1.6} intensity={2.4} distanceFalloff={1} halfRes quality="performance" />
          <SMAA />
          {/* bloom only after dark: on the white daytime backdrop it turns into haze */}
          {dusk ? <Bloom luminanceThreshold={0.6} intensity={0.9} mipmapBlur /> : <></>}
        </EffectComposer>
      </Canvas>
      <div
        ref={(el) => {
          if (el) htmlPortal.current = el;
        }}
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />
      <Controls />
    </div>
  );
}
