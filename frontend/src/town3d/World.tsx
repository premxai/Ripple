/**
 * The island, roads and the ten districts. Buildings are KayKit City Builder Bits
 * (CC0) where they fit, plus hand-built clay-style shapes for the landmarks.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { createInstances, Html, RoundedBox, useCursor, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../store";
import { PLACE_BY_ID } from "../mapConfig";
import { DISTRICTS, ROAD_END, ROAD_W, ROADS, BLOCK_TOP, bounds, center, type District } from "./layout";
import { htmlPortal, live, M } from "./shared";

type V3 = [number, number, number];

// Hundreds of windows and party bulbs collapse into one draw call each.
const [WindowSet, WindowPane] = createInstances();
const [BulbSet, Bulb] = createInstances();

/* ---------- small building blocks ---------- */

function B({ p, s, m, r = 0, shadow = true }: { p: V3; s: V3; m: THREE.Material; r?: number; shadow?: boolean }) {
  return (
    <mesh position={p} rotation={[0, r, 0]} material={m} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  );
}
function C({ p, r1, r2 = r1, h, m, seg = 20 }: { p: V3; r1: number; r2?: number; h: number; m: THREE.Material; seg?: number }) {
  return (
    <mesh position={p} material={m} castShadow receiveShadow>
      <cylinderGeometry args={[r1, r2, h, seg]} />
    </mesh>
  );
}

const gable = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
})();

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A KayKit model, scaled so its footprint is `w` wide and its base sits on y = 0. */
function Kit({ name, p, r = 0, w }: { name: string; p: V3; r?: number; w: number }) {
  const { scene } = useGLTF(`/models/kaykit/${name}.gltf`);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const k = w / Math.max(size.x, size.z);
    c.scale.setScalar(k);
    c.position.set(-ctr.x * k, -box.min.y * k, -ctr.z * k);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const g = new THREE.Group();
    g.add(c);
    return g;
  }, [scene, w]);
  return <primitive object={obj} position={p} rotation={[0, r, 0]} />;
}

/* ---------- island, water and streets ---------- */

function Island() {
  const dashes = useMemo(() => {
    const out: { p: V3; s: V3 }[] = [];
    for (const r of ROADS)
      for (let t = -ROAD_END + 1; t < ROAD_END - 1; t += 1.6) {
        if (ROADS.some((q) => Math.abs(t - q) < 1.8)) continue;
        out.push({ p: [r, 0.045, t], s: [0.12, 0.02, 0.7] });
        out.push({ p: [t, 0.045, r], s: [0.7, 0.02, 0.12] });
      }
    // zebra crossings next to every junction
    for (const a of ROADS)
      for (const b of ROADS)
        for (const side of [-1, 1])
          for (let k = -2; k <= 2; k++) {
            out.push({ p: [a + k * 0.42, 0.045, b + side * 1.85], s: [0.24, 0.02, 0.9] });
            out.push({ p: [a + side * 1.85, 0.045, b + k * 0.42], s: [0.9, 0.02, 0.24] });
          }
    return out;
  }, []);
  const dashRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    dashes.forEach((d, i) => {
      m.compose(new THREE.Vector3(...d.p), new THREE.Quaternion(), new THREE.Vector3(...d.s));
      dashRef.current!.setMatrixAt(i, m);
    });
    dashRef.current!.instanceMatrix.needsUpdate = true;
  }, [dashes]);

  return (
    <group>
      {/* earth and rock skirt */}
      <RoundedBox args={[46, 1.6, 53.6]} radius={0.5} position={[0, -1.4, -3.7]} material={M.dirt} receiveShadow />
      <RoundedBox args={[45.2, 2.4, 52.8]} radius={0.6} position={[0, -3.2, -3.7]} material={M.stone} />
      {/* grass top, harbour cut out of the north edge */}
      <RoundedBox args={[46, 0.7, 45]} radius={0.3} position={[0, -0.35, 0.3]} material={M.grass} receiveShadow />
      <RoundedBox args={[13.4, 0.7, 9]} radius={0.3} position={[16.3, -0.35, -26.4]} material={M.grass} receiveShadow />
      <RoundedBox args={[32.8, 0.5, 8.8]} radius={0.25} position={[-6.6, -0.6, -26.4]} material={M.water} receiveShadow />
      {/* roads */}
      {ROADS.map((r) => (
        <group key={r}>
          <B p={[r, 0.01, r === -7 ? -0.1 : 0]} s={[ROAD_W, 0.04, ROAD_END * 2 + (r === -7 ? 0.2 : 0)]} m={M.road} shadow={false} />
          <B p={[0, 0.012, r]} s={[ROAD_END * 2, 0.04, ROAD_W]} m={M.road} shadow={false} />
        </group>
      ))}
      <instancedMesh ref={dashRef} args={[undefined, undefined, dashes.length]} material={M.paint} receiveShadow>
        <boxGeometry />
      </instancedMesh>
      {/* raised blocks with a sidewalk kerb */}
      {DISTRICTS.filter((d) => d.x !== "W").map((d) => {
        const [x0, x1, z0, z1] = bounds(d);
        return (
          <RoundedBox
            key={d.id}
            args={[x1 - x0, 0.36, z1 - z0]}
            radius={0.12}
            position={[(x0 + x1) / 2, BLOCK_TOP - 0.18, (z0 + z1) / 2]}
            material={M.walk}
            receiveShadow
          />
        );
      })}
    </group>
  );
}

/* ---------- trees and lamps (instanced) ---------- */

function rand(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

const TREE_SPOTS: { p: [number, number]; kind: 0 | 1 | 2; s?: number }[] = (() => {
  const t: { p: [number, number]; kind: 0 | 1 | 2; s?: number }[] = [];
  // rim of the island
  for (let i = -20; i <= 20; i += 2.6) {
    if (rand(i) > 0.25) t.push({ p: [i + rand(i + 1) * 0.8, 22.2], kind: rand(i + 2) > 0.7 ? 2 : 0 });
    if (rand(i + 9) > 0.3 && Math.abs(i - 7) > 2 && Math.abs(i + 7) > 2) t.push({ p: [22.2, i + rand(i + 3) * 0.8], kind: rand(i + 4) > 0.7 ? 2 : 0 });
    if (rand(i + 19) > 0.3 && i > -19 && Math.abs(i - 7) > 2 && Math.abs(i + 7) > 2) t.push({ p: [-22.2, i], kind: rand(i + 5) > 0.6 ? 2 : 0 });
  }
  for (let x = 10; x <= 21; x += 2.4) t.push({ p: [x, -29.6 + rand(x) * 1.5], kind: rand(x + 1) > 0.5 ? 2 : 0 });
  // town square corners: blossoms
  for (const [x, z] of [[-4.6, -1.2], [4.6, -1.2], [-4.6, 4.6], [4.6, 4.6], [-4.8, 1.8], [4.8, 1.8]] as [number, number][]) t.push({ p: [x, z], kind: 1, s: 0.85 });
  // district greenery
  const more: [number, number, 0 | 1 | 2][] = [
    [-5, -9.4, 0], [5, -9.4, 0], [-4.8, -12.5, 2], [-20, -9.4, 0], [-9.5, -20, 0], [-9.5, -14.8, 1],
    [9.6, -20, 2], [20.2, -9.4, 0], [9.6, -15, 0],
    [-20, -4.6, 2], [-20, 4.6, 2], [-9.2, -4.4, 0], [-9.2, 4.6, 0],
    [9.4, -4.8, 0], [20.2, 4.8, 0], [20.2, -4.8, 0], [9.4, 4.8, 2],
    [-20, 9.4, 0], [-9.4, 20, 0], [-19.6, 20, 2], [-14, 9.4, 1],
    [-5, 9.6, 0], [5, 9.6, 0], [-5, 13.6, 2], [5, 13.6, 2], [-4.8, 20.2, 0], [4.8, 20.2, 0],
    [9.4, 9.6, 0], [20.2, 20.2, 0], [9.4, 20.4, 2], [15.4, 13.6, 0], [20.4, 13.8, 2],
  ];
  for (const [x, z, k] of more) t.push({ p: [x, z], kind: k });
  return t;
})();

function Trees() {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const crown = useRef<THREE.InstancedMesh>(null);
  const crown2 = useRef<THREE.InstancedMesh>(null);
  const pine = useRef<THREE.InstancedMesh>(null);
  const greens = ["#6DA552", "#5E9A4B", "#7DB25E", "#56904A", "#8BBE63"];
  const pinks = ["#F2A7C3", "#EE93B6", "#F6BBD0"];
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let ri = 0;
    let pi = 0;
    TREE_SPOTS.forEach((t, i) => {
      const s = (t.s ?? 1) * (0.85 + rand(i * 3.1) * 0.35);
      const [x, z] = t.p;
      const y0 = Math.abs(x) < 21 && Math.abs(z) < 21 ? BLOCK_TOP : 0;
      m.compose(new THREE.Vector3(x, y0 + 0.35 * s, z), q, new THREE.Vector3(s, s, s));
      trunk.current!.setMatrixAt(i, m);
      if (t.kind === 2) {
        m.compose(new THREE.Vector3(x, y0 + 1.3 * s, z), q, new THREE.Vector3(s, s, s));
        pine.current!.setMatrixAt(pi, m);
        pine.current!.setColorAt(pi++, col.set(greens[(i + 1) % greens.length]).multiplyScalar(0.85));
      } else {
        const c = t.kind === 1 ? pinks[i % pinks.length] : greens[i % greens.length];
        m.compose(new THREE.Vector3(x, y0 + 1.15 * s, z), q, new THREE.Vector3(s, s * 0.92, s));
        crown.current!.setMatrixAt(ri, m);
        crown.current!.setColorAt(ri, col.set(c));
        m.compose(new THREE.Vector3(x + 0.22 * s, y0 + 1.62 * s, z + 0.1 * s), q, new THREE.Vector3(s * 0.62, s * 0.6, s * 0.62));
        crown2.current!.setMatrixAt(ri, m);
        crown2.current!.setColorAt(ri++, col.set(c).offsetHSL(0, 0, 0.05));
      }
    });
    for (const im of [trunk, crown, crown2, pine]) {
      im.current!.instanceMatrix.needsUpdate = true;
      if (im.current!.instanceColor) im.current!.instanceColor.needsUpdate = true;
    }
    crown.current!.count = ri;
    crown2.current!.count = ri;
    pine.current!.count = pi;
  }, []);
  const n = TREE_SPOTS.length;
  return (
    <group>
      <instancedMesh ref={trunk} args={[undefined, undefined, n]} castShadow material={M.woodDark}>
        <cylinderGeometry args={[0.09, 0.13, 0.7, 6]} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, n]} castShadow receiveShadow>
        <icosahedronGeometry args={[0.62, 2]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crown2} args={[undefined, undefined, n]} castShadow>
        <icosahedronGeometry args={[0.62, 2]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={pine} args={[undefined, undefined, n]} castShadow receiveShadow>
        <coneGeometry args={[0.6, 1.9, 8]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

const LAMP_SPOTS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (const a of ROADS) for (const b of ROADS) for (const [dx, dz] of [[-1.55, -1.55], [1.55, 1.55]]) out.push([a + dx, b + dz]);
  for (const a of ROADS) for (const t of [-15, 15]) out.push([a + 1.55, t], [t, a - 1.55]);
  for (let x = -19; x <= -4; x += 4) out.push([x, -24.3]);
  return out;
})();

function Lamps() {
  const post = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    LAMP_SPOTS.forEach(([x, z], i) => {
      m.makeTranslation(x, 0.75, z);
      post.current!.setMatrixAt(i, m);
      m.makeTranslation(x, 1.55, z);
      head.current!.setMatrixAt(i, m);
    });
    post.current!.instanceMatrix.needsUpdate = true;
    head.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <instancedMesh ref={post} args={[undefined, undefined, LAMP_SPOTS.length]} castShadow material={M.ink}>
        <cylinderGeometry args={[0.045, 0.06, 1.5, 6]} />
      </instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, LAMP_SPOTS.length]} material={M.lamp}>
        <sphereGeometry args={[0.14, 12, 10]} />
      </instancedMesh>
    </group>
  );
}

/** Strings of party bulbs between two points. */
function Bulbs({ a, b, n = 8, sag = 0.4 }: { a: V3; b: V3; n?: number; sag?: number }) {
  const pts = useMemo(() => {
    const out: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t]);
    }
    return out;
  }, [a, b, n, sag]);
  return (
    <group>
      {pts.map((p, i) => (
        <Bulb key={i} position={p} />
      ))}
    </group>
  );
}

/* ---------- districts ---------- */

function Windows({ w, h, rows, cols, at, face = "z", y0 = 0.6, size = [0.38, 0.5] }: { w: number; h: number; rows: number; cols: number; at: V3; face?: "x" | "z"; y0?: number; size?: [number, number] }) {
  const out: ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const u = -w / 2 + (w / cols) * (c + 0.5);
      const y = y0 + (rows > 1 ? (r * (h - y0 - 0.5)) / (rows - 1) : 0);
      const p: V3 = face === "z" ? [at[0] + u, at[1] + y, at[2]] : [at[0], at[1] + y, at[2] + u];
      const s: V3 = face === "z" ? [size[0], size[1], 0.06] : [0.06, size[1], size[0]];
      out.push(<WindowPane key={`${r}-${c}`} position={p} scale={s} />);
    }
  return <>{out}</>;
}

function House({ p, wall, roof, r = 0 }: { p: V3; wall: string; roof: string; r?: number }) {
  const wm = useMemo(() => new THREE.MeshStandardMaterial({ color: wall, roughness: 0.85 }), [wall]);
  const rm = useMemo(() => new THREE.MeshStandardMaterial({ color: roof, roughness: 0.8 }), [roof]);
  return (
    <group position={p} rotation={[0, r, 0]}>
      <B p={[0, 1, 0]} s={[2.6, 2, 2.4]} m={wm} />
      <mesh geometry={gable} position={[0, 2, 0]} scale={[3.0, 1.35, 2.7]} material={rm} castShadow />
      <B p={[0, 0.12, 1.55]} s={[2.8, 0.24, 0.7]} m={M.white} />
      <B p={[0.55, 0.62, 1.22]} s={[0.55, 1.0, 0.05]} m={M.woodDark} shadow={false} />
      <Windows w={2.6} h={1.2} rows={1} cols={2} at={[-0.35, 0.95, 1.22]} y0={0} size={[0.42, 0.48]} />
      <Windows w={2.4} h={1.2} rows={1} cols={2} at={[1.32, 0.95, 0]} face="x" y0={0} size={[0.42, 0.48]} />
      <B p={[0.8, 2.7, -0.5]} s={[0.32, 0.9, 0.32]} m={M.brickDark} />
      {/* picket fence */}
      {[-1, 1].map((side) => (
        <B key={side} p={[side * 1.75, 0.3, 0.6]} s={[0.06, 0.4, 2.6]} m={M.white} />
      ))}
    </group>
  );
}

function TownSquare() {
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current) water.current.scale.y = 1 + Math.sin(clock.elapsedTime * 3) * 0.08;
  });
  return (
    <group>
      <mesh position={[0, BLOCK_TOP + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.plaza} receiveShadow>
        <circleGeometry args={[5.4, 48]} />
      </mesh>
      <mesh position={[0, BLOCK_TOP + 0.02, 3.2]} rotation={[-Math.PI / 2, 0, 0]} material={M.paving} receiveShadow>
        <ringGeometry args={[1.9, 2.4, 40]} />
      </mesh>
      {/* fountain */}
      <group position={[0, BLOCK_TOP, 3.2]}>
        <C p={[0, 0.22, 0]} r1={1.6} r2={1.7} h={0.44} m={M.paving} seg={32} />
        <C p={[0, 0.45, 0]} r1={1.42} h={0.04} m={M.water} seg={32} />
        <C p={[0, 0.85, 0]} r1={0.16} r2={0.24} h={0.9} m={M.paving} seg={12} />
        <C p={[0, 1.3, 0]} r1={0.62} r2={0.4} h={0.14} m={M.paving} seg={24} />
        <mesh ref={water} position={[0, 1.7, 0]} material={M.water}>
          <coneGeometry args={[0.32, 0.9, 16, 1, true]} />
        </mesh>
      </group>
      {/* stage with a shell canopy */}
      <group position={[0, BLOCK_TOP, -4.5]}>
        <B p={[0, 0.25, 0.1]} s={[4.6, 0.5, 2.2]} m={M.wood} />
        <B p={[0, 0.12, 1.35]} s={[1.6, 0.24, 0.5]} m={M.woodDark} />
        <mesh position={[0, 0.5, -0.4]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[2.5, 2.5, 2.4, 32, 1, true, 0, Math.PI]} />
          <meshStandardMaterial color="#EAD9BE" side={THREE.DoubleSide} roughness={0.8} />
        </mesh>
        <Bulbs a={[-2.3, 2.6, 0.8]} b={[2.3, 2.6, 0.8]} n={10} sag={0.3} />
      </group>
      <Kit name="bench" p={[-3.8, BLOCK_TOP, 3.2]} r={Math.PI / 2} w={1.2} />
      <Kit name="bench" p={[3.8, BLOCK_TOP, 3.2]} r={-Math.PI / 2} w={1.2} />
      <Kit name="bench" p={[-2.4, BLOCK_TOP, 5.3]} r={Math.PI} w={1.2} />
    </group>
  );
}

function Apartments() {
  const y = BLOCK_TOP;
  return (
    <group>
      <B p={[-12.4, y + 0.01, -12.4]} s={[6.5, 0.02, 6.5]} m={M.paving} shadow={false} />
      <Kit name="building_F_withoutBase" p={[-18.3, y, -18.3]} w={4} />
      <Kit name="building_C_withoutBase" p={[-14, y, -18.5]} w={3.6} />
      <Kit name="building_D_withoutBase" p={[-9.9, y, -18.4]} w={3.8} />
      <Kit name="building_A_withoutBase" p={[-18.5, y, -13.8]} r={Math.PI / 2} w={3.6} />
      <Kit name="building_E_withoutBase" p={[-18.4, y, -9.8]} r={Math.PI / 2} w={3.8} />
      <Kit name="bush" p={[-14.5, y, -15.6]} w={1} />
      <Kit name="bush" p={[-15.6, y, -14.2]} w={0.9} />
      <Kit name="firehydrant" p={[-8.8, y, -8.8]} w={0.35} />
    </group>
  );
}

function Tower({ p, w, d, h, tint = "#7FB3DF" }: { p: V3; w: number; d: number; h: number; tint?: string }) {
  const floors = Math.floor(h / 0.9);
  const glass = useMemo(() => {
    const g = M.glass.clone();
    g.color.set(tint);
    return g;
  }, [tint]);
  return (
    <group position={p}>
      <RoundedBox args={[w, h, d]} radius={0.18} position={[0, h / 2, 0]} material={glass} castShadow receiveShadow />
      {Array.from({ length: floors }, (_, i) => (
        <B key={i} p={[0, 0.9 + i * 0.9, 0]} s={[w + 0.04, 0.1, d + 0.04]} m={M.band} shadow={false} />
      ))}
      <B p={[0, h + 0.12, 0]} s={[w + 0.1, 0.24, d + 0.1]} m={M.white} />
      <B p={[w * 0.18, h + 0.45, -d * 0.15]} s={[w * 0.4, 0.5, d * 0.4]} m={M.paving} />
      <B p={[-w * 0.2, h + 0.32, d * 0.2]} s={[w * 0.4, 0.2, d * 0.35]} m={M.grassDark} />
    </group>
  );
}

function StartupRow() {
  const y = BLOCK_TOP;
  return (
    <group>
      <Tower p={[-2.6, y, -17.4]} w={3.8} d={3.8} h={11.5} />
      <Tower p={[2.4, y, -18]} w={3.4} d={3.6} h={8.2} tint="#8CC0E4" />
      <Tower p={[3.4, y, -13.4]} w={2.8} d={3} h={5.6} tint="#6EA6D6" />
      <B p={[-2, y + 0.01, -11.4]} s={[6, 0.02, 3.6]} m={M.paving} shadow={false} />
      <C p={[-3.6, y + 0.25, -12.6]} r1={0.75} h={0.5} m={M.paving} />
      <C p={[-3.6, y + 0.52, -12.6]} r1={0.62} h={0.06} m={M.water} />
    </group>
  );
}

function CreatorLoft() {
  const y = BLOCK_TOP;
  const arches: ReactNode[] = [];
  for (let i = 0; i < 4; i++) {
    arches.push(<B key={`z${i}`} p={[11.6 + i * 1.9, y + 2.1, -11.88]} s={[1.1, 2.2, 0.08]} m={M.window} shadow={false} />);
    arches.push(
      <mesh key={`zc${i}`} position={[11.6 + i * 1.9, y + 3.2, -11.88]} rotation={[Math.PI / 2, 0, 0]} material={M.window}>
        <cylinderGeometry args={[0.55, 0.55, 0.08, 16, 1, false, -Math.PI / 2, Math.PI]} />
      </mesh>,
    );
  }
  for (let i = 0; i < 3; i++) arches.push(<B key={`x${i}`} p={[20.28, y + 2.1, -18.4 + i * 2.6]} s={[0.08, 2.2, 1.3]} m={M.window} shadow={false} />);
  return (
    <group>
      <B p={[15.6, y + 2.3, -15.6]} s={[9.2, 4.6, 7.4]} m={M.brick} />
      <B p={[15.6, y + 4.75, -15.6]} s={[9.5, 0.3, 7.7]} m={M.brickDark} />
      <B p={[15.6, y + 4.95, -15.6]} s={[8.4, 0.1, 6.6]} m={M.wood} />
      {arches}
      <B p={[11.2, y + 0.75, -11.82]} s={[1.4, 1.5, 0.1]} m={M.woodDark} shadow={false} />
      {/* rooftop hangout */}
      <B p={[17.6, y + 5.6, -17.4]} s={[2.4, 1.2, 2.2]} m={M.brickDark} />
      <Bulbs a={[11.8, y + 6.2, -12.4]} b={[19.4, y + 6.2, -12.4]} n={12} sag={0.5} />
      <Bulbs a={[11.8, y + 6.2, -18.8]} b={[19.4, y + 6.2, -18.8]} n={12} sag={0.5} />
      {[11.8, 19.4].flatMap((x) => [-12.4, -18.8].map((z) => <B key={`${x}${z}`} p={[x, y + 5.6, z]} s={[0.08, 1.2, 0.08]} m={M.ink} />))}
      <Kit name="car_hatchback" p={[19.2, y, -10]} r={Math.PI / 2} w={1.0} />
    </group>
  );
}

function FoodTruck({ p, color, r = 0 }: { p: V3; color: string; r?: number }) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), [color]);
  return (
    <group position={p} rotation={[0, r, 0]}>
      <RoundedBox args={[1.5, 1.5, 2.8]} radius={0.15} position={[0, 1.0, 0]} material={m} castShadow receiveShadow />
      <RoundedBox args={[1.4, 1.0, 0.9]} radius={0.12} position={[0, 0.75, 1.75]} material={m} castShadow />
      <B p={[0, 1.0, 2.2]} s={[1.1, 0.4, 0.05]} m={M.window} shadow={false} />
      <B p={[0.77, 1.25, -0.2]} s={[0.04, 0.6, 1.6]} m={M.window} shadow={false} />
      <mesh position={[1.05, 1.7, -0.2]} rotation={[0, 0, -0.5]} castShadow>
        <boxGeometry args={[0.7, 0.05, 1.9]} />
        <meshStandardMaterial color="#FBF8F2" />
      </mesh>
      {[-0.9, 1.6].flatMap((z) =>
        [-0.72, 0.72].map((x) => (
          <mesh key={`${x}${z}`} position={[x, 0.25, z]} rotation={[0, 0, Math.PI / 2]} material={M.ink}>
            <cylinderGeometry args={[0.25, 0.25, 0.16, 14]} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Umbrella({ p, color }: { p: V3; color: string }) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }), [color]);
  return (
    <group position={p}>
      <C p={[0, 0.35, 0]} r1={0.42} h={0.05} m={M.wood} seg={14} />
      <C p={[0, 0.18, 0]} r1={0.04} h={0.36} m={M.woodDark} seg={6} />
      <C p={[0, 0.8, 0]} r1={0.025} h={1.0} m={M.ink} seg={6} />
      <mesh position={[0, 1.38, 0]} material={m} castShadow>
        <coneGeometry args={[0.85, 0.4, 10, 1, true]} />
      </mesh>
    </group>
  );
}

function FoodMarket() {
  const y = BLOCK_TOP;
  return (
    <group>
      <B p={[-16.4, y + 0.01, 0]} s={[8, 0.02, 10.6]} m={M.paving} shadow={false} />
      <FoodTruck p={[-17.6, y, -3.2]} color="#4FC1B0" r={Math.PI / 2} />
      <FoodTruck p={[-17.6, y, 0.4]} color="#F2994A" r={Math.PI / 2} />
      <FoodTruck p={[-17.6, y, 4]} color="#F28DB2" r={Math.PI / 2} />
      <Umbrella p={[-13.6, y, -3.4]} color="#E5484D" />
      <Umbrella p={[-13.4, y, 3.8]} color="#4FA3E0" />
      <Umbrella p={[-10.4, y, -3.8]} color="#F2C94C" />
      <Bulbs a={[-20.2, y + 2.6, -5.2]} b={[-12, y + 2.4, -5.2]} n={12} />
      <Bulbs a={[-20.2, y + 2.6, 5.2]} b={[-12, y + 2.4, 5.2]} n={12} />
      {[[-20.2, -5.2], [-12, -5.2], [-20.2, 5.2], [-12, 5.2]].map(([x, z]) => (
        <B key={`${x}${z}`} p={[x, y + 1.25, z]} s={[0.08, 2.5, 0.08]} m={M.woodDark} />
      ))}
    </group>
  );
}

function Gym() {
  const y = BLOCK_TOP;
  const track = useMemo(() => {
    const s = roundedRect(10.2, 7.6, 3.6);
    s.holes.push(roundedRect(7.6, 5.0, 2.3));
    return new THREE.ShapeGeometry(s, 24);
  }, []);
  const field = useMemo(() => new THREE.ShapeGeometry(roundedRect(7.6, 5.0, 2.3), 24), []);
  return (
    <group>
      <group position={[15.4, y + 0.02, 0.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={track} material={M.track} receiveShadow />
        <mesh geometry={field} material={M.field} receiveShadow position={[0, 0, 0.02]} />
        <mesh position={[0, 0, 0.04]} material={M.paint}>
          <ringGeometry args={[0.8, 0.9, 32]} />
        </mesh>
        <mesh position={[0, 0, 0.04]} material={M.paint}>
          <planeGeometry args={[0.08, 4.6]} />
        </mesh>
      </group>
      <group position={[14, y, -4.6]}>
        <B p={[0, 1.2, 0]} s={[5.4, 2.4, 2]} m={M.ink} />
        <B p={[0, 2.5, 0]} s={[5.6, 0.2, 2.2]} m={M.white} />
        <Windows w={5} h={1.6} rows={1} cols={4} at={[0, 0.7, 1.02]} y0={0.5} size={[1.0, 1.1]} />
      </group>
      {[11.4, 19.4].map((x) => (
        <group key={x} position={[x, y, 0.8]}>
          <B p={[0, 0.6, -0.5]} s={[0.06, 1.2, 0.06]} m={M.white} />
          <B p={[0, 0.6, 0.5]} s={[0.06, 1.2, 0.06]} m={M.white} />
          <B p={[0, 1.18, 0]} s={[0.06, 0.06, 1.06]} m={M.white} />
        </group>
      ))}
    </group>
  );
}

function Cafe() {
  const y = BLOCK_TOP;
  const awning = (p: V3, r: number, a: string, b: string) => (
    <group position={p} rotation={[0, r, 0]}>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-1.75 + i * 0.5, 0, 0]} rotation={[0.55, 0, 0]} castShadow>
          <boxGeometry args={[0.5, 0.05, 1.1]} />
          <meshStandardMaterial color={i % 2 ? a : b} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
  return (
    <group>
      <group position={[-17.2, y, 16.6]}>
        <B p={[0, 1.8, 0]} s={[5.2, 3.6, 5]} m={new THREE.MeshStandardMaterial({ color: "#E3CFA8", roughness: 0.85 })} />
        <B p={[0, 3.7, 0]} s={[5.5, 0.25, 5.3]} m={M.white} />
        <B p={[1.6, 4.0, -1.2]} s={[1.2, 0.6, 1.2]} m={M.paving} />
        <Windows w={4.4} h={3} rows={2} cols={3} at={[0, 0, 2.52]} y0={0.9} size={[0.8, 0.8]} />
        <Windows w={4.4} h={3} rows={2} cols={3} at={[2.62, 0, 0]} face="x" y0={0.9} size={[0.8, 0.8]} />
        {awning([0, 1.95, 2.95], 0, "#1E8E6E", "#FBF8F2")}
        {awning([3.05, 1.95, 0], Math.PI / 2, "#E5484D", "#FBF8F2")}
        <C p={[-1.6, 4.1, 1.4]} r1={0.4} r2={0.3} h={0.6} m={M.white} />
      </group>
      <Umbrella p={[-12.6, y, 15.6]} color="#1E8E6E" />
      <Umbrella p={[-12.4, y, 18.6]} color="#E5484D" />
      <Umbrella p={[-15.8, y, 10.6]} color="#F2C94C" />
      <Umbrella p={[-19.2, y, 10.6]} color="#1E8E6E" />
    </group>
  );
}

function Campus() {
  const y = BLOCK_TOP;
  return (
    <group>
      <B p={[0, y + 0.01, 13.2]} s={[1.2, 0.02, 4]} m={M.paving} shadow={false} />
      <B p={[0, y + 0.01, 12.6]} s={[9, 0.02, 1.1]} m={M.paving} shadow={false} />
      <group position={[0.6, y, 17.6]}>
        <B p={[0, 1.6, 0]} s={[9, 3.2, 4]} m={M.brick} />
        <mesh geometry={gable} position={[0, 3.2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[4.5, 1.6, 9.3]} material={M.roofSlate} castShadow />
        <Windows w={8} h={2.6} rows={2} cols={6} at={[0, 0, 2.02]} y0={0.8} size={[0.5, 0.8]} />
        <Windows w={3.4} h={2.6} rows={2} cols={2} at={[4.52, 0, 0]} face="x" y0={0.8} size={[0.5, 0.8]} />
        <B p={[1.8, 0.7, 2.06]} s={[1, 1.4, 0.08]} m={M.woodDark} shadow={false} />
        {/* clock tower */}
        <group position={[-2.4, 0, 0.6]}>
          <B p={[0, 3.6, 0]} s={[1.7, 7.2, 1.7]} m={M.brickDark} />
          <mesh geometry={gable} position={[0, 7.2, 0]} scale={[2, 2.2, 2]} material={M.roofSlate} castShadow />
          <mesh geometry={gable} position={[0, 7.2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[2, 2.2, 2]} material={M.roofSlate} castShadow />
          <mesh position={[0, 5.9, 0.87]} material={M.white}>
            <circleGeometry args={[0.55, 24]} />
          </mesh>
          <mesh position={[0.87, 5.9, 0]} rotation={[0, Math.PI / 2, 0]} material={M.white}>
            <circleGeometry args={[0.55, 24]} />
          </mesh>
          <B p={[0, 6.05, 0.9]} s={[0.05, 0.36, 0.02]} m={M.ink} shadow={false} />
          <B p={[0.1, 5.9, 0.9]} s={[0.28, 0.05, 0.02]} m={M.ink} shadow={false} />
        </group>
      </group>
      {/* statue */}
      <group position={[3.4, y, 11.2]}>
        <C p={[0, 0.3, 0]} r1={0.55} r2={0.65} h={0.6} m={M.paving} />
        <C p={[0, 1.05, 0]} r1={0.16} r2={0.22} h={0.9} m={M.stone} seg={10} />
        <mesh position={[0, 1.65, 0]} material={M.stone} castShadow>
          <sphereGeometry args={[0.2, 12, 10]} />
        </mesh>
      </group>
    </group>
  );
}

function Suburbs() {
  const y = BLOCK_TOP;
  return (
    <group>
      <House p={[18.2, y, 10.6]} wall="#6E9FD8" roof="#4D5B7A" r={-Math.PI / 2} />
      <House p={[18.2, y, 15.6]} wall="#F2D06B" roof="#B5563C" r={-Math.PI / 2} />
      <House p={[11.2, y, 18.6]} wall="#8DBE7A" roof="#4E6B4A" r={Math.PI} />
      <House p={[16.2, y, 19]} wall="#A98BCB" roof="#6E4E8C" r={Math.PI} />
      {/* playground */}
      <mesh position={[14.6, y + 0.02, 14.4]} rotation={[-Math.PI / 2, 0, 0]} material={M.sand} receiveShadow>
        <circleGeometry args={[1.7, 32]} />
      </mesh>
      <group position={[14.8, y, 14.6]} rotation={[0, -0.6, 0]}>
        <B p={[0, 0.6, -0.6]} s={[0.8, 1.2, 0.8]} m={M.red} />
        <mesh position={[0, 0.6, 0.45]} rotation={[0.7, 0, 0]} castShadow>
          <boxGeometry args={[0.5, 0.06, 1.6]} />
          <meshStandardMaterial color="#4FC1B0" />
        </mesh>
      </group>
      <group position={[10.2, y, 15.4]}>
        {[-0.8, 0.8].map((z) => (
          <B key={z} p={[0, 0.7, z]} s={[0.08, 1.4, 0.08]} m={M.ink} />
        ))}
        <B p={[0, 1.4, 0]} s={[0.08, 0.08, 1.7]} m={M.ink} />
        {[-0.35, 0.35].map((z) => (
          <B key={z} p={[0, 0.4, z]} s={[0.3, 0.05, 0.2]} m={M.red} />
        ))}
      </group>
    </group>
  );
}

function Waterfront() {
  const boat = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (boat.current) {
      boat.current.position.y = -0.3 + Math.sin(t * 1.4) * 0.06;
      boat.current.rotation.z = Math.sin(t * 1.1) * 0.05;
      boat.current.position.x = -18 + Math.sin(t * 0.12) * 2.5;
    }
  });
  const bridgeRed = useMemo(() => new THREE.MeshStandardMaterial({ color: "#C8443A", roughness: 0.6 }), []);
  const cable = useMemo(() => {
    const mk = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, b, c), 20, 0.05, 5);
    return [-0.7, 0.7].flatMap((dz) => [
      mk(new THREE.Vector3(-0.5, 5.4, dz), new THREE.Vector3(2.8, 1.8, dz), new THREE.Vector3(6, 5.4, dz)),
      mk(new THREE.Vector3(-4, 1.4, dz), new THREE.Vector3(-2.4, 2.4, dz), new THREE.Vector3(-0.5, 5.4, dz)),
      mk(new THREE.Vector3(6, 5.4, dz), new THREE.Vector3(8, 2.4, dz), new THREE.Vector3(9.8, 1.4, dz)),
    ]);
  }, []);
  return (
    <group>
      {/* boardwalk + pier */}
      <B p={[-11.75, 0.06, -22.95]} s={[18.5, 0.14, 3.3]} m={M.wood} />
      <B p={[-13.2, 0.06, -26.8]} s={[1.8, 0.14, 4.6]} m={M.wood} />
      {[-25, -27, -29].flatMap((z) => [-14.1, -12.3].map((x) => <C key={`${x}${z}`} p={[x, -0.3, z]} r1={0.1} h={0.8} m={M.woodDark} seg={6} />))}
      {Array.from({ length: 9 }, (_, i) => (
        <B key={i} p={[-20.5 + i * 2.2, 0.38, -24.55]} s={[0.08, 0.5, 0.08]} m={M.woodDark} />
      ))}
      <B p={[-11.7, 0.6, -24.55]} s={[18, 0.06, 0.06]} m={M.woodDark} />
      {/* sailboat */}
      <group ref={boat} position={[-18, -0.3, -27.6]}>
        <mesh scale={[0.7, 0.35, 1.8]} material={M.white} castShadow>
          <sphereGeometry args={[1, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        </mesh>
        <C p={[0, 1.6, 0.1]} r1={0.04} h={3.2} m={M.woodDark} seg={6} />
        <mesh position={[0, 1.7, -0.5]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <shapeGeometry args={[(() => { const s = new THREE.Shape(); s.moveTo(-0.6, -1.2); s.lineTo(0.75, -1.2); s.lineTo(-0.6, 1.5); s.closePath(); return s; })()]} />
          <meshStandardMaterial color="#FBF8F2" side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* islet with gazebo and the red bridge */}
      <group position={[-5.4, 0, -27.4]}>
        <C p={[0, -0.25, 0]} r1={1.8} r2={2.1} h={0.9} m={M.stone} seg={10} />
        <C p={[0, 0.25, 0]} r1={1.6} h={0.1} m={M.grassDark} seg={20} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <C key={i} p={[Math.cos((i / 6) * Math.PI * 2) * 0.9, 0.95, Math.sin((i / 6) * Math.PI * 2) * 0.9]} r1={0.05} h={1.3} m={M.white} seg={6} />
        ))}
        <mesh position={[0, 1.85, 0]} castShadow material={M.roofSlate}>
          <coneGeometry args={[1.3, 0.8, 6]} />
        </mesh>
      </group>
      <group position={[0, 0, -27.4]}>
        <B p={[2.9, 1.3, 0]} s={[13.8, 0.2, 1.4]} m={bridgeRed} />
        {[-0.5, 6].map((x) => (
          <group key={x}>
            {[-0.7, 0.7].map((dz) => (
              <B key={dz} p={[x, 2.4, dz]} s={[0.3, 5.6, 0.3]} m={bridgeRed} />
            ))}
            <B p={[x, 4.9, 0]} s={[0.3, 0.3, 1.7]} m={bridgeRed} />
            <B p={[x, 3.4, 0]} s={[0.3, 0.25, 1.7]} m={bridgeRed} />
            <B p={[x, -0.2, 0]} s={[1.2, 0.8, 2.2]} m={M.stone} />
          </group>
        ))}
        {cable.map((g, i) => (
          <mesh key={i} geometry={g} material={bridgeRed} />
        ))}
      </group>
    </group>
  );
}

/* ---------- moving cars ---------- */

const LOOP: [number, number][] = [[-7.6, -7.6], [-7.6, 7.6], [7.6, 7.6], [7.6, -7.6]];
function Car({ name, phase }: { name: string; phase: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const per = 30.4 * 2; // loop length
    let d = ((clock.elapsedTime * 2.2 + phase * per) % per + per) % per;
    for (let i = 0; i < 4; i++) {
      const a = LOOP[i];
      const b = LOOP[(i + 1) % 4];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= l) {
        const t = d / l;
        ref.current!.position.set(a[0] + (b[0] - a[0]) * t, 0.03, a[1] + (b[1] - a[1]) * t);
        ref.current!.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
        break;
      }
      d -= l;
    }
  });
  return (
    <group ref={ref}>
      <Kit name={name} p={[0, 0, 0]} w={0.95} />
    </group>
  );
}

/* ---------- clickable districts ---------- */

function Hit({ d, children }: { d: District; children: ReactNode }) {
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selection?.kind === "place" && s.selection.id === d.id);
  const [hover, setHover] = useState(false);
  useCursor(hover);
  const [x0, x1, z0, z1] = bounds(d);
  const outline = useMemo(() => {
    const w = x1 - x0 + 0.5;
    const h = z1 - z0 + 0.5;
    const s = roundedRect(w, h, 0.6);
    s.holes.push(roundedRect(w - 0.5, h - 0.5, 0.4));
    return new THREE.ShapeGeometry(s, 8);
  }, [x0, x1, z0, z1]);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select({ kind: "place", id: d.id });
  };
  return (
    <group
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      {children}
      {/* invisible floor so the whole block is clickable */}
      <mesh position={[(x0 + x1) / 2, BLOCK_TOP + 0.03, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[x1 - x0, z1 - z0]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {(hover || selected) && (
        <mesh geometry={outline} position={[(x0 + x1) / 2, BLOCK_TOP + 0.04, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <meshBasicMaterial color="#0EA5A4" transparent opacity={selected ? 0.95 : 0.5} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

const PARTS: Record<string, () => ReactNode> = {
  town_square: TownSquare,
  apartments: Apartments,
  startup_row: StartupRow,
  creator_loft: CreatorLoft,
  food_market: FoodMarket,
  gym: Gym,
  cafe: Cafe,
  campus: Campus,
  suburbs: Suburbs,
  waterfront: Waterfront,
};

function Labels() {
  const town = useStore((s) => s.town);
  const labels = useStore((s) => s.labels);
  const select = useStore((s) => s.select);
  // Phones: district names only once zoomed in, otherwise they cover the whole island.
  const narrow = useThree((s) => s.size.width < 560);
  const [zoomedIn, setZoomedIn] = useState(false);
  useFrame(({ camera }) => {
    const z = camera.zoom > live.fitZoom * 1.5;
    if (z !== zoomedIn) setZoomedIn(z);
  });
  if (!labels || !town || (narrow && !zoomedIn)) return null;
  return (
    <>
      {DISTRICTS.map((d) => {
        // The square's label sits by the fountain so it never covers the crowd at the stage.
        const [x, z] = d.id === "waterfront" ? [-12, -26] : d.id === "town_square" ? [1.5, 5.2] : center(d);
        const Icon = PLACE_BY_ID[d.id]?.icon;
        const name = town.locations.find((l) => l.id === d.id)?.name ?? d.id;
        return (
          <Html key={d.id} position={[x, d.labelY, z]} center zIndexRange={[40, 0]} portal={htmlPortal}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                select({ kind: "place", id: d.id });
              }}
              className="flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-ink shadow-[0_2px_10px_rgba(0,0,0,.14)] transition hover:scale-105 sm:px-2.5 sm:py-1 sm:text-[12px]"
            >
              {Icon && <Icon size={12} className="text-teal" />} {name}
            </button>
          </Html>
        );
      })}
    </>
  );
}

export default function World() {
  return (
    <WindowSet limit={400} material={M.window} frustumCulled={false}>
      <boxGeometry />
      <BulbSet limit={300} material={M.bulb} frustumCulled={false}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <WorldInner />
      </BulbSet>
    </WindowSet>
  );
}

function WorldInner() {
  return (
    <group>
      <Island />
      <Trees />
      <Lamps />
      {DISTRICTS.map((d) => {
        const Part = PARTS[d.id];
        return (
          <Hit key={d.id} d={d}>
            <Part />
          </Hit>
        );
      })}
      <Car name="car_taxi" phase={0} />
      <Car name="car_sedan" phase={0.33} />
      <Car name="car_stationwagon" phase={0.66} />
      <Labels />
    </group>
  );
}

