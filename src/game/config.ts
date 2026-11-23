// Shared constants and small math helpers for the whole game.
import {
  CORE_BLOCK_HALF,
  CORE_HALF,
  CORE_NB,
  CORE_P,
  CORE_PIER_END,
  CORE_PIER_X,
  CORE_ROAD_W,
  CORE_SIDEWALK_Y,
  DECK,
  OUTER_HIGHWAYS,
  WEAPONS,
  WEAPON_ORDER,
  WEAPON_SHOP_ORDER,
  WORLD_BOUNDS,
  WORLD_HALF,
  applySandFootPhysics,
  applySandVehiclePhysics,
  clampVal,
  createMovementState,
  deckHeight,
  distToOuterHighway,
  districtNameAt,
  groundHeightAt,
  isMeleeWeapon,
  isOceanAt,
  isOnOuterHighway,
  lerpVal,
  sandFactorAt,
  smoothVal,
  stepMovementState,
  surfaceAt,
  terrainHeightAt,
  terrainSlopeAt,
} from './terrain';
import type { HighwayCorridor, MovementInput, MovementState, SurfaceType, WeaponDef, WeaponId } from './terrain';

export {
  DECK,
  OUTER_HIGHWAYS,
  WEAPONS,
  WEAPON_ORDER,
  WEAPON_SHOP_ORDER,
  WORLD_HALF,
  applySandFootPhysics,
  applySandVehiclePhysics,
  createMovementState,
  deckHeight,
  distToOuterHighway,
  districtNameAt,
  isMeleeWeapon,
  isOceanAt,
  isOnOuterHighway,
  sandFactorAt,
  stepMovementState,
  surfaceAt,
  terrainHeightAt,
  terrainSlopeAt,
};
export type { HighwayCorridor, MovementInput, MovementState, SurfaceType, WeaponDef, WeaponId };

export const P = CORE_P; // distance between road center lines
export const ROAD_W = CORE_ROAD_W; // asphalt width
export const SLAB = P - ROAD_W; // block slab (incl. sidewalks)
export const BLOCK_HALF = CORE_BLOCK_HALF; // 47
export const INNER_HALF = 42; // buildable half-size (5m sidewalk)
export const NB = CORE_NB; // blocks per side
export const HALF = CORE_HALF; // 513
export const SIDEWALK_Y = CORE_SIDEWALK_Y;

export const LANE_INNER = 2.4;
export const LANE_OUTER = 5.9;
export const PARK_OFF = 8.9;
export const STOP_DIST = 17;
export const CORNER = 12.5; // pedestrian corner offset from intersection center

export const BOUNDS = WORLD_BOUNDS;
export const PIER_X = CORE_PIER_X;
export const PIER_END = CORE_PIER_END;

// District map (rows = j from north to south, cols = i from west to east)
// R residential, C low-rise commercial, M mid-rise, D downtown towers, B bank,
// P park, I industrial, H hospital, Q police, T beachfront, K port, S gas, Y pay'n'spray, G gun shop
export const DISTRICTS: string[] = [
  'RRRRCCIII',
  'RRPRCMIII',
  'RHRQMMCII',
  'RCMDDDMCI',
  'RCMDBDMCI',
  'RCMDDDMCC',
  'RRCMMCSYI',
  'RRRCGCCKK',
  'TTTTTTKKK',
];

export function roadLine(k: number) {
  return (k - NB / 2) * P;
}
export function blockCenter(i: number) {
  return (i - (NB - 1) / 2) * P;
}

// Traffic signals --------------------------------------------------
// returns 0 green, 1 yellow, 2 red for the given axis (0 = traffic moving along x, 1 = along z)
export const SIGNAL_CYCLE = 26;
export function signalState(k: number, l: number, axis: 0 | 1, t: number): number {
  const p = (t + ((k * 7 + l * 5) % 13) * 2) % SIGNAL_CYCLE;
  if (axis === 0) {
    if (p < 10) return 0;
    if (p < 12) return 1;
    return 2;
  }
  if (p < 13) return 2;
  if (p < 23) return 0;
  if (p < 25) return 1;
  return 2;
}
/** seconds until the given axis turns green (0 if already green) */
export function redRemaining(k: number, l: number, axis: 0 | 1, t: number): number {
  const p = (t + ((k * 7 + l * 5) % 13) * 2) % SIGNAL_CYCLE;
  if (axis === 0) return p >= 12 ? SIGNAL_CYCLE - p : 0;
  if (p < 13) return 13 - p;
  if (p >= 25) return SIGNAL_CYCLE - p + 13;
  return 0;
}

// Rng ---------------------------------------------------------------
export class Rng {
  s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  chance(p: number) {
    return this.next() < p;
  }
}

export const clamp = clampVal;
export const lerp = lerpVal;
export const smooth = smoothVal;

export function angDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function dampAngle(cur: number, target: number, rate: number, dt: number) {
  return cur + angDiff(cur, target) * (1 - Math.exp(-rate * dt));
}

export function groundHeight(x: number, z: number, curY = 0): number {
  return groundHeightAt(x, z, curY);
}

export function nearestNode(x: number, z: number): [number, number] {
  const k = clamp(Math.round(x / P + NB / 2), 0, NB);
  const l = clamp(Math.round(z / P + NB / 2), 0, NB);
  return [k, l];
}
