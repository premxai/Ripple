/** Runtime state shared across the 3D scene without React re-renders. */
import type { MutableRefObject } from "react";
import * as THREE from "three";

/**
 * One fixed container for every drei <Html>. Without it each label re-parents itself when
 * R3F connects pointer events, and React 19 then fails to remove the old node.
 */
export const htmlPortal: MutableRefObject<HTMLElement> = { current: null! };

export const live = {
  /** 0 = warm afternoon, 1 = dusk. Eased toward the target each frame. */
  dusk: 0,
  /** Camera zoom that fits the whole island; names show once zoomed in past this. */
  fitZoom: 10,
  /** Current world position of every resident, written by the characters each frame. */
  positions: new Map<string, THREE.Vector3>(),
};

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

/** Shared materials: one instance each keeps draw state cheap and lets dusk drive them centrally. */
export const M = {
  grass: std("#92C062"),
  grassDark: std("#86B25A"),
  dirt: std("#8C6A4E"),
  stone: std("#9A948C"),
  road: std("#61666F", { roughness: 0.95 }),
  paint: std("#F5F2EA"),
  walk: std("#E7E0D2"),
  plaza: std("#EFE8DA"),
  paving: std("#DCD3C3"),
  wood: std("#B07D52"),
  woodDark: std("#7E5636"),
  white: std("#FBF8F2"),
  ink: std("#3A3D45"),
  brick: std("#B5563C"),
  brickDark: std("#8E3F2D"),
  roofSlate: std("#5D6577"),
  water: new THREE.MeshStandardMaterial({ color: "#3D8FD1", roughness: 0.15, metalness: 0.1, emissive: "#0B4D8A", emissiveIntensity: 0.25 }),
  glass: new THREE.MeshStandardMaterial({ color: "#6FA8D8", roughness: 0.12, metalness: 0.55 }),
  window: new THREE.MeshStandardMaterial({ color: "#41597A", roughness: 0.3, metalness: 0.2, emissive: "#FFC46B", emissiveIntensity: 0 }),
  /** floor bands on the glass towers: white by day, lit office floors after dark */
  band: new THREE.MeshStandardMaterial({ color: "#FBF8F2", roughness: 0.8, emissive: "#FFD089", emissiveIntensity: 0 }),
  lamp: new THREE.MeshStandardMaterial({ color: "#FFF4D6", emissive: "#FFD27A", emissiveIntensity: 0.4 }),
  bulb: new THREE.MeshStandardMaterial({ color: "#FFF4D6", emissive: "#FFC870", emissiveIntensity: 0.6 }),
  track: std("#C9584A"),
  field: std("#7DB85A"),
  sand: std("#E9D29A"),
  red: std("#D24B3E"),
  teal: std("#0EA5A4"),
};

/** Called every frame with the eased dusk value. */
export function applyDusk(d: number) {
  M.window.emissiveIntensity = 0.05 + d * 2.4;
  M.glass.emissiveIntensity = 0;
  M.band.emissiveIntensity = d * 1.6;
  M.lamp.emissiveIntensity = 0.4 + d * 3.2;
  M.bulb.emissiveIntensity = 0.5 + d * 3.5;
  M.water.emissiveIntensity = 0.25 - d * 0.15;
}
