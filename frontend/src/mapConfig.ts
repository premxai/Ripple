/**
 * Where things are on the illustrated map (public/map/town.webp, 3840x2160).
 * All numbers are percentages of the image width/height, so they survive any resize.
 *  - spot: where residents stand when they are at this place
 *  - box:  the clickable area of the district
 * If you regenerate the map, re-measure these against the new image.
 */
import type { LucideIcon } from "lucide-react";
import { Building2, Coffee, Dumbbell, GraduationCap, Home, Landmark, Palette, Sailboat, Truck, Building } from "lucide-react";

export const MAP = { src: "/map/town.webp", small: "/map/town-small.webp", width: 2000, height: 1125 };

export interface MapPlace {
  id: string;
  spot: [number, number];
  box: { x: number; y: number; w: number; h: number };
  icon: LucideIcon;
}

// Order matters: later entries sit on top when click areas overlap.
export const PLACES: MapPlace[] = [
  { id: "town_square", spot: [49.3, 52.5], box: { x: 36, y: 37, w: 28, h: 24 }, icon: Landmark },
  { id: "apartments", spot: [40.5, 38.5], box: { x: 33, y: 16, w: 28, h: 21 }, icon: Building },
  { id: "waterfront", spot: [30.5, 18.5], box: { x: 25, y: 2, w: 36, h: 16 }, icon: Sailboat },
  { id: "startup_row", spot: [72.5, 34], box: { x: 63.5, y: 2, w: 22.5, h: 31 }, icon: Building2 },
  { id: "creator_loft", spot: [79, 52], box: { x: 80.5, y: 28, w: 15.5, h: 23 }, icon: Palette },
  { id: "gym", spot: [70, 64], box: { x: 63.5, y: 50, w: 22, h: 21 }, icon: Dumbbell },
  { id: "suburbs", spot: [52, 80.5], box: { x: 32, y: 63, w: 39, h: 23 }, icon: Home },
  { id: "campus", spot: [24.5, 66], box: { x: 15, y: 39, w: 19, h: 33 }, icon: GraduationCap },
  { id: "cafe", spot: [10.5, 50.5], box: { x: 3, y: 35, w: 15, h: 18 }, icon: Coffee },
  { id: "food_market", spot: [22, 34.5], box: { x: 11.5, y: 22, w: 17, h: 15 }, icon: Truck },
];

export const PLACE_BY_ID = Object.fromEntries(PLACES.map((p) => [p.id, p]));

/** Spread people standing at the same place so they don't overlap (percent offsets). */
export function slot(index: number, count: number): [number, number] {
  if (count <= 1) return [0, 0];
  const ring = index < 6 ? 0 : 1;
  const inRing = ring === 0 ? Math.min(count, 6) : count - 6;
  const i = ring === 0 ? index : index - 6;
  const a = (i / inRing) * Math.PI * 2 + (ring ? 0.5 : 0.2);
  const r = ring ? 4.4 : 2.6;
  return [Math.cos(a) * r, Math.sin(a) * r * 1.05];
}
