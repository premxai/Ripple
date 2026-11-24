/**
 * The ten residents: Quaternius' animated robot (CC0), tinted with each resident's colour.
 * They walk the streets between districts, react with emoji and gather at the square.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useAnimations, useCursor, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useStore } from "../store";
import type { Resident } from "../types";
import Avatar from "../components/Avatar";
import Emoji from "../components/Emoji";
import { DISTRICT_BY_ID, groundY, route, standPoint, type V2 } from "./layout";
import { htmlPortal, live } from "./shared";

const ROBOT = "/models/characters/RobotExpressive.glb";
const HEIGHT = 1.75;
const STATUS_COLOR: Record<string, string> = { watching: "#0EA5A4", engaged: "#22A06B", scrolled: "#E5484D" };
const CAMERA_YAW = Math.PI / 4;

function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function Character({ r, index, loc, stand }: { r: Resident; index: number; loc: string; stand: V2 }) {
  const view = useStore((s) => s.residents[r.id]);
  const labels = useStore((s) => s.labels);
  const selected = useStore((s) => s.selection?.kind === "resident" && s.selection.id === r.id);
  const select = useStore((s) => s.select);
  const done = useStore((s) => s.phase === "done");
  const { scene, animations } = useGLTF(ROBOT);

  const model = useMemo(() => {
    const c = cloneSkinned(scene) as THREE.Object3D;
    const tint = new THREE.Color(r.color);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.raycast = () => {}; // clicks go to the simple hit capsule instead
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mat) => {
        const k = (mat as THREE.MeshStandardMaterial).clone();
        if (k.name === "Main") k.color.copy(tint);
        k.roughness = 0.55;
        return k;
      });
      m.material = Array.isArray(m.material) ? mats : mats[0];
    });
    // Skinned bounding boxes are unreliable before the first pose; the robot stands ~4.6 units tall.
    c.scale.setScalar(HEIGHT / 4.6);
    return c;
  }, [scene, r.color]);

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, body);
  const current = useRef("");
  const oneShotUntil = useRef(0);
  const [hover, setHover] = useState(false);
  const [zoomedIn, setZoomedIn] = useState(false);
  useCursor(hover);

  const play = (name: string, once = false) => {
    const next = actions[name];
    if (!next) return;
    if (current.current === name && !once) return;
    const prev = current.current ? actions[current.current] : undefined;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(0.25).play();
    if (prev && prev !== next) prev.fadeOut(0.25);
    current.current = name;
  };

  // Movement state lives in refs; React only hands us the destination.
  const pos = useRef(new THREE.Vector3(stand[0], groundY(stand[0], stand[1]), stand[1]));
  const path = useRef<V2[]>([]);
  const prevLoc = useRef(loc);
  const lane = ((index % 5) - 2) * 0.28;

  useEffect(() => {
    const p: V2 = [pos.current.x, pos.current.z];
    const moving = path.current.length > 0;
    path.current = route(p, moving ? "road" : prevLoc.current, stand, loc, lane).slice(1);
    prevLoc.current = loc;
  }, [loc, stand[0], stand[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Emoji reactions: a short gesture when a new bubble appears.
  const bubbleAt = view?.bubble?.at;
  const [, force] = useState(0);
  useEffect(() => {
    if (!bubbleAt || !view?.bubble) return;
    const e = view.bubble.emoji;
    const gesture =
      e === "📣" ? "Wave" : view.status === "scrolled" || e === "🙅" || e === "😴" ? "No" : view.status === "engaged" ? "ThumbsUp" : "Yes";
    if (path.current.length === 0) {
      play(gesture, true);
      oneShotUntil.current = performance.now() + (actions[gesture]?.getClip().duration ?? 1.5) * 1000 - 250;
    }
    const t = setTimeout(() => force((n) => n + 1), 6100);
    return () => clearTimeout(t);
  }, [bubbleAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Report ready: everyone turns around and celebrates (or shrugs).
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      if (path.current.length) return;
      const g = view?.status === "engaged" ? "Dance" : view?.status === "scrolled" ? "No" : "Wave";
      play(g, true);
      oneShotUntil.current = performance.now() + Math.min(4, actions[g]?.getClip().duration ?? 2) * 1000;
    }, 600 + index * 120);
    return () => clearTimeout(t);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ camera }, dt) => {
    const zin = camera.zoom > live.fitZoom * 2.2;
    if (zin !== zoomedIn) setZoomedIn(zin);
    const g = root.current;
    if (!g) return;
    dt = Math.min(dt, 0.25); // keep walking pace on slow machines without teleporting after a stall
    const p = pos.current;
    let yaw = g.rotation.y;
    if (path.current.length) {
      const [tx, tz] = path.current[0];
      const dx = tx - p.x;
      const dz = tz - p.z;
      const dist = Math.hypot(dx, dz);
      const remaining = path.current.reduce((s, q, i, a) => s + (i ? Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) : dist), 0);
      const speed = remaining > 14 ? 5.2 : 2.6;
      const step = speed * dt;
      if (dist <= step) {
        p.x = tx;
        p.z = tz;
        path.current.shift();
      } else {
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
      }
      yaw = lerpAngle(yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
      play(speed > 3 ? "Running" : "Walking");
      oneShotUntil.current = 0;
    } else {
      // During the review the crowd watches the stage; once the report is in they turn to us.
      const face = done ? undefined : DISTRICT_BY_ID[loc]?.face;
      const want = face ? Math.atan2(face[0] - p.x, face[1] - p.z) : CAMERA_YAW;
      yaw = lerpAngle(yaw, want, Math.min(1, dt * 5));
      if (!oneShotUntil.current || performance.now() > oneShotUntil.current) {
        oneShotUntil.current = 0;
        play("Idle");
      }
    }
    p.y += (groundY(p.x, p.z) - p.y) * Math.min(1, dt * 12);
    g.position.copy(p);
    g.rotation.y = yaw;
    live.positions.set(r.id, p);
  });

  const status = view?.status ?? "idle";
  const ring = STATUS_COLOR[status];
  const showBubble = view?.bubble && performance.now() - view.bubble.at < 6000;
  const onPick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    select({ kind: "resident", id: r.id });
  };

  return (
    <group ref={root}>
      <group ref={body}>
        <primitive object={model} />
      </group>
      {/* status ring on the ground */}
      {ring && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.66, 32]} />
          <meshBasicMaterial color={ring} transparent opacity={status === "scrolled" ? 0.75 : 0.95} depthWrite={false} />
        </mesh>
      )}
      {selected && (
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.74, 0.85, 32]} />
          <meshBasicMaterial color="#1F2328" depthWrite={false} />
        </mesh>
      )}
      {/* generous click target */}
      <mesh
        position={[0, HEIGHT / 2, 0]}
        onClick={onPick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      >
        <cylinderGeometry args={[0.6, 0.6, HEIGHT, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html position={[0, HEIGHT + 0.15, 0]} zIndexRange={[60, 0]} portal={htmlPortal} pointerEvents="none">
        <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1" style={{ opacity: status === "scrolled" ? 0.8 : 1 }}>
          {view?.thinking ? (
            <span className="flex gap-0.5 rounded-full bg-white px-2 py-1 text-[11px] leading-none text-muted shadow-md">
              <span className="dot">●</span>
              <span className="dot">●</span>
              <span className="dot">●</span>
            </span>
          ) : showBubble ? (
            <span key={view!.bubble!.at} className="animate-pop">
              <span className="relative grid h-[38px] w-[38px] place-items-center rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,.18)]">
                <Emoji char={view!.bubble!.emoji} size={26} />
                <span className="absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-white" />
              </span>
            </span>
          ) : null}
          {((labels && zoomedIn) || selected || hover) && (
            <button
              onClick={onPick}
              style={{ pointerEvents: "auto" }}
              className={`flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-0.5 pr-2 text-[10px] font-semibold shadow-sm ${
                selected ? "bg-ink text-white" : "bg-white/95 text-ink"
              }`}
            >
              <Avatar id={r.id} name={r.name} color={r.color} size={16} />
              {r.name}
            </button>
          )}
        </div>
      </Html>
    </group>
  );
}

/** Expanding teal rings on the ground when someone shares the video. */
function Ripple({ residentId, at }: { residentId: string; at: number }) {
  const g = useRef<THREE.Group>(null);
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);
  useFrame(() => {
    const age = (performance.now() - at) / 1000;
    const p = live.positions.get(residentId);
    if (!g.current) return;
    g.current.visible = age < 3.6 && !!p;
    if (!p || age >= 3.6) return;
    g.current.position.set(p.x, p.y + 0.05, p.z);
    g.current.children.forEach((c, i) => {
      const t = ((age - i * 0.45) % 1.8) / 1.8;
      const on = age - i * 0.45 > 0;
      c.scale.setScalar(on ? 0.6 + t * 5 : 0.001);
      if (mats.current[i]) mats.current[i].opacity = on ? (1 - t) * 0.9 : 0;
    });
  });
  return (
    <group ref={g}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 48]} />
          <meshBasicMaterial
            ref={(m) => {
              if (m) mats.current[i] = m;
            }}
            color="#0EA5A4"
            transparent
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function Characters() {
  const town = useStore((s) => s.town);
  const residents = useStore((s) => s.residents);
  const ripples = useStore((s) => s.ripples);

  const stands = useMemo(() => {
    const out: Record<string, { loc: string; stand: V2 }> = {};
    if (!town) return out;
    const byLoc: Record<string, string[]> = {};
    for (const r of town.residents) {
      const loc = DISTRICT_BY_ID[residents[r.id]?.location ?? r.home] ? (residents[r.id]?.location ?? r.home) : "town_square";
      (byLoc[loc] ??= []).push(r.id);
    }
    for (const [loc, ids] of Object.entries(byLoc)) ids.forEach((id, i) => (out[id] = { loc, stand: standPoint(loc, i, ids.length) }));
    return out;
  }, [town, residents]);

  if (!town) return null;
  return (
    <group>
      {town.residents.map((r, i) => (
        <Character key={r.id} r={r} index={i} loc={stands[r.id].loc} stand={stands[r.id].stand} />
      ))}
      {ripples.map((rp) => (
        <Ripple key={rp.id} residentId={rp.residentId} at={rp.at} />
      ))}
    </group>
  );
}

useGLTF.preload(ROBOT);
