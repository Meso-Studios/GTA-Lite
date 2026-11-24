// Pure simulation math for the 10km x 10km world, terrain/dunes, highway decks,
// sand physics, enhanced character movement, and weapon catalog.
// Zero Three.js dependencies so it can be deterministically unit-tested with node:test.

export const WORLD_HALF = 5000; // 10km x 10km playable world (-5000..+5000)
export const WORLD_BOUNDS = {
  minX: -WORLD_HALF,
  maxX: WORLD_HALF,
  minZ: -WORLD_HALF,
  maxZ: WORLD_HALF,
} as const;

export const CORE_P = 114;
export const CORE_ROAD_W = 20;
export const CORE_NB = 9;
export const CORE_HALF = (CORE_NB * CORE_P) / 2; // 513
export const CORE_BLOCK_HALF = (CORE_P - CORE_ROAD_W) / 2; // 47
export const CORE_SIDEWALK_Y = 0.16;
export const CORE_PIER_X = -150;
export const CORE_PIER_END = 705;

export const clampVal = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerpVal = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothVal = (a: number, b: number, v: number) => {
  const t = clampVal((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ highways & decks
export const DECK = {
  H: 9.4,
  HALF_W: 12,
  RING: { w: -640, e: 640, n: -640, s: 620 },
  RAMP_N: { x: 0, z0: -628, z1: -500 },
  RAMP_E: { z: 0, x0: 500, x1: 628 },
  RAMP_W: { z: 0, x0: -628, x1: -500 },
  RAMP_S: { x: -342, z0: 500, z1: 608 },
  BRIDGE: { x: 300, z0: 620, z1: 2040 },
  // Outer 10km expressway network (grade-separated where crossing inner ring, smooth ground expressway outside)
  OUTER_RING: 3000,
  HW_HALF_W: 14,
  EXPRESS_END: 4650,
  ISLAND: { cx: 300, cz: 2420, r: 420 },
  AIRPORT: { x0: 1220, x1: 2180, z0: -410, z1: -110, runwayZ: -260, runwayW: 48 },
};

export interface HighwayCorridor {
  id: string;
  axis: 'x' | 'z';
  fixed: number;
  a0: number;
  a1: number;
  halfW: number;
  elevated: boolean;
  height: number;
}

export const OUTER_HIGHWAYS: HighwayCorridor[] = [
  // Cardinal cross-map expressways radiating from the inner ring out to ±4650m
  { id: 'north-exp', axis: 'z', fixed: 0, a0: -4650, a1: -652, halfW: 14, elevated: false, height: 0.14 },
  { id: 'west-exp', axis: 'x', fixed: 0, a0: -4650, a1: -652, halfW: 14, elevated: false, height: 0.14 },
  { id: 'east-exp', axis: 'x', fixed: 0, a0: 652, a1: 4650, halfW: 14, elevated: false, height: 0.14 },
  // Outer 10km Beltway Loop (North, West, East, and South Desert Bypass)
  { id: 'belt-n', axis: 'x', fixed: -3000, a0: -3014, a1: 3014, halfW: 14, elevated: false, height: 0.14 },
  { id: 'belt-w', axis: 'z', fixed: -3000, a0: -3014, a1: 3014, halfW: 14, elevated: false, height: 0.14 },
  { id: 'belt-e', axis: 'z', fixed: 3000, a0: -3014, a1: 480, halfW: 14, elevated: false, height: 0.14 },
  // Southern Golden Dunes Highway connecting West Beltway to the Southwest Coast
  { id: 'dune-s', axis: 'x', fixed: 1800, a0: -4500, a1: -980, halfW: 13, elevated: false, height: 0.14 },
  // Coastal Connector linking West Beltway & Inner West Ring along the beachfront
  { id: 'coast-w', axis: 'x', fixed: 560, a0: -3000, a1: -652, halfW: 12, elevated: false, height: 0.14 },
];

export interface SuburbanZone {
  id: string;
  name: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export const SUBURBAN_ZONES: SuburbanZone[] = [
  { id: 'north_palms', name: 'NORTH PALMS SUBURBS', x0: -520, x1: 520, z0: -1240, z1: -760 },
  { id: 'palmetto_heights', name: 'PALMETTO HEIGHTS SUBURBS', x0: -1240, x1: -760, z0: -520, z1: 420 },
  { id: 'bayview_suburbs', name: 'BAYVIEW HEIGHTS SUBURBS', x0: 760, x1: 1180, z0: 60, z1: 480 },
];

export interface RuralGasStationDef {
  id: string;
  name: string;
  x: number;
  z: number;
  yaw: number;
}

export const RURAL_GAS_STATIONS: RuralGasStationDef[] = [
  { id: 'gas_north_exp', name: 'NORTH RIDGE FUEL & DINER', x: 76, z: -1850, yaw: -Math.PI / 2 },
  { id: 'gas_west_dunes', name: 'GOLDEN DUNES GAS & MART', x: -1750, z: -76, yaw: 0 },
  { id: 'gas_east_coast', name: 'BAYSIDE TRUCK STOP', x: 2450, z: 76, yaw: Math.PI },
  { id: 'gas_nw_belt', name: 'PINECREST HIGHWAY GAS', x: -1650, z: -2924, yaw: Math.PI },
  { id: 'gas_west_belt', name: 'CANYON ROUTE 66 FUEL', x: -2924, z: -1450, yaw: -Math.PI / 2 },
  { id: 'gas_east_belt', name: 'HARBOR BELTWAY GAS', x: 2924, z: -1550, yaw: Math.PI / 2 },
];

export function isInSuburbanZone(x: number, z: number, pad = 0): SuburbanZone | null {
  for (const s of SUBURBAN_ZONES) {
    if (x >= s.x0 - pad && x <= s.x1 + pad && z >= s.z0 - pad && z <= s.z1 + pad) return s;
  }
  return null;
}

export function nearestRuralGasStation(x: number, z: number): { station: RuralGasStationDef; dist: number } {
  let best = RURAL_GAS_STATIONS[0];
  let bestD = Infinity;
  for (const st of RURAL_GAS_STATIONS) {
    const d = Math.hypot(x - st.x, z - st.z);
    if (d < bestD) {
      bestD = d;
      best = st;
    }
  }
  return { station: best, dist: bestD };
}


/** Returns true if (x, z) lies on one of the outer ground-level expressways. */
export function isOnOuterHighway(x: number, z: number, pad = 0): boolean {
  for (const h of OUTER_HIGHWAYS) {
    const hw = h.halfW + pad;
    if (h.axis === 'x') {
      if (Math.abs(z - h.fixed) <= hw && x >= h.a0 - pad && x <= h.a1 + pad) return true;
    } else {
      if (Math.abs(x - h.fixed) <= hw && z >= h.a0 - pad && z <= h.a1 + pad) return true;
    }
  }
  return false;
}

/** Distance from (x,z) to nearest outer expressway centerline (used to flatten terrain cleanly under highways). */
export function distToOuterHighway(x: number, z: number): number {
  let best = 1e9;
  for (const h of OUTER_HIGHWAYS) {
    let d: number;
    if (h.axis === 'x') {
      const cx = clampVal(x, h.a0, h.a1);
      d = Math.hypot(x - cx, z - h.fixed);
    } else {
      const cz = clampVal(z, h.a0, h.a1);
      d = Math.hypot(x - h.fixed, z - cz);
    }
    if (d < best) best = d;
  }
  return best;
}

/** Height of elevated decks & ramps if you are near that level (prevents snapping cars driving underneath). */
export function deckHeight(x: number, z: number, curY = 0): number {
  const { H, HALF_W, RING, BRIDGE } = DECK;
  const cands: number[] = [];
  const w = HALF_W;
  // Inner elevated ring
  if (Math.abs(x - RING.w) <= w && z >= RING.n - w && z <= RING.s + w) cands.push(H);
  if (Math.abs(x - RING.e) <= w && z >= RING.n - w && z <= RING.s + w) cands.push(H);
  if (Math.abs(z - RING.n) <= w && x >= RING.w - w && x <= RING.e + w) cands.push(H);
  if (Math.abs(z - RING.s) <= w && x >= RING.w - w && x <= RING.e + w) cands.push(H);
  // North, East, West, South access ramps onto inner ring
  if (Math.abs(x - DECK.RAMP_N.x) <= w && z >= DECK.RAMP_N.z0 && z <= DECK.RAMP_N.z1) {
    cands.push(H * clampVal((DECK.RAMP_N.z1 - z) / (DECK.RAMP_N.z1 - DECK.RAMP_N.z0), 0, 1));
  }
  if (Math.abs(z - DECK.RAMP_E.z) <= w && x >= DECK.RAMP_E.x0 && x <= DECK.RAMP_E.x1) {
    cands.push(H * clampVal((x - DECK.RAMP_E.x0) / (DECK.RAMP_E.x1 - DECK.RAMP_E.x0), 0, 1));
  }
  if (Math.abs(z - DECK.RAMP_W.z) <= w && x >= DECK.RAMP_W.x0 && x <= DECK.RAMP_W.x1) {
    cands.push(H * clampVal((DECK.RAMP_W.x1 - x) / (DECK.RAMP_W.x1 - DECK.RAMP_W.x0), 0, 1));
  }
  if (Math.abs(x - DECK.RAMP_S.x) <= w && z >= DECK.RAMP_S.z0 && z <= DECK.RAMP_S.z1) {
    cands.push(H * clampVal((z - DECK.RAMP_S.z0) / (DECK.RAMP_S.z1 - DECK.RAMP_S.z0), 0, 1));
  }
  // Outer highway interchange ramps descending cleanly from the inner ring onto the N/W/E expressways
  // North expressway descent: z from -652 down to -790
  if (Math.abs(x - 0) <= w + 2 && z >= -790 && z <= -652) {
    cands.push(H * clampVal((z - -790) / ( -652 - -790), 0, 1));
  }
  // West expressway descent: x from -652 down to -790
  if (Math.abs(z - 0) <= w + 2 && x >= -790 && x <= -652) {
    cands.push(H * clampVal((x - -790) / (-652 - -790), 0, 1));
  }
  // East expressway descent: x from 652 down to 790
  if (Math.abs(z - 0) <= w + 2 && x >= 652 && x <= 790) {
    cands.push(H * clampVal((790 - x) / (790 - 652), 0, 1));
  }
  // Cable-stayed Ocean Causeway Bridge & descent onto Nova Keys Island
  if (Math.abs(x - BRIDGE.x) <= w && z >= BRIDGE.z0 && z <= BRIDGE.z1) {
    if (z <= BRIDGE.z1 - 150) cands.push(H);
    else {
      // smooth descent onto island at z = 1890..2040
      const t = clampVal((BRIDGE.z1 - z) / 150, 0, 1);
      cands.push(1.8 + (H - 1.8) * t);
    }
  }
  let best = -1;
  for (const h of cands) {
    if (Math.abs(h - curY) < 4.5) best = Math.max(best, h);
  }
  return best > 0 ? best : 0;
}

// ------------------------------------------------------------------ 10km terrain height & biomes
/** True if (x, z) is in the open ocean bay (non-land water). */
export function isOceanAt(x: number, z: number): boolean {
  // Nova Keys Resort Island in the southern ocean
  const isl = DECK.ISLAND;
  const di = Math.hypot(x - isl.cx, z - isl.cz);
  if (di < isl.r) return false;
  // West Golden Dunes Peninsula extends south down to z = 4500 for x < -920
  const coastLineZ = x < -920
    ? 4450 + Math.sin(x * 0.0022) * 180
    : x < -680
      ? lerpVal(4450, 612, smoothVal(-920, -680, x))
      : x > 3200
        ? 612 + smoothVal(3200, 3900, x) * 1400
        : 612;
  return z > coastLineZ;
}

/** Smooth continuous procedural terrain height for the 10km x 10km map. Core city is 0. */
export function terrainHeightAt(x: number, z: number): number {
  // Core city + inner beach strip stays flat at 0 so all buildings/roads/missions sit flush
  if (Math.abs(x) <= 720 && z >= -720 && z <= 660) return 0;

  // Nova Keys Island (southern ocean causeway destination)
  const isl = DECK.ISLAND;
  const di = Math.hypot(x - isl.cx, z - isl.cz);
  if (di < isl.r + 60) {
    const islandT = 1 - smoothVal(isl.r * 0.72, isl.r + 45, di);
    const mound = Math.sin(x * 0.012) * Math.cos(z * 0.012) * 2.2 + 2.4;
    return Math.max(-1.2, lerpVal(-1.2, mound, islandT));
  }

  if (isOceanAt(x, z)) return -1.2;

  // Smooth transition away from the flat city core
  const dxCore = Math.max(0, Math.abs(x) - 720);
  const dzCore = z < -720 ? -720 - z : z > 660 ? z - 660 : 0;
  const coreFade = smoothVal(0, 260, Math.hypot(dxCore, dzCore));

  // Flatten smoothly along all outer expressways & interchanges so terrain triangles never clip road shoulders
  const hwDist = distToOuterHighway(x, z);
  const hwFlatten = smoothVal(70, 155, hwDist);

  // Flatten cleanly under San Nova International Airport + taxiway connector to East Expressway
  const ap = DECK.AIRPORT;
  const apDx = x < ap.x0 - 40 ? ap.x0 - 40 - x : x > ap.x1 + 40 ? x - (ap.x1 + 40) : 0;
  const apDz = z < ap.z0 - 40 ? ap.z0 - 40 - z : z > ap.z1 + 120 ? z - (ap.z1 + 120) : 0;
  const apDist = Math.hypot(apDx, apDz);
  if (apDist <= 0.1) return 0;
  const apFlatten = smoothVal(0, 140, apDist);

  // Flatten cleanly under all 3 suburban neighborhoods (zero floating houses/roads)
  let subDist = 1e9;
  for (const s of SUBURBAN_ZONES) {
    const sx = x < s.x0 - 20 ? s.x0 - 20 - x : x > s.x1 + 20 ? x - (s.x1 + 20) : 0;
    const sz = z < s.z0 - 20 ? s.z0 - 20 - z : z > s.z1 + 20 ? z - (s.z1 + 20) : 0;
    const d = Math.hypot(sx, sz);
    if (d < subDist) subDist = d;
  }
  if (subDist <= 0.1) return 0;
  const subFlatten = smoothVal(0, 95, subDist);

  // Flatten cleanly under all 6 rural highway gas stations / truck stops
  const gasNear = nearestRuralGasStation(x, z);
  if (gasNear.dist <= 64) return 0;
  const gasFlatten = smoothVal(64, 145, gasNear.dist);

  // Flatten around outer satellite landmarks (Desert Oasis Motel, North Observatory, Outer Hubs)
  const landmarkDist = Math.min(
    Math.hypot(x - -2200, z - 1200), // Golden Dunes Oasis
    Math.hypot(x - 0, z - -3400),    // North Ridge Observatory
    Math.hypot(x - 0, z - -3000),    // North Ridge Interchange
    Math.hypot(x - -3000, z - 0),    // West Dunes Hub
    Math.hypot(x - 3000, z - 0),     // East Harbor Hub
  );
  const lmFlatten = smoothVal(90, 210, landmarkDist);

  let h = 0;
  if (x < -740) {
    // Golden Dunes & Western Desert: wind-swept rolling sand dunes (drivable)
    const d1 = Math.sin(x * 0.0055 + z * 0.0028) * 6.5;
    const d2 = Math.cos(x * 0.011 - z * 0.0075) * 3.2;
    const d3 = Math.sin((x + z) * 0.022) * 1.1;
    h = Math.max(0.2, 6.2 + d1 + d2 + d3);
  } else if (z < -740) {
    // Northern San Nova Hills & Mountain Passes
    const n1 = Math.sin(x * 0.0032) * Math.cos(z * 0.0038) * 18;
    const n2 = Math.sin(x * 0.0078 + z * 0.0064) * 7.5;
    const rise = smoothVal(-900, -4200, z) * 26;
    h = Math.max(0, 5.0 + n1 + n2 + rise);
  } else {
    // Eastern Coastal Plains & Mesas
    const e1 = Math.sin(x * 0.0045 + z * 0.004) * 8.0;
    const e2 = Math.cos(x * 0.009 - z * 0.006) * 3.4;
    h = Math.max(0, 4.2 + e1 + e2);
  }

  // Coastal slope down to sea level near z = 612 (east of dunes)
  if (x >= -740 && z > 420 && z <= 640) {
    h *= 1 - smoothVal(420, 610, z);
  }

  return h * coreFade * hwFlatten * lmFlatten * apFlatten * subFlatten * gasFlatten;
}

/** Surface normal approximation from terrainHeightAt (for vehicle pitch/roll on dunes/hills). */
export function terrainSlopeAt(x: number, z: number): { nx: number; ny: number; nz: number } {
  const e = 2.0;
  const hL = terrainHeightAt(x - e, z);
  const hR = terrainHeightAt(x + e, z);
  const hD = terrainHeightAt(x, z - e);
  const hU = terrainHeightAt(x, z + e);
  let nx = hL - hR;
  let ny = 2 * e;
  let nz = hD - hU;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { nx: nx / len, ny: ny / len, nz: nz / len };
}

export type SurfaceType = 'highway' | 'road' | 'sidewalk' | 'sand' | 'wet_sand' | 'grass' | 'dirt' | 'water' | 'pier';

export function surfaceAt(x: number, z: number, curY = 0): SurfaceType {
  if (deckHeight(x, z, curY) > 0) return 'highway';
  if (isOnOuterHighway(x, z, 1)) return 'highway';
  const ap = DECK.AIRPORT;
  if (x >= ap.x0 && x <= ap.x1 && z >= ap.z0 && z <= ap.z1) return 'road';
  if (z > 606 && z <= CORE_PIER_END && Math.abs(x - CORE_PIER_X) < 5) return 'pier';
  if (isOceanAt(x, z)) return 'water';
  // Core city blocks & streets
  if (Math.abs(x) <= CORE_HALF + 16 && z >= -CORE_HALF - 16 && z <= CORE_HALF + 16) {
    const ax = x + CORE_HALF;
    const az = z + CORE_HALF;
    const bi = Math.floor(ax / CORE_P);
    const bj = Math.floor(az / CORE_P);
    if (bi >= 0 && bi < CORE_NB && bj >= 0 && bj < CORE_NB) {
      const cx = (bi - (CORE_NB - 1) / 2) * CORE_P;
      const cz = (bj - (CORE_NB - 1) / 2) * CORE_P;
      if (Math.abs(x - cx) < CORE_BLOCK_HALF && Math.abs(z - cz) < CORE_BLOCK_HALF) return 'sidewalk';
      return 'road';
    }
    return 'sidewalk';
  }
  // Rural highway gas station paved aprons
  const gasNear = nearestRuralGasStation(x, z);
  if (gasNear.dist <= 46) return 'road';
  // Suburban neighborhoods (paved avenues + residential lawns/sidewalks)
  const sub = isInSuburbanZone(x, z);
  if (sub) {
    const lx = ((x - sub.x0) % 100 + 100) % 100;
    const lz = ((z - sub.z0) % 100 + 100) % 100;
    if (lx < 12 || lx > 88 || lz < 12 || lz > 88) return 'road';
    return 'sidewalk';
  }
  // Nova Keys Resort Island beach rim
  const isl = DECK.ISLAND;
  const di = Math.hypot(x - isl.cx, z - isl.cz);
  if (di < isl.r) {
    if (di > isl.r - 45) return 'wet_sand';
    if (di > isl.r - 170) return 'sand';
    return 'grass';
  }
  // Main San Nova Beachfront strip (south of downtown)
  if (z >= 522 && z <= 616 && x >= -920) {
    return z >= 596 ? 'wet_sand' : 'sand';
  }
  // Vast Western Golden Dunes & Desert Biome
  if (x < -740) {
    if (z > 4320) return 'wet_sand';
    return 'sand';
  }
  // Northern Hills & Eastern Plains
  if (z < -740) return terrainHeightAt(x, z) > 22 ? 'dirt' : 'grass';
  return 'grass';
}

/** 0 = firm pavement/grass, 0.35 = wet shoreline sand, 0.75..1.0 = deep dry beach/dune sand. */
export function sandFactorAt(x: number, z: number, curY = 0): number {
  const s = surfaceAt(x, z, curY);
  if (s === 'wet_sand') return 0.4;
  if (s === 'sand') {
    // Deeper, looser sand further out in the Golden Dunes
    const duneDepth = x < -950 ? clampVal(0.8 + Math.abs(Math.sin(x * 0.013 + z * 0.011)) * 0.2, 0.8, 1.0) : 0.72;
    return duneDepth;
  }
  return 0;
}

export function districtNameAt(x: number, z: number, curY = 0): string {
  if (deckHeight(x, z, curY) > 2) {
    if (Math.abs(x - DECK.BRIDGE.x) <= 24 && z > DECK.BRIDGE.z0) return 'OCEAN CAUSEWAY BRIDGE';
    return 'INNER RING EXPRESSWAY';
  }
  // Check rural gas stations & suburbs before broad regional fallbacks
  const gasNear = nearestRuralGasStation(x, z);
  if (gasNear.dist <= 65) return gasNear.station.name;
  const sub = isInSuburbanZone(x, z, 10);
  if (sub && !isOnOuterHighway(x, z, 2)) return sub.name;
  if (isOnOuterHighway(x, z, 2)) {
    if (Math.abs(x) > 2900 || Math.abs(z) > 2900) return 'SAN NOVA OUTER BELTWAY';
    if (x < -700) return 'GOLDEN DUNES EXPRESSWAY';
    if (z < -700) return 'NORTH RIDGE HIGHWAY';
    return 'EAST COAST EXPRESSWAY';
  }
  const ap = DECK.AIRPORT;
  if (x >= ap.x0 - 30 && x <= ap.x1 + 30 && z >= ap.z0 - 30 && z <= ap.z1 + 50) return 'SAN NOVA INTL AIRPORT';
  const isl = DECK.ISLAND;
  if (Math.hypot(x - isl.cx, z - isl.cz) < isl.r + 30) return 'NOVA KEYS RESORT ISLAND';
  if (z > 522 && z < 650 && x >= -800 && x <= 800) return 'OCEAN BEACH BOARDWALK';
  if (x < -740) return z > 1200 ? 'SOUTH GOLDEN DUNES' : 'WEST GOLDEN DUNES';
  if (z < -740) return 'NORTH SAN NOVA HILLS';
  if (x > 740) return 'EAST HARBOR & PLAINS';
  if (z >= 360 && x <= 220) return 'OCEAN BEACH ART DECO';
  if (z >= 320 && x > 220) return 'VICE MARINA & PORT';
  if (Math.abs(x) < 200 && Math.abs(z) < 200) return 'DOWNTOWN FINANCIAL CORE';
  if (x <= -170 && z >= -180 && z < 360) return 'LITTLE HAVANA · CALLE NOVA';
  if (x >= 170 && z < 160 && z > -360) return 'WYNWOOD ARTS DISTRICT';
  if (z <= -220) return 'LEONIDA STRIP PLAZA';
  return 'SAN NOVA METRO';
}

export function groundHeightAt(x: number, z: number, curY = 0): number {
  const dh = deckHeight(x, z, curY);
  if (dh > 0) return dh;
  // Pier deck
  if (z > 606 && z <= CORE_PIER_END && Math.abs(x - CORE_PIER_X) < 5) return 0.45;
  // Core city blocks
  const ax = x + CORE_HALF;
  const az = z + CORE_HALF;
  const bi = Math.floor(ax / CORE_P);
  const bj = Math.floor(az / CORE_P);
  if (bi >= 0 && bi < CORE_NB && bj >= 0 && bj < CORE_NB) {
    const cx = (bi - (CORE_NB - 1) / 2) * CORE_P;
    const cz = (bj - (CORE_NB - 1) / 2) * CORE_P;
    if (Math.abs(x - cx) < CORE_BLOCK_HALF && Math.abs(z - cz) < CORE_BLOCK_HALF) return CORE_SIDEWALK_Y;
    return 0;
  }
  // Outer sidewalk ring around core city
  const inside = Math.abs(x) <= CORE_HALF + 16 && z >= -CORE_HALF - 16 && z <= CORE_HALF + 16;
  const core = Math.abs(x) < CORE_HALF + 10 && z > -CORE_HALF - 10 && z < CORE_HALF + 10;
  if (inside && !core) return CORE_SIDEWALK_Y;
  // Outer highway slight crown above terrain
  const th = terrainHeightAt(x, z);
  if (isOnOuterHighway(x, z, 0)) return Math.max(0.12, th + 0.12);
  return Math.max(0, th);
}

// ------------------------------------------------------------------ sand physics
export interface SandVehicleResult {
  vf: number;
  vl: number;
  gripMul: number;
  sinkY: number;
  sprayIntensity: number;
}

/** Applies soft-sand rolling resistance, lateral slip, tire sink, and rooster-tail spray intensity. */
export function applySandVehiclePhysics(
  vf: number,
  vl: number,
  throttle: number,
  hand: boolean,
  sandFactor: number,
  mass: number,
  dt: number,
): SandVehicleResult {
  if (sandFactor <= 0.01) {
    return { vf, vl, gripMul: 1, sinkY: 0, sprayIntensity: 0 };
  }
  // Heavier vehicles sink slightly more; SUVs/pickups handle sand better (approximated by moderate resistance)
  const weightFactor = clampVal(mass / 1550, 0.75, 1.35);
  // Rolling drag in loose sand slows top speed and causes rapid coast-down off throttle
  const dragRate = sandFactor * (throttle === 0 ? 1.45 : 0.42) * weightFactor;
  const nextVf = vf * Math.exp(-dragRate * dt);
  // Reduced lateral grip -> fun sandy fish-tailing & drifting
  const gripMul = clampVal(1 - sandFactor * (hand ? 0.55 : 0.42), 0.35, 1);
  // Slight wheel sink into loose dry sand
  const speed = Math.hypot(nextVf, vl);
  const sinkY = sandFactor * (0.08 + clampVal(1 - speed / 26, 0, 1) * 0.055) * weightFactor;
  // Rooster-tail sand spray kicks up with speed, wheelspin, or sideways drift
  const slip = Math.abs(vl) + (Math.abs(throttle) > 0.2 ? Math.min(8, Math.abs(nextVf) * 0.35) : 0);
  const sprayIntensity = clampVal(sandFactor * (speed * 0.045 + slip * 0.065), 0, 1.5);
  return { vf: nextVf, vl, gripMul, sinkY, sprayIntensity };
}

export interface SandFootResult {
  speedMul: number;
  puffRate: number;
  sinkY: number;
}

/** Applies soft-sand drag and sand-puff emission rate for on-foot movement. */
export function applySandFootPhysics(speed: number, sandFactor: number): SandFootResult {
  if (sandFactor <= 0.01) return { speedMul: 1, puffRate: 0, sinkY: 0 };
  return {
    speedMul: clampVal(1 - sandFactor * 0.22, 0.72, 1),
    puffRate: speed > 1.0 ? clampVal(sandFactor * speed * 1.8, 0, 14) : 0,
    sinkY: sandFactor * 0.045,
  };
}

// ------------------------------------------------------------------ enhanced on-foot movement
export interface MovementState {
  vx: number;
  vy: number;
  vz: number;
  y: number;
  onGround: boolean;
  coyoteT: number;
  jumpBufferT: number;
  stamina: number; // 0..100
  crouching: boolean;
  slideT: number;
  slideDirX: number;
  slideDirZ: number;
  exhausted: boolean;
}

export interface MovementInput {
  wishX: number; // normalized desired move dir X (or 0)
  wishZ: number; // normalized desired move dir Z (or 0)
  sprint: boolean;
  crouch: boolean;
  crouchPressed: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  aiming: boolean;
  scoping: boolean;
  groundY: number;
  sandFactor: number;
}

export function createMovementState(y = 0.16): MovementState {
  return {
    vx: 0, vy: 0, vz: 0, y, onGround: true,
    coyoteT: 0.13, jumpBufferT: 0,
    stamina: 100, crouching: false,
    slideT: 0, slideDirX: 0, slideDirZ: 0,
    exhausted: false,
  };
}

export function stepMovementState(s: MovementState, inp: MovementInput, dt: number): { jumped: boolean; landed: boolean; sliding: boolean } {
  const COYOTE_MAX = 0.13;
  const BUFFER_MAX = 0.13;
  const GRAVITY = 18.5;
  const JUMP_V = 6.4;

  let jumped = false;
  let landed = false;

  // Coyote & jump buffer timers
  if (s.onGround) s.coyoteT = COYOTE_MAX;
  else s.coyoteT = Math.max(0, s.coyoteT - dt);

  if (inp.jumpPressed) s.jumpBufferT = BUFFER_MAX;
  else s.jumpBufferT = Math.max(0, s.jumpBufferT - dt);

  const hasWish = Math.hypot(inp.wishX, inp.wishZ) > 0.01;
  const horizSp = Math.hypot(s.vx, s.vz);

  // Sprint stamina & tactical slide trigger
  if (s.exhausted && s.stamina >= 28) s.exhausted = false;
  const canSprint = inp.sprint && hasWish && !inp.crouch && !inp.scoping && !s.exhausted && s.stamina > 0;

  if (inp.crouchPressed && s.onGround && horizSp > 5.4 && s.slideT <= 0 && s.stamina >= 16) {
    const inv = 1 / (horizSp || 1);
    s.slideDirX = s.vx * inv;
    s.slideDirZ = s.vz * inv;
    s.slideT = 0.48;
    s.stamina = Math.max(0, s.stamina - 16);
    s.vx = s.slideDirX * 10.2;
    s.vz = s.slideDirZ * 10.2;
  }

  if (s.slideT > 0) {
    s.slideT = Math.max(0, s.slideT - dt);
    s.crouching = true;
  } else {
    s.crouching = inp.crouch && s.onGround;
  }

  // Sand drag on foot
  const sand = applySandFootPhysics(horizSp, inp.sandFactor);

  // Target horizontal velocity
  if (s.slideT > 0) {
    const slideDrag = Math.exp(-(3.4 + inp.sandFactor * 2.5) * dt);
    s.vx *= slideDrag;
    s.vz *= slideDrag;
  } else {
    let targetSp = 5.1; // crisp base jog
    if (s.crouching) targetSp = 2.4;
    else if (canSprint) targetSp = 8.6;
    if (inp.scoping) targetSp = Math.min(targetSp, 1.5);
    else if (inp.aiming) targetSp = Math.min(targetSp, canSprint ? 5.2 : 3.9);
    targetSp *= sand.speedMul;

    const tvx = hasWish ? inp.wishX * targetSp : 0;
    const tvz = hasWish ? inp.wishZ * targetSp : 0;

    // Crisp acceleration on ground, responsive deceleration, controlled air steering
    const accelRate = s.onGround ? (hasWish ? 14.5 : 16.5) : (hasWish ? 4.2 : 1.4);
    const k = 1 - Math.exp(-accelRate * dt);
    s.vx += (tvx - s.vx) * k;
    s.vz += (tvz - s.vz) * k;

    if (canSprint) {
      s.stamina = Math.max(0, s.stamina - 18 * dt);
      if (s.stamina <= 0.5) s.exhausted = true;
    } else {
      const regen = hasWish ? 15 : 26;
      s.stamina = Math.min(100, s.stamina + regen * dt);
    }
  }

  // Execute buffered/coyote jump
  if (s.jumpBufferT > 0 && s.coyoteT > 0) {
    s.vy = JUMP_V;
    s.onGround = false;
    s.coyoteT = 0;
    s.jumpBufferT = 0;
    s.slideT = 0;
    s.crouching = false;
    jumped = true;
  }

  // Variable jump height cut when player releases Space early while rising
  if (!inp.jumpHeld && s.vy > 2.4) {
    s.vy *= Math.exp(-10 * dt);
  }

  // Vertical integration
  const wasOnGround = s.onGround;
  s.vy -= GRAVITY * dt;
  s.y += s.vy * dt;

  // Smooth curb & slope stepping when grounded
  if (wasOnGround && !jumped && s.y < inp.groundY && inp.groundY - s.y <= 0.55) {
    s.y = inp.groundY;
    s.vy = 0;
    s.onGround = true;
  } else if (s.y <= inp.groundY) {
    if (!wasOnGround && s.vy < -2.2) landed = true;
    s.y = inp.groundY;
    s.vy = 0;
    s.onGround = true;
  } else if (s.y > inp.groundY + 0.08) {
    s.onGround = false;
  }

  return { jumped, landed, sliding: s.slideT > 0 };
}

// ------------------------------------------------------------------ expanded weapon arsenal (15 weapons)
export interface WeaponDef {
  readonly name: string;
  readonly dmg: number;
  readonly rate: number;
  readonly spread: number;
  readonly ammo: number;
  readonly range: number;
  readonly auto: boolean;
  readonly pellets: number;
  readonly melee?: boolean;
  readonly scope?: boolean;
  readonly silenced?: boolean;
  readonly explosive?: boolean;
  readonly recoil?: number;
  readonly price?: number;
}

export const WEAPONS = {
  fists:       { name: 'Fists',             dmg: 14,  rate: 2.8,  spread: 0,      ammo: 0,   range: 2.3, auto: false, pellets: 1, melee: true },
  bat:         { name: 'Baseball Bat',      dmg: 34,  rate: 1.8,  spread: 0,      ammo: 0,   range: 2.8, auto: false, pellets: 1, melee: true, price: 250 },
  katana:      { name: 'Street Katana',     dmg: 62,  rate: 2.4,  spread: 0,      ammo: 0,   range: 3.1, auto: false, pellets: 1, melee: true, price: 900 },
  pistol:      { name: '9mm Pistol',        dmg: 24,  rate: 4.5,  spread: 0.011,  ammo: 180, range: 125, auto: false, pellets: 1, recoil: 0.012 },
  silenced:    { name: 'Silenced 9mm',      dmg: 28,  rate: 4.8,  spread: 0.008,  ammo: 160, range: 130, auto: false, pellets: 1, silenced: true, recoil: 0.007, price: 850 },
  revolver:    { name: '.44 Magnum',        dmg: 64,  rate: 1.65, spread: 0.007,  ammo: 72,  range: 165, auto: false, pellets: 1, recoil: 0.036, price: 1400 },
  smg:         { name: 'Micro SMG',         dmg: 15,  rate: 13.5, spread: 0.032,  ammo: 450, range: 105, auto: true,  pellets: 1, recoil: 0.01,  price: 1200 },
  shotgun:     { name: 'Pump Shotgun',      dmg: 14,  rate: 1.3,  spread: 0.068,  ammo: 64,  range: 48,  auto: false, pellets: 8, recoil: 0.05,  price: 1800 },
  autoshotgun: { name: 'Tactical Auto-12',  dmg: 12,  rate: 3.6,  spread: 0.075,  ammo: 96,  range: 44,  auto: true,  pellets: 7, recoil: 0.038, price: 3200 },
  rifle:       { name: 'Assault Rifle',     dmg: 23,  rate: 9.2,  spread: 0.018,  ammo: 360, range: 175, auto: true,  pellets: 1, recoil: 0.014, price: 3500 },
  carbine:     { name: 'Heavy Carbine',     dmg: 31,  rate: 7.4,  spread: 0.015,  ammo: 300, range: 195, auto: true,  pellets: 1, recoil: 0.018, price: 4200 },
  lmg:         { name: 'Squad LMG',         dmg: 26,  rate: 11.5, spread: 0.028,  ammo: 600, range: 185, auto: true,  pellets: 1, recoil: 0.017, price: 5800 },
  sniper:      { name: 'Marksman Rifle',    dmg: 105, rate: 1.0,  spread: 0.002,  ammo: 48,  range: 520, auto: false, pellets: 1, scope: true, recoil: 0.045, price: 5000 },
  rpg:         { name: 'Rocket Launcher',   dmg: 165, rate: 0.55, spread: 0.006,  ammo: 10,  range: 260, auto: false, pellets: 1, explosive: true, recoil: 0.08, price: 7500 },
  grenade:     { name: 'Frag Grenade',      dmg: 115, rate: 1.1,  spread: 0.01,   ammo: 16,  range: 75,  auto: false, pellets: 1, explosive: true, price: 600 },
} as const satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;

export const WEAPON_ORDER: WeaponId[] = [
  'fists', 'bat', 'katana', 'pistol', 'silenced', 'revolver', 'smg',
  'shotgun', 'autoshotgun', 'rifle', 'carbine', 'lmg', 'sniper', 'rpg', 'grenade',
];

export const WEAPON_SHOP_ORDER: WeaponId[] = [
  'katana', 'silenced', 'smg', 'revolver', 'shotgun', 'autoshotgun', 'rifle', 'carbine', 'sniper', 'lmg', 'rpg',
];

export function isMeleeWeapon(w: WeaponId): boolean {
  return w === 'fists' || w === 'bat' || w === 'katana';
}
