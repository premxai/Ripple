/**
 * Town layout in world units (x right-back, z toward the viewer, y up).
 * A 3x3 grid of blocks split by two roads each way (x = ±7, z = ±7), plus a
 * harbour strip along the north edge. Seen from the isometric camera it reads
 * like public/map/town.webp: water at the top, suburbs at the front.
 */
import * as THREE from "three";

export type V2 = [number, number];

export const ROADS = [-7, 7] as const;
export const ROAD_W = 2.4;
export const ROAD_END = 21.6;
export const BLOCK_TOP = 0.18;
const SPAN = { L: [-21, -8.2], C: [-5.8, 5.8], R: [8.2, 21] } as const;
type Span = keyof typeof SPAN;

export interface District {
  id: string;
  x: Span | "W";
  z: Span | "W";
  /** where residents stand */
  spot: V2;
  /** entry points on the road network */
  doors: V2[];
  /** point residents turn toward when standing still (default: the camera) */
  face?: V2;
  labelY: number;
}

export const DISTRICTS: District[] = [
  { id: "town_square", x: "C", z: "C", spot: [0, -0.9], doors: [[0, -7], [0, 7], [-7, 0], [7, 0]], face: [0, -4.4], labelY: 2.4 },
  { id: "apartments", x: "L", z: "L", spot: [-11.2, -11.2], doors: [[-7, -11.2], [-11.2, -7]], labelY: 9 },
  { id: "startup_row", x: "C", z: "L", spot: [0, -10.2], doors: [[0, -7]], labelY: 12.5 },
  { id: "creator_loft", x: "R", z: "L", spot: [11.6, -10.4], doors: [[11.6, -7], [7, -10.4]], labelY: 7 },
  { id: "food_market", x: "L", z: "C", spot: [-11.4, 0.6], doors: [[-7, 0.6]], labelY: 4.5 },
  { id: "gym", x: "R", z: "C", spot: [10.6, 1.2], doors: [[7, 1.2]], labelY: 5 },
  { id: "cafe", x: "L", z: "R", spot: [-11, 11], doors: [[-7, 11], [-11, 7]], labelY: 5.5 },
  { id: "campus", x: "C", z: "R", spot: [0, 10.6], doors: [[0, 7]], labelY: 8.5 },
  { id: "suburbs", x: "R", z: "R", spot: [12.6, 12.6], doors: [[12.6, 7], [7, 12.6]], labelY: 5 },
  { id: "waterfront", x: "W", z: "W", spot: [-12.5, -23], doors: [[-7, -21.8]], labelY: 4 },
];
export const DISTRICT_BY_ID: Record<string, District> = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

/** Footprint of a district: [x0, x1, z0, z1]. */
export function bounds(d: District): [number, number, number, number] {
  if (d.x === "W") return [-21, -2.5, -24.6, -21.3];
  return [SPAN[d.x][0], SPAN[d.x][1], SPAN[d.z as Span][0], SPAN[d.z as Span][1]];
}
export function center(d: District): V2 {
  const [x0, x1, z0, z1] = bounds(d);
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}

/** Height of the walkable surface (blocks are raised kerbs above the road). */
export function groundY(x: number, z: number) {
  for (const s of [SPAN.L, SPAN.C, SPAN.R])
    if (x > s[0] && x < s[1]) for (const t of [SPAN.L, SPAN.C, SPAN.R]) if (z > t[0] && z < t[1]) return BLOCK_TOP;
  if (z < -21.3 && x < -2.5) return 0.12; // boardwalk
  return 0.03;
}

const onRoad = (v: number) => ROADS.some((r) => Math.abs(v - r) < 0.01);

/** Manhattan route along the road grid between two road points. */
function roadPath(a: V2, b: V2): V2[] {
  const aV = onRoad(a[0]); // on a north-south road (x = ±7)
  const bV = onRoad(b[0]);
  const aH = onRoad(a[1]);
  const bH = onRoad(b[1]);
  if (aV && bV) {
    if (a[0] === b[0]) return [a, b];
    const z = [...ROADS].sort((p, q) => Math.abs(a[1] - p) + Math.abs(b[1] - p) - (Math.abs(a[1] - q) + Math.abs(b[1] - q)))[0];
    return [a, [a[0], z], [b[0], z], b];
  }
  if (aH && bH) {
    if (a[1] === b[1]) return [a, b];
    const x = [...ROADS].sort((p, q) => Math.abs(a[0] - p) + Math.abs(b[0] - p) - (Math.abs(a[0] - q) + Math.abs(b[0] - q)))[0];
    return [a, [x, a[1]], [x, b[1]], b];
  }
  if (aV && bH) return [a, [a[0], b[1]], b];
  if (aH && bV) return [a, [b[0], a[1]], b];
  return [a, b];
}

const len = (pts: V2[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

export function snapToRoad(p: V2): V2 {
  const c = (v: number) => Math.max(-ROAD_END, Math.min(ROAD_END, v));
  let best: V2 = [ROADS[0], c(p[1])];
  for (const r of ROADS) {
    if (Math.abs(p[0] - r) < Math.abs(p[0] - best[0]) + Math.abs(p[1] - best[1])) best = [r, c(p[1])];
    const h: V2 = [c(p[0]), r];
    if (Math.abs(p[1] - r) < Math.hypot(p[0] - best[0], p[1] - best[1])) best = h;
  }
  return best;
}

/** Full walk from one standing point to another, along the streets. */
export function route(from: V2, fromId: string, to: V2, toId: string, lane: number): V2[] {
  const B = DISTRICT_BY_ID[toId];
  // "road": already walking somewhere, so rejoin the nearest street first.
  const aDoors = fromId === "road" ? [snapToRoad(from)] : DISTRICT_BY_ID[fromId]?.doors;
  if (!aDoors || !B || fromId === toId) return [from, to];
  let best: V2[] = [];
  let bestLen = Infinity;
  for (const da of aDoors)
    for (const db of B.doors) {
      const p = [from, ...roadPath(da, db), to];
      const l = len(p);
      if (l < bestLen) {
        bestLen = l;
        best = p;
      }
    }
  // Walk a little off the centre line so people don't stack in single file.
  return best.map((p, i) => (i === 0 || i === best.length - 1 ? p : ([p[0] + lane, p[1] + lane] as V2)));
}

/** Where the i-th of n residents stands in a district. */
export function standPoint(id: string, i: number, n: number): V2 {
  const d = DISTRICT_BY_ID[id] ?? DISTRICT_BY_ID.town_square;
  if (id === "town_square") {
    // An audience arc in front of the stage.
    const row = i < 6 ? 0 : 1;
    const inRow = row === 0 ? Math.min(n, 6) : n - 6;
    const k = row === 0 ? i : i - 6;
    const spread = row === 0 ? 1.05 : 0.75;
    const t = inRow <= 1 ? 0 : (k / (inRow - 1) - 0.5) * 2 * spread;
    const r = row === 0 ? 3.4 : 4.9;
    return [Math.sin(t) * r, -4.4 + Math.cos(t) * r];
  }
  if (n <= 1) return d.spot;
  const ring = i < 6 ? 0 : 1;
  const inRing = ring === 0 ? Math.min(n, 6) : n - 6;
  const k = ring === 0 ? i : i - 6;
  const a = (k / inRing) * Math.PI * 2 + (ring ? 0.5 : 0.3);
  const r = ring ? 2.3 : 1.25;
  return [d.spot[0] + Math.cos(a) * r, d.spot[1] + Math.sin(a) * r];
}

export const ISLAND_BOX = new THREE.Box3(new THREE.Vector3(-23, -3, -30.5), new THREE.Vector3(23, 6, 23));
