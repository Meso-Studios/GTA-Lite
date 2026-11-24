// Building generators (all merged into batches via the Batcher).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batcher, Collector, box, cone, cyl, finish, flat, gable, place, sign, sph, walls } from './geo';
import {
  DECK,
  INNER_HALF,
  Rng,
  RuralGasStationDef,
  SuburbanZone,
  groundHeight,
  isOnOuterHighway,
  terrainHeightAt,
} from './config';
import { BAY, FLOOR_H, FacadeStyle, signUV } from './textures';
import { STORES, StoreDef } from './stores';
import { World } from './world';

export interface MapRect { x0: number; z0: number; x1: number; z1: number; c: string }
export interface Place { x: number; z: number; yaw?: number; r?: number }
export interface PropSpawn { kind: 'cone' | 'barrel' | 'xbarrel' | 'bin' | 'crate'; x: number; z: number }
export interface Door { x: number; z: number; yaw: number; name: string; kind: 'shop' | 'diner' | 'office' | 'apartment' | 'bank' | 'police' | 'hospital' | 'gun' | 'garage' }
export interface BCtx {
  b: Batcher;
  world: World;
  rng: Rng;
  mapRects: MapRect[];
  places: Record<string, Place>;
  props: PropSpawn[];
  chunk: (x: number, z: number) => string;
  collect: Place[];
  lampBulbs: { x: number; y: number; z: number }[];
  doors: Door[];
  storeUsed: Set<number>;
  storeCursor: number;
}

/** Allocates the next unique GTA-6 / Leonida store, prioritizing unused stores matching the neighborhood district. */
export function allocateStore(c: BCtx, preferredDistrict?: StoreDef['district']): StoreDef {
  if (preferredDistrict) {
    for (let i = 16; i < STORES.length; i++) {
      if (!c.storeUsed.has(i) && STORES[i].district === preferredDistrict) {
        c.storeUsed.add(i);
        return STORES[i];
      }
    }
  }
  // Pick any remaining unused store so all 320+ unique brands appear across the city
  for (let i = 8; i < STORES.length; i++) {
    const idx = ((c.storeCursor + i) % (STORES.length - 8)) + 8;
    if (!c.storeUsed.has(idx)) {
      c.storeUsed.add(idx);
      c.storeCursor = (idx + 1) % STORES.length;
      return STORES[idx];
    }
  }
  const fallback = STORES[8 + (c.storeCursor++ % (STORES.length - 8))];
  return fallback;
}

export function doorKind(name: string): Door['kind'] {
  if (name === 'BANK' || name.includes('BANK') || name.includes('CAPITAL') || name.includes('CHECKS')) return 'bank';
  if (name === 'POLICE') return 'police';
  if (name === 'HOSPITAL' || name.includes('CLINIC') || name.includes('DENTAL')) return 'hospital';
  if (name === 'AMMO' || name.includes('GUN') || name.includes('TACTICAL') || name.includes('SURPLUS')) return 'gun';
  if (name === 'PAY N SPRAY' || name.includes('CUSTOMS') || name.includes('MOTOR') || name.includes('AUTOS') || name.includes('GARAGE') || name.includes('HANGAR')) return 'garage';
  if (/(PIZZA|DINER|CAFE|COFFEE|BURGER|SUSHI|TACO|NOODLE|RAMEN|CLUB|BAR|LOUNGE|BAKERY|GRILL|DELI|STEAK|SEAFOOD|BBQ|WAFFLE|DONUT|JUICE|TEA|GELATO|CANTINA|PUB|BISTRO|DISCO|TAPROOM|CHICKEN|WINGS|CLUCKIN|EMPANADA|AREPA|CEVICHE|BRUNCH|CREAM)/i.test(name)) return 'diner';
  if (/(HOTEL|MOTEL|INN|RESORT|SUITES|LODGE|PALACE)/i.test(name)) return 'apartment';
  if (/(OFFICE|REALTY|LAW|NEWS|MEDIA|STUDIOS|TICKETS|TERMINAL|CHARTER|LOGISTICS|INSURANCE|TRAVEL|FLIGHT|AVIATION)/i.test(name)) return 'office';
  return 'shop';
}
const TINTS: Record<FacadeStyle, number[]> = {
  brick: [0xffffff, 0xf2d9c8, 0xd9b8a0, 0xc9c0b8, 0xe8c4b0],
  office: [0xffffff, 0xe5ecf2, 0xd6dde3, 0xf2f2ee, 0xcfd6dc],
  glass: [0xffffff, 0xbfe3f5, 0xa9d6e8, 0xcfe9d9, 0xc7c9f0, 0x9fb7d4],
  stone: [0xffffff, 0xf0e6d2, 0xe6dcc8, 0xd9cfc0, 0xf5efe0],
  apartment: [0xffe8d0, 0xffd9d9, 0xdff2d9, 0xd6e6ff, 0xfff3c4, 0xf3dcff, 0xffffff, 0xffe0b8],
  industrial: [0xffffff, 0xd8e4ea, 0xe8dcc8, 0xcfd8c8, 0xe0d0d0],
};
const SHELLS = [0xffffff, 0xffd9b0, 0xbfd9ff, 0xd9ffd0, 0xf5c8c8, 0xe0e0e0, 0xc8d8ff];
const AWNINGS = [0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x7d3c98, 0x17202a, 0xe8e8e8];
const HOUSE_ROOFS = [0x8a3b2b, 0x5a4a40, 0x3b3f48, 0x6b2d2d, 0x4a5058, 0x70513a];
const CONTAINERS = [0xb03a2e, 0x1f618d, 0x1e8449, 0xd68910, 0x7d3c98, 0x808b96, 0xcb4335, 0x2e4053];

export const FACES = [
  { nx: 0, nz: 1, yaw: 0 },
  { nx: 1, nz: 0, yaw: Math.PI / 2 },
  { nx: 0, nz: -1, yaw: Math.PI },
  { nx: -1, nz: 0, yaw: -Math.PI / 2 },
];

export interface Lot { x0: number; x1: number; z0: number; z1: number; faces: number }
export function splitLots(r: Rng, cols: number, rows: number, gap: number, jitter = 0.12): Lot[] {
  const I = INNER_HALF;
  const xs: number[] = [-I], zs: number[] = [-I];
  for (let c = 1; c < cols; c++) xs.push(-I + ((2 * I) / cols) * (c + r.range(-jitter, jitter)));
  xs.push(I);
  for (let c = 1; c < rows; c++) zs.push(-I + ((2 * I) / rows) * (c + r.range(-jitter, jitter)));
  zs.push(I);
  const lots: Lot[] = [];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      let faces = 0;
      if (j === rows - 1) faces |= 1; // +z
      if (i === cols - 1) faces |= 2; // +x
      if (j === 0) faces |= 4; // -z
      if (i === 0) faces |= 8; // -x
      lots.push({
        x0: xs[i] + (i === 0 ? 0 : gap / 2), x1: xs[i + 1] - (i === cols - 1 ? 0 : gap / 2),
        z0: zs[j] + (j === 0 ? 0 : gap / 2), z1: zs[j + 1] - (j === rows - 1 ? 0 : gap / 2), faces,
      });
    }
  return lots;
}

// ------------------------------------------------------------ trees & lamps
let treeTpl: { wood: THREE.BufferGeometry; leaf: THREE.BufferGeometry }[] | null = null;
/** An alpha-cut leaf card with atlas UVs. */
function leafCard(cx: number, cy: number, cz: number, w: number, h: number, yaw: number, tilt: number, cell: number, tint: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  const c = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]][cell];
  for (let i = 0; i < uv.count; i++) uv.setXY(i, c[0] + uv.getX(i) * 0.5, c[1] + uv.getY(i) * 0.5);
  return finish(g, tint, { x: cx, y: cy, z: cz, rx: tilt, ry: yaw });
}
function leaves(cards: THREE.BufferGeometry[]) { return mergeGeometries(cards, false)!; }
function trees() {
  if (treeTpl) return treeTpl;
  const trunkC = 0x5a4030, tint = 0xffffff;
  const broad = (scale: number, tint2: number, trunkH: number, cell = 0) => {
    const cards: THREE.BufferGeometry[] = [];
    const cy = trunkH + 1.1;
    const R = 2.4 * scale;
    for (let i = 0; i < 3; i++) cards.push(leafCard(0, cy, 0, 4.6 * scale, 3.5 * scale, (i / 3) * Math.PI, 0, cell, tint2));
    for (let i = 0; i < 2; i++) cards.push(leafCard(0, cy + 0.5 * scale, 0, 4.4 * scale, 3.3 * scale, (i / 2) * Math.PI + 0.4, -Math.PI / 2 + 0.35, cell, tint2));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      cards.push(leafCard(Math.cos(a) * R * 0.42, cy - 0.4 * scale, Math.sin(a) * R * 0.42, 2.6 * scale, 2.2 * scale, a + Math.PI / 2, 0, cell, tint2));
    }
    const wood = mergeGeometries([
      cyl(0.2 * scale, 0.32 * scale, trunkH + 0.5, 0, 0, 0, trunkC, 8),
      cyl(0.09, 0.13, 1.5, 0.4 * scale, trunkH - 0.6, 0.1, trunkC, 6),
      cyl(0.08, 0.12, 1.3, -0.35 * scale, trunkH - 0.4, -0.2, trunkC, 6),
      cyl(0.07, 0.1, 1.2, 0, trunkH - 0.3, 0.35 * scale, trunkC, 6),
    ], false)!;
    return { wood, leaf: leaves(cards) };
  };
  const pine = () => {
    const cards: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const y = 2.2 + i * 1.7, w = (4.4 - i * 1.0);
      for (let k = 0; k < 2; k++) cards.push(leafCard(0, y + 1.0, 0, w, 3.6, (k / 2) * Math.PI, 0, 1, 0xffffff));
    }
    cards.push(leafCard(0, 7.4, 0, 2.2, 2.6, 0.4, 0, 1, 0xffffff));
    return { wood: cyl(0.17, 0.27, 2.4, 0, 0, 0, trunkC, 7), leaf: leaves(cards) };
  };
  const palm = () => {
    const cards: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      cards.push(leafCard(Math.cos(a) * 1.5, 6.6 + (i % 2) * 0.35, Math.sin(a) * 1.5, 4.6, 2.3, a + Math.PI / 2, 0.22, 2, 0xffffff));
    }
    cards.push(leafCard(0, 7.2, 0, 3.2, 1.8, 0.2, -Math.PI / 2 + 0.2, 2, 0xffffff));
    const trunkParts: THREE.BufferGeometry[] = [cyl(0.13, 0.27, 6.6, 0, 0, 0, 0x9a7a52, 8)];
    for (let i = 0; i < 14; i++) trunkParts.push(cyl(0.26 - i * 0.004, 0.27 - i * 0.005, 0.2, 0, 0.5 + i * 0.46, 0, 0x8a6a45, 8));
    return { wood: mergeGeometries(trunkParts, false)!, leaf: leaves(cards) };
  };
  treeTpl = [broad(1, tint, 3.6), broad(0.86, 0xa8d6a0, 3.1), pine(), palm()];
  return treeTpl;
}
function shrubTpl(): THREE.BufferGeometry {
  const cards: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) cards.push(leafCard(0, 0.6, 0, 1.6, 1.3, (i / 3) * Math.PI, 0, 3, 0xffffff));
  cards.push(leafCard(0, 1.0, 0, 1.4, 1.1, 0.4, -Math.PI / 2 + 0.2, 3, 0xffffff));
  return leaves(cards);
}
let shrubGeo: THREE.BufferGeometry | null = null;
export function addShrub(c: BCtx, x: number, z: number, s = 1) {
  if (!shrubGeo) shrubGeo = shrubTpl();
  const gy = Math.max(0, groundHeight(x, z)) - 0.04;
  c.b.add('leaf', place(shrubGeo, x, gy, z, c.rng.range(0, 6), s), c.chunk(x, z));
  if (s > 0.8) c.world.addCircle(x, z, 0.45 * s, gy + 1.4, 'shrub');
}
export function addTree(c: BCtx, x: number, z: number, kind = -1, s = 1, collide = true) {
  const t = trees();
  const k = kind >= 0 ? kind : c.rng.pick([0, 0, 1, 2]);
  const sc = s * c.rng.range(0.82, 1.22);
  const yaw = c.rng.range(0, 6.28);
  const gy = Math.max(0, groundHeight(x, z)) - 0.12;
  c.b.add('prop', place(t[k].wood, x, gy, z, yaw, sc), c.chunk(x, z));
  c.b.add('leaf', place(t[k].leaf, x, gy, z, yaw, sc), c.chunk(x, z));
  if (collide) c.world.addCircle(x, z, 0.4 * sc, gy + 7, 'tree');
  if (c.rng.chance(0.35)) addShrub(c, x + c.rng.range(-2, 2), z + c.rng.range(-2, 2), 0.7);
}
let lampTpl: THREE.BufferGeometry | null = null;
export function addLamp(c: BCtx, x: number, z: number, dx: number, dz: number) {
  if (!lampTpl) {
    lampTpl = mergeGeometries([
      cyl(0.2, 0.28, 0.5, 0, 0, 0, 0x3a3d42, 10),
      cyl(0.09, 0.14, 8.2, 0, 0.3, 0, 0x4d5158, 10),
      cyl(0.16, 0.16, 0.18, 0, 8.3, 0, 0x3a3d42, 10),
      box(0.12, 0.12, 1.1, 0, 8.25, 0.55, 0x4d5158),
      box(0.12, 0.12, 1.0, 0, 8.35, 1.5, 0x4d5158, 0, -0.12),
      box(0.38, 0.16, 0.95, 0, 8.3, 2.2, 0x5f646b),
      box(0.3, 0.05, 0.8, 0, 8.18, 2.2, 0xfff0c0),
    ], false)!;
  }
  const yaw = Math.atan2(dx, dz);
  const gy = Math.max(0, terrainHeightAt(x, z));
  c.b.add('prop', place(lampTpl, x, gy, z, yaw), c.chunk(x, z));
  c.world.addCircle(x, z, 0.26, gy + 8.3, 'lamp');
  c.lampBulbs.push({ x: x + dx * 2.2, y: gy + 8.12, z: z + dz * 2.2 });
}

// ------------------------------------------------------------ small helpers
function faceInfo(cx: number, cz: number, w: number, d: number, f: number) {
  const F = FACES[f];
  const half = F.nx !== 0 ? w / 2 : d / 2;
  return { px: cx + F.nx * half, pz: cz + F.nz * half, yaw: F.yaw, len: F.nx !== 0 ? d : w, nx: F.nx, nz: F.nz };
}
function pushRect(c: BCtx, cx: number, cz: number, w: number, d: number, col: string) {
  c.mapRects.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, c: col });
}
function mapCol(style: FacadeStyle) {
  return style === 'glass' ? '#5d7f99' : style === 'brick' ? '#8a5a4a' : style === 'industrial' ? '#6a7075' : '#8e8a80';
}

export function addSign(c: BCtx, cx: number, cz: number, w: number, d: number, f: number, name: string, y: number, sw = 6, sh = 1.5) {
  const fi = faceInfo(cx, cz, w, d, f);
  const width = Math.min(sw, fi.len * 0.8);
  const x = fi.px + fi.nx * 0.14, z = fi.pz + fi.nz * 0.14;
  c.b.add('sign', sign(width, sh, x, y, z, fi.yaw, signUV(name)), c.chunk(cx, cz));
}
function awning(c: BCtx, cx: number, cz: number, w: number, d: number, f: number, y: number) {
  const fi = faceInfo(cx, cz, w, d, f);
  const len = Math.max(3, fi.len * 0.8);
  const g = new THREE.BoxGeometry(len, 0.07, 1.9);
  g.translate(0, 0, 0.95);
  const col = c.rng.pick(AWNINGS);
  c.b.add('prop', finish(g, col, { rx: 0.28, ry: fi.yaw, x: fi.px + fi.nx * 0.15, y, z: fi.pz + fi.nz * 0.15 }), c.chunk(cx, cz));
}

function roofStuff(c: BCtx, cx: number, cz: number, w: number, d: number, y: number, kind: 'small' | 'big' | 'tower' | 'none', heli = false) {
  const ch = c.chunk(cx, cz);
  const r = c.rng;
  c.b.add('roof', flat(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y + 0.4, (px, pz) => [px / 5, pz / 5]), ch);
  c.b.add('prop', box(w + 0.1, 0.4, d + 0.1, cx, y, cz, 0x9a9a98), ch);
  // parapet
  const t = 0.35, hgt = 1.0;
  c.b.add('prop', box(w + 0.2, hgt, t, cx, y + 0.4, cz + d / 2 - t / 2 + 0.05, 0xb5b1a8), ch);
  c.b.add('prop', box(w + 0.2, hgt, t, cx, y + 0.4, cz - d / 2 + t / 2 - 0.05, 0xb5b1a8), ch);
  c.b.add('prop', box(t, hgt, d, cx + w / 2 - t / 2 + 0.05, y + 0.4, cz, 0xb5b1a8), ch);
  c.b.add('prop', box(t, hgt, d, cx - w / 2 + t / 2 - 0.05, y + 0.4, cz, 0xb5b1a8), ch);
  if (kind === 'none') return;
  const n = kind === 'small' ? r.int(1, 2) : r.int(2, 5);
  for (let i = 0; i < n; i++) {
    const px = cx + r.range(-w / 2 + 2.5, w / 2 - 2.5), pz = cz + r.range(-d / 2 + 2.5, d / 2 - 2.5);
    if (heli && Math.hypot(px - cx, pz - cz) < 7) continue;
    const s = r.range(0.8, 1.4);
    c.b.add('propMetal', box(2 * s, 1.2 * s, 1.5 * s, px, y + 0.4, pz, 0xaab0b5, r.range(0, 3)), ch);
    c.b.add('prop', cyl(0.5 * s, 0.5 * s, 0.1, px, y + 1.6 * s, pz, 0x222222, 10), ch);
  }
  if (kind !== 'small' && w > 9 && d > 9 && !heli) {
    const px = cx + r.range(-w / 4, w / 4), pz = cz + r.range(-d / 4, d / 4);
    c.b.add('prop', box(3.2, 2.8, 3.2, px, y + 0.4, pz, 0xa9a49a), ch);
    if (r.chance(0.55)) {
      const tx = cx + r.range(-w / 3, w / 3), tz = cz + r.range(-d / 3, d / 3);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) c.b.add('prop', box(0.14, 2, 0.14, tx + lx, y + 0.4, tz + lz, 0x4a4a4a), ch);
      c.b.add('prop', cyl(1.6, 1.6, 3, tx, y + 2.4, tz, 0x7a5a3a, 10), ch);
      c.b.add('prop', cone(1.75, 1.0, tx, y + 5.4, tz, 0x5a4a3a, 10), ch);
    }
  }
  if (kind === 'tower' && !heli) {
    const px = cx + r.range(-w / 5, w / 5), pz = cz + r.range(-d / 5, d / 5);
    const h = r.range(7, 14);
    c.b.add('propMetal', cyl(0.12, 0.2, h, px, y + 0.4, pz, 0x888c92, 6), ch);
    c.b.add('propMetal', box(2.4, 0.1, 0.1, px, y + 0.4 + h * 0.7, pz, 0x888c92), ch);
    c.b.add('red', sph(0.25, px, y + 0.4 + h, pz, 0xff2a2a), ch);
  }
  if (heli) {
    c.b.add('prop', cyl(7, 7, 0.15, cx, y + 0.4, cz, 0x3a3d42, 20), ch);
    c.b.add('prop', cyl(6, 6, 0.17, cx, y + 0.4, cz, 0x2d3035, 20), ch);
    c.b.add('prop', box(0.7, 0.19, 5, cx - 1.8, y + 0.4, cz, 0xf4d03f), ch);
    c.b.add('prop', box(0.7, 0.19, 5, cx + 1.8, y + 0.4, cz, 0xf4d03f), ch);
    c.b.add('prop', box(4, 0.19, 0.7, cx, y + 0.4, cz, 0xf4d03f), ch);
  }
}

function fireEscape(c: BCtx, cx: number, cz: number, w: number, d: number, f: number, floors: number) {
  const fi = faceInfo(cx, cz, w, d, f);
  const col = new Collector();
  const dark = 0x2b2e33;
  const off = c.rng.range(-fi.len / 4, fi.len / 4);
  const fw = 3.2;
  for (let fl = 1; fl < floors; fl++) {
    const y = fl * FLOOR_H + 0.2;
    col.add('prop', box(fw, 0.08, 1.3, off, y, 0.65, dark));
    col.add('prop', box(fw, 0.05, 0.05, off, y + 0.95, 1.3, dark));
    col.add('prop', box(fw, 0.05, 0.05, off, y + 0.5, 1.3, dark));
    for (const px of [-fw / 2, 0, fw / 2]) col.add('prop', box(0.05, 0.95, 0.05, off + px, y, 1.3, dark));
    for (const sx of [-1, 1]) col.add('prop', box(0.05, 0.95, 1.3, off + sx * fw / 2, y, 0.65, dark));
    if (fl > 1) {
      const sl = new THREE.BoxGeometry(0.9, 0.06, 4.6);
      col.add('prop', finish(sl, dark, { rx: -0.65 * 0 + Math.atan2(FLOOR_H, 3.4), x: off + 0.0, y: y - FLOOR_H / 2 + 0.1, z: 0.8 }));
    }
  }
  col.flush(c.b, fi.px, fi.pz, fi.yaw, c.chunk(cx, cz));
}

// ------------------------------------------------------------ generic building
export interface BOpts {
  cx: number; cz: number; w: number; d: number; floors: number; style: FacadeStyle;
  tint?: number; store?: boolean; faces?: number; sign?: string | null; roof?: 'small' | 'big' | 'tower' | 'none';
  fire?: boolean; heli?: boolean; y0?: number; noCollide?: boolean; ad?: boolean;
  district?: StoreDef['district'];
  neonTrim?: number;
}
export function addBuilding(c: BCtx, o: BOpts) {
  const r = c.rng;
  const primaryStore = o.sign ? null : allocateStore(c, o.district);
  const shopName = o.sign ?? primaryStore!.name;
  let doorDone = false;
  const w = Math.max(BAY * 2, Math.round(o.w / BAY) * BAY), d = Math.max(BAY * 2, Math.round(o.d / BAY) * BAY);
  const { cx, cz, floors, style } = o;
  const y0 = o.y0 ?? 0;
  const H = floors * FLOOR_H;
  const ch = c.chunk(cx, cz);
  const tint = o.tint ?? r.pick(TINTS[style]);
  const uOff = [0, 1, 2, 3].map(() => r.int(0, 7) / 8);
  c.b.add('f_' + style, walls(w, H, d, cx, y0, cz, tint, uOff), ch);
  if (o.neonTrim && y0 === 0) {
    // Glowing Vice/Art-Deco architectural neon trim band
    c.b.add('emit', box(w + 0.5, 0.24, d + 0.5, cx, Math.min(H - 0.6, 4.7), cz, o.neonTrim), ch);
    if (H > 10) c.b.add('emit', box(w + 0.45, 0.22, d + 0.45, cx, H - 0.35, cz, o.neonTrim), ch);
  }
  if (o.store && y0 === 0) {
    const st = r.pick(SHELLS);
    c.b.add('store', walls(w + 0.3, 4.4, d + 0.3, cx, 0, cz, st, [r.range(0, 1), r.range(0, 1), r.range(0, 1), r.range(0, 1)], 7, 4.4), ch);
    c.b.add('prop', box(w + 0.7, 0.35, d + 0.7, cx, 4.4, cz, 0x6a6b70), ch);
    const faces = o.faces ?? 15;
    let firstUsed = false;
    for (let f = 0; f < 4; f++) {
      const bit = [1, 2, 4, 8][f];
      if (!(faces & bit)) continue;
      const fi = faceInfo(cx, cz, w, d, f);
      const tx = Math.cos(fi.yaw), tz = -Math.sin(fi.yaw);
      // Pack 1 to 3 distinct GTA-6 storefronts per street-facing facade!
      const bays = o.sign !== undefined ? 1 : Math.max(1, Math.min(3, Math.floor(fi.len / 9.5)));
      const baySpan = fi.len / bays;
      for (let bIdx = 0; bIdx < bays; bIdx++) {
        const sDef = (!firstUsed && o.sign)
          ? null
          : (!firstUsed && primaryStore)
            ? primaryStore
            : allocateStore(c, o.district);
        firstUsed = true;
        const unitName = sDef ? sDef.name : shopName;
        const unitKind = sDef ? sDef.doorKind : doorKind(unitName);
        const off = -fi.len / 2 + baySpan * (bIdx + 0.5);
        const sx = fi.px + fi.nx * 0.16 + tx * off;
        const sz = fi.pz + fi.nz * 0.16 + tz * off;
        if (o.sign !== null) {
          const signW = Math.min(6.4, baySpan * 0.84);
          const signY = floors >= 2 ? 5.35 : 3.95;
          c.b.add('sign', sign(signW, 1.35, sx, signY, sz, fi.yaw, signUV(sDef ? sDef.id : unitName)), ch);
        }
        doorDone = true;
        c.doors.push({
          x: fi.px + fi.nx * 0.65 + tx * off,
          z: fi.pz + fi.nz * 0.65 + tz * off,
          yaw: fi.yaw,
          name: unitName,
          kind: unitKind,
        });
      }
      if (r.chance(0.65)) awning(c, cx, cz, w, d, f, 3.55);
    }
  }
  if (!o.store && !doorDone && y0 === 0 && floors > 0) {
    doorDone = true;
    const f = [0, 1, 2, 3].find((q) => ((o.faces ?? 15) & [1, 2, 4, 8][q]) !== 0) ?? 0;
    const fi = faceInfo(cx, cz, w, d, f);
    c.doors.push({ x: fi.px + fi.nx * 0.55, z: fi.pz + fi.nz * 0.55, yaw: fi.yaw, name: shopName, kind: doorKind(shopName) });
  }
  if (o.store && floors >= 4) {
    // awnings, vents, downpipes and AC units on the shop block
    for (let f = 0; f < 2; f++) {
      const fi = faceInfo(cx, cz, w, d, f);
      const x = fi.px + fi.nx * 0.3, z = fi.pz + fi.nz * 0.3;
      c.b.add('propMetal', cyl(0.09, 0.09, floors * FLOOR_H - 1.2, x + (fi.nx ? 0.1 : w / 2 - 0.5), 0.4, z + (fi.nz ? 0.1 : d / 2 - 0.5), 0x6a6e72, 8), ch);
      for (let fl = 1; fl < Math.min(floors, 5); fl++) {
        c.b.add('propMetal', box(0.7, 0.55, 0.35, x + 1.5, fl * FLOOR_H + 0.9, z, 0xb8bcc0, fi.yaw), ch);
        c.b.add('propMetal', box(0.5, 0.6, 0.16, x - 2.2, fl * FLOOR_H + 0.6, z, 0x8a8f93, fi.yaw), ch);
      }
    }
  }
  if (floors > 4 && y0 === 0) {
    // Architectural cornice & bespoke style flourishes so buildings look diverse and handmade
    c.b.add('prop', box(w + 0.6, 0.5, d + 0.6, cx, H - 0.5, cz, 0xb8b2a4), ch);
    if (style === 'glass' && floors >= 6) {
      // Modern structural mullions + recessed penthouse sky-lounge crown
      for (let i = -1; i <= 1; i += 2) {
        c.b.add('propMetal', box(0.32, H, 0.32, cx + i * (w / 2 + 0.08), 0, cz + d / 2 + 0.08, 0x2a3440), ch);
        c.b.add('propMetal', box(0.32, H, 0.32, cx + i * (w / 2 + 0.08), 0, cz - d / 2 - 0.08, 0x2a3440), ch);
      }
      c.b.add('propMetal', box(w + 0.35, 0.36, d + 0.35, cx, H * 0.5, cz, 0x323d4a), ch);
      c.b.add('emit', box(w + 0.3, 0.16, d + 0.3, cx, H - 0.18, cz, 0x5ee6ff), ch);
    } else if (style === 'stone' && floors >= 5) {
      // Classical pilasters + stepped limestone parapet crown
      for (const sx of [-0.36, 0, 0.36]) {
        c.b.add('prop', box(0.65, H - 0.6, 0.32, cx + sx * w, 0.4, cz + d / 2 + 0.14, 0xe8dfd0), ch);
        c.b.add('prop', box(0.65, H - 0.6, 0.32, cx + sx * w, 0.4, cz - d / 2 - 0.14, 0xe8dfd0), ch);
      }
      c.b.add('prop', box(w * 0.68, 1.8, d * 0.68, cx, H + 0.4, cz, 0xd8cfc0), ch);
    } else if (style === 'brick' && floors >= 5) {
      // Classic masonry corner quoins + dark-iron cornice dentils
      c.b.add('prop', box(w + 0.9, 0.72, d + 0.9, cx, H - 0.65, cz, 0x4b3d36), ch);
      c.b.add('prop', box(w * 0.52, 2.2, d * 0.52, cx, H + 0.4, cz, 0x8a5b4a), ch);
    } else if (style === 'apartment' && floors >= 5) {
      // Art Deco stepped central fin & cantilevered balconies
      c.b.add('prop', box(1.2, H + 1.8, 0.55, cx, 0.4, cz + d / 2 + 0.22, 0xf6efe6), ch);
      for (let fl = 2; fl < Math.min(floors, 7); fl += 2) {
        c.b.add('prop', box(w * 0.32, 0.18, 1.2, cx - w * 0.24, fl * FLOOR_H, cz + d / 2 + 0.6, 0xe8e4dc), ch);
        c.b.add('propMetal', box(w * 0.32, 0.9, 0.08, cx - w * 0.24, fl * FLOOR_H + 0.18, cz + d / 2 + 1.15, 0x2b3038), ch);
      }
    }
  }
  if (o.roof !== 'none') roofStuff(c, cx, cz, w, d, y0 + H, o.roof ?? (floors > 12 ? 'tower' : floors > 4 ? 'big' : 'small'), o.heli);
  else roofStuff(c, cx, cz, w, d, y0 + H, 'none');
  if (o.fire && style === 'brick') {
    const fcs = [0, 1, 2, 3].filter((f) => !((o.faces ?? 0) & [1, 2, 4, 8][f]));
    if (fcs.length) fireEscape(c, cx, cz, w, d, r.pick(fcs), floors);
  }
  if (o.ad) {
    const f = [0, 1, 2, 3].find((q) => ((o.faces ?? 0) & [1, 2, 4, 8][q]) !== 0);
    if (f !== undefined) {
      const fi = faceInfo(cx, cz, w, d, f);
      const col = new Collector();
      col.add('propMetal', box(0.3, 4, 0.3, -5, 0, 0, 0x555a60));
      col.add('propMetal', box(0.3, 4, 0.3, 5, 0, 0, 0x555a60));
      col.add('propMetal', box(12.4, 6.4, 0.3, 0, 3.0, 0, 0x3a3d42));
      const idx = r.int(0, 3);
      col.add('ad', sign(12, 6, 0, 6.2, 0.2, 0, [(idx % 2) * 0.5, idx < 2 ? 0.5 : 0, 0.5, 0.5]));
      // lift everything onto the roof
      for (const it of col.items) it[1].translate(0, y0 + H + 1.2, 0);
      col.flush(c.b, cx - fi.nx * 0 + 0, cz - fi.nz * 0 + 0, fi.yaw, ch);
    }
  }
  if (!o.noCollide) c.world.addBox(cx - w / 2 - 0.2, cx + w / 2 + 0.2, cz - d / 2 - 0.2, cz + d / 2 + 0.2, y0 + H);
  pushRect(c, cx, cz, w, d, mapCol(style));
  return { w, d, H };
}

/** Lot-aware placement */
export function buildingInLot(c: BCtx, lot: Lot, o: Omit<BOpts, 'cx' | 'cz' | 'w' | 'd'>) {
  const lw = lot.x1 - lot.x0, ld = lot.z1 - lot.z0;
  const w = Math.max(BAY * 2, Math.floor(lw / BAY) * BAY), d = Math.max(BAY * 2, Math.floor(ld / BAY) * BAY);
  let cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  if (lot.faces & 8) cx = lot.x0 + w / 2;
  else if (lot.faces & 2) cx = lot.x1 - w / 2;
  if (lot.faces & 4) cz = lot.z0 + d / 2;
  else if (lot.faces & 1) cz = lot.z1 - d / 2;
  return addBuilding(c, { ...o, cx, cz, w, d, faces: lot.faces });
}

export function addTower(c: BCtx, lot: Lot, floors: number) {
  const r = c.rng;
  const lw = lot.x1 - lot.x0, ld = lot.z1 - lot.z0;
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  const podF = r.int(3, 4);
  const podium = addBuilding(c, { cx, cz, w: lw, d: ld, floors: podF, style: 'stone', store: true, faces: lot.faces, roof: 'none', district: 'downtown' });
  // shaft tiers
  const shaftStyle: FacadeStyle = r.pick(['glass', 'glass', 'glass', 'office', 'office', 'stone']);
  const tint = r.pick(TINTS[shaftStyle]);
  let w = podium.w - 6, d = podium.d - 6;
  let y = podF * FLOOR_H;
  let left = floors - podF;
  const tiers = left > 24 ? 3 : left > 12 ? 2 : 1;
  for (let t = 0; t < tiers; t++) {
    const fl = t === tiers - 1 ? left : Math.max(4, Math.round(left * r.range(0.45, 0.6)));
    const last = t === tiers - 1;
    addBuilding(c, { cx, cz, w, d, floors: fl, style: shaftStyle, tint, y0: y, roof: last ? 'tower' : 'small', heli: last && r.chance(0.3), noCollide: true });
    c.b.add('prop', box(w + 1, 0.6, d + 1, cx, y - 0.2, cz, 0xa5a8ad), c.chunk(cx, cz));
    y += fl * FLOOR_H;
    left -= fl;
    w = Math.max(BAY * 3, w - BAY * 2);
    d = Math.max(BAY * 3, d - BAY * 2);
    if (left <= 0) break;
  }
  // Architectural skyscraper crown: Art Deco stepped ziggurat, sloped glass fin, or twin telecom spire
  const ch = c.chunk(cx, cz);
  const crownRoll = r.int(0, 2);
  if (crownRoll === 0) {
    c.b.add('prop', box(w * 0.72, 3.6, d * 0.72, cx, y + 0.3, cz, 0xd8dce2), ch);
    c.b.add('emit', box(w * 0.76, 0.28, d * 0.76, cx, y + 3.6, cz, 0x38d9ff), ch);
    c.b.add('propMetal', cone(1.15, 18, cx, y + 3.9, cz, 0xc2c8d0, 8), ch);
    c.b.add('red', sph(0.32, cx, y + 21.9, cz, 0xff2a2a), ch);
  } else if (crownRoll === 1) {
    // Diagonal beveled crown lantern
    c.b.add('f_glass', box(w * 0.85, 5.2, d * 0.62, cx, y + 0.3, cz, 0xa8d8ff), ch);
    c.b.add('emit', box(w * 0.88, 0.25, d * 0.66, cx, y + 5.3, cz, 0xff4da6), ch);
  } else if (r.chance(0.75)) {
    c.b.add('propMetal', cone(1.2, 16, cx, y + 0.4, cz, 0xb0b5bb, 6), ch);
    c.b.add('red', sph(0.3, cx, y + 16.4, cz, 0xff2a2a), ch);
  }
  c.world.addBox(cx - podium.w / 2, cx + podium.w / 2, cz - podium.d / 2, cz + podium.d / 2, y);
}

// ------------------------------------------------------------ houses
export function addHouse(c: BCtx, lotCx: number, lotZFront: number, dirZ: number, lotX0: number, lotX1: number, yBase?: number) {
  const r = c.rng;
  const w = r.pick([10.5, 12, 14]), d = r.pick([9, 10.5, 12]);
  const floors = r.chance(0.55) ? 2 : 1;
  const style: FacadeStyle = r.pick(['brick', 'apartment', 'stone', 'apartment']);
  const tint = r.pick(TINTS[style]);
  const hz = lotZFront - dirZ * (6 + d / 2);
  const y0 = yBase ?? Math.max(0, terrainHeightAt(lotCx, hz));
  const yaw = dirZ > 0 ? 0 : Math.PI;
  const s = dirZ > 0 ? 1 : -1; // local->world sign
  const col = new Collector();
  const H = floors * FLOOR_H;
  const uOff = [r.int(0, 7) / 8, r.int(0, 7) / 8, r.int(0, 7) / 8, r.int(0, 7) / 8];
  // Grounded concrete foundation plinth so no house ever floats on sloped terrain edges
  col.add('prop', box(w + 0.4, 0.5, d + 0.4, 0, -0.35, 0, 0x8a8780));
  col.add('f_' + style, walls(w, H, d, 0, 0, 0, tint, uOff));
  // roof
  const roofCol = r.pick(HOUSE_ROOFS);
  const ridgeX = r.chance(0.5);
  const rh = Math.min(w, d) * 0.38;
  const wallCol = new THREE.Color(tint).multiply(new THREE.Color(style === 'brick' ? 0xc8a898 : 0xeee2d0)).getHex();
  const [slopes, ends] = ridgeX ? gable(w, d, rh, 0.5, roofCol, wallCol) : gable(d, w, rh, 0.5, roofCol, wallCol);
  if (!ridgeX) { slopes.rotateY(Math.PI / 2); ends.rotateY(Math.PI / 2); }
  slopes.translate(0, H, 0); ends.translate(0, H, 0);
  col.add('prop', slopes); col.add('prop', ends);
  col.add('prop', box(0.9, rh + 2.2, 0.9, w * 0.25, H + 0.5, -d * 0.2, 0x8a6a5a));
  // door + porch
  const doorX = r.range(-w * 0.2, w * 0.2);
  col.add('prop', box(1.15, 2.25, 0.1, doorX, 0.16, d / 2 + 0.05, r.pick([0x5a3a22, 0x2a4a6a, 0x7a2a2a, 0x2a2a2a])));
  col.add('prop', box(1.5, 0.12, 0.14, doorX, 2.4, d / 2 + 0.08, 0xeeeeee));
  col.add('prop', box(3.4, 0.2, 1.8, doorX, 0, d / 2 + 0.9, 0xb5b0a5));
  col.add('prop', box(3.4, 0.14, 1.9, doorX, 2.9, d / 2 + 0.95, roofCol));
  for (const sx of [-1.6, 1.6]) col.add('prop', box(0.14, 2.7, 0.14, doorX + sx, 0.2, d / 2 + 1.7, 0xeeeeee));
  // garage
  const gx = w / 2 + 2.6;
  col.add('prop', box(5.4, 0.45, d * 0.8 + 0.3, gx, -0.3, -d * 0.1, 0x8a8780));
  col.add('f_industrial', walls(5.2, 3.2, d * 0.8, gx, 0, -d * 0.1 + 0.0, 0xe8e0d0, [0, 0, 0, 0], 28, 28.8));
  col.add('prop', box(4.6, 0.3, d * 0.8 + 0.6, gx, 3.2, -d * 0.1, roofCol));
  col.add('prop', box(3.9, 2.4, 0.1, gx, 0.16, d * 0.3 + 0.05, 0x8f9498));
  for (let k = 0; k < 4; k++) col.add('prop', box(3.9, 0.04, 0.12, gx, 0.55 + k * 0.55, d * 0.3 + 0.07, 0xaaaaaa));
  // driveway
  col.add('conc', flat(gx - 2, d / 2 - 2, gx + 2, d / 2 + 7.5, 0.185, (x, z) => [x / 4, z / 4]));
  // fence along front
  const fz = d / 2 + 6;
  const fw = 21;
  for (const [a, b] of [[-fw / 2, gx - 2.4], [gx + 2.4, fw / 2]]) {
    if (b - a < 1) continue;
    col.add('prop', box(b - a, 0.95, 0.06, (a + b) / 2, 0.16, fz, 0xf2f2ee));
    col.add('prop', box(b - a, 0.08, 0.1, (a + b) / 2, 0.95, fz, 0xe0e0dc));
  }
  // bushes
  for (let i = 0; i < 4; i++) col.add('prop', sph(0.7, r.range(-w / 2, w / 2), 0.7, d / 2 + 0.7 + r.range(0, 0.3), r.pick([0x2f6a2a, 0x3d7a30]), 1, 0.8, 1, 6));
  // mailbox
  col.add('prop', box(0.4, 0.3, 0.25, doorX + 3, 1.0, fz + 0.5, 0x2a4a8a));
  col.add('prop', box(0.08, 1.0, 0.08, doorX + 3, 0.16, fz + 0.5, 0x555555));
  // pool in some backyards
  if (r.chance(0.18)) col.add('pool', flat(-w / 2 + 1, -d / 2 - 12, w / 2 - 1, -d / 2 - 4, 0.19, () => [0, 0]));
  if (y0 !== 0) {
    for (const it of col.items) it[1].translate(0, y0, 0);
  }
  col.flush(c.b, lotCx, hz, yaw, c.chunk(lotCx, hz));
  c.doors.push({ x: lotCx + s * doorX, z: hz + s * (d / 2 + 0.7), yaw, name: 'APARTMENT', kind: 'apartment' });
  // collider (world space)
  const x0 = lotCx + s * (-w / 2), x1 = lotCx + s * (w / 2 + 5.2);
  c.world.addBox(Math.min(x0, x1), Math.max(x0, x1), hz - d / 2 - 0.2, hz + d / 2 + 0.2, y0 + H + rh);
  pushRect(c, lotCx + s * (gx / 2 - 0.1 * 0), hz, w + 5.2, d, '#8a7a70');
  // trees
  if (r.chance(0.7)) addTree(c, lotCx + r.range(-6, 6), hz - dirZ * (d / 2 + 10), -1, 1);
  if (r.chance(0.4)) addTree(c, lotX0 + r.range(2, 5), lotZFront - dirZ * r.range(2, 5), -1, 0.9);
  void lotX1;
}

// ------------------------------------------------------------ industrial
export function addWarehouse(c: BCtx, cx: number, cz: number, w: number, d: number, faces: number) {
  const r = c.rng;
  const floors = r.int(2, 3);
  const H = floors * FLOOR_H;
  const ch = c.chunk(cx, cz);
  c.b.add('f_industrial', walls(w, H, d, cx, 0, cz, r.pick(TINTS.industrial), [r.range(0, 1), r.range(0, 1), r.range(0, 1), r.range(0, 1)]), ch);
  const ridgeX = w >= d;
  const rh = 2.4;
  const [sl, en] = ridgeX ? gable(w, d, rh, 0.3, 0x7f8a92, 0x9aa5ab) : gable(d, w, rh, 0.3, 0x7f8a92, 0x9aa5ab);
  if (!ridgeX) { sl.rotateY(Math.PI / 2); en.rotateY(Math.PI / 2); }
  sl.translate(cx, H, cz); en.translate(cx, H, cz);
  c.b.add('propMetal', sl, ch); c.b.add('prop', en, ch);
  // roller doors on faces toward the street
  for (let f = 0; f < 4; f++) {
    if (!(faces & [1, 2, 4, 8][f])) continue;
    const fi = faceInfo(cx, cz, w, d, f);
    const col = new Collector();
    const n = Math.max(1, Math.floor(fi.len / 12));
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 11;
      col.add('prop', box(5, 4.4, 0.25, x, 0.16, 0.12, 0x6e757b));
      for (let k = 0; k < 8; k++) col.add('prop', box(4.8, 0.05, 0.28, x, 0.5 + k * 0.5, 0.14, 0x8b9399));
      col.add('prop', box(5.6, 0.3, 0.3, x, 4.5, 0.12, 0xf1c40f));
    }
    col.flush(c.b, fi.px, fi.pz, fi.yaw, ch);
  }
  c.world.addBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, H + rh);
  pushRect(c, cx, cz, w, d, '#6a7075');
}

export function addContainers(c: BCtx, x0: number, z0: number, cols: number, rows: number, maxLevels: number) {
  const r = c.rng;
  const ch = c.chunk(x0, z0);
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const lv = r.int(1, maxLevels);
      const x = x0 + i * 2.9, z = z0 + j * 12.4;
      for (let l = 0; l < lv; l++) {
        const col = r.pick(CONTAINERS);
        c.b.add('prop', box(2.45, 2.55, 12, x, l * 2.6 + 0.16, z, col), ch);
        c.b.add('prop', box(2.3, 2.3, 0.05, x, l * 2.6 + 0.28, z + 6.02, 0x222222), ch);
        for (let k = 0; k < 6; k++) c.b.add('prop', box(2.5, 2.4, 0.08, x, l * 2.6 + 0.2, z - 5 + k * 2, new THREE.Color(col).multiplyScalar(0.85).getHex()), ch);
      }
      c.world.addBox(x - 1.25, x + 1.25, z - 6, z + 6, lv * 2.6 + 0.2);
    }
  c.mapRects.push({ x0: x0 - 1.5, z0: z0 - 6, x1: x0 + cols * 2.9, z1: z0 + rows * 12.4 - 6, c: '#7a6f8a' });
}

export function addCrane(c: BCtx, x: number, z: number) {
  const ch = c.chunk(x, z);
  const col = 0xd35400;
  const legs: [number, number][] = [[-9, -6], [9, -6], [-9, 6], [9, 6]];
  for (const [lx, lz] of legs) c.b.add('propMetal', box(1.2, 32, 1.2, x + lx, 0, z + lz, col), ch);
  c.b.add('propMetal', box(20, 1.6, 14, x, 31, z, col), ch);
  c.b.add('propMetal', box(3, 2.5, 90, x, 32.6, z + 20, 0xe67e22), ch);
  c.b.add('propMetal', box(4.5, 3.5, 4.5, x + 4, 30, z - 4, 0x34495e), ch);
  c.b.add('prop', box(0.15, 14, 0.15, x, 18.5, z + 40, 0x222222), ch);
  c.b.add('propMetal', box(3.2, 1.2, 4, x, 17.5, z + 40, 0x444444), ch);
  c.b.add('red', sph(0.4, x, 36, z + 64, 0xff2a2a), ch);
  for (const [lx, lz] of legs) c.world.addCircle(x + lx, z + lz, 0.9, 32, 'crane');
}

export function addSilos(c: BCtx, x: number, z: number, n: number) {
  const ch = c.chunk(x, z);
  for (let i = 0; i < n; i++) {
    const sx = x + i * 10;
    c.b.add('propMetal', cyl(4, 4, 18, sx, 0, z, 0xb8c0c6, 14), ch);
    c.b.add('propMetal', cone(4.1, 3, sx, 18, z, 0x8f99a0, 14), ch);
    c.b.add('prop', box(0.5, 18, 0.1, sx, 0, z + 4.1, 0x444444), ch);
    c.world.addCircle(sx, z, 4.1, 21, 'silo');
  }
  c.mapRects.push({ x0: x - 4, z0: z - 4, x1: x + n * 10, z1: z + 4, c: '#9aa0a5' });
}

// ------------------------------------------------------------ specials
export function addBank(c: BCtx, bx: number, bz: number) {
  const ch = c.chunk(bx, bz);
  const W = 62, D = 34;
  const cx = bx, cz = bz - 42 + D / 2;
  const front = cz + D / 2;
  c.b.add('f_stone', walls(W, 5 * FLOOR_H, D, cx, 0, cz, 0xf3ead8, [0, 0.25, 0.5, 0.75]), ch);
  c.b.add('prop', box(W + 1.2, 1, D + 1.2, cx, 5 * FLOOR_H, cz, 0xd5ccb8), ch);
  roofStuff(c, cx, cz, W, D, 5 * FLOOR_H + 1, 'big');
  const colH = 11;
  for (let i = 0; i < 8; i++) {
    const x = cx - 24.5 + i * 7;
    c.b.add('prop', cyl(0.9, 1.0, colH, x, 0.3, front + 4.5, 0xf2eee2, 12), ch);
    c.b.add('prop', box(2.4, 0.5, 2.4, x, colH + 0.3, front + 4.5, 0xe5ded0), ch);
    c.b.add('prop', box(2.4, 0.5, 2.4, x, 0.16, front + 4.5, 0xe5ded0), ch);
    c.world.addCircle(x, front + 4.5, 1.0, colH, 'column');
  }
  c.b.add('prop', box(60, 1.8, 11, cx, colH + 0.8, front + 3.5, 0xe9e2d2), ch);
  const [sl, en] = gable(60, 11, 4.2, 0.4, 0xd8cfbd, 0xe9e2d2);
  sl.translate(cx, colH + 2.6, front + 3.5); en.translate(cx, colH + 2.6, front + 3.5);
  c.b.add('prop', sl, ch); c.b.add('prop', en, ch);
  for (let s = 0; s < 4; s++) c.b.add('prop', box(58 - s * 2, 0.3, 12 - s * 0.6, cx, s * 0.3, front + 3 + s * 0.4, 0xd9d2c2), ch);
  // doors
  c.b.add('prop', box(6.4, 6.6, 0.4, cx, 0.8, front + 0.1, 0x3a2e1e), ch);
  c.b.add('prop', box(5.6, 6.0, 0.45, cx, 1.0, front + 0.12, 0x1c2430), ch);
  c.b.add('prop', box(0.12, 6.0, 0.5, cx, 1.0, front + 0.14, 0xd4af37), ch);
  c.b.add('sign', sign(12, 2.8, cx, colH + 1.0, front + 9.1, 0, signUV('BANK')), ch);
  c.world.addBox(cx - W / 2, cx + W / 2, cz - D / 2, front + 0.2, 5 * FLOOR_H + 2);
  c.world.addBox(cx - 30, cx + 30, front + 0.2, front + 10, 0.9, 'steps');
  pushRect(c, cx, cz, W, D, '#c8bfa8');
  c.places.bank = { x: cx, z: front + 12.5 };
  c.doors.push({ x: cx, z: front + 11.4, yaw: 0, name: 'BANK', kind: 'bank' });
  // fountain
  const fz = bz + 22;
  c.b.add('prop', cyl(5.6, 5.8, 0.9, bx, 0.17, fz, 0xbdb7aa, 24), ch);
  c.b.add('water', cyl(5.0, 5.0, 0.05, bx, 0.92, fz, 0x3f8fb0, 24), ch);
  c.b.add('prop', cyl(0.6, 0.9, 2.5, bx, 0.9, fz, 0xcfc9bc, 12), ch);
  c.b.add('prop', cyl(2.0, 1.2, 0.4, bx, 3.0, fz, 0xcfc9bc, 14), ch);
  c.world.addCircle(bx, fz, 5.8, 1.2, 'fountain');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    c.b.add('prop', box(1.8, 0.5, 0.5, bx + Math.cos(a) * 9, 0.17, fz + Math.sin(a) * 9, 0x6b4a2a, -a + Math.PI / 2), ch);
  }
  for (const [tx, tz] of [[-34, 6], [34, 6], [-34, 36], [34, 36], [-20, 38], [20, 38]]) addTree(c, bx + tx, bz + tz, 0);
  c.collect.push({ x: bx + 12, z: bz + 40 });
}

export function addBigBlock(c: BCtx, cx: number, cz: number, w: number, d: number, floors: number, style: FacadeStyle, name: string, face: number, heli = false) {
  const r = addBuilding(c, { cx, cz, w, d, floors, style, store: true, faces: 1 << face, sign: name, heli, roof: 'big', tint: style === 'office' ? 0xf5f5f2 : undefined });
  return r;
}

export function addHospital(c: BCtx, bx: number, bz: number) {
  const cx = bx, cz = bz - 8;
  const r = addBuilding(c, { cx, cz, w: 70, d: 42, floors: 6, style: 'office', tint: 0xf4f6f8, store: true, faces: 1, sign: 'HOSPITAL', heli: true, roof: 'big' });
  const ch = c.chunk(cx, cz);
  c.b.add('prop', box(14, 0.5, 8, cx, 4.6, cz + r.d / 2 + 4, 0xe74c3c), ch);
  for (const sx of [-6, 6]) c.b.add('prop', box(0.4, 4.6, 0.4, cx + sx, 0.16, cz + r.d / 2 + 7.6, 0xdddddd), ch);
  // red cross on the facade
  c.b.add('prop', box(1.6, 5, 0.3, cx - 28, 14, cz + r.d / 2 + 0.2, 0xd62828), ch);
  c.b.add('prop', box(5, 1.6, 0.3, cx - 28, 15.7, cz + r.d / 2 + 0.2, 0xd62828), ch);
  c.places.hospital = { x: bx, z: bz + 44.5 };
  for (const [tx, tz] of [[-38, 36], [38, 36], [-20, 38], [20, 38]]) addTree(c, bx + tx, bz + tz, 0);
  c.b.add('prop', box(9, 0.02, 4, bx + 25, 0.19, bz + 30, 0x444444), ch);
}
export function addPolice(c: BCtx, bx: number, bz: number) {
  const cx = bx, cz = bz - 14;
  const r = addBuilding(c, { cx, cz, w: 56, d: 28, floors: 4, style: 'stone', tint: 0xb8c4d6, store: true, faces: 1, sign: 'POLICE', roof: 'big' });
  const ch = c.chunk(cx, cz);
  c.b.add('prop', box(0.25, 14, 0.25, cx + 30, 0.16, cz + r.d / 2 + 6, 0xdddddd), ch);
  c.b.add('prop', box(4, 2.4, 0.06, cx + 32, 11.4, cz + r.d / 2 + 6, 0x3355aa), ch);
  c.b.add('prop', box(r.w, 0.02, 20, cx, 0.19, bz + 28, 0x45464a), ch);
  for (let i = 0; i < 6; i++) c.b.add('prop', box(0.12, 0.02, 5, cx - 25 + i * 10, 0.2, bz + 30, 0xf2f2f2), ch);
  c.places.police = { x: bx, z: bz + 22 };
}
export function addGas(c: BCtx, bx: number, bz: number) {
  const ch = c.chunk(bx, bz);
  addBuilding(c, { cx: bx, cz: bz - 32, w: 24.5, d: 10.5, floors: 1, style: 'brick', store: true, faces: 1, sign: 'GAS', roof: 'small' });
  c.b.add('prop', box(28, 0.7, 16, bx, 5.4, bz + 4, 0xe8e8e8), ch);
  c.b.add('prop', box(28.2, 0.4, 16.2, bx, 5.2, bz + 4, 0xc0392b), ch);
  for (const [px, pz] of [[-12, -2], [12, -2], [-12, 10], [12, 10]]) {
    c.b.add('prop', box(0.7, 5.4, 0.7, bx + px, 0.16, bz + pz, 0xdddddd), ch);
    c.world.addCircle(bx + px, bz + pz, 0.5, 6, 'pillar');
  }
  for (const px of [-6, 6]) for (const pz of [1, 7]) {
    c.b.add('prop', box(0.9, 1.6, 0.6, bx + px, 0.4, bz + pz, 0xc0392b), ch);
    c.b.add('prop', box(0.7, 0.4, 0.62, bx + px, 1.3, bz + pz, 0x2c3e50), ch);
    c.b.add('prop', box(2.4, 0.2, 1.6, bx + px, 0.16, bz + pz, 0x8a8a86), ch);
    c.world.addBox(bx + px - 0.5, bx + px + 0.5, bz + pz - 0.4, bz + pz + 0.4, 1.7);
  }
  c.b.add('propMetal', box(0.4, 11, 0.4, bx - 18, 0, bz + 30, 0x555a60), ch);
  c.b.add('sign', sign(5, 2.5, bx - 18, 11.5, bz + 30.25, 0, signUV('GAS')), ch);
  c.world.addCircle(bx - 18, bz + 30, 0.4, 12, 'pole');
  c.props.push({ kind: 'xbarrel', x: bx + 17, z: bz - 20 }, { kind: 'xbarrel', x: bx + 18.3, z: bz - 20.5 });
}
export function addPaySpray(c: BCtx, bx: number, bz: number) {
  const ch = c.chunk(bx, bz);
  const cz = bz + 33;
  const r = addBuilding(c, { cx: bx, cz, w: 38.5, d: 17.5, floors: 2, style: 'industrial', tint: 0xf2e8c0, faces: 4, roof: 'big' });
  const front = cz - r.d / 2;
  c.b.add('prop', box(13, 7, 0.5, bx, 0.16, front - 0.15, 0x222428), ch);
  c.b.add('prop', box(12, 6.4, 0.3, bx, 0.3, front - 0.4, 0xc9a227), ch);
  for (let k = 0; k < 12; k++) c.b.add('prop', box(12, 0.06, 0.32, bx, 0.5 + k * 0.5, front - 0.42, 0x8a6f12), ch);
  c.b.add('sign', sign(10, 2.5, bx, 8.4, front - 0.6, Math.PI, signUV('PAY N SPRAY')), ch);
  c.b.add('prop', box(40, 0.02, 24, bx, 0.185, bz + 5, 0x4a4b4e), ch);
  c.places.payspray = { x: bx, z: front - 7, r: 7 };
}
export function addGunShop(c: BCtx, bx: number, bz: number) {
  const ch = c.chunk(bx, bz);
  const r = addBuilding(c, { cx: bx, cz: bz - 42 + 8.75, w: 31.5, d: 17.5, floors: 2, style: 'brick', tint: 0xb89080, store: true, faces: 4, sign: 'AMMO', roof: 'small' });
  c.places.gunshop = { x: bx, z: bz - 44.5 };
  c.b.add('prop', box(2.4, 0.04, 2.4, bx, 0.19, bz - 44.5, 0xc0392b), ch);
  void r;
}
export function addPark(c: BCtx, bx: number, bz: number) {
  const r = c.rng;
  const ch = c.chunk(bx, bz);
  const I = INNER_HALF;
  c.b.add('conc', flat(bx - 2.5, bz - I, bx + 2.5, bz + I, 0.2, (x, z) => [x / 4, z / 4]), ch);
  c.b.add('conc', flat(bx - I, bz - 2.5, bx + I, bz + 2.5, 0.2, (x, z) => [x / 4, z / 4]), ch);
  // pond
  const pg = new THREE.CircleGeometry(13, 28);
  pg.rotateX(-Math.PI / 2);
  pg.scale(1.4, 1, 1);
  c.b.add('water', finish(pg, 0xffffff, { x: bx - 22, y: 0.22, z: bz - 20 }), ch);
  c.world.addCircle(bx - 22, bz - 20, 12, 2, 'pond');
  // gazebo
  const gx = bx + 22, gz = bz + 22;
  c.b.add('prop', cyl(5, 5, 0.3, gx, 0.18, gz, 0xcfc8b8, 12), ch);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    c.b.add('prop', cyl(0.15, 0.15, 3.4, gx + Math.cos(a) * 4.4, 0.4, gz + Math.sin(a) * 4.4, 0xf2f2ee, 6), ch);
    c.world.addCircle(gx + Math.cos(a) * 4.4, gz + Math.sin(a) * 4.4, 0.2, 4, 'post');
  }
  c.b.add('prop', cone(5.8, 2.4, gx, 3.8, gz, 0x3d6b4a, 6), ch);
  // playground
  const px = bx - 22, pz = bz + 24;
  for (const sx of [-2, 2]) c.b.add('propMetal', box(0.1, 2.6, 0.1, px + sx, 0.18, pz, 0xd35400, 0, 0, sx * 0.04), ch);
  c.b.add('propMetal', box(4.2, 0.1, 0.1, px, 2.7, pz, 0xd35400), ch);
  c.b.add('prop', box(0.5, 0.06, 0.4, px - 0.8, 0.8, pz, 0x222222), ch);
  c.b.add('prop', box(0.5, 0.06, 0.4, px + 0.8, 0.8, pz, 0x222222), ch);
  c.b.add('prop', box(2.4, 2.6, 2.4, px + 8, 0.18, pz, 0x2e86c1), ch);
  c.b.add('prop', box(1, 0.1, 5, px + 8, 1.4, pz + 3.6, 0xf1c40f, 0, -0.5), ch);
  c.world.addBox(px + 6.8, px + 9.2, pz - 1.2, pz + 1.2, 2.8);
  // trees & benches
  for (let i = 0; i < 46; i++) {
    const x = bx + r.range(-I + 2, I - 2), z = bz + r.range(-I + 2, I - 2);
    if (Math.abs(x - bx) < 4 || Math.abs(z - bz) < 4) continue;
    if (Math.hypot(x - (bx - 22), (z - (bz - 20)) / 1) < 18 && Math.abs(x - (bx - 22)) < 20) continue;
    if (Math.hypot(x - gx, z - gz) < 7 || Math.hypot(x - px, z - pz) < 12) continue;
    addTree(c, x, z, -1, r.range(1, 1.4));
  }
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? 1 : -1;
    const x = bx + s * 4.2, z = bz - 36 + Math.floor(i / 2) * 22;
    c.b.add('prop', box(0.5, 0.1, 2.0, x, 0.55, z, 0x7a5230), ch);
    c.b.add('prop', box(0.12, 0.5, 2.0, x + s * 0.2, 0.55, z, 0x7a5230, 0, 0, 0.1 * s), ch);
    c.b.add('prop', box(0.5, 0.4, 0.1, x, 0.18, z - 0.8, 0x333333), ch);
    c.b.add('prop', box(0.5, 0.4, 0.1, x, 0.18, z + 0.8, 0x333333), ch);
    c.world.addBox(x - 0.4, x + 0.4, z - 1, z + 1, 1);
  }
  c.collect.push({ x: bx - 34, z: bz - 34 }, { x: gx, z: gz + 1 }, { x: bx + 10, z: bz - 38 });
  c.mapRects.push({ x0: bx - I, z0: bz - I, x1: bx + I, z1: bz + I, c: '#4f7a3a' });
  c.mapRects.push({ x0: bx - 22 - 17, z0: bz - 20 - 12, x1: bx - 22 + 17, z1: bz - 20 + 12, c: '#3b6f90' });
}

export function addBeachfront(c: BCtx, bx: number, bz: number, i: number) {
  const r = c.rng;
  const ch = c.chunk(bx, bz);
  const pastelTints = [0xffc6d9, 0xbef5ea, 0xffe4b5, 0xc7e6ff, 0xf2d1ff, 0xfff3d4];
  const neonAccents = [0xff3d9a, 0x2ef2e8, 0xffd23d, 0x62ff9b, 0xff7043];
  const lots = splitLots(r, 3, 1, 5);
  lots.forEach((lot, idx) => {
    const style: FacadeStyle = r.pick(['apartment', 'stone', 'apartment', 'office']);
    const floors = r.int(3, 8);
    const tint = pastelTints[(i * 3 + idx) % pastelTints.length];
    const neon = neonAccents[(i + idx) % neonAccents.length];
    const worldLot: Lot = { x0: lot.x0 + bx, x1: lot.x1 + bx, z0: lot.z0 + bz, z1: lot.z1 + bz, faces: lot.faces | 1 };
    const b = buildingInLot(c, worldLot, {
      floors, style, store: true, tint, roof: floors > 5 ? 'big' : 'small',
      ad: r.chance(0.25), district: 'ocean', neonTrim: neon,
    });
    // Stepped Art Deco parapet crown + vertical glowing neon fin facing Ocean Drive
    const lcx = (worldLot.x0 + worldLot.x1) / 2;
    c.b.add('prop', box(b.w * 0.42, 2.4, 1.4, lcx, b.H + 0.5, worldLot.z1 - 0.9, tint), ch);
    c.b.add('prop', box(b.w * 0.24, 1.6, 1.2, lcx, b.H + 2.9, worldLot.z1 - 0.9, 0xffffff), ch);
    c.b.add('emit', box(0.32, b.H * 0.72, 0.35, lcx, 4.6, worldLot.z1 + 0.22, neon), ch);
  });
  // Tropical palms & sidewalk cafe umbrellas along the Ocean Beach strip
  for (let k = 0; k < 7; k++) addTree(c, bx - 40 + k * 13.3 + r.range(-2, 2), bz - 41, 3, 1.05);
  for (let k = 0; k < 4; k++) {
    const ux = bx - 30 + k * 20, uz = bz + 44.5;
    c.b.add('propMetal', cyl(0.04, 0.04, 2.3, ux, 0.16, uz, 0xd8dce0, 6), ch);
    c.b.add('prop', cone(1.3, 0.45, ux, 2.3, uz, neonAccents[k % neonAccents.length], 8), ch);
  }
}

/** Hand-built GTA-6 / Leonida Neon Strip Mall Plaza (L/U-shaped retail row + central parking + glowing marquee totem). */
export function addStripMallBlock(c: BCtx, bx: number, bz: number) {
  const r = c.rng;
  const ch = c.chunk(bx, bz);
  const neonCols = [0xff3d9a, 0x29e8ff, 0xffd23d, 0x6dff6a, 0xff7a2a];
  // Asphalt plaza lot + parking stripes
  c.b.add('g_asph', flat(bx - 40, bz - 40, bx + 40, bz + 40, 0.2, (px, pz) => [px / 6, pz / 6]), ch);
  for (let sx = -24; sx <= 24; sx += 4) {
    c.b.add('prop', box(0.14, 0.03, 5.2, bx + sx, 0.21, bz + 16, 0xebedf0), ch);
  }
  // North main strip building (70m wide -> 6 distinct side-by-side strip-mall stores!)
  const northW = 70, northD = 17.5, northZ = bz - 27;
  c.b.add('f_apartment', walls(northW, 5.6, northD, bx, 0, northZ, 0xf2e4cc, [0, 0.2, 0.4, 0.6]), ch);
  c.b.add('store', walls(northW + 0.3, 4.4, northD + 0.3, bx, 0, northZ, 0xffffff, [0, 0.3, 0.6, 0.9], 7, 4.4), ch);
  c.b.add('prop', box(northW + 1.2, 0.7, northD + 1.2, bx, 5.6, northZ, 0xc9b89c), ch);
  c.b.add('emit', box(northW + 0.8, 0.24, 0.25, bx, 5.8, northZ + northD / 2 + 0.5, r.pick(neonCols)), ch);
  c.world.addBox(bx - northW / 2, bx + northW / 2, northZ - northD / 2, northZ + northD / 2, 6.2);
  pushRect(c, bx, northZ, northW, northD, '#8c7e6d');
  // 6 distinct strip-mall bays facing the parking plaza (+Z)
  for (let i = 0; i < 6; i++) {
    const sDef = allocateStore(c, 'strip');
    const sx = bx - 29 + i * 11.6;
    const sz = northZ + northD / 2 + 0.22;
    c.b.add('sign', sign(9.2, 1.35, sx, 5.05, sz, 0, signUV(sDef.id)), ch);
    c.doors.push({ x: sx, z: sz + 0.6, yaw: 0, name: sDef.name, kind: sDef.doorKind });
  }
  // West wing retail strip (3 more distinct stores facing +X into the plaza)
  const wingW = 14, wingD = 42, wingX = bx - 31, wingZ = bz + 8;
  c.b.add('f_stone', walls(wingW, 5.2, wingD, wingX, 0, wingZ, 0xeadcc8, [0.1, 0.3, 0.5, 0.7]), ch);
  c.b.add('store', walls(wingW + 0.3, 4.4, wingD + 0.3, wingX, 0, wingZ, 0xfff0d8, [0.2, 0.4, 0.6, 0.8], 7, 4.4), ch);
  c.b.add('prop', box(wingW + 0.9, 0.6, wingD + 0.9, wingX, 5.2, wingZ, 0x9e8f7a), ch);
  c.world.addBox(wingX - wingW / 2, wingX + wingW / 2, wingZ - wingD / 2, wingZ + wingD / 2, 5.8);
  pushRect(c, wingX, wingZ, wingW, wingD, '#8c7e6d');
  for (let i = 0; i < 3; i++) {
    const sDef = allocateStore(c, 'strip');
    const sz = wingZ - 14 + i * 14;
    const sx = wingX + wingW / 2 + 0.22;
    c.b.add('sign', sign(9.8, 1.35, sx, 4.9, sz, Math.PI / 2, signUV(sDef.id)), ch);
    c.doors.push({ x: sx + 0.6, z: sz, yaw: Math.PI / 2, name: sDef.name, kind: sDef.doorKind });
  }
  // Iconic freestanding glowing strip-mall plaza totem sign near street corner
  const tx = bx + 32, tz = bz + 34;
  c.b.add('propMetal', box(0.65, 9.5, 0.65, tx, 0, tz, 0x2c323a), ch);
  c.b.add('prop', box(5.4, 6.2, 0.6, tx, 3.6, tz, 0x161922), ch);
  c.b.add('emit', box(5.6, 0.2, 0.68, tx, 9.8, tz, 0xff3d9a), ch);
  for (let k = 0; k < 3; k++) {
    const ts = allocateStore(c, 'strip');
    c.b.add('sign', sign(4.8, 1.15, tx, 4.6 + k * 1.65, tz + 0.34, 0, signUV(ts.id)), ch);
  }
  c.world.addBox(tx - 1.5, tx + 1.5, tz - 0.8, tz + 0.8, 9.5);
  addTree(c, bx + 34, bz - 10, 3, 1.1);
  addTree(c, bx + 34, bz + 12, 3, 1.0);
}

/** Hand-built Little Havana / Calle Nova neighborhood: colorful low-rise stucco, striped awnings, bodegas & domino courtyard. */
export function addLittleHavanaBlock(c: BCtx, bx: number, bz: number) {
  const r = c.rng;
  const ch = c.chunk(bx, bz);
  const havanaTints = [0xffc99e, 0xffe49e, 0xa8e8dc, 0xffb3aa, 0xc2d8ff, 0xf7d8b5];
  const lots = splitLots(r, 3, 2, 4.5);
  lots.forEach((lot, idx) => {
    const worldLot: Lot = { x0: lot.x0 + bx, x1: lot.x1 + bx, z0: lot.z0 + bz, z1: lot.z1 + bz, faces: lot.faces };
    buildingInLot(c, worldLot, {
      floors: r.int(2, 4),
      style: idx % 2 === 0 ? 'apartment' : 'stone',
      tint: havanaTints[idx % havanaTints.length],
      store: true,
      fire: false,
      district: 'havana',
      neonTrim: idx % 3 === 0 ? 0xffa62b : undefined,
    });
  });
  // Central palm & colorful street bollards
  addTree(c, bx, bz, 3, 1.05);
  c.b.add('prop', box(4.5, 0.45, 4.5, bx, 0.18, bz, 0xd8a26a), ch);
}

/** Hand-built Wynwood Arts & Nightlife District: bold geometric mural walls, vibrant neon studios, streetwear & breweries. */
export function addWynwoodArtsBlock(c: BCtx, bx: number, bz: number) {
  const r = c.rng;
  const ch = c.chunk(bx, bz);
  const muralPalette = [0xff2e88, 0x00e5ff, 0xffd60a, 0x8338ec, 0x06d6a0, 0xfb5607];
  const lots = splitLots(r, 2, 2, 5);
  lots.forEach((lot, idx) => {
    const worldLot: Lot = { x0: lot.x0 + bx, x1: lot.x1 + bx, z0: lot.z0 + bz, z1: lot.z1 + bz, faces: lot.faces };
    const b = buildingInLot(c, worldLot, {
      floors: r.int(2, 5),
      style: idx % 2 === 0 ? 'brick' : 'industrial',
      store: true,
      ad: idx === 0,
      district: 'wynwood',
      neonTrim: muralPalette[idx % muralPalette.length],
    });
    // Vivid geometric Wynwood street-art mural bands along upper walls
    const lcx = (worldLot.x0 + worldLot.x1) / 2;
    const lcz = (worldLot.z0 + worldLot.z1) / 2;
    for (let m = 0; m < 3; m++) {
      c.b.add('prop', box(b.w * 0.25, 2.2, b.d + 0.32, lcx + (m - 1) * (b.w * 0.26), 5.2 + (m % 2) * 1.4, lcz, muralPalette[(idx + m) % muralPalette.length]), ch);
    }
  });
}

/** Iconic glowing Vice Pier Observation Wheel along Ocean Beach. */
export function addBoardwalkWheel(c: BCtx, x: number, z: number) {
  const ch = c.chunk(x, z);
  const R = 17, cy = 21;
  // A-frame support legs
  for (const s of [-1, 1]) {
    c.b.add('propMetal', box(0.8, 22, 0.8, x + s * 6.5, 0, z - 3.2, 0xe8edf2, 0, 0, -s * 0.26), ch);
    c.b.add('propMetal', box(0.8, 22, 0.8, x + s * 6.5, 0, z + 3.2, 0xe8edf2, 0, 0, -s * 0.26), ch);
  }
  c.b.add('propMetal', cyl(1.2, 1.2, 8.2, x, cy, z, 0xff3d9a, 12).rotateX(Math.PI / 2), ch);
  // Spokes, glowing neon rim segments & passenger gondolas
  const N = 16;
  const cols = [0xff3d9a, 0x2ef2e8, 0xffd23d, 0x9b5de5];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const gx = x + Math.cos(a) * R;
    const gy = cy + Math.sin(a) * R;
    c.b.add('propMetal', box(R * 2, 0.22, 0.22, x, cy, z - 1.6, 0xd8dfe6, 0, 0, a), ch);
    c.b.add('propMetal', box(R * 2, 0.22, 0.22, x, cy, z + 1.6, 0xd8dfe6, 0, 0, a), ch);
    c.b.add('emit', box(0.45, 0.45, 3.6, gx, gy, z, cols[i % cols.length]), ch);
    // Gondola cabin
    c.b.add('prop', box(1.9, 2.1, 2.2, gx, gy - 1.6, z, cols[(i + 1) % cols.length]), ch);
  }
  c.world.addBox(x - 11, x + 11, z - 5, z + 5, 6, 'ferriswheel');
  // Boardwalk waterfront seafood & kiosk stalls beside the wheel
  for (let k = 0; k < 4; k++) {
    const kx = x + 22 + k * 14, kz = z - 8;
    const sDef = allocateStore(c, 'marina');
    c.b.add('store', walls(10.5, 4.2, 7, kx, 0, kz, 0xfff2dc, [0, 0, 0, 0], 7, 4.4), ch);
    c.b.add('prop', box(11.4, 0.5, 8.0, kx, 4.2, kz, 0x2ec4b6), ch);
    c.b.add('sign', sign(8.2, 1.3, kx, 4.95, kz + 3.65, 0, signUV(sDef.id)), ch);
    c.doors.push({ x: kx, z: kz + 4.2, yaw: 0, name: sDef.name, kind: sDef.doorKind });
    c.world.addBox(kx - 5.3, kx + 5.3, kz - 3.6, kz + 3.6, 4.8);
  }
}

/** Hand-built San Nova International Airport: 820m paved runway, taxiway, terminal, ATC tower, 3 aircraft hangars & runway beacons. */
export function addAirport(c: BCtx) {
  const ap = DECK.AIRPORT;
  const cx = (ap.x0 + ap.x1) / 2; // 1700
  const rwZ = ap.runwayZ; // -260
  const rwLen = ap.x1 - ap.x0 - 80; // 880m
  const ch = c.chunk(cx, rwZ);

  // Tarmac apron & taxiway linking south to East Coast Expressway (z = 0)
  c.b.add('g_asph', flat(ap.x0, ap.z0, ap.x1, ap.z1, 0.05, (px, pz) => [px / 10, pz / 10]), ch);
  c.b.add('g_asph', flat(1420, ap.z1, 1480, 14, 0.06, (px, pz) => [px / 8, pz / 8]), ch);

  // Main paved runway strip (mapped with dedicated runway texture in city.ts via 'runway' batch)
  c.b.add('runway', flat(ap.x0 + 40, rwZ - ap.runwayW / 2, ap.x1 - 40, rwZ + ap.runwayW / 2, 0.09, (px, pz) => [(pz - (rwZ - ap.runwayW / 2)) / ap.runwayW, (px - (ap.x0 + 40)) / 36]), ch);

  // Runway threshold piano keys & edge lighting beacons
  for (const endX of [ap.x0 + 54, ap.x1 - 54]) {
    for (let k = -4; k <= 4; k++) {
      c.b.add('prop', box(14, 0.04, 2.2, endX, 0.11, rwZ + k * 4.5, 0xf2f5f8), ch);
    }
  }
  for (let rx = ap.x0 + 50; rx <= ap.x1 - 50; rx += 55) {
    c.b.add('emit', sph(0.32, rx, 0.45, rwZ - ap.runwayW / 2 - 2.5, 0x38e8ff), ch);
    c.b.add('emit', sph(0.32, rx, 0.45, rwZ + ap.runwayW / 2 + 2.5, 0x38e8ff), ch);
  }

  // Main Glass Passenger Terminal (north side of tarmac at z = -375)
  const termX = 1660, termZ = -375, termW = 140, termD = 26;
  c.b.add('f_glass', walls(termW, 13, termD, termX, 0, termZ, 0xc2e6ff, [0, 0.25, 0.5, 0.75]), ch);
  c.b.add('propMetal', box(termW + 8, 1.4, termD + 10, termX, 13.0, termZ, 0xe2e8f0), ch);
  c.b.add('emit', box(termW + 6, 0.3, 0.3, termX, 13.5, termZ + termD / 2 + 5.1, 0x38bdf8), ch);
  c.world.addBox(termX - termW / 2, termX + termW / 2, termZ - termD / 2, termZ + termD / 2, 14.5, 'terminal');
  // Airport terminal storefronts (San Nova Intl Terminal, FlyUS, Elitas Travel, Duty Free, Jetstream Cafe, etc.)
  for (let i = 0; i < 6; i++) {
    const sDef = allocateStore(c, 'airport');
    const sx = termX - 52 + i * 20.8;
    const sz = termZ + termD / 2 + 0.35;
    c.b.add('sign', sign(13.5, 2.0, sx, 6.2, sz, 0, signUV(sDef.id)), ch);
    c.doors.push({ x: sx, z: sz + 1.1, yaw: 0, name: sDef.name, kind: sDef.doorKind });
  }

  // Air Traffic Control (ATC) Tower
  const atcX = 1545, atcZ = -368;
  c.b.add('prop', cyl(3.4, 4.6, 30, atcX, 0, atcZ, 0xd8dce0, 12), ch);
  c.b.add('prop', cyl(7.2, 4.8, 3.2, atcX, 30, atcZ, 0xc8cfd6, 12), ch);
  c.b.add('glass', cyl(6.8, 6.4, 4.4, atcX, 33.2, atcZ, 0x387898, 12), ch);
  c.b.add('propMetal', cyl(7.6, 7.6, 1.2, atcX, 37.6, atcZ, 0xe8edf2, 12), ch);
  c.b.add('propMetal', cyl(0.25, 0.4, 8, atcX, 38.8, atcZ, 0x9aa2a8, 8), ch);
  c.b.add('red', sph(0.55, atcX, 47.0, atcZ, 0xff2222), ch);
  c.world.addCircle(atcX, atcZ, 5.2, 42, 'atc');

  // 3 Open-Front Aircraft Hangars along the east apron (z = -370)
  for (let h = 0; h < 3; h++) {
    const hx = 1825 + h * 72, hz = -368, hw = 44, hd = 32, hh = 13;
    // Back + side walls + arched roof (front facing +Z runway is open!)
    c.b.add('f_industrial', box(hw, hh, 1.4, hx, 0, hz - hd / 2, 0xc8d2da), ch);
    c.b.add('f_industrial', box(1.4, hh, hd, hx - hw / 2, 0, hz, 0xc8d2da), ch);
    c.b.add('f_industrial', box(1.4, hh, hd, hx + hw / 2, 0, hz, 0xc8d2da), ch);
    c.b.add('propMetal', box(hw + 1, 1.2, hd + 1, hx, hh, hz, 0x475569), ch);
    const hs = allocateStore(c, 'airport');
    c.b.add('sign', sign(16, 2.2, hx, hh - 1.2, hz + hd / 2 + 0.3, 0, signUV(hs.id)), ch);
    c.world.addBox(hx - hw / 2, hx + hw / 2, hz - hd / 2 - 1, hz - hd / 2 + 1, hh);
    c.world.addBox(hx - hw / 2 - 1, hx - hw / 2 + 1, hz - hd / 2, hz + hd / 2, hh);
    c.world.addBox(hx + hw / 2 - 1, hx + hw / 2 + 1, hz - hd / 2, hz + hd / 2, hh);
  }

  c.mapRects.push({ x0: ap.x0, z0: ap.z0, x1: ap.x1, z1: ap.z1, c: '#3a404a' });
  c.mapRects.push({ x0: ap.x0 + 40, z0: rwZ - ap.runwayW / 2, x1: ap.x1 - 40, z1: rwZ + ap.runwayW / 2, c: '#1f242c' });
  c.places.airport = { x: 1450, z: rwZ };
  void rwLen;
}

export function beachProps(c: BCtx, pierX: number) {
  const r = c.rng;
  const ch = (x: number, z: number) => c.chunk(x, z);
  const cols = [0xe74c3c, 0xf1c40f, 0x3498db, 0x1abc9c, 0xe67e22, 0xffffff];
  for (let i = 0; i < 46; i++) {
    const x = r.range(-480, 480), z = r.range(545, 598);
    if (Math.abs(x - pierX) < 8) continue;
    const col = r.pick(cols);
    c.b.add('prop', cyl(0.04, 0.04, 2.3, x, 0, z, 0xdddddd, 5), ch(x, z));
    c.b.add('prop', cone(1.5, 0.55, x, 2.1, z, col, 8), ch(x, z));
    c.b.add('prop', box(1.0, 0.04, 1.9, x + 1.3, 0.02, z, r.pick(cols)), ch(x, z));
    if (r.chance(0.5)) c.b.add('prop', box(0.5, 0.35, 1.0, x - 1.4, 0, z + 0.4, 0xeeeeee, r.range(0, 1)), ch(x, z));
  }
  for (let i = 0; i < 40; i++) addTree(c, r.range(-500, 500), r.range(535, 542), 3);
  // lifeguard tower
  for (const x of [-300, 160, 340]) {
    const z = 575;
    c.b.add('prop', box(3, 0.2, 3, x, 2.4, z, 0xe8e8e8), ch(x, z));
    c.b.add('prop', box(2.6, 2, 2.6, x, 2.6, z, 0xf5f5f5), ch(x, z));
    c.b.add('prop', box(3.4, 0.3, 3.4, x, 4.6, z, 0xe74c3c), ch(x, z));
    for (const [lx, lz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) c.b.add('prop', box(0.15, 2.4, 0.15, x + lx, 0, z + lz, 0x8a6a45), ch(x, z));
    c.world.addBox(x - 1.7, x + 1.7, z - 1.7, z + 1.7, 5);
  }
  // pier
  const z0 = 606, z1 = 705;
  c.b.add('wood', flat(pierX - 4.5, z0, pierX + 4.5, z1, 0.45, (x, z) => [x / 4, z / 4]), ch(pierX, 650));
  c.b.add('prop', box(9.4, 0.4, z1 - z0, pierX, 0.05, (z0 + z1) / 2, 0x5a4026), ch(pierX, 650));
  for (let z = z0 + 4; z < z1; z += 8) {
    for (const s of [-1, 1]) {
      c.b.add('prop', cyl(0.28, 0.28, 3.5, pierX + s * 4.3, -2.6, z, 0x4a3a2a, 6), ch(pierX, 650));
      c.b.add('prop', box(0.1, 1.0, 0.1, pierX + s * 4.5, 0.45, z, 0x777777), ch(pierX, 650));
    }
  }
  for (const s of [-1, 1]) c.b.add('prop', box(0.08, 0.08, z1 - z0, pierX + s * 4.5, 1.4, (z0 + z1) / 2, 0xaaaaaa), ch(pierX, 650));
  c.b.add('prop', box(9, 1, 0.12, pierX, 0.45, z1, 0x777777), ch(pierX, 650));
  c.b.add('prop', box(12, 0.3, 10, pierX, 3.8, z1 - 8, 0xc0392b), ch(pierX, 650));
  c.collect.push({ x: pierX, z: z1 - 3 }, { x: -60, z: 590 }, { x: 250, z: 560 });
}

/**
 * Hand-built paved suburban neighborhood district (100m residential blocks with avenues,
 * curbs, sidewalks, grassy yards, rows of houses, streetlamps, shade trees, and corner markets).
 */
export function addSuburbanDistrict(c: BCtx, zone: SuburbanZone) {
  const step = 100;
  const roadHalf = 7;
  const cols = Math.max(1, Math.floor((zone.x1 - zone.x0) / step));
  const rows = Math.max(1, Math.floor((zone.z1 - zone.z0) / step));
  const ox = (zone.x0 + zone.x1) / 2 - (cols * step) / 2;
  const oz = (zone.z0 + zone.z1) / 2 - (rows * step) / 2;

  // Paved suburban avenues & cross-streets
  for (let i = 0; i <= cols; i++) {
    const sx = ox + i * step;
    if (Math.abs(sx) < 28 && zone.z1 < -650) continue; // keep North Expressway clear
    const ch = c.chunk(sx, (zone.z0 + zone.z1) / 2);
    c.b.add('g_asph', flat(sx - roadHalf, oz - roadHalf, sx + roadHalf, oz + rows * step + roadHalf, 0.03, (px, pz) => [px / 6, pz / 6]), ch);
    c.mapRects.push({ x0: sx - roadHalf, z0: oz - roadHalf, x1: sx + roadHalf, z1: oz + rows * step + roadHalf, c: '#32363e' });
  }
  for (let j = 0; j <= rows; j++) {
    const sz = oz + j * step;
    if (Math.abs(sz) < 28 && zone.x1 < -650) continue; // keep West Expressway clear
    const ch = c.chunk((zone.x0 + zone.x1) / 2, sz);
    c.b.add('g_asph', flat(ox - roadHalf, sz - roadHalf, ox + cols * step + roadHalf, sz + roadHalf, 0.035, (px, pz) => [px / 6, pz / 6]), ch);
    c.mapRects.push({ x0: ox - roadHalf, z0: sz - roadHalf, x1: ox + cols * step + roadHalf, z1: sz + roadHalf, c: '#32363e' });
  }

  let blockIdx = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const bx = ox + (i + 0.5) * step;
      const bz = oz + (j + 0.5) * step;
      // Never place houses over the cardinal expressways or their shoulders
      if (isOnOuterHighway(bx, bz, 44)) continue;
      const ch = c.chunk(bx, bz);
      const halfPad = step / 2 - roadHalf; // 43m
      const innerPad = halfPad - 4.2;      // 38.8m lawn inside concrete sidewalk

      // Curb slab + concrete sidewalk apron + suburban green grass yard
      c.b.add('prop', box(halfPad * 2, 0.16, halfPad * 2, bx, 0, bz, 0x9b9b96), ch);
      c.b.add('g_sidewalk', flat(bx - halfPad, bz - halfPad, bx + halfPad, bz + halfPad, 0.16, (px, pz) => [px / 4, pz / 4]), ch);
      c.b.add('g_grass', flat(bx - innerPad, bz - innerPad, bx + innerPad, bz + innerPad, 0.175, (px, pz) => [px / 6, pz / 6]), ch);
      c.mapRects.push({ x0: bx - halfPad, z0: bz - halfPad, x1: bx + halfPad, z1: bz + halfPad, c: '#5c784c' });

      // Corner neighborhood market / diner on every 5th suburban block so suburbs feel lived-in
      if (blockIdx % 5 === 2) {
        const sDef = allocateStore(c, 'strip');
        addBuilding(c, {
          cx: bx - 16, cz: bz - 16, w: 24.5, d: 17.5, floors: 1, style: 'brick',
          store: true, faces: 1 | 2, sign: sDef.name, roof: 'small', district: 'strip',
        });
        c.b.add('g_asph', flat(bx - 34, bz + 2, bx + 34, bz + 34, 0.19, (px, pz) => [px / 6, pz / 6]), ch);
        for (let sx = -20; sx <= 20; sx += 5) {
          c.b.add('prop', box(0.14, 0.03, 4.8, bx + sx, 0.21, bz + 24, 0xeaecef), ch);
        }
        // Small neighborhood mini-park + shade trees on the east half
        addTree(c, bx + 18, bz - 18, 0, 1.1);
        addTree(c, bx + 26, bz - 10, 3, 1.0);
        c.b.add('prop', box(2.0, 0.48, 0.55, bx + 18, 0.18, bz - 6, 0x6b4a2a), ch);
      } else {
        // Two neat rows of suburban homes facing North (-1) and South (+1) streets
        for (const row of [-1, 1]) {
          for (let h = 0; h < 3; h++) {
            const lx = bx - 24 + h * 24;
            addHouse(c, lx, bz + row * 37, row, lx - 11.5, lx + 11.5, 0);
          }
        }
      }

      // Streetlamps along north and south curbs
      addLamp(c, bx - 22, bz + halfPad - 1.2, 0, 1);
      addLamp(c, bx + 22, bz - halfPad + 1.2, 0, -1);
      blockIdx++;
    }
  }
  c.places[zone.id] = { x: (zone.x0 + zone.x1) / 2, z: (zone.z0 + zone.z1) / 2 };
}

/**
 * Hand-built rural highway gas station & roadside truck stop:
 * Grounded asphalt forecourt, illuminated steel canopy + 4 pump islands, glowing highway price pylon,
 * enterable convenience store ('shop') + roadside repair bay ('garage'), explosive barrels, and rural barn/water tower.
 */
export function addRuralGasStation(c: BCtx, st: RuralGasStationDef) {
  const ch = c.chunk(st.x, st.z);
  const col = new Collector();
  const y0 = Math.max(0, terrainHeightAt(st.x, st.z));
  const cos = Math.cos(st.yaw);
  const sin = Math.sin(st.yaw);
  const toWorld = (lx: number, lz: number): [number, number] => [
    st.x + lx * cos + lz * sin,
    st.z - lx * sin + lz * cos,
  ];

  // Grounded asphalt forecourt slab + concrete skirt so edges never float on rural hills
  col.add('prop', box(78, 0.55, 62, 0, -0.45, 0, 0x5c6066));
  col.add('g_asph', flat(-38, -30, 38, 30, 0.12, (px, pz) => [px / 6, pz / 6]));
  // Driveway apron linking directly toward the adjacent highway (+Z local)
  col.add('g_asph', flat(-16, 28, 16, 52, 0.12, (px, pz) => [px / 6, pz / 6]));
  // Parking lines
  for (let px = -28; px <= -14; px += 3.5) {
    col.add('prop', box(0.14, 0.03, 5.2, px, 0.135, -8, 0xebedf0));
  }

  // Convenience Store & Roadside Diner building (back-left at z = -18)
  const shopX = -8, shopZ = -18, shopW = 24, shopD = 12, shopH = 4.6;
  col.add('prop', box(shopW + 0.6, 0.45, shopD + 0.6, shopX, -0.25, shopZ, 0x7b7870));
  col.add('f_brick', walls(shopW, shopH, shopD, shopX, 0.12, shopZ, 0xd9c2a8, [0, 0.25, 0.5, 0.75]));
  col.add('store', walls(shopW + 0.25, 4.1, shopD + 0.25, shopX, 0.12, shopZ, 0xfff2dc, [0.1, 0.3, 0.5, 0.7], 7, 4.2));
  col.add('prop', box(shopW + 1.4, 0.55, shopD + 1.4, shopX, shopH + 0.12, shopZ, 0x3b4048));
  col.add('emit', box(shopW + 1.5, 0.22, 0.26, shopX, shopH + 0.32, shopZ + shopD / 2 + 0.72, 0xff7b29));
  col.add('sign', sign(10.5, 1.65, shopX, shopH + 1.15, shopZ + shopD / 2 + 0.45, 0, signUV('GAS')));

  // Attached Rural Auto Repair / Tire Bay (back-right at x = +15, z = -18)
  const bayX = 16, bayZ = -18, bayW = 16, bayD = 12, bayH = 5.4;
  col.add('prop', box(bayW + 0.5, 0.45, bayD + 0.5, bayX, -0.25, bayZ, 0x7b7870));
  col.add('f_industrial', walls(bayW, bayH, bayD, bayX, 0.12, bayZ, 0xcfd6dc, [0, 0.2, 0.4, 0.6]));
  col.add('propMetal', box(bayW + 0.8, 0.5, bayD + 0.8, bayX, bayH + 0.12, bayZ, 0x4b535d));
  // Twin roll-up service bay doors
  for (const ox of [-3.8, 3.8]) {
    col.add('prop', box(5.4, 3.8, 0.24, bayX + ox, 0.12, bayZ + bayD / 2 + 0.1, 0x2c323a));
    col.add('prop', box(4.9, 3.45, 0.26, bayX + ox, 0.22, bayZ + bayD / 2 + 0.14, 0xd8a832));
    for (let k = 0; k < 6; k++) {
      col.add('prop', box(4.9, 0.05, 0.28, bayX + ox, 0.55 + k * 0.52, bayZ + bayD / 2 + 0.16, 0x8a6912));
    }
  }
  col.add('sign', sign(9.0, 1.5, bayX, bayH - 0.55, bayZ + bayD / 2 + 0.32, 0, signUV('PAY N SPRAY')));

  // Illuminated Fuel Canopy (centered at x = -2, z = +8)
  const canX = -2, canZ = 8;
  col.add('prop', box(28, 0.85, 16, canX, 5.65, canZ, 0xf2f4f7));
  col.add('prop', box(28.3, 0.55, 16.3, canX, 5.3, canZ, 0xc82d2d));
  col.add('emit', box(28.45, 0.2, 16.45, canX, 5.88, canZ, 0xffaa2b));
  // Overhead canopy LED downlights
  for (const lx of [-9, -3, 3, 9]) {
    for (const lz of [-4, 4]) {
      col.add('emit', box(1.5, 0.08, 0.8, canX + lx, 5.24, canZ + lz, 0xfff5dc));
    }
  }
  // 4 steel support columns grounded on concrete curbs
  for (const [px, pz] of [[-11, -5], [11, -5], [-11, 5], [11, 5]]) {
    col.add('propMetal', box(0.68, 5.55, 0.68, canX + px, 0.12, canZ + pz, 0xe5e8ec));
    col.add('prop', box(1.25, 0.35, 1.25, canX + px, 0.12, canZ + pz, 0xc82d2d));
    const [wx, wz] = toWorld(canX + px, canZ + pz);
    c.world.addCircle(wx, wz, 0.55, y0 + 6, 'pillar');
  }
  // 4 Fuel Pump Islands with digital displays, nozzles & protective yellow bollards
  for (const px of [-5.5, 5.5]) {
    for (const pz of [-3.2, 3.2]) {
      const ix = canX + px, iz = canZ + pz;
      col.add('prop', box(3.4, 0.22, 1.65, ix, 0.12, iz, 0x94989e));
      col.add('prop', box(1.05, 1.85, 0.65, ix, 0.34, iz, 0xc82d2d));
      col.add('prop', box(0.84, 0.52, 0.69, ix, 1.38, iz, 0x1e2b38));
      col.add('emit', box(0.68, 0.22, 0.71, ix, 1.5, iz, 0x7ef7b2));
      col.add('prop', cyl(0.11, 0.11, 0.92, ix - 1.45, 0.12, iz, 0xf2c92b, 8));
      col.add('prop', cyl(0.11, 0.11, 0.92, ix + 1.45, 0.12, iz, 0xf2c92b, 8));
      const [wx, wz] = toWorld(ix, iz);
      c.world.addCircle(wx, wz, 1.05, y0 + 2.2, 'pump');
    }
  }

  // Tall Highway Price Pylon Sign facing highway (+Z local)
  const pyX = -26, pyZ = 22;
  col.add('propMetal', cyl(0.42, 0.52, 14.5, pyX, 0.12, pyZ, 0x3b414a, 10));
  col.add('prop', box(5.4, 6.2, 0.75, pyX, 9.2, pyZ, 0x1c222b));
  col.add('emit', box(5.6, 0.22, 0.85, pyX, 15.35, pyZ, 0xffaa2b));
  col.add('sign', sign(4.9, 2.2, pyX, 13.6, pyZ + 0.42, 0, signUV('GAS')));
  // Digital fuel price bars
  for (let row = 0; row < 3; row++) {
    col.add('emit', box(3.6, 0.42, 0.12, pyX, 10.2 + row * 0.95, pyZ + 0.42, row === 2 ? 0x62ff9b : 0xff6b35));
  }
  const [pwx, pwz] = toWorld(pyX, pyZ);
  c.world.addCircle(pwx, pwz, 0.75, y0 + 15, 'pole');

  // Rural roadside detail: timber water tower & perimeter ranch fence behind the station
  const wtX = 28, wtZ = -20;
  for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    col.add('wood', box(0.26, 7.2, 0.26, wtX + lx, 0.12, wtZ + lz, 0x6d5034));
  }
  col.add('wood', cyl(2.4, 2.5, 3.8, wtX, 7.2, wtZ, 0x856342, 12));
  col.add('propMetal', cone(2.75, 1.5, wtX, 11.0, wtZ, 0x5c646d, 12));
  const [wtwx, wtwz] = toWorld(wtX, wtZ);
  c.world.addCircle(wtwx, wtwz, 2.6, y0 + 12.5, 'watertower');

  // Rural split-rail timber fence along the back edge
  for (let fx = -34; fx <= 34; fx += 4) {
    col.add('wood', box(0.18, 1.25, 0.18, fx, 0.12, -28.5, 0x7a5938));
  }
  col.add('wood', box(68, 0.12, 0.08, 0, 0.62, -28.5, 0x8a6642));
  col.add('wood', box(68, 0.12, 0.08, 0, 1.12, -28.5, 0x8a6642));

  if (y0 !== 0) {
    for (const it of col.items) it[1].translate(0, y0, 0);
  }
  col.flush(c.b, st.x, st.z, st.yaw, ch);

  // World colliders for shop & repair bay (axis-aligned bounding footprint around rotated centers)
  const [sWx, sWz] = toWorld(shopX, shopZ);
  const [bWx, bWz] = toWorld(bayX, bayZ);
  const sRadX = Math.abs(shopW * cos) / 2 + Math.abs(shopD * sin) / 2;
  const sRadZ = Math.abs(shopW * sin) / 2 + Math.abs(shopD * cos) / 2;
  c.world.addBox(sWx - sRadX, sWx + sRadX, sWz - sRadZ, sWz + sRadZ, y0 + shopH + 0.6, 'rural_gas_shop');
  const bRadX = Math.abs(bayW * cos) / 2 + Math.abs(bayD * sin) / 2;
  const bRadZ = Math.abs(bayW * sin) / 2 + Math.abs(bayD * cos) / 2;
  c.world.addBox(bWx - bRadX, bWx + bRadX, bWz - bRadZ, bWz + bRadZ, y0 + bayH + 0.6, 'rural_gas_bay');

  // Enterable doors for both the rural convenience store and the repair garage
  const [sdx, sdz] = toWorld(shopX, shopZ + shopD / 2 + 1.0);
  c.doors.push({ x: sdx, z: sdz, yaw: st.yaw, name: st.name, kind: 'shop' });
  const [bdx, bdz] = toWorld(bayX, bayZ + bayD / 2 + 1.1);
  c.doors.push({ x: bdx, z: bdz, yaw: st.yaw, name: `${st.name} GARAGE`, kind: 'garage' });

  // Explosive fuel barrels beside the repair bay + roadside lamp
  const [ex1, ez1] = toWorld(25.5, -14);
  const [ex2, ez2] = toWorld(26.8, -13.2);
  c.props.push({ kind: 'xbarrel', x: ex1, z: ez1 }, { kind: 'xbarrel', x: ex2, z: ez2 });
  const [lx, lz] = toWorld(22, 22);
  addLamp(c, lx, lz, -sin, -cos);

  c.mapRects.push({ x0: st.x - 42, z0: st.z - 34, x1: st.x + 42, z1: st.z + 34, c: '#c87d28' });
  c.places[st.id] = { x: st.x, z: st.z };
}

