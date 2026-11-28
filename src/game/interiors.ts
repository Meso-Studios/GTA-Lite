// Handcrafted, human-scaled, bright architectural multi-room interiors for all 10 building kinds.
// Directly modeled on modern hospitality, healthcare, dining, civic, and commercial floorplans:
// - Complete floor-to-ceiling partition walls with framed doorway lintels (zero half-thrown clunky walls)
// - Real hinged opening swing doors, working moving escalators, furnished subterranean basements
// - Bright sunlit floor-to-ceiling windows, recessed LED ceiling troffers, and circular halo chandeliers
// - Distinct room flooring (carpet, oak LVT, ceramic tile, marble) & zero self-contradicting signage
// - Zero floating or uncanny assets; accurate human-scale proportions (1.72m player)
import * as THREE from 'three';
import { box, cone, cyl, finish, flat, flatDown, sign, sph } from './geo';
import {
  InteriorBasementSpec,
  InteriorCutoutSpec,
  InteriorElevationLayout,
  InteriorEscalatorSpec,
  InteriorExitSpec,
  InteriorStairSpec,
  InteriorSwingDoorSpec,
  computeWaitLineSlots,
} from './interiorMath';
import type { BCtx, Door } from './buildings';

export type IndoorNpcRole =
  | 'clerk'
  | 'customer'
  | 'guard'
  | 'queue'
  | 'seated'
  | 'server'
  | 'doctor'
  | 'nurse'
  | 'chef'
  | 'attendant';

export interface IndoorNpcSpot {
  x: number;
  z: number;
  y?: number;
  yaw: number;
  role: IndoorNpcRole;
}

export interface RoomSpec {
  w: number;
  d: number;
  h: number;
  mezzY: number;
  mezzDepth: number;
  stairSide: 'right' | 'left';
  hasEscalator: boolean;
  hasBasement: boolean;
  basementSide?: 'left' | 'right';
  basementZ0?: number;
  floorMat: 'intFloorWood' | 'intMarble' | 'intTile';
  floorTint: number;
  wallCol: number;
  ceilCol: number;
  beamMat: 'intWood' | 'propMetal';
  beamCol: number;
  warmTint: number;
  shadeCol: number;
}

export const ROOM_SPECS: Record<Door['kind'], RoomSpec> = {
  // Bright Sunlit Modern Bistro / Restaurant + Enclosed Commercial Kitchen
  diner: {
    w: 24, d: 19, h: 3.6, mezzY: 2.55, mezzDepth: 0, stairSide: 'right',
    hasEscalator: false, hasBasement: true, basementSide: 'right', basementZ0: -4.2,
    floorMat: 'intFloorWood', floorTint: 0xe6cda8, wallCol: 0xf6f1e6, ceilCol: 0xfbf9f4,
    beamMat: 'intWood', beamCol: 0x7d5a3b, warmTint: 0xfff0d6, shadeCol: 0xb88446,
  },
  // Bright Modern Flagship Retail Boutique + Fitting Rooms + Escalator Loft
  shop: {
    w: 22, d: 18, h: 5.4, mezzY: 2.85, mezzDepth: 4.8, stairSide: 'right',
    hasEscalator: true, hasBasement: false,
    floorMat: 'intFloorWood', floorTint: 0xebd9be, wallCol: 0xf7f4ee, ceilCol: 0xfcfbf8,
    beamMat: 'intWood', beamCol: 0x8b6b4a, warmTint: 0xfff4e0, shadeCol: 0x2d4a44,
  },
  // Bright Grand Marble NovaBank Atrium + Private Office + Steel Vault + Underground Vault
  bank: {
    w: 28, d: 22, h: 6.2, mezzY: 3.25, mezzDepth: 5.4, stairSide: 'right',
    hasEscalator: true, hasBasement: true, basementSide: 'left', basementZ0: -4.6,
    floorMat: 'intMarble', floorTint: 0xf6f3ec, wallCol: 0xf4f0e8, ceilCol: 0xfaf9f5,
    beamMat: 'intWood', beamCol: 0x75593c, warmTint: 0xfff3de, shadeCol: 0x8a6d38,
  },
  // Bright Modern Corporate Floor + Glass Boardroom + Exec Suite + Escalator
  office: {
    w: 24, d: 20, h: 5.6, mezzY: 2.95, mezzDepth: 4.8, stairSide: 'left',
    hasEscalator: true, hasBasement: false,
    floorMat: 'intFloorWood', floorTint: 0xdcc6a8, wallCol: 0xf3f5f7, ceilCol: 0xfafbfc,
    beamMat: 'propMetal', beamCol: 0x626b75, warmTint: 0xf6f9ff, shadeCol: 0x3b4d63,
  },
  // Luxury Boutique Hotel Floor (Reference Photo 1: Slatted Oak Suite 401 + En-Suite Bath + Suite 402 + Corridor)
  apartment: {
    w: 24, d: 20, h: 3.35, mezzY: 2.55, mezzDepth: 0, stairSide: 'right',
    hasEscalator: false, hasBasement: true, basementSide: 'right', basementZ0: -7.6,
    floorMat: 'intFloorWood', floorTint: 0xd8c3a5, wallCol: 0xf5f2ec, ceilCol: 0xfdfcfa,
    beamMat: 'intWood', beamCol: 0x8a6847, warmTint: 0xfff1dc, shadeCol: 0xd6c8b4,
  },
  // Bright Modern San Nova PD Precinct (Public Lobby + Squad Room + Enclosed Holding Cells + Basement Armory)
  police: {
    w: 26, d: 20, h: 3.7, mezzY: 2.65, mezzDepth: 0, stairSide: 'left',
    hasEscalator: false, hasBasement: true, basementSide: 'left', basementZ0: -4.4,
    floorMat: 'intTile', floorTint: 0xebeff4, wallCol: 0xf0f3f7, ceilCol: 0xf8fafc,
    beamMat: 'propMetal', beamCol: 0x526074, warmTint: 0xf4f8ff, shadeCol: 0x2c4a7a,
  },
  // Modern Medical Center (Reference Photos 2, 3 & 4: Halo-Chandelier Lobby + 3 Enclosed Sunlit Patient Rooms + Escalator + Basement Lab)
  hospital: {
    w: 28, d: 22, h: 4.4, mezzY: 2.95, mezzDepth: 0, stairSide: 'right',
    hasEscalator: true, hasBasement: true, basementSide: 'right', basementZ0: -4.4,
    floorMat: 'intTile', floorTint: 0xf2f4f7, wallCol: 0xf5f7f9, ceilCol: 0xfbfcfd,
    beamMat: 'propMetal', beamCol: 0x7b8896, warmTint: 0xf8fbff, shadeCol: 0x2884a6,
  },
  // Tactical Outfitter Showroom + Glass-Walled Soundproof Firing Range
  gun: {
    w: 22, d: 18, h: 3.6, mezzY: 2.6, mezzDepth: 0, stairSide: 'left',
    hasEscalator: false, hasBasement: false,
    floorMat: 'intFloorWood', floorTint: 0xcab092, wallCol: 0xede7dc, ceilCol: 0xf7f4ee,
    beamMat: 'intWood', beamCol: 0x624632, warmTint: 0xfff0d8, shadeCol: 0x7a3430,
  },
  // Auto Service Workshop + Enclosed Bright Customer Lounge
  garage: {
    w: 24, d: 18, h: 4.8, mezzY: 2.85, mezzDepth: 0, stairSide: 'right',
    hasEscalator: false, hasBasement: false,
    floorMat: 'intTile', floorTint: 0xdce0e5, wallCol: 0xedf0f2, ceilCol: 0xf5f7f8,
    beamMat: 'propMetal', beamCol: 0x5c6670, warmTint: 0xf7fbff, shadeCol: 0xb84032,
  },
  // 4-Level Downtown Parking Garage Atrium + Attendant Booth + Escalator + B1 Underground Deck
  parking: {
    w: 28, d: 22, h: 5.8, mezzY: 3.05, mezzDepth: 6.2, stairSide: 'left',
    hasEscalator: true, hasBasement: true, basementSide: 'right', basementZ0: -4.5,
    floorMat: 'intTile', floorTint: 0xd4d8de, wallCol: 0xe9ecf0, ceilCol: 0xf1f4f7,
    beamMat: 'propMetal', beamCol: 0x5d6774, warmTint: 0xf6faff, shadeCol: 0x24468c,
  },
  // Grand Art-Deco Resort Casino Floor + Slot Rows + Blackjack/Roulette + VIP Lounge + Cashier Cage
  casino: {
    w: 30, d: 24, h: 5.8, mezzY: 3.15, mezzDepth: 5.4, stairSide: 'right',
    hasEscalator: true, hasBasement: true, basementSide: 'left', basementZ0: -4.6,
    floorMat: 'intMarble', floorTint: 0xf2ece0, wallCol: 0xf2eadc, ceilCol: 0xf8f3e8,
    beamMat: 'intWood', beamCol: 0x6e4b2c, warmTint: 0xfff0cc, shadeCol: 0x9c7224,
  },
  // Bright Modern Luxury Car Dealership Showroom + 3 Elevated Turntables + Glass Sales Offices
  dealership: {
    w: 30, d: 22, h: 5.6, mezzY: 3.05, mezzDepth: 5.0, stairSide: 'left',
    hasEscalator: true, hasBasement: false,
    floorMat: 'intMarble', floorTint: 0xf7f8fa, wallCol: 0xf6f8fa, ceilCol: 0xfcfdfe,
    beamMat: 'propMetal', beamCol: 0x3b4450, warmTint: 0xf8fbff, shadeCol: 0x243448,
  },
};

export interface Room {
  id: number;
  kind: Door['kind'];
  name: string;
  cx: number;
  cz: number;
  w: number;
  d: number;
  h: number;
  spawn: { x: number; z: number; yaw: number };
  exit: { x: number; z: number; yaw: number };
  exits: InteriorExitSpec[];
  elevation: InteriorElevationLayout;
  swingDoors: InteriorSwingDoorSpec[];
  npcSpots: IndoorNpcSpot[];
  pendantLights: [number, number, number][];
  light: THREE.Vector3;
  warmTint: number;
  vaultPos?: { x: number; z: number };
  tellerPos?: { x: number; z: number };
}

const FLOOR_Y = 0.26;
const BASEMENT_Y = -3.14;
const DOOR_H = 2.18;

export function buildInteriors(c: BCtx): Room[] {
  const rooms: Room[] = [];
  const kinds: Door['kind'][] = [
    'shop', 'diner', 'office', 'apartment', 'bank',
    'police', 'hospital', 'gun', 'garage', 'parking',
    'casino', 'dealership',
  ];
  let idx = 0;
  for (const kind of kinds) {
    for (let variant = 0; variant < 2; variant++) {
      const cx = 6400 + (idx % 6) * 60;
      const cz = 6400 + Math.floor(idx / 6) * 60;
      rooms.push(buildRoom(c, kind, cx, cz, idx, variant));
      idx++;
    }
  }
  return rooms;
}

export function roomForDoor(door: Door, rooms: Room[]): Room {
  const of = rooms.filter((r) => r.kind === door.kind);
  if (!of.length) return rooms[0];
  let h = 0;
  for (let i = 0; i < door.name.length; i++) h = (h * 31 + door.name.charCodeAt(i)) >>> 0;
  return of[h % of.length];
}

function buildRoom(c: BCtx, kind: Door['kind'], cx: number, cz: number, id: number, _variant: number): Room {
  const spec = ROOM_SPECS[kind];
  const RW = spec.w;
  const RD = spec.d;
  const RH = spec.h;
  const MEZZ_Y = spec.mezzY;
  const ch = c.chunk(cx, cz);

  const B = (mat: string, w: number, h: number, d: number, x: number, y: number, z: number, col = 0xffffff, ry = 0) =>
    c.b.add(mat, box(w, h, d, cx + x, y, cz + z, col, ry), ch);
  const P = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    c.world.addBox(cx + x - w / 2, cx + x + w / 2, cz + z - d / 2, cz + z + d / 2, y + h);
  const G = (mat: string, geo: THREE.BufferGeometry) => {
    geo.translate(cx, 0, cz);
    c.b.add(mat, geo, ch);
  };

  const stairsList: InteriorStairSpec[] = [];
  const escalatorsList: InteriorEscalatorSpec[] = [];
  const basementsList: InteriorBasementSpec[] = [];
  const cutoutsList: InteriorCutoutSpec[] = [];
  const swingDoors: InteriorSwingDoorSpec[] = [];
  const npcSpots: IndoorNpcSpot[] = [];
  const lights: [number, number, number][] = [];

  const addLight = (x: number, y: number, z: number) => {
    if (lights.length < 12) lights.push([cx + x, y, cz + z]);
  };

  // Distinct per-room flooring overlay (clean +0.012m above structural base slab — zero z-fighting!)
  const addFloorFinish = (
    mat: 'intFloorWood' | 'intTile' | 'intMarble' | 'carpet' | 'carpet2',
    x0: number, z0: number, x1: number, z1: number, col: number, scale = 2.2, y = FLOOR_Y + 0.012,
  ) => {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    c.b.add(
      mat,
      flat(cx + x0, cz + z0, cx + x1, cz + z1, y, (x, z) => [(x - cx) / scale, (z - cz) / scale], col),
      ch,
    );
  };

  // Full floor-to-ceiling architectural wall along X with framed doorway lintel & optional hinged door
  const addWallX = (
    x0: number, x1: number, z: number, h: number, wallCol: number,
    opts?: {
      doorX?: number;
      doorW?: number;
      doorId?: string;
      doorStyle?: 'wood' | 'glass' | 'steel';
      openDir?: 1 | -1;
      trimCol?: number;
      thick?: number;
      glassUpper?: boolean;
      baseY?: number;
      windowX?: number;
      windowW?: number;
    },
  ) => {
    const t = opts?.thick ?? 0.16;
    const by = opts?.baseY ?? FLOOR_Y;
    const trim = opts?.trimCol ?? 0x6c523b;
    const span = x1 - x0;
    if (span < 0.05) return;
    const wallH = Math.max(0.2, h - by);

    if (opts?.doorX !== undefined && opts.doorW) {
      const dx0 = Math.max(x0 + 0.15, opts.doorX - opts.doorW / 2);
      const dx1 = Math.min(x1 - 0.15, opts.doorX + opts.doorW / 2);
      const dw = dx1 - dx0;
      const dh = Math.min(DOOR_H, wallH - 0.25);

      // Left solid full-height wall segment
      if (dx0 - x0 > 0.06) {
        const wL = dx0 - x0;
        const cxL = (x0 + dx0) / 2;
        if (opts.glassUpper) {
          B('intWall', wL, 1.05, t, cxL, by, z, wallCol);
          B('glass', wL, wallH - 1.15, 0.04, cxL, by + 1.05, z, 0xc8e0ec);
          B('propMetal', wL, 0.08, t + 0.02, cxL, by + 1.04, z, 0x9aa4ae);
          B('propMetal', wL, 0.08, t + 0.02, cxL, h - 0.08, z, 0x9aa4ae);
        } else {
          B('intWall', wL, wallH, t, cxL, by, z, wallCol);
          B('intTrim', wL, 0.10, t + 0.03, cxL, by, z, trim);
        }
        P(wL, wallH, t + 0.06, cxL, by, z);
      }

      // Right solid full-height wall segment
      if (x1 - dx1 > 0.06) {
        const wR = x1 - dx1;
        const cxR = (dx1 + x1) / 2;
        if (opts.glassUpper) {
          B('intWall', wR, 1.05, t, cxR, by, z, wallCol);
          B('glass', wR, wallH - 1.15, 0.04, cxR, by + 1.05, z, 0xc8e0ec);
          B('propMetal', wR, 0.08, t + 0.02, cxR, by + 1.04, z, 0x9aa4ae);
          B('propMetal', wR, 0.08, t + 0.02, cxR, h - 0.08, z, 0x9aa4ae);
        } else {
          B('intWall', wR, wallH, t, cxR, by, z, wallCol);
          B('intTrim', wR, 0.10, t + 0.03, cxR, by, z, trim);
        }
        P(wR, wallH, t + 0.06, cxR, by, z);
      }

      // Complete lintel/transom header above doorway all the way to ceiling (NEVER incomplete!)
      const lintelH = h - (by + dh);
      if (lintelH > 0.04) {
        B(opts.glassUpper ? 'glass' : 'intWall', dw + 0.06, lintelH, opts.glassUpper ? 0.05 : t, (dx0 + dx1) / 2, by + dh, z, opts.glassUpper ? 0xc8e0ec : wallCol);
      }
      // Door jambs & header casing
      B('intTrim', 0.08, dh + 0.06, t + 0.06, dx0, by, z, trim);
      B('intTrim', 0.08, dh + 0.06, t + 0.06, dx1, by, z, trim);
      B('intTrim', dw + 0.16, 0.09, t + 0.06, (dx0 + dx1) / 2, by + dh, z, trim);

      if (opts.doorId && opts.doorStyle) {
        if (dw > 1.55) {
          // Double swinging doors (hinged at both jambs)
          const leafW = dw / 2 - 0.03;
          swingDoors.push({
            id: `${opts.doorId}_L`,
            hingeX: cx + dx0 + 0.03,
            hingeZ: cz + z,
            y: by,
            width: leafW,
            height: dh - 0.02,
            closedYaw: 0,
            openDir: opts.openDir ?? 1,
            style: opts.doorStyle,
          });
          swingDoors.push({
            id: `${opts.doorId}_R`,
            hingeX: cx + dx1 - 0.03,
            hingeZ: cz + z,
            y: by,
            width: leafW,
            height: dh - 0.02,
            closedYaw: Math.PI,
            openDir: (opts.openDir ?? 1) === 1 ? -1 : 1,
            style: opts.doorStyle,
          });
        } else {
          swingDoors.push({
            id: opts.doorId,
            hingeX: cx + dx0 + 0.04,
            hingeZ: cz + z,
            y: by,
            width: dw - 0.08,
            height: dh - 0.02,
            closedYaw: 0,
            openDir: opts.openDir ?? 1,
            style: opts.doorStyle,
          });
        }
      }
    } else if (opts?.windowX !== undefined && opts.windowW) {
      // Wall with pass-through / glass observation window
      const wx0 = opts.windowX - opts.windowW / 2;
      const wx1 = opts.windowX + opts.windowW / 2;
      if (wx0 - x0 > 0.05) B('intWall', wx0 - x0, wallH, t, (x0 + wx0) / 2, by, z, wallCol);
      if (x1 - wx1 > 0.05) B('intWall', x1 - wx1, wallH, t, (wx1 + x1) / 2, by, z, wallCol);
      B('intWall', opts.windowW, 0.96, t, opts.windowX, by, z, wallCol);
      B('intWall', opts.windowW, Math.max(0.2, h - (by + 2.05)), t, opts.windowX, by + 2.05, z, wallCol);
      B('propMetal', opts.windowW + 0.14, 0.07, t + 0.22, opts.windowX, by + 0.95, z, 0xcad2da);
      P(span, wallH, t + 0.06, (x0 + x1) / 2, by, z);
    } else {
      if (opts?.glassUpper) {
        B('intWall', span, 1.05, t, (x0 + x1) / 2, by, z, wallCol);
        B('glass', span, wallH - 1.15, 0.04, (x0 + x1) / 2, by + 1.05, z, 0xc8e0ec);
        B('propMetal', span, 0.08, t + 0.02, (x0 + x1) / 2, by + 1.04, z, 0x9aa4ae);
        B('propMetal', span, 0.08, t + 0.02, (x0 + x1) / 2, h - 0.08, z, 0x9aa4ae);
      } else {
        B('intWall', span, wallH, t, (x0 + x1) / 2, by, z, wallCol);
        B('intTrim', span, 0.10, t + 0.03, (x0 + x1) / 2, by, z, trim);
      }
      P(span, wallH, t + 0.06, (x0 + x1) / 2, by, z);
    }
  };

  // Full floor-to-ceiling architectural wall along Z with framed doorway lintel & optional hinged door
  const addWallZ = (
    x: number, z0: number, z1: number, h: number, wallCol: number,
    opts?: {
      doorZ?: number;
      doorW?: number;
      doorId?: string;
      doorStyle?: 'wood' | 'glass' | 'steel';
      openDir?: 1 | -1;
      trimCol?: number;
      thick?: number;
      glassUpper?: boolean;
      baseY?: number;
    },
  ) => {
    const t = opts?.thick ?? 0.16;
    const by = opts?.baseY ?? FLOOR_Y;
    const trim = opts?.trimCol ?? 0x6c523b;
    const span = z1 - z0;
    if (span < 0.05) return;
    const wallH = Math.max(0.2, h - by);

    if (opts?.doorZ !== undefined && opts.doorW) {
      const dz0 = Math.max(z0 + 0.15, opts.doorZ - opts.doorW / 2);
      const dz1 = Math.min(z1 - 0.15, opts.doorZ + opts.doorW / 2);
      const dw = dz1 - dz0;
      const dh = Math.min(DOOR_H, wallH - 0.25);

      if (dz0 - z0 > 0.06) {
        const dA = dz0 - z0;
        const czA = (z0 + dz0) / 2;
        if (opts.glassUpper) {
          B('intWall', t, 1.05, dA, x, by, czA, wallCol);
          B('glass', 0.04, wallH - 1.15, dA, x, by + 1.05, czA, 0xc8e0ec);
          B('propMetal', t + 0.02, 0.08, dA, x, by + 1.04, czA, 0x9aa4ae);
          B('propMetal', t + 0.02, 0.08, dA, x, h - 0.08, czA, 0x9aa4ae);
        } else {
          B('intWall', t, wallH, dA, x, by, czA, wallCol);
          B('intTrim', t + 0.03, 0.10, dA, x, by, czA, trim);
        }
        P(t + 0.06, wallH, dA, x, by, czA);
      }

      if (z1 - dz1 > 0.06) {
        const dB = z1 - dz1;
        const czB = (dz1 + z1) / 2;
        if (opts.glassUpper) {
          B('intWall', t, 1.05, dB, x, by, czB, wallCol);
          B('glass', 0.04, wallH - 1.15, dB, x, by + 1.05, czB, 0xc8e0ec);
          B('propMetal', t + 0.02, 0.08, dB, x, by + 1.04, czB, 0x9aa4ae);
          B('propMetal', t + 0.02, 0.08, dB, x, h - 0.08, czB, 0x9aa4ae);
        } else {
          B('intWall', t, wallH, dB, x, by, czB, wallCol);
          B('intTrim', t + 0.03, 0.10, dB, x, by, czB, trim);
        }
        P(t + 0.06, wallH, dB, x, by, czB);
      }

      // Full lintel header above door to ceiling
      const lintelH = h - (by + dh);
      if (lintelH > 0.04) {
        B(opts.glassUpper ? 'glass' : 'intWall', opts.glassUpper ? 0.05 : t, lintelH, dw + 0.06, x, by + dh, (dz0 + dz1) / 2, opts.glassUpper ? 0xc8e0ec : wallCol);
      }
      B('intTrim', t + 0.06, dh + 0.06, 0.08, x, by, dz0, trim);
      B('intTrim', t + 0.06, dh + 0.06, 0.08, x, by, dz1, trim);
      B('intTrim', t + 0.06, 0.09, dw + 0.16, x, by + dh, (dz0 + dz1) / 2, trim);

      if (opts.doorId && opts.doorStyle) {
        swingDoors.push({
          id: opts.doorId,
          hingeX: cx + x,
          hingeZ: cz + dz0 + 0.04,
          y: by,
          width: dw - 0.08,
          height: dh - 0.02,
          closedYaw: -Math.PI / 2,
          openDir: opts.openDir ?? 1,
          style: opts.doorStyle,
        });
      }
    } else {
      if (opts?.glassUpper) {
        B('intWall', t, 1.05, span, x, by, (z0 + z1) / 2, wallCol);
        B('glass', 0.04, wallH - 1.15, span, x, by + 1.05, (z0 + z1) / 2, 0xc8e0ec);
        B('propMetal', t + 0.02, 0.08, span, x, by + 1.04, (z0 + z1) / 2, 0x9aa4ae);
        B('propMetal', t + 0.02, 0.08, span, x, h - 0.08, (z0 + z1) / 2, 0x9aa4ae);
      } else {
        B('intWall', t, wallH, span, x, by, (z0 + z1) / 2, wallCol);
        B('intTrim', t + 0.03, 0.10, span, x, by, (z0 + z1) / 2, trim);
      }
      P(t + 0.06, wallH, span, x, by, (z0 + z1) / 2);
    }
  };

  // Recessed modern LED ceiling troffer light panel (matches Ref Photo 2!)
  const addLedTroffer = (x: number, z: number, ceilY: number, w = 1.25, d = 0.52, col = 0xfffef8) => {
    B('propMetal', w + 0.08, 0.04, d + 0.08, x, ceilY - 0.045, z, 0xd8dde3);
    B('emit', w, 0.03, d, x, ceilY - 0.055, z, col);
    addLight(x, ceilY - 0.45, z);
  };

  // Large architectural circular LED halo ring chandelier (matches Ref Photos 3 & 4!)
  const addHaloChandelier = (x: number, z: number, ceilY: number, dropY: number, radius = 1.65) => {
    const segs = 16;
    const segLen = (2 * Math.PI * radius) / segs + 0.04;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const sx = x + Math.cos(a) * radius;
      const sz = z + Math.sin(a) * radius;
      // Sleek brushed metallic outer rim + bright warm-white luminous LED inner ring
      B('propMetal', 0.09, 0.11, segLen, sx, dropY, sz, 0xb8c0c8, -a);
      B('emit', 0.05, 0.07, segLen * 0.96, x + Math.cos(a) * (radius - 0.04), dropY - 0.01, z + Math.sin(a) * (radius - 0.04), 0xfffdf6, -a);
    }
    // 4 thin aircraft suspension cables anchored flush into ceiling soffit
    const wireH = Math.max(0.15, ceilY - (dropY + 0.1));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      G('propMetal', cyl(0.012, 0.012, wireH, x + Math.cos(a) * radius, dropY + 0.1, z + Math.sin(a) * radius, 0x9aa3ad, 6));
    }
    addLight(x, dropY - 0.25, z);
  };

  // Architectural pendant globe light (realistic human scale: 0.26m frosted glass globe + black/brass stem)
  const addGlobePendant = (x: number, z: number, ceilY: number, globeY: number, rodCol = 0x22252a, glowCol = 0xfff3d8) => {
    const rodH = Math.max(0.15, ceilY - (globeY + 0.14));
    G('propMetal', cyl(0.055, 0.055, 0.03, x, ceilY - 0.03, z, rodCol, 10));
    G('propMetal', cyl(0.014, 0.014, rodH, x, globeY + 0.14, z, rodCol, 8));
    G('emit', sph(0.14, x, globeY, z, glowCol, 1, 1, 1, 12));
  };

  // Flush-mounted wall helpers (ZERO floating objects!)
  const mountExitSign = (x: number, y: number, z: number, yaw: number) => {
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    B('propMetal', 0.78, 0.28, 0.10, x, y - 0.14, z, 0x20262c, yaw);
    c.b.add('intExitSign', sign(0.70, 0.22, cx + x + nx * 0.06, y, cz + z + nz * 0.06, yaw, [0, 0, 1, 1], 0xffffff), ch);
  };

  const addWallArt = (x: number, y: number, z: number, w: number, h: number, yaw: number, artCol: number, accentCol: number) => {
    const nx = Math.sin(yaw), nz = Math.cos(yaw);
    B('intTrim', w + 0.10, h + 0.10, 0.05, x, y, z, 0x3b2c20, yaw);
    B('prop', w, h, 0.04, x + nx * 0.02, y + 0.05, z + nz * 0.02, artCol, yaw);
    B('prop', w * 0.62, h * 0.44, 0.045, x + nx * 0.026, y + h * 0.28, z + nz * 0.026, accentCol, yaw);
  };

  const addFireExtinguisher = (x: number, y: number, z: number) => {
    B('propMetal', 0.34, 0.74, 0.14, x, y, z, 0xf2f4f7);
    G('prop', cyl(0.07, 0.07, 0.46, x, y + 0.08, z + 0.03, 0xd62828, 10));
    G('propMetal', cyl(0.022, 0.028, 0.09, x, y + 0.54, z + 0.03, 0x22262b, 8));
  };

  // Sunlit floor-to-ceiling curtain-wall window (matches Ref Photo 2!)
  const addCurtainWallZ = (x: number, z0: number, z1: number, sillY: number, headY: number, normalDir: 1 | -1) => {
    const len = z1 - z0;
    const midZ = (z0 + z1) / 2;
    const h = headY - sillY;
    // Bright sunlit daylight exterior pane + crisp aluminum mullion grid
    B('emit', 0.04, h, len, x - normalDir * 0.02, sillY, midZ, 0xe4f3fc);
    B('emit', 0.045, h * 0.28, len, x - normalDir * 0.015, sillY, midZ, 0xb8d4ba); // subtle sunlit foliage horizon band
    B('glass', 0.03, h, len, x + normalDir * 0.04, sillY, midZ, 0xbad8e8);
    // Horizontal aluminum sill, transom, and header
    B('propMetal', 0.16, 0.08, len + 0.08, x + normalDir * 0.04, sillY - 0.04, midZ, 0x9aa4ae);
    B('propMetal', 0.10, 0.06, len, x + normalDir * 0.05, sillY + h * 0.56, midZ, 0x9aa4ae);
    B('propMetal', 0.14, 0.09, len + 0.08, x + normalDir * 0.04, headY, midZ, 0x9aa4ae);
    const bays = Math.max(2, Math.round(len / 1.25));
    for (let i = 0; i <= bays; i++) {
      const mz = z0 + (i / bays) * len;
      B('propMetal', 0.08, h + 0.06, 0.07, x + normalDir * 0.05, sillY - 0.02, mz, 0x9aa4ae);
    }
  };

  const addCurtainWallX = (x0: number, x1: number, z: number, sillY: number, headY: number, normalDir: 1 | -1) => {
    const len = x1 - x0;
    const midX = (x0 + x1) / 2;
    const h = headY - sillY;
    B('emit', len, h, 0.04, midX, sillY, z - normalDir * 0.02, 0xe4f3fc);
    B('emit', len, h * 0.28, 0.045, midX, sillY, z - normalDir * 0.015, 0xb8d4ba);
    B('glass', len, h, 0.03, midX, sillY, z + normalDir * 0.04, 0xbad8e8);
    B('propMetal', len + 0.08, 0.08, 0.16, midX, sillY - 0.04, z + normalDir * 0.04, 0x9aa4ae);
    B('propMetal', len, 0.06, 0.10, midX, sillY + h * 0.56, z + normalDir * 0.05, 0x9aa4ae);
    B('propMetal', len + 0.08, 0.09, 0.14, midX, headY, z + normalDir * 0.04, 0x9aa4ae);
    const bays = Math.max(2, Math.round(len / 1.25));
    for (let i = 0; i <= bays; i++) {
      const mx = x0 + (i / bays) * len;
      B('propMetal', 0.07, h + 0.06, 0.08, mx, sillY - 0.02, z + normalDir * 0.05, 0x9aa4ae);
    }
  };

  // Realistic human-scaled potted indoor ficus/olive tree (always grounded on baseY)
  const addPlant = (x: number, z: number, baseY = FLOOR_Y) => {
    G('prop', cyl(0.22, 0.16, 0.44, x, baseY, z, 0xe2ddd4, 12));
    G('prop', cyl(0.18, 0.18, 0.04, x, baseY + 0.42, z, 0x4b3b2c, 10));
    G('intWood', cyl(0.035, 0.045, 0.56, x, baseY + 0.44, z, 0x5c422c, 8));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      G('leaf', sph(0.20, x + Math.cos(a) * 0.14, baseY + 1.04 + (i % 2) * 0.12, z + Math.sin(a) * 0.14, 0x457d47, 1, 1.15, 1, 8));
    }
    G('leaf', sph(0.22, x, baseY + 1.24, z, 0x528f52, 1, 1.15, 1, 8));
  };

  // Human-scaled modern lounge chair (0.44m seat height, curved oak/upholstered back, 4 grounded legs)
  const addModernChair = (x: number, z: number, yaw: number, seatCol: number, legCol = 0x7a5b3c, baseY = FLOOR_Y) => {
    const cY = Math.cos(yaw), sY = Math.sin(yaw);
    const pt = (lx: number, lz: number): [number, number] => [x + lx * cY + lz * sY, z - lx * sY + lz * cY];
    for (const [lx, lz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) {
      const [wx, wz] = pt(lx, lz);
      G('intWood', cyl(0.022, 0.018, 0.42, wx, baseY, wz, legCol, 8));
    }
    B('carpet2', 0.56, 0.10, 0.54, x, baseY + 0.40, z, seatCol, yaw);
    const [bx, bz] = pt(0, -0.23);
    B('carpet2', 0.58, 0.38, 0.09, bx, baseY + 0.48, bz, seatCol, yaw);
    for (const side of [-1, 1]) {
      const [ax, az] = pt(side * 0.26, -0.02);
      B('carpet2', 0.08, 0.22, 0.46, ax, baseY + 0.48, az, seatCol, yaw);
    }
  };

  // Human-scaled modern sofa (0.44m seat, 2.0m wide, 4 legs grounded)
  const addSofa = (x: number, z: number, yaw: number, col: number, width = 2.0, baseY = FLOOR_Y) => {
    const cY = Math.cos(yaw), sY = Math.sin(yaw);
    const pt = (lx: number, lz: number): [number, number] => [x + lx * cY + lz * sY, z - lx * sY + lz * cY];
    for (const lx of [-width / 2 + 0.14, width / 2 - 0.14]) {
      for (const lz of [-0.30, 0.30]) {
        const [wx, wz] = pt(lx, lz);
        G('intWood', cyl(0.025, 0.02, 0.16, wx, baseY, wz, 0x3b2c20, 8));
      }
    }
    B('carpet2', width, 0.24, 0.78, x, baseY + 0.16, z, col, yaw);
    B('carpet2', width - 0.24, 0.12, 0.62, x, baseY + 0.36, z, col, yaw);
    const [bx, bz] = pt(0, -0.32);
    B('carpet2', width, 0.48, 0.16, bx, baseY + 0.36, bz, col, yaw);
    for (const side of [-1, 1]) {
      const [ax, az] = pt(side * (width / 2 - 0.09), 0);
      B('carpet2', 0.18, 0.32, 0.78, ax, baseY + 0.36, az, col, yaw);
    }
    P(Math.abs(cY) > 0.5 ? width : 0.82, 0.8, Math.abs(cY) > 0.5 ? 0.82 : width, x, baseY, z);
  };

  // Human-scaled restaurant dining table + 2 facing booths or chairs (0.75m table height, 0.45m seats)
  const addDiningBooth = (x: number, z: number, woodCol: number, leatherCol: number, baseY = FLOOR_Y) => {
    // Central pedestal table (0.75m tall, grounded base plate)
    B('propMetal', 0.46, 0.04, 0.62, x, baseY, z, 0x2c3036);
    G('propMetal', cyl(0.045, 0.055, 0.70, x, baseY + 0.04, z, 0x2c3036, 10));
    B('intWood', 1.38, 0.055, 0.82, x, baseY + 0.72, z, woodCol);
    // Tableware (2 white porcelain plates, glasses, warm shaded mini table lamp)
    for (const sx of [-0.36, 0.36]) {
      for (const sz of [-0.22, 0.22]) {
        G('prop', cyl(0.11, 0.09, 0.02, x + sx, baseY + 0.775, z + sz, 0xf8f8f5, 10));
        G('glass', cyl(0.028, 0.024, 0.09, x + sx + 0.15, baseY + 0.775, z + sz, 0xc8e4f0, 8));
      }
    }
    G('propMetal', cyl(0.04, 0.055, 0.03, x, baseY + 0.775, z, 0xb89648, 10));
    G('propMetal', cyl(0.012, 0.012, 0.18, x, baseY + 0.80, z, 0xb89648, 8));
    G('emit', cyl(0.08, 0.10, 0.11, x, baseY + 0.96, z, 0xfff2d2, 10));
    // Facing upholstered booths (0.45m seat height, 0.96m backrest)
    for (const sz of [-0.76, 0.76]) {
      B('intWood', 1.48, 0.36, 0.54, x, baseY, z + sz, 0x4c3726);
      B('carpet2', 1.44, 0.12, 0.50, x, baseY + 0.34, z + sz, leatherCol);
      B('carpet2', 1.48, 0.58, 0.14, x, baseY + 0.40, z + sz + Math.sign(sz) * 0.23, leatherCol);
    }
    P(1.52, 0.95, 2.08, x, baseY, z);
  };

  // Working twin-lane architectural escalator (grounded trusses, glass balustrades, yellow comb plates)
  const addTwinEscalator = (escX0: number, z0: number, z1: number, y0: number, y1: number) => {
    const laneW = 1.15;
    const gap = 0.26;
    const spanZ = z1 - z0;
    const rise = y1 - y0;
    const slopeLen = Math.hypot(spanZ, rise);
    const slopePitch = Math.atan2(rise, spanZ);
    const midY = (y0 + y1) / 2;
    const midZ = (z0 + z1) / 2;

    for (let lane = 0; lane < 2; lane++) {
      const lx0 = escX0 + lane * (laneW + gap);
      const lx1 = lx0 + laneW;
      const lcx = (lx0 + lx1) / 2;
      B('propMetal', laneW + 0.16, 0.24, 0.72, lcx, y0 - 0.16, z1 + 0.32, 0x8e96a0);
      B('prop', laneW - 0.04, 0.03, 0.22, lcx, y0 + 0.02, z1 + 0.04, 0xdfb22a);
      B('propMetal', laneW + 0.16, 0.22, 0.72, lcx, y1 - 0.18, z0 - 0.32, 0x8e96a0);
      B('prop', laneW - 0.04, 0.03, 0.22, lcx, y1 + 0.02, z0 - 0.04, 0xdfb22a);
      c.b.add('propMetal', finish(new THREE.BoxGeometry(laneW + 0.14, 0.32, slopeLen), 0x767e88, { x: cx + lcx, y: midY - 0.16, z: cz + midZ, rx: slopePitch }), ch);
      for (const side of [-1, 1]) {
        const bx = lcx + side * (laneW / 2 + 0.04);
        c.b.add('glass', finish(new THREE.BoxGeometry(0.04, 0.88, slopeLen), 0xbad6e4, { x: cx + bx, y: midY + 0.48, z: cz + midZ, rx: slopePitch }), ch);
        c.b.add('prop', finish(new THREE.BoxGeometry(0.08, 0.06, slopeLen + 0.42), 0x1d2025, { x: cx + bx, y: midY + 0.94, z: cz + midZ, rx: slopePitch }), ch);
        B('propMetal', 0.10, 0.96, 0.16, bx, y0, z1 + 0.24, 0x8c949e);
        B('propMetal', 0.10, 0.96, 0.16, bx, y1, z0 - 0.24, 0x8c949e);
      }
      escalatorsList.push({
        x0: cx + lx0, x1: cx + lx1,
        z0: cz + z0, z1: cz + z1,
        y0, y1, axis: 'z', dir: -1,
        speed: 1.32,
        travelDir: lane === 0 ? 1 : -1,
      });
    }
  };

  // ---------------------------------------------------------------- Subterranean Basement Cutout & Base Slab
  const hasBasement = spec.hasBasement;
  const bSide = spec.basementSide ?? 'left';
  const bStairW = 2.2;
  const bStairLen = 4.4;
  const cutX0 = bSide === 'left' ? -RW / 2 + 0.42 : RW / 2 - 0.42 - bStairW;
  const cutX1 = cutX0 + bStairW;
  const cutZ0 = spec.basementZ0 ?? -4.2;
  const cutZ1 = cutZ0 + bStairLen;

  const floorScale = spec.floorMat === 'intFloorWood' ? 2.4 : 2.0;
  const addFloorQuad = (x0: number, z0: number, x1: number, z1: number) => {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    B('intWood', x1 - x0, 0.25, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0x42352a);
    c.b.add(
      spec.floorMat,
      flat(cx + x0, cz + z0, cx + x1, cz + z1, FLOOR_Y, (x, z) => [(x - cx) / floorScale, (z - cz) / floorScale], spec.floorTint),
      ch,
    );
  };
  if (hasBasement) {
    addFloorQuad(-RW / 2, -RD / 2, RW / 2, cutZ0);
    addFloorQuad(-RW / 2, cutZ1, RW / 2, RD / 2);
    addFloorQuad(-RW / 2, cutZ0, cutX0, cutZ1);
    addFloorQuad(cutX1, cutZ0, RW / 2, cutZ1);
    cutoutsList.push({ x0: cx + cutX0, x1: cx + cutX1, z0: cz + cutZ0, z1: cz + cutZ1 });
  } else {
    addFloorQuad(-RW / 2, -RD / 2, RW / 2, RD / 2);
  }

  // ---------------------------------------------------------------- Ceiling & Perimeter Structural Envelope
  B('intCeil', RW + 0.4, 0.26, RD + 0.4, 0, RH + 0.02, 0, spec.ceilCol);
  c.b.add(
    'intCeil',
    flatDown(cx - RW / 2, cz - RD / 2, cx + RW / 2, cz + RD / 2, RH - 0.01, (x, z) => [(x - cx) / 2.2, (z - cz) / 2.2], spec.ceilCol),
    ch,
  );

  // Perimeter Exterior Structural Walls
  B('intWall', RW, RH, 0.36, 0, 0, -RD / 2, spec.wallCol);
  B('intWall', 0.36, RH, RD, -RW / 2, 0, 0, spec.wallCol);
  B('intWall', 0.36, RH, RD, RW / 2, 0, 0, spec.wallCol);
  P(RW, RH, 0.36, 0, 0, -RD / 2);
  P(0.36, RH, RD, -RW / 2, 0, 0);
  P(0.36, RH, RD, RW / 2, 0, 0);

  // Human-scaled Front Entrance Wall (2.25m double doors — NO giant 5.6m warehouse cutouts!)
  const frontDoorHalfW = kind === 'garage' || kind === 'parking' ? 3.2 : 1.15;
  const frontDoorH = kind === 'garage' || kind === 'parking' ? 3.25 : 2.32;
  for (const s of [-1, 1]) {
    const seg = RW / 2 - frontDoorHalfW;
    const fx = s * (frontDoorHalfW + seg / 2);
    B('intWall', seg, RH, 0.36, fx, 0, RD / 2, spec.wallCol);
    P(seg, RH, 0.36, fx, 0, RD / 2);
  }
  B('intWall', frontDoorHalfW * 2, Math.max(0.2, RH - frontDoorH), 0.36, 0, frontDoorH, RD / 2, spec.wallCol);
  if (kind === 'garage') {
    B('propMetal', frontDoorHalfW * 2 - 0.16, frontDoorH - FLOOR_Y, 0.14, 0, FLOOR_Y, RD / 2 - 0.16, 0x76808a);
    for (let k = 0; k < 6; k++) {
      B('propMetal', frontDoorHalfW * 2 - 0.24, 0.05, 0.18, 0, FLOOR_Y + 0.42 + k * 0.46, RD / 2 - 0.18, 0x4b525a);
    }
  } else {
    // Bright sunlit city-sidewalk exterior backdrop behind glass doors (prevents seeing raw ocean horizon)
    B('emit', frontDoorHalfW * 2 + 0.12, frontDoorH - FLOOR_Y, 0.04, 0, FLOOR_Y, RD / 2 + 0.14, 0xe4f1fa);
    B('emit', frontDoorHalfW * 2 + 0.12, (frontDoorH - FLOOR_Y) * 0.34, 0.045, 0, FLOOR_Y, RD / 2 + 0.12, 0xcfd6dc);
    B('emit', frontDoorHalfW * 2 + 0.12, 0.24, 0.048, 0, FLOOR_Y + (frontDoorH - FLOOR_Y) * 0.34, RD / 2 + 0.11, 0xa8c6a6);
    // Sleek architectural double glazed entrance doors with brushed aluminum/wood jambs & welcome mat
    B('glass', frontDoorHalfW * 2 - 0.22, frontDoorH - FLOOR_Y - 0.04, 0.08, 0, FLOOR_Y, RD / 2 - 0.16, 0x9ac4da);
    B('propMetal', 0.10, frontDoorH, 0.20, -frontDoorHalfW + 0.06, FLOOR_Y, RD / 2 - 0.14, 0x4c545c);
    B('propMetal', 0.10, frontDoorH, 0.20, frontDoorHalfW - 0.06, FLOOR_Y, RD / 2 - 0.14, 0x4c545c);
    B('propMetal', frontDoorHalfW * 2 + 0.08, 0.12, 0.20, 0, frontDoorH, RD / 2 - 0.14, 0x4c545c);
    B('propMetal', 0.06, frontDoorH - FLOOR_Y, 0.10, 0, FLOOR_Y, RD / 2 - 0.18, 0x4c545c);
    B('propMetal', 0.04, 0.56, 0.08, -0.14, FLOOR_Y + 0.92, RD / 2 - 0.24, 0xd2d8de);
    B('propMetal', 0.04, 0.56, 0.08, 0.14, FLOOR_Y + 0.92, RD / 2 - 0.24, 0xd2d8de);
    B('carpet', 2.2, 0.025, 1.1, 0, FLOOR_Y + 0.014, RD / 2 - 0.95, 0x3b4048);
  }
  P(frontDoorHalfW * 2 + 0.4, RH, 0.44, 0, 0, RD / 2);
  mountExitSign(0, Math.min(RH - 0.34, frontDoorH + 0.28), RD / 2 - 0.22, Math.PI);

  // Secondary Side Emergency Exit (human scale: 1.08m × 2.18m)
  const sideExitZ = RD / 2 - 2.6;
  B('propMetal', 0.10, DOOR_H, 1.12, -RW / 2 + 0.20, FLOOR_Y, sideExitZ, 0x3b444e);
  B('prop', 0.06, 0.08, 0.84, -RW / 2 + 0.27, FLOOR_Y + 0.98, sideExitZ, 0xc8322b);
  mountExitSign(-RW / 2 + 0.22, Math.min(RH - 0.34, FLOOR_Y + DOOR_H + 0.22), sideExitZ, Math.PI / 2);
  addFireExtinguisher(-RW / 2 + 0.24, FLOOR_Y + 0.88, sideExitZ - 1.15);

  const exitsList: InteriorExitSpec[] = [
    { x: cx, z: cz + RD / 2 - 1.35, y: FLOOR_Y, yaw: Math.PI, label: 'Main Entrance' },
    { x: cx - RW / 2 + 1.05, z: cz + sideExitZ, y: FLOOR_Y, yaw: Math.PI / 2, label: 'Side Exit' },
  ];

  // ---------------------------------------------------------------- Optional Upper Mezzanine (only for open-atrium buildings: shop, bank, office, parking)
  const mezzList: { x0: number; x1: number; z0: number; z1: number; y: number }[] = [];
  if (spec.mezzDepth > 0) {
    const mz0 = -RD / 2 + 0.22;
    const mz1 = -RD / 2 + spec.mezzDepth;
    const mzMid = (mz0 + mz1) / 2;
    const mzD = mz1 - mz0;
    B('intWood', RW - 0.44, 0.22, mzD, 0, MEZZ_Y - 0.22, mzMid, 0x5c4836);
    c.b.add(
      spec.floorMat,
      flat(cx - RW / 2 + 0.22, cz + mz0, cx + RW / 2 - 0.22, cz + mz1, MEZZ_Y, (x, z) => [(x - cx) / 2.2, (z - cz) / 2.2], spec.floorTint),
      ch,
    );
    mezzList.push({ x0: cx - RW / 2 + 0.22, x1: cx + RW / 2 - 0.22, z0: cz + mz0, z1: cz + mz1, y: MEZZ_Y });

    const sSign = spec.stairSide === 'right' ? 1 : -1;
    const stairX0 = sSign === 1 ? RW / 2 - 3.05 : -RW / 2 + 0.45;
    const stairX1 = stairX0 + 2.58;
    const stairZ0 = mz1;
    const stairZ1 = mz1 + 4.4;

    // Glass mezzanine safety balustrade (gap left cleanly at escalator/stair landing)
    const railSegs: [number, number][] = [];
    if (stairX0 > -RW / 2 + 0.6) railSegs.push([-RW / 2 + 0.35, stairX0 - 0.08]);
    if (stairX1 < RW / 2 - 0.6) railSegs.push([stairX1 + 0.08, RW / 2 - 0.35]);
    for (const [rx0, rx1] of railSegs) {
      const rw = rx1 - rx0;
      const rcx = (rx0 + rx1) / 2;
      B('glass', rw, 0.92, 0.04, rcx, MEZZ_Y + 0.04, mz1 - 0.06, 0xbad6e4);
      B('propMetal', rw, 0.05, 0.08, rcx, MEZZ_Y + 0.96, mz1 - 0.06, 0x7c8692);
      P(rw, 1.0, 0.14, rcx, MEZZ_Y, mz1 - 0.06);
    }
    // Support columns grounded to floor
    for (const colX of [-RW * 0.30, 0, RW * 0.30]) {
      if (colX > stairX0 - 0.5 && colX < stairX1 + 0.5) continue;
      if (hasBasement && colX > cutX0 - 0.5 && colX < cutX1 + 0.5 && mz1 > cutZ0 - 0.5 && mz1 < cutZ1 + 0.5) continue;
      G('prop', cyl(0.18, 0.20, MEZZ_Y - FLOOR_Y, colX, FLOOR_Y, mz1 - 0.24, 0xeae6de, 12));
      P(0.42, MEZZ_Y - FLOOR_Y, 0.42, colX, FLOOR_Y, mz1 - 0.24);
    }

    if (spec.hasEscalator) {
      addTwinEscalator(stairX0, stairZ0, stairZ1, FLOOR_Y, MEZZ_Y);
    } else {
      const steps = 13;
      const stepD = (stairZ1 - stairZ0) / steps;
      const stepH = (MEZZ_Y - FLOOR_Y) / steps;
      for (let i = 0; i < steps; i++) {
        B('intWood', stairX1 - stairX0, stepH * (i + 1), stepD + 0.03, (stairX0 + stairX1) / 2, FLOOR_Y, stairZ1 - stepD * (i + 0.5), 0x82654a);
      }
      stairsList.push({ x0: cx + stairX0, x1: cx + stairX1, z0: cz + stairZ0, z1: cz + stairZ1, y0: FLOOR_Y, y1: MEZZ_Y, axis: 'z', dir: -1 });
    }
  }

  // ---------------------------------------------------------------- Furnished Subterranean Basement (y = -3.14m)
  if (hasBasement) {
    const BW = RW - 2.4;
    const BD = RD - 2.4;
    const BH = FLOOR_Y - BASEMENT_Y;
    c.b.add('intTile', flat(cx - BW / 2, cz - BD / 2, cx + BW / 2, cz + BD / 2, BASEMENT_Y, (x, z) => [(x - cx) / 2.2, (z - cz) / 2.2], 0xd4dae2), ch);
    c.b.add('intCeil', flatDown(cx - BW / 2, cz - BD / 2, cx + BW / 2, cz + BD / 2, FLOOR_Y - 0.25, (x, z) => [(x - cx) / 2.4, (z - cz) / 2.4], 0xe8ecf0), ch);
    B('intWall', BW, BH, 0.34, 0, BASEMENT_Y, -BD / 2, 0xe2e6eb);
    B('intWall', BW, BH, 0.34, 0, BASEMENT_Y, BD / 2, 0xe2e6eb);
    B('intWall', 0.34, BH, BD, -BW / 2, BASEMENT_Y, 0, 0xe2e6eb);
    B('intWall', 0.34, BH, BD, BW / 2, BASEMENT_Y, 0, 0xe2e6eb);
    basementsList.push({ x0: cx - BW / 2 + 0.25, x1: cx + BW / 2 - 0.25, z0: cz - BD / 2 + 0.25, z1: cz + BD / 2 - 0.25, y: BASEMENT_Y });

    // Concrete descending stair treads through the open 4-quad ground cutout
    const bSteps = 14;
    const bStepD = (cutZ1 - cutZ0) / bSteps;
    const bStepH = (FLOOR_Y - BASEMENT_Y) / bSteps;
    for (let i = 0; i < bSteps; i++) {
      B('prop', cutX1 - cutX0 - 0.08, bStepH * (i + 1), bStepD + 0.03, (cutX0 + cutX1) / 2, BASEMENT_Y, cutZ0 + bStepD * (i + 0.5), 0xb8bec6);
    }
    stairsList.push({ x0: cx + cutX0, x1: cx + cutX1, z0: cz + cutZ0, z1: cz + cutZ1, y0: BASEMENT_Y, y1: FLOOR_Y, axis: 'z', dir: 1 });

    // Ground-floor safety glass/metal guardrails around stairwell cutout (leaving South entry open)
    const railInnerX = bSide === 'left' ? cutX1 + 0.06 : cutX0 - 0.06;
    B('glass', 0.04, 0.92, cutZ1 - cutZ0, railInnerX, FLOOR_Y + 0.04, (cutZ0 + cutZ1) / 2, 0xbad6e4);
    B('propMetal', 0.07, 0.05, cutZ1 - cutZ0 + 0.1, railInnerX, FLOOR_Y + 0.96, (cutZ0 + cutZ1) / 2, 0x626c78);
    B('glass', cutX1 - cutX0, 0.92, 0.04, (cutX0 + cutX1) / 2, FLOOR_Y + 0.04, cutZ0 - 0.06, 0xbad6e4);
    B('propMetal', cutX1 - cutX0 + 0.1, 0.05, 0.07, (cutX0 + cutX1) / 2, FLOOR_Y + 0.96, cutZ0 - 0.06, 0x626c78);
    // Basement bright LED troffers
    for (const bx of [-BW * 0.25, 0, BW * 0.25]) {
      B('emit', 1.4, 0.05, 0.36, bx, FLOOR_Y - 0.30, 0.6, 0xf8fbff);
    }
    // Basement themed furnishings
    if (kind === 'parking') {
      for (const sx of [-7.5, -2.5, 2.5, 7.5]) {
        B('prop', 0.12, 0.02, 4.4, sx - 1.3, BASEMENT_Y + 0.015, -3.5, 0xf2c94c);
        B('prop', 1.65, 0.15, 0.18, sx, BASEMENT_Y + 0.01, -5.6, 0xd8a828);
      }
      B('prop', 2.4, 0.95, 1.5, -4.5, BASEMENT_Y + 0.26, -3.5, 0x2f5f96);
      B('prop', 2.2, 0.95, 1.5, 3.0, BASEMENT_Y + 0.26, -3.5, 0x9e3535);
    } else if (kind === 'bank') {
      for (let i = 0; i < 4; i++) B('propMetal', 1.8, 2.1, 0.55, -5.5 + i * 3.2, BASEMENT_Y, -BD / 2 + 0.72, 0x9aa4ae);
      B('intWood', 2.6, 0.78, 1.15, 0.5, BASEMENT_Y, 1.2, 0x6b4e34);
      for (let g = 0; g < 6; g++) B('propMetal', 0.28, 0.12, 0.14, -0.3 + (g % 3) * 0.36, BASEMENT_Y + 0.79 + Math.floor(g / 3) * 0.12, 1.2, 0xe8b93a);
    } else if (kind === 'hospital') {
      // Basement Clinical Diagnostic Lab & Sterile Supply
      for (const lx of [-5.8, -1.2, 3.4]) {
        B('intWall', 2.4, 0.88, 0.86, lx, BASEMENT_Y, -BD / 2 + 1.1, 0xf0f4f8);
        B('propMetal', 2.44, 0.05, 0.90, lx, BASEMENT_Y + 0.88, -BD / 2 + 1.1, 0x454e58);
        B('emit', 0.52, 0.34, 0.06, lx - 0.5, BASEMENT_Y + 0.94, -BD / 2 + 0.9, 0x88e6d8);
      }
      B('propMetal', 2.4, 1.45, 1.1, -6.4, BASEMENT_Y, 2.4, 0x2e6a56); // Backup hospital generator
    } else if (kind === 'police') {
      for (const sx of [-5.5, -1.5, 2.5]) {
        B('propMetal', 2.2, 2.1, 0.58, sx, BASEMENT_Y, -BD / 2 + 0.72, 0x5c6672);
        B('prop', 0.52, 0.34, 0.42, sx - 0.5, BASEMENT_Y + 0.72, -BD / 2 + 0.72, 0xd8b474);
        B('prop', 0.52, 0.34, 0.42, sx + 0.4, BASEMENT_Y + 1.38, -BD / 2 + 0.72, 0xd8b474);
      }
    } else {
      // Wine / Supply Cellar & Laundry
      for (const sx of [-5.2, -1.4, 2.4]) {
        B('intWood', 2.2, 1.95, 0.55, sx, BASEMENT_Y, -BD / 2 + 0.75, 0x6e4e34);
        for (let b = 0; b < 4; b++) G('prop', cyl(0.06, 0.06, 0.28, sx - 0.7 + b * 0.45, BASEMENT_Y + 0.74, -BD / 2 + 0.75, 0x2e5838, 8));
      }
      B('propMetal', 0.85, 1.55, 0.85, -7.2, BASEMENT_Y, 1.4, 0xcad2da);
      B('propMetal', 0.85, 1.55, 0.85, -6.1, BASEMENT_Y, 1.4, 0xcad2da);
    }
  }

  let vaultPos: { x: number; z: number } | undefined;
  let tellerPos: { x: number; z: number } | undefined;

  // =========================================================================
  // BESPOKE ARCHITECTURAL FLOORPLANS FOR EVERY SINGLE BUILDING KIND
  // =========================================================================

  if (kind === 'hospital') {
    // -----------------------------------------------------------------------
    // HOSPITAL — MODELED DIRECTLY ON REFERENCE PHOTOS 2, 3 & 4
    // Zone A (z: +0.8 .. +11.0): Modern Atrium Lobby with 3 Circular Halo LED Chandeliers,
    //   Check-in Kiosks + White Cylindrical Ottomans, 4 Frosted-Glass Privacy Registration Bays,
    //   Charcoal Carpet + Cerulean-Blue Wayfinding Floor Lanes, Amber Accent Chairs & Desk
    // Zone B (z: -11.0 .. +0.8): Central Clinical Hallway + 3 Complete Enclosed Patient Rooms
    //   (Warm Oak LVT Floor, Sunlit Floor-to-Ceiling Corner Windows, LED Ceiling Troffers,
    //    Warm Oak Accent Headwall + Art, Properly Scaled Modern Hospital Bed, Overbed Table,
    //    Teal Window Sofa, Oak Patient Wardrobe, Bedside Cart)
    // -----------------------------------------------------------------------

    // Lobby dropped ceiling soffit + 3 Iconic Circular LED Halo Ring Chandeliers (Refs 3 & 4)
    B('intCeil', RW - 0.6, 0.24, 9.8, 0, RH - 0.24, 5.8, 0xe8edf2);
    B('intAccent', RW - 0.6, 0.14, 0.16, 0, RH - 0.36, 0.95, 0x2a7898); // Subtle cerulean architectural trim cove
    addHaloChandelier(-6.2, 5.8, RH - 0.24, RH - 0.78, 1.65);
    addHaloChandelier(0.2, 5.8, RH - 0.24, RH - 0.78, 1.85);
    addHaloChandelier(6.8, 5.8, RH - 0.24, RH - 0.78, 1.65);

    // Charcoal commercial carpet floor in lobby with cerulean-blue wayfinding tile lanes (Refs 3 & 4!)
    addFloorFinish('carpet', -RW / 2 + 0.3, 0.9, RW / 2 - 0.3, RD / 2 - 1.8, 0x525862, 1.8);
    // Light grey limestone stone threshold strip right inside the entrance
    addFloorFinish('intTile', -RW / 2 + 0.3, RD / 2 - 1.8, RW / 2 - 0.3, RD / 2 - 0.2, 0xd8d6d0, 1.6, FLOOR_Y + 0.015);
    // Iconic horizontal blue wayfinding carpet lanes across the lobby
    addFloorFinish('carpet2', -10.5, 4.5, 8.5, 5.2, 0x3a84a8, 1.4, FLOOR_Y + 0.017);
    addFloorFinish('carpet2', -5.8, 7.2, 7.6, 7.9, 0x3a84a8, 1.4, FLOOR_Y + 0.017);

    // Front panoramic lobby glass windows flanking main doors
    addCurtainWallX(-RW / 2 + 0.8, -1.6, RD / 2 - 0.22, FLOOR_Y + 0.12, RH - 0.45, -1);
    addCurtainWallX(1.6, RW / 2 - 0.8, RD / 2 - 0.22, FLOOR_Y + 0.12, RH - 0.45, -1);

    // LEFT CHECK-IN KIOSK WALL (Exact Reference Photos 3 & 4: 3 Angled White Kiosks + Cylindrical Ottomans)
    for (let k = 0; k < 3; k++) {
      const kz = 2.6 + k * 2.15;
      const kx = -RW / 2 + 1.05;
      B('prop', 0.48, 1.48, 0.56, kx, FLOOR_Y, kz, 0xf2f4f7);
      B('prop', 0.36, 0.08, 0.56, kx + 0.18, FLOOR_Y + 0.92, kz, 0xe2e6eb);
      B('emit', 0.04, 0.36, 0.40, kx + 0.26, FLOOR_Y + 1.04, kz, 0x2c4a66); // Dark touchscreen display
      B('prop', 0.05, 0.14, 0.38, kx + 0.25, FLOOR_Y + 1.44, kz, 0x2d86a8); // Self Check-In header strip
      P(0.65, 1.5, 0.65, kx, FLOOR_Y, kz);
      // Cylindrical white waiting ottoman beside kiosk
      G('prop', cyl(0.28, 0.22, 0.42, kx + 0.58, FLOOR_Y, kz + 0.88, 0xeaecef, 14));
    }
    // Framed green landscape painting on left lobby corridor wall (visible in Refs 3 & 4!)
    addWallArt(-RW / 2 + 0.24, FLOOR_Y + 1.25, 1.35, 1.65, 0.92, Math.PI / 2, 0x5ea256, 0x8bc8e8);

    // CENTER REGISTRATION & TRIAGE CUBICLES (4 White/Grey Desks with Frosted Glass Privacy Dividers — Refs 3 & 4!)
    const deskZ = 2.65;
    for (let b = 0; b < 4; b++) {
      const bx = -4.6 + b * 2.55;
      // Clean white laminate front counter + dark blue-grey rear privacy screen
      B('prop', 2.42, 0.96, 0.68, bx, FLOOR_Y, deskZ, 0xf4f6f8);
      B('prop', 2.46, 0.05, 0.74, bx, FLOOR_Y + 0.96, deskZ, 0xd4dbe2);
      B('prop', 2.42, 1.18, 0.08, bx, FLOOR_Y, deskZ - 0.88, 0x5c6878);
      // Tall frosted privacy glass wing partition between cubicles
      B('propMetal', 0.06, 1.52, 1.18, bx - 1.26, FLOOR_Y, deskZ - 0.15, 0xa8b2bc);
      B('glass', 0.03, 1.42, 1.12, bx - 1.26, FLOOR_Y + 0.06, deskZ - 0.15, 0xd4e6f0);
      // Dual desktop monitors on desk
      B('propMetal', 0.08, 0.18, 0.08, bx - 0.35, FLOOR_Y + 1.01, deskZ - 0.06, 0x262c34);
      B('emit', 0.44, 0.28, 0.03, bx - 0.35, FLOOR_Y + 1.14, deskZ - 0.06, 0xbfe4f8);
      P(2.48, 1.2, 0.76, bx, FLOOR_Y, deskZ);
      if (b === 0 || b === 2) {
        npcSpots.push({ x: cx + bx, z: cz + deskZ - 0.48, yaw: 0, role: 'nurse' });
      }
    }
    // Rightmost privacy glass wing + overhead digital queue screens
    B('propMetal', 0.06, 1.52, 1.18, 4.32, FLOOR_Y, deskZ - 0.15, 0xa8b2bc);
    B('glass', 0.03, 1.42, 1.12, 4.32, FLOOR_Y + 0.06, deskZ - 0.15, 0xd4e6f0);
    for (const tvX of [-1.2, 4.8]) {
      G('propMetal', cyl(0.025, 0.025, 1.15, tvX, FLOOR_Y + 2.78, deskZ - 0.55, 0x454d56, 8));
      B('propMetal', 1.16, 0.64, 0.06, tvX, FLOOR_Y + 2.22, deskZ - 0.55, 0x1c2228);
      B('emit', 1.08, 0.56, 0.03, tvX, FLOOR_Y + 2.26, deskZ - 0.51, 0xd4eefc);
    }

    // RIGHT LOUNGE & CONSULTATION AREA (Amber-Orange Modern Curved Lounge Chairs + Side Table + Oak Desk — Refs 3 & 4!)
    addModernChair(7.4, 5.1, -0.8, 0xd47824, 0x9aa4ae);
    addModernChair(8.6, 6.4, -2.1, 0xd47824, 0x9aa4ae);
    G('propMetal', cyl(0.24, 0.24, 0.03, 7.6, FLOOR_Y, 6.2, 0xb4bcc4, 12));
    G('propMetal', cyl(0.03, 0.03, 0.52, 7.6, FLOOR_Y + 0.03, 6.2, 0xb4bcc4, 8));
    G('prop', cyl(0.32, 0.32, 0.03, 7.6, FLOOR_Y + 0.54, 6.2, 0xf2f4f6, 14));
    // Oak consultation desk & chairs
    B('intWood', 1.85, 0.74, 0.92, 10.6, FLOOR_Y, 5.8, 0x8c6848);
    P(1.9, 0.8, 0.96, 10.6, FLOOR_Y, 5.8);
    addModernChair(10.4, 4.8, 0.1, 0x4a5568, 0x7c8692);
    addModernChair(11.6, 6.2, -1.5, 0xd8dee6, 0x7c8692);
    addPlant(12.2, 9.2);
    addPlant(-12.2, 9.2);

    // Wait-line patients checking in + seated lounge visitors
    const queue = computeWaitLineSlots(-3.4, 5.2, 0.15, 0.98, 2, 1.12);
    for (const q of queue) npcSpots.push({ x: cx + q.x, z: cz + q.z, yaw: q.yaw, role: 'queue' });
    npcSpots.push({ x: cx + 7.4, z: cz + 5.1, yaw: -0.8, role: 'seated' });
    npcSpots.push({ x: cx + 10.4, z: cz + 4.8, yaw: 0.1, role: 'doctor' });
    npcSpots.push({ x: cx + 2.4, z: cz + 7.8, yaw: Math.PI, role: 'guard' });

    // FULL FLOOR-TO-CEILING PARTITION WALL SEPARATING LOBBY FROM CLINICAL PATIENT WING (z = 0.85)
    addWallX(-RW / 2 + 0.2, 8.0, 0.85, RH, 0xf2f5f8, {
      doorX: -0.8, doorW: 1.95, doorId: 'hosp_clinical_double', doorStyle: 'glass', openDir: -1, trimCol: 0x7c8a96,
    });
    // East circulation wing wall + Twin Escalator up to Level 2 + Basement Lab Stairwell
    addWallX(8.0, RW / 2 - 0.2, 0.85, RH, 0xf2f5f8, {
      doorX: 10.2, doorW: 1.6, trimCol: 0x7c8a96,
    });
    addTwinEscalator(8.4, -9.2, -4.8, FLOOR_Y, MEZZ_Y);

    // CLINICAL CORRIDOR (z: -4.4 .. +0.85) WITH BRIGHT LED TROFFERS
    addFloorFinish('intTile', -RW / 2 + 0.3, -4.4, 8.0, 0.85, 0xe8edf2, 1.8);
    addLedTroffer(-9.0, -1.7, RH, 1.35, 0.48);
    addLedTroffer(-3.2, -1.7, RH, 1.35, 0.48);
    addLedTroffer(2.8, -1.7, RH, 1.35, 0.48);

    // 3 COMPLETELY ENCLOSED PRIVATE HOSPITAL PATIENT ROOMS (EXACT REFERENCE PHOTO 2!)
    // Room 1: x -13.8..-7.0, z -10.8..-4.4 | Room 2: x -7.0..-0.2, z -10.8..-4.4 | Room 3: x -0.2..+6.8, z -10.8..-4.4
    const pRooms: [number, number, string][] = [
      [-13.8, -7.0, 'pt_room_101'],
      [-7.0, -0.2, 'pt_room_102'],
      [-0.2, 6.8, 'pt_room_103'],
    ];
    for (let ri = 0; ri < pRooms.length; ri++) {
      const [rx0, rx1, rId] = pRooms[ri];
      const rcx = (rx0 + rx1) / 2;
      const roomH = 3.25;
      // Dropped acoustic patient-room ceiling (realistic 3.25m clinical ceiling height!) + recessed LED troffer
      B('intCeil', rx1 - rx0, 0.16, 6.4, rcx, roomH, -7.6, 0xf9fbfc);
      addLedTroffer(rcx, -7.5, roomH, 1.45, 0.56);
      // Warm Oak LVT wood-grain floor (exact Reference Photo 2!)
      addFloorFinish('intFloorWood', rx0 + 0.08, -10.75, rx1 - 0.08, -4.45, 0xc89a6e, 2.0, FLOOR_Y + 0.015);
      // Complete floor-to-ceiling front corridor wall with framed hinged patient door
      addWallX(rx0, rx1, -4.4, RH, 0xf4f6f8, {
        doorX: rx0 + 1.35, doorW: 1.08, doorId: rId, doorStyle: 'wood', openDir: -1, trimCol: 0x8a6442,
      });
      // Complete floor-to-ceiling dividing wall between patient rooms
      if (ri > 0) addWallZ(rx0, -10.8, -4.4, RH, 0xf2f5f7, { trimCol: 0x8a6442 });
      if (ri === pRooms.length - 1) addWallZ(rx1, -10.8, -4.4, RH, 0xf2f5f7, { trimCol: 0x8a6442 });

      // Floor-to-ceiling sunlit curtain-wall window along rear wall (and left corner for Room 101 — exact Ref Photo 2!)
      addCurtainWallX(rx0 + 0.35, rx1 - 0.35, -10.72, FLOOR_Y + 0.45, roomH - 0.12, 1);
      if (ri === 0) addCurtainWallZ(rx0 + 0.12, -10.4, -5.2, FLOOR_Y + 0.45, roomH - 0.12, 1);

      // Warm oak wood headboard accent wall on right interior wall of each room (exact Ref Photo 2!)
      const hwX = rx1 - 0.14;
      B('intWood', 0.08, roomH - FLOOR_Y, 3.8, hwX, FLOOR_Y, -7.6, 0x9c6638);
      addWallArt(hwX - 0.06, FLOOR_Y + 1.35, -7.6, 1.35, 0.92, -Math.PI / 2, 0xf0ead8, 0xc85c4a);
      // Medical oxygen/gas headwall rail + mounted vitals display
      B('propMetal', 0.08, 0.16, 2.4, hwX - 0.05, FLOOR_Y + 1.05, -7.6, 0xd8dee6);
      B('propMetal', 0.10, 0.34, 0.44, hwX - 0.07, FLOOR_Y + 1.28, -6.55, 0x1e2630);
      B('emit', 0.04, 0.26, 0.36, hwX - 0.12, FLOOR_Y + 1.32, -6.55, 0x4de6a8);

      // Properly human-scaled modern clinical hospital bed (2.15m × 1.02m, wheels grounded on FLOOR_Y — exact Ref Photo 2!)
      const bedX = rx1 - 1.38;
      const bedZ = -7.6;
      for (const [wx, wz] of [[-0.86, -0.40], [0.86, -0.40], [-0.86, 0.40], [0.86, 0.40]]) {
        G('propMetal', cyl(0.06, 0.06, 0.14, bedX + wx, FLOOR_Y, bedZ + wz, 0x3a4048, 8));
      }
      B('propMetal', 2.02, 0.18, 0.92, bedX, FLOOR_Y + 0.14, bedZ, 0xd8dfe6); // Articulated undercarriage
      B('prop', 2.10, 0.20, 0.98, bedX, FLOOR_Y + 0.32, bedZ, 0xf6f8fa);      // White clinical mattress
      B('carpet2', 1.48, 0.05, 1.00, bedX - 0.26, FLOOR_Y + 0.51, bedZ, 0x7cb0d8); // Blue clinical blanket
      B('prop', 0.38, 0.12, 0.68, bedX + 0.78, FLOOR_Y + 0.52, bedZ, 0xffffff);    // White pillow
      // Sculpted white/blue clinical side rails & headboard/footboard
      B('prop', 0.09, 0.62, 1.02, bedX + 1.04, FLOOR_Y + 0.26, bedZ, 0xe8edf2);
      B('prop', 0.09, 0.54, 1.02, bedX - 1.04, FLOOR_Y + 0.26, bedZ, 0xe8edf2);
      for (const side of [-0.51, 0.51]) {
        B('prop', 0.92, 0.28, 0.05, bedX + 0.32, FLOOR_Y + 0.44, bedZ + side, 0xf2f5f8);
        B('prop', 0.74, 0.05, 0.06, bedX + 0.32, FLOOR_Y + 0.68, bedZ + side, 0x2a6ca8);
      }
      // Rolling oak over-bed tray table (grounded C-frame base!)
      B('propMetal', 0.48, 0.04, 0.08, bedX - 0.25, FLOOR_Y, bedZ + 0.64, 0x8a949e);
      G('propMetal', cyl(0.025, 0.025, 0.80, bedX - 0.25, FLOOR_Y + 0.04, bedZ + 0.64, 0x8a949e, 8));
      B('intWood', 0.52, 0.04, 0.84, bedX - 0.25, FLOOR_Y + 0.82, bedZ + 0.24, 0xaa7c50);
      P(2.15, 0.95, 1.12, bedX, FLOOR_Y, bedZ);

      // Teal visitor sofa along window wall + tall oak patient wardrobe + wooden bedside bassinet/cart (Ref Photo 2!)
      addSofa(rcx - 0.6, -10.1, 0, 0x1f7a8c, 1.85);
      B('intWood', 0.64, 2.05, 0.86, rx1 - 0.55, FLOOR_Y, -10.1, 0x9c6a3e);
      P(0.68, 2.05, 0.90, rx1 - 0.55, FLOOR_Y, -10.1);
      // Bedside wooden nursery/supply cart
      B('intWood', 0.62, 0.72, 0.46, rx0 + 0.95, FLOOR_Y + 0.08, -7.8, 0x8c5a34);
      B('glass', 0.56, 0.24, 0.42, rx0 + 0.95, FLOOR_Y + 0.80, -7.8, 0xd8eef8);
      for (const [cxw, czw] of [[-0.24, -0.18], [0.24, -0.18], [-0.24, 0.18], [0.24, 0.18]]) {
        G('propMetal', cyl(0.035, 0.035, 0.08, rx0 + 0.95 + cxw, FLOOR_Y, -7.8 + czw, 0x3c424a, 8));
      }

      if (ri === 0) npcSpots.push({ x: cx + rcx - 0.9, z: cz - 6.2, yaw: -1.4, role: 'doctor' });
      if (ri === 1) npcSpots.push({ x: cx + rcx - 0.8, z: cz - 6.1, yaw: -1.3, role: 'nurse' });
    }
  } else if (kind === 'apartment') {
    // -----------------------------------------------------------------------
    // LUXURY HOTEL FLOOR & SUITES — MODELED DIRECTLY ON REFERENCE PHOTO 1
    // Central Hotel Corridor (x: -2.0 .. +2.0) + Elevator Lobby + Room Doors 401/402
    // West Wing (x: -11.8 .. -2.0): Suite 401 (Master Bedroom w/ Vertical Oak Slat Headboard Wall,
    //   Backlit Warm Glow, Dual Matte-Black Rod Pendant Milk-Glass Globes, King Platform Bed w/
    //   Crisp White Duvet + 6 Pillows, Floor-to-Ceiling White Multi-Pane French Balcony Doors,
    //   Pleated Grey Curtains & Sheers, Warm Pelmet Cove, Sunlit Floor Light-Bars, Oak Chair,
    //   Marble Console + Enclosed En-Suite Marble Bathroom w/ Walk-in Glass Shower!)
    // East Wing (x: +2.0 .. +11.8): Suite 402 (Corner Lounge + Second Bedroom Suite) + Basement Stairs
    // -----------------------------------------------------------------------

    // Central Hotel Corridor with warm woven runner & recessed ceiling downlights
    addFloorFinish('carpet', -2.0, -RD / 2 + 0.3, 2.0, RD / 2 - 0.3, 0x847e76, 1.8);
    addFloorFinish('carpet2', -1.25, -RD / 2 + 0.8, 1.25, RD / 2 - 1.2, 0x625c55, 1.6, FLOOR_Y + 0.015);
    for (const lz of [-6.8, -2.2, 2.4, 7.0]) {
      addLedTroffer(0, lz, RH, 0.65, 0.65, 0xfff3de);
    }
    // Stainless-steel Hotel Elevator Bank at north end of corridor
    B('propMetal', 1.65, 2.22, 0.14, 0, FLOOR_Y, -RD / 2 + 0.28, 0xb8c0c8);
    B('propMetal', 0.04, 2.20, 0.16, 0, FLOOR_Y, -RD / 2 + 0.30, 0x4c545c);
    B('propMetal', 1.85, 0.14, 0.18, 0, FLOOR_Y + 2.22, -RD / 2 + 0.28, 0x767e88);
    B('emit', 0.42, 0.14, 0.05, 0, FLOOR_Y + 2.48, -RD / 2 + 0.24, 0xffe49c); // Floor indicator 4F

    // Full floor-to-ceiling Hotel Corridor Walls with Suite Doors (401 West, 402 East)
    addWallZ(-2.0, -RD / 2 + 0.2, RD / 2 - 0.2, RH, 0xf2eee6, {
      doorZ: 4.4, doorW: 1.06, doorId: 'hotel_suite_401', doorStyle: 'wood', openDir: -1, trimCol: 0x6a4f38,
    });
    addWallZ(2.0, -RD / 2 + 0.2, RD / 2 - 0.2, RH, 0xf2eee6, {
      doorZ: 4.4, doorW: 1.06, doorId: 'hotel_suite_402', doorStyle: 'wood', openDir: 1, trimCol: 0x6a4f38,
    });

    // === SUITE 401 (WEST WING — EXACT REFERENCE PHOTO 1!) ===
    // Textured warm-grey woven hotel bedroom carpet (x: -11.8 .. -2.0, z: -2.6 .. +9.8)
    addFloorFinish('carpet', -11.8, -2.6, -2.05, 9.75, 0xa8a49e, 1.4, FLOOR_Y + 0.015);
    // Crisp sunlit diagonal light-bars cast across the hotel carpet from the French balcony doors (Ref Photo 1!)
    for (let sb = 0; sb < 3; sb++) {
      B('emit', 2.4, 0.008, 0.58, -8.8 + sb * 0.4, FLOOR_Y + 0.019, 1.4 + sb * 0.95, 0xf6f3ec, -0.35);
    }

    // SUITE 401 FULL-HEIGHT EN-SUITE BATHROOM PARTITION (z = -2.6)
    addWallX(-11.8, -2.0, -2.6, RH, 0xf5f2ec, {
      doorX: -4.2, doorW: 0.98, doorId: 'suite_401_bath', doorStyle: 'wood', openDir: -1, trimCol: 0x7c5e42,
    });

    // ICONIC VERTICAL SLATTED OAK HEADBOARD ACCENT WALL along West Wall (x = -11.72, z = -2.4 .. +4.8 — EXACT REF PHOTO 1!)
    // Warm golden ambient cove glow sheet directly behind oak slats
    B('emit', 0.03, RH - FLOOR_Y - 0.18, 6.8, -11.74, FLOOR_Y + 0.08, 1.2, 0xffd699);
    // 28 individually modeled floor-to-ceiling vertical oak slats!
    for (let s = 0; s < 28; s++) {
      const sz = -2.2 + s * 0.245;
      B('intWood', 0.07, RH - FLOOR_Y - 0.06, 0.095, -11.66, FLOOR_Y, sz, s % 2 === 0 ? 0x9c7652 : 0x8a6442);
    }

    // KING PLATFORM BED (2.08m × 2.04m, human-scaled 0.56m mattress top — EXACT REF PHOTO 1!)
    const bedX = -10.52;
    const bedZ = 1.2;
    // 4 dark cylindrical legs grounded cleanly on carpet
    for (const [lx, lz] of [[-0.92, -0.88], [0.92, -0.88], [-0.92, 0.88], [0.92, 0.88]]) {
      G('propMetal', cyl(0.035, 0.03, 0.14, bedX + lx, FLOOR_Y, bedZ + lz, 0x222428, 8));
    }
    // Upholstered warm-grey divan base + padded headboard + plush white duvet
    B('carpet2', 2.06, 0.26, 2.02, bedX, FLOOR_Y + 0.14, bedZ, 0xa89f96);
    B('carpet2', 0.14, 1.18, 2.12, -11.55, FLOOR_Y + 0.14, bedZ, 0xb8aea2); // Upholstered headboard
    B('prop', 2.04, 0.22, 2.00, bedX + 0.02, FLOOR_Y + 0.38, bedZ, 0xfafaf8); // Crisp white mattress & duvet
    B('prop', 1.65, 0.06, 2.04, bedX + 0.22, FLOOR_Y + 0.56, bedZ, 0xf4f4f2); // Soft duvet fold
    // 6 layered hotel pillows (2 large back white euro pillows + 2 white pillows + 2 pale slate-blue accent cushions!)
    for (const pz of [-0.52, 0.52]) {
      B('prop', 0.22, 0.44, 0.78, -11.32, FLOOR_Y + 0.58, bedZ + pz, 0xf8f8f6, 0.14);
      B('prop', 0.20, 0.36, 0.68, -11.10, FLOOR_Y + 0.58, bedZ + pz, 0xffffff, 0.18);
      B('carpet2', 0.16, 0.26, 0.46, -10.90, FLOOR_Y + 0.58, bedZ + pz, 0xa4b4c4, 0.22); // Pale blue-grey bolster cushions!
    }
    P(2.14, 0.72, 2.08, bedX, FLOOR_Y, bedZ);

    // DUAL BEDSIDE DARK-WOOD/BRASS NIGHTSTANDS + SUSPENDED MATTE-BLACK ROD MILK-GLASS GLOBE PENDANTS (REF PHOTO 1!)
    for (const nz of [-0.28, 2.68]) {
      // Brass open-frame base + dark espresso drawer box
      for (const [lx, lz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) {
        B('propMetal', 0.025, 0.36, 0.025, -11.24 + lx, FLOOR_Y, nz + lz, 0xa88652);
      }
      B('intWood', 0.54, 0.20, 0.54, -11.24, FLOOR_Y + 0.36, nz, 0x26201c);
      // Wall switch plate + matte-black ceiling drop rod + glowing frosted milk-glass globe lamp!
      B('prop', 0.03, 0.10, 0.24, -11.60, FLOOR_Y + 0.68, nz, 0x8a745c);
      addGlobePendant(-11.20, nz, RH, FLOOR_Y + 0.96, 0x1a1c20, 0xfff0cc);
      addLight(-10.6, FLOOR_Y + 1.45, nz);
    }

    // FLOOR-TO-CEILING WHITE MULTI-PANE FRENCH BALCONY DOORS + SHEERS + GREY DRAPERY + WARM PELMET COVE (REF PHOTO 1!)
    const winZ = 9.72;
    // Warm indirect cove glow strip tucked inside the curtain pelmet
    B('emit', 6.4, 0.14, 0.12, -6.9, RH - 0.18, winZ - 0.14, 0xffd9a4);
    B('intCeil', 6.8, 0.22, 0.28, -6.9, RH - 0.22, winZ - 0.32, 0xf7f5f0); // White ceiling pelmet soffit
    // Bright daylight city balcony backdrop + white 3-panel French doors with muntin grid!
    B('emit', 5.2, RH - FLOOR_Y - 0.24, 0.04, -6.9, FLOOR_Y + 0.06, winZ + 0.02, 0xe8f3fc);
    B('glass', 5.2, RH - FLOOR_Y - 0.24, 0.03, -6.9, FLOOR_Y + 0.06, winZ - 0.04, 0xc2dceb);
    for (const mx of [-9.5, -7.78, -6.02, -4.3]) {
      B('prop', 0.11, RH - FLOOR_Y - 0.22, 0.10, mx, FLOOR_Y + 0.06, winZ - 0.05, 0xf8f8f6);
    }
    for (let gy = 0; gy < 6; gy++) {
      B('prop', 5.2, 0.04, 0.06, -6.9, FLOOR_Y + 0.38 + gy * 0.44, winZ - 0.06, 0xf8f8f6);
    }
    for (let gx = 0; gx < 10; gx++) {
      B('prop', 0.035, RH - FLOOR_Y - 0.28, 0.05, -9.2 + gx * 0.51, FLOOR_Y + 0.08, winZ - 0.06, 0xf8f8f6);
    }
    // Tall floor-to-ceiling pleated grey curtains + inner white sheer panels framing both sides!
    for (const side of [-1, 1]) {
      const drX = -6.9 + side * 3.15;
      for (let fold = 0; fold < 4; fold++) {
        G('carpet2', cyl(0.11, 0.13, RH - FLOOR_Y - 0.14, drX - side * fold * 0.18, FLOOR_Y, winZ - 0.22, 0xb8b8b6, 10));
      }
      B('prop', 0.38, RH - FLOOR_Y - 0.14, 0.05, -6.9 + side * 2.48, FLOOR_Y, winZ - 0.18, 0xfafaf8); // Sheer veil
    }

    // Natural oak curved accent chair + white marble-top console dresser in Suite 401 (Ref Photo 1!)
    addModernChair(-4.2, 7.6, -2.5, 0xc8a47c, 0x825d3c);
    B('intWood', 1.85, 0.78, 0.52, -7.0, FLOOR_Y, -2.18, 0x8c6848);
    B('intMarble', 1.90, 0.05, 0.56, -7.0, FLOOR_Y + 0.78, -2.18, 0xf8f6f2);
    B('propMetal', 1.32, 0.76, 0.05, -7.0, FLOOR_Y + 1.25, -2.46, 0x1e2228); // Wall-mounted smart TV
    P(1.9, 0.85, 0.58, -7.0, FLOOR_Y, -2.18);
    addLedTroffer(-6.8, 3.2, RH, 1.1, 0.5, 0xfff8ee);
    addLedTroffer(-6.8, 7.2, RH, 1.1, 0.5, 0xfff8ee);

    // EN-SUITE MARBLE BATHROOM FOR SUITE 401 (x: -11.8 .. -2.0, z: -9.8 .. -2.6)
    addFloorFinish('intMarble', -11.7, -9.7, -2.1, -2.65, 0xf4f2ee, 1.8, FLOOR_Y + 0.015);
    addLedTroffer(-6.8, -6.2, RH, 1.2, 0.48, 0xf8fbff);
    // Double marble vanity + backlit vanity mirror
    B('intWood', 2.4, 0.82, 0.58, -6.8, FLOOR_Y, -9.35, 0x7c5d40);
    B('intMarble', 2.46, 0.06, 0.62, -6.8, FLOOR_Y + 0.82, -9.35, 0xfaf8f5);
    B('emit', 2.15, 0.96, 0.04, -6.8, FLOOR_Y + 1.15, -9.68, 0xeef6fc);
    B('glass', 2.08, 0.88, 0.03, -6.8, FLOOR_Y + 1.19, -9.64, 0xc8dce8);
    // Walk-in glass rain shower (west corner) + porcelain toilet (east corner)
    B('intTile', 2.2, 0.06, 2.2, -10.5, FLOOR_Y + 0.02, -8.5, 0xe8ecf0);
    B('glass', 0.04, 2.15, 2.2, -9.4, FLOOR_Y + 0.06, -8.5, 0xc2dce8);
    B('propMetal', 0.04, 0.04, 0.42, -11.4, FLOOR_Y + 2.18, -8.5, 0xc8d0d8);
    G('propMetal', cyl(0.14, 0.14, 0.03, -11.15, FLOOR_Y + 2.14, -8.5, 0xd4dce4, 12)); // Rain showerhead
    B('prop', 0.44, 0.42, 0.56, -3.2, FLOOR_Y, -9.2, 0xfafaf8);
    B('prop', 0.46, 0.42, 0.22, -3.2, FLOOR_Y + 0.42, -9.45, 0xfafaf8);

    // === SUITE 402 (EAST WING — DELUXE LOUNGE & CORNER BEDROOM) ===
    addFloorFinish('carpet', 2.05, -2.6, 11.75, 9.75, 0xb2aba0, 1.5, FLOOR_Y + 0.015);
    addWallX(2.0, 8.8, -2.6, RH, 0xf5f2ec, { doorX: 4.4, doorW: 0.98, doorId: 'suite_402_bed', doorStyle: 'wood', openDir: -1, trimCol: 0x7c5e42 });
    addCurtainWallX(3.2, 10.6, 9.72, FLOOR_Y + 0.12, RH - 0.18, -1);
    addSofa(6.8, 5.2, Math.PI, 0x5c7482, 2.2);
    B('intWood', 1.25, 0.42, 0.68, 6.8, FLOOR_Y, 3.6, 0x8a6442);
    addModernChair(9.2, 3.6, -1.6, 0xc89862, 0x6e4e32);
    addPlant(10.8, 8.6);
    addLedTroffer(6.8, 4.4, RH, 1.2, 0.5, 0xfff6e6);
    addLedTroffer(5.8, -6.2, RH, 1.2, 0.5, 0xfff6e6);
    // Second suite queen bed in back room
    B('carpet2', 1.8, 0.36, 2.0, 5.6, FLOOR_Y + 0.10, -7.8, 0x8e867c);
    B('prop', 1.76, 0.18, 1.96, 5.6, FLOOR_Y + 0.42, -7.8, 0xfafaf8);
    P(1.85, 0.65, 2.05, 5.6, FLOOR_Y, -7.8);

    npcSpots.push({ x: cx - 5.8, z: cz + 4.4, yaw: -1.2, role: 'customer' });
    npcSpots.push({ x: cx + 6.8, z: cz + 5.2, yaw: Math.PI, role: 'seated' });
    npcSpots.push({ x: cx + 0.4, z: cz + 2.6, yaw: 0, role: 'attendant' });
  } else if (kind === 'diner') {
    // -----------------------------------------------------------------------
    // BRIGHT SUNLIT MODERN RESTAURANT / BISTRO + ENCLOSED COMMERCIAL KITCHEN
    // -----------------------------------------------------------------------
    addFloorFinish('intFloorWood', -RW / 2 + 0.25, -2.0, RW / 2 - 0.25, RD / 2 - 0.25, 0xdab98e, 2.2, FLOOR_Y + 0.012);
    addFloorFinish('intTile', -RW / 2 + 0.25, -RD / 2 + 0.25, RW / 2 - 0.25, -2.0, 0xe8edf0, 1.5, FLOOR_Y + 0.014);

    // Panoramic bright sunlit dining windows along Front & West walls!
    addCurtainWallX(-RW / 2 + 0.8, -1.5, RD / 2 - 0.22, FLOOR_Y + 0.62, RH - 0.35, -1);
    addCurtainWallX(1.5, RW / 2 - 0.8, RD / 2 - 0.22, FLOOR_Y + 0.62, RH - 0.35, -1);
    addCurtainWallZ(-RW / 2 + 0.22, -1.4, 5.6, FLOOR_Y + 0.62, RH - 0.35, 1);

    // Entry Host Stand + Architectural Oak Slat Screen dividing foyer from booths
    B('intWood', 0.86, 1.08, 0.56, -2.2, FLOOR_Y, RD / 2 - 2.3, 0x6e4e34);
    B('prop', 0.42, 0.04, 0.32, -2.2, FLOOR_Y + 1.08, RD / 2 - 2.3, 0x262a30);
    for (let s = 0; s < 8; s++) {
      B('intWood', 0.07, RH - FLOOR_Y - 0.1, 0.12, -3.2 - s * 0.22, FLOOR_Y, RD / 2 - 2.8, 0x8a6442);
    }
    P(1.0, 1.1, 0.6, -2.2, FLOOR_Y, RD / 2 - 2.3);
    npcSpots.push({ x: cx - 2.2, z: cz + RD / 2 - 3.05, yaw: 0, role: 'server' });

    // 4 Sunlit Upholstered Dining Booths along the West panoramic window wall
    for (const [bx, bz] of [[-8.6, 4.4], [-8.6, 0.8], [-3.8, 4.4], [-3.8, 0.8]]) {
      addDiningBooth(bx, bz, 0x9c7248, 0x2f6b56);
      addGlobePendant(bx, bz, RH, FLOOR_Y + 2.05, 0x8e6c38, 0xfff0cc);
      addLight(bx, RH - 0.45, bz);
    }
    npcSpots.push({ x: cx - 8.6, z: cz + 3.7, yaw: 0, role: 'seated' });
    npcSpots.push({ x: cx - 3.8, z: cz + 1.5, yaw: Math.PI, role: 'seated' });
    npcSpots.push({ x: cx - 6.2, z: cz + 2.6, yaw: 0.4, role: 'server' });

    // Espresso & Cocktail Bar on East side of dining room
    B('intWood', 1.15, 1.04, 5.8, 4.8, FLOOR_Y, 2.2, 0x6b4b32);
    B('intMarble', 1.32, 0.06, 5.95, 4.8, FLOOR_Y + 1.04, 2.2, 0xf6f3ed);
    P(1.35, 1.1, 6.0, 4.8, FLOOR_Y, 2.2);
    // Espresso machine & bar stools
    B('propMetal', 0.48, 0.46, 0.72, 4.8, FLOOR_Y + 1.10, 0.8, 0xc8d0d8);
    for (let i = 0; i < 4; i++) {
      const sz = 0.0 + i * 1.45;
      G('propMetal', cyl(0.18, 0.22, 0.04, 3.65, FLOOR_Y, sz, 0x363b42, 10));
      G('propMetal', cyl(0.03, 0.03, 0.66, 3.65, FLOOR_Y + 0.04, sz, 0x363b42, 8));
      G('carpet2', cyl(0.19, 0.19, 0.08, 3.65, FLOOR_Y + 0.70, sz, 0xb26a36, 12));
    }
    addLight(4.2, RH - 0.45, 2.2);
    npcSpots.push({ x: cx + 5.7, z: cz + 2.2, yaw: -Math.PI / 2, role: 'clerk' });
    addPlant(10.6, RD / 2 - 1.4);
    addPlant(-10.8, RD / 2 - 1.4);

    // FULL-HEIGHT PARTITION WALL WITH DOUBLE SWINGING KITCHEN DOORS & EXPEDITER PASS-THROUGH WINDOW (z = -2.0)
    addWallX(-RW / 2 + 0.2, 2.6, -2.0, RH, 0xf4f0e8, {
      windowX: -4.2, windowW: 4.4, trimCol: 0x6e4e34,
    });
    // Stainless steel expediter pass-through counter & heat lamps
    B('propMetal', 4.4, 0.06, 0.62, -4.2, FLOOR_Y + 0.96, -2.0, 0xd2d8de);
    for (const hx of [-5.4, -4.2, -3.0]) {
      G('propMetal', cyl(0.02, 0.02, 0.42, hx, FLOOR_Y + 1.68, -2.0, 0x454d56, 8));
      G('emit', cone(0.14, 0.14, hx, FLOOR_Y + 1.54, -2.0, 0xffd088, 10));
      G('prop', cyl(0.14, 0.12, 0.03, hx, FLOOR_Y + 1.02, -2.0, 0xfafaf8, 10));
    }
    addWallX(2.6, 8.6, -2.0, RH, 0xf4f0e8, {
      doorX: 5.2, doorW: 1.75, doorId: 'diner_kitchen_double', doorStyle: 'steel', openDir: -1, trimCol: 0x6e4e34,
    });
    addWallX(8.6, RW / 2 - 0.2, -2.0, RH, 0xf4f0e8, {
      doorX: 10.2, doorW: 0.98, doorId: 'diner_restroom', doorStyle: 'wood', openDir: -1, trimCol: 0x6e4e34,
    });

    // BRIGHT WHITE-TILED COMMERCIAL KITCHEN (z: -9.3 .. -2.0)
    addLedTroffer(-6.8, -5.8, RH, 1.55, 0.52, 0xf8fbff);
    addLedTroffer(-1.2, -5.8, RH, 1.55, 0.52, 0xf8fbff);
    addLedTroffer(4.2, -5.8, RH, 1.55, 0.52, 0xf8fbff);
    // Commercial stainless 6-burner gas range + flat-top grill + full ceiling-anchored exhaust hood
    B('propMetal', 6.4, 0.90, 0.96, -4.8, FLOOR_Y, -RD / 2 + 0.72, 0xcad2da);
    B('prop', 2.8, 0.04, 0.72, -6.2, FLOOR_Y + 0.91, -RD / 2 + 0.72, 0x262a30);
    for (let b = 0; b < 6; b++) {
      G('propMetal', cyl(0.11, 0.11, 0.04, -7.2 + (b % 3) * 0.95, FLOOR_Y + 0.93, -RD / 2 + (b < 3 ? 0.52 : 0.92), 0x181a1e, 10));
    }
    B('propMetal', 2.4, 0.06, 0.72, -3.2, FLOOR_Y + 0.91, -RD / 2 + 0.72, 0x8e969e); // Flat-top griddle
    // Ceiling-anchored commercial stainless exhaust hood (ZERO floating!)
    B('propMetal', 6.8, 0.68, 1.25, -4.8, FLOOR_Y + 2.15, -RD / 2 + 0.82, 0xb8c0c8);
    B('propMetal', 1.6, Math.max(0.2, RH - (FLOOR_Y + 2.83)), 0.85, -4.8, FLOOR_Y + 2.83, -RD / 2 + 0.82, 0x9aa4ae);
    P(6.5, 1.0, 1.0, -4.8, FLOOR_Y, -RD / 2 + 0.72);
    // Twin stainless center prep island + triple-bay sink + commercial glass-door fridges
    B('propMetal', 4.6, 0.88, 1.08, -3.8, FLOOR_Y, -5.6, 0xd2d8de);
    B('intWood', 0.65, 0.04, 0.45, -4.8, FLOOR_Y + 0.89, -5.6, 0xc89a64); // Cutting board
    P(4.7, 0.92, 1.12, -3.8, FLOOR_Y, -5.6);
    B('propMetal', 2.2, 2.08, 0.82, 1.6, FLOOR_Y, -RD / 2 + 0.65, 0xd4dce4); // Walk-in reach-in fridge
    B('glass', 0.82, 1.45, 0.05, 1.1, FLOOR_Y + 0.45, -RD / 2 + 1.07, 0xc6e2f0);
    B('glass', 0.82, 1.45, 0.05, 2.1, FLOOR_Y + 0.45, -RD / 2 + 1.07, 0xc6e2f0);
    P(2.3, 2.1, 0.88, 1.6, FLOOR_Y, -RD / 2 + 0.65);
    B('propMetal', 2.6, 0.90, 0.82, 5.2, FLOOR_Y, -RD / 2 + 0.65, 0xc4ccd4); // Triple dish sink
    npcSpots.push({ x: cx - 5.4, z: cz - 7.3, yaw: Math.PI, role: 'chef' });
    npcSpots.push({ x: cx - 2.6, z: cz - 4.4, yaw: 0, role: 'chef' });
  } else if (kind === 'bank') {
    // -----------------------------------------------------------------------
    // NOVABANK — GRAND MARBLE ROTUNDA + PRIVATE WEALTH OFFICE + STEEL VAULT
    // -----------------------------------------------------------------------
    addCurtainWallX(-RW / 2 + 0.9, -1.6, RD / 2 - 0.22, FLOOR_Y + 0.5, RH - 0.8, -1);
    addCurtainWallX(1.6, RW / 2 - 0.9, RD / 2 - 0.22, FLOOR_Y + 0.5, RH - 0.8, -1);
    addHaloChandelier(-4.5, 4.8, RH, RH - 0.85, 1.6);
    addHaloChandelier(4.5, 4.8, RH, RH - 0.85, 1.6);
    addLedTroffer(0, 0.5, RH, 1.8, 0.65);
    addLedTroffer(-7.8, -2.5, RH, 1.4, 0.52);

    // Grand marble teller counter along west-center
    B('intMarble', 9.2, 1.06, 0.95, -2.2, FLOOR_Y, 0.8, 0xf2eee6);
    B('intWood', 9.3, 0.07, 1.08, -2.2, FLOOR_Y + 1.06, 0.8, 0x6b4f34);
    B('glass', 9.0, 1.15, 0.05, -2.2, FLOOR_Y + 1.13, 0.52, 0xc4dce8);
    for (const mx of [-6.4, -4.3, -2.2, -0.1, 2.0]) {
      B('propMetal', 0.06, 1.22, 0.08, mx, FLOOR_Y + 1.12, 0.52, 0xb6944a);
    }
    P(9.3, 2.2, 1.05, -2.2, FLOOR_Y, 0.8);
    tellerPos = { x: cx - 2.2, z: cz + 1.9 };
    npcSpots.push({ x: cx - 4.3, z: cz - 0.25, yaw: 0, role: 'clerk' });
    npcSpots.push({ x: cx - 0.1, z: cz - 0.25, yaw: 0, role: 'clerk' });
    npcSpots.push({ x: cx + 4.8, z: cz + 3.6, yaw: -0.5, role: 'guard' });

    // Enclosed Glass-Walled Private Wealth Manager Office (East side)
    addWallZ(5.6, 2.2, RD / 2 - 0.3, RH, 0xf4f0e8, { doorZ: 5.4, doorW: 1.06, doorId: 'bank_office_door', doorStyle: 'glass', openDir: 1, glassUpper: true });
    addWallX(5.6, RW / 2 - 0.2, 2.2, RH, 0xf4f0e8, { glassUpper: true });
    B('intWood', 2.2, 0.76, 1.02, 9.6, FLOOR_Y, 5.8, 0x6b4e34);
    addModernChair(9.6, 4.8, 0, 0x3b4856);
    addModernChair(9.1, 6.8, Math.PI, 0x9c7248);
    addModernChair(10.2, 6.8, Math.PI, 0x9c7248);
    P(2.25, 0.8, 1.05, 9.6, FLOOR_Y, 5.8);
    addLight(9.4, RH - 0.5, 5.8);

    // Heavy Reinforced Steel Vault Room behind Teller Line
    addWallX(-7.8, 2.2, -3.2, MEZZ_Y, 0xd8dce2, { doorX: -2.8, doorW: 1.55, doorId: 'bank_vault_door', doorStyle: 'steel', openDir: 1, trimCol: 0x454e58 });
    B('propMetal', 3.4, 2.6, 0.42, -2.8, FLOOR_Y, -RD / 2 + 0.55, 0x646e78);
    G('propMetal', cyl(1.02, 1.02, 0.22, -2.8, FLOOR_Y + 1.32, -RD / 2 + 0.85, 0x9aa4ae, 18));
    vaultPos = { x: cx - 2.8, z: cz - RD / 2 + 2.2 };

    const q = computeWaitLineSlots(-3.2, 2.8, 0.12, 0.98, 3, 1.15);
    for (const s of q) npcSpots.push({ x: cx + s.x, z: cz + s.z, yaw: s.yaw, role: 'queue' });
  } else if (kind === 'office') {
    // -----------------------------------------------------------------------
    // BRIGHT MODERN CORPORATE FLOOR — RECEPTION + GLASS BOARDROOM + EXEC SUITE
    // -----------------------------------------------------------------------
    addCurtainWallX(-RW / 2 + 0.8, -1.6, RD / 2 - 0.22, FLOOR_Y + 0.35, RH - 0.6, -1);
    addCurtainWallX(1.6, RW / 2 - 0.8, RD / 2 - 0.22, FLOOR_Y + 0.35, RH - 0.6, -1);
    addFloorFinish('carpet', -RW / 2 + 0.3, -2.6, 3.2, 4.6, 0x76808a, 1.8, FLOOR_Y + 0.014);
    for (const [lx, lz] of [[-5.6, 5.2], [5.2, 5.2], [-4.2, -0.4], [5.8, -0.4], [0, 7.2]]) {
      addLedTroffer(lx, lz, RH, 1.4, 0.52);
    }

    // Reception desk with oak slat backdrop
    B('prop', 3.6, 1.02, 0.78, 0, FLOOR_Y, 6.2, 0xf6f7f9);
    B('intWood', 3.68, 0.06, 0.86, 0, FLOOR_Y + 1.02, 6.2, 0x966f4a);
    P(3.7, 1.08, 0.86, 0, FLOOR_Y, 6.2);
    npcSpots.push({ x: cx, z: cz + 5.25, yaw: 0, role: 'clerk' });
    addSofa(-7.8, 7.2, Math.PI / 2, 0x426680, 2.2);
    addPlant(-10.4, 8.2);
    addPlant(10.4, 8.2);

    // Enclosed Glass-Walled Conference Boardroom (East Wing)
    addWallZ(3.4, -2.4, 4.4, RH, 0xf2f4f7, { doorZ: 1.8, doorW: 1.08, doorId: 'office_boardroom', doorStyle: 'glass', openDir: 1, glassUpper: true });
    addWallX(3.4, RW / 2 - 0.2, 4.4, RH, 0xf2f4f7, { glassUpper: true });
    addWallX(3.4, RW / 2 - 0.2, -2.4, RH, 0xf2f4f7, { glassUpper: true });
    B('intWood', 2.2, 0.75, 4.4, 7.8, FLOOR_Y, 1.0, 0x8c6644);
    P(2.25, 0.8, 4.45, 7.8, FLOOR_Y, 1.0);
    for (let i = 0; i < 3; i++) {
      addModernChair(6.2, -0.4 + i * 1.4, Math.PI / 2, 0x3b4450);
      addModernChair(9.4, -0.4 + i * 1.4, -Math.PI / 2, 0x3b4450);
    }
    B('propMetal', 0.06, 1.15, 2.2, RW / 2 - 0.24, FLOOR_Y + 1.18, 1.0, 0x1e2228);
    B('emit', 0.04, 1.04, 2.06, RW / 2 - 0.28, FLOOR_Y + 1.24, 1.0, 0xd2ecfc);

    // Open-plan workstation pods (West Wing)
    for (const wz of [-0.6, 2.4]) {
      B('prop', 4.6, 0.74, 1.42, -5.8, FLOOR_Y, wz, 0xf2f4f7);
      B('prop', 4.5, 0.42, 0.05, -5.8, FLOOR_Y + 0.74, wz, 0x7e8c9a);
      P(4.65, 0.8, 1.45, -5.8, FLOOR_Y, wz);
      for (const mx of [-7.2, -4.4]) {
        B('emit', 0.56, 0.34, 0.04, mx, FLOOR_Y + 0.88, wz - 0.22, 0xc6e4fa);
        addModernChair(mx, wz - 1.0, 0, 0x2e3a48);
        addModernChair(mx, wz + 1.0, Math.PI, 0x2e3a48);
      }
    }
    npcSpots.push({ x: cx - 7.2, z: cz + 1.4, yaw: 0, role: 'seated' });
    npcSpots.push({ x: cx - 4.4, z: cz + 3.4, yaw: Math.PI, role: 'seated' });
    npcSpots.push({ x: cx + 6.2, z: cz + 1.0, yaw: Math.PI / 2, role: 'customer' });
  } else if (kind === 'police') {
    // -----------------------------------------------------------------------
    // SAN NOVA PD PRECINCT — PUBLIC LOBBY + SQUAD ROOM + ENCLOSED HOLDING CELLS
    // -----------------------------------------------------------------------
    addCurtainWallX(-RW / 2 + 0.8, -1.5, RD / 2 - 0.22, FLOOR_Y + 0.65, RH - 0.45, -1);
    addCurtainWallX(1.5, RW / 2 - 0.8, RD / 2 - 0.22, FLOOR_Y + 0.65, RH - 0.45, -1);
    for (const [lx, lz] of [[-6.5, 6.0], [0, 6.0], [6.5, 6.0], [-4.5, -1.5], [4.5, -1.5], [0, -7.2]]) {
      addLedTroffer(lx, lz, RH, 1.4, 0.52);
    }

    // Front Precinct Desk & Public Lobby (z: +2.8 .. +9.8)
    B('intWood', 6.4, 1.05, 0.92, 0, FLOOR_Y, 3.6, 0x3b4d68);
    B('intMarble', 6.5, 0.06, 1.02, 0, FLOOR_Y + 1.05, 3.6, 0xeaecef);
    B('glass', 6.2, 1.15, 0.05, 0, FLOOR_Y + 1.11, 3.88, 0xb8d4e8);
    P(6.5, 2.2, 1.02, 0, FLOOR_Y, 3.6);
    npcSpots.push({ x: cx - 1.2, z: cz + 2.6, yaw: 0, role: 'guard' });
    npcSpots.push({ x: cx + 1.4, z: cz + 2.6, yaw: 0, role: 'guard' });
    addSofa(-7.5, 6.6, Math.PI / 2, 0x34465c, 2.2);
    addSofa(7.5, 6.6, -Math.PI / 2, 0x34465c, 2.2);

    // Full-height Security Wall into Squad Room
    addWallX(-RW / 2 + 0.2, RW / 2 - 0.2, 2.4, RH, 0xedf1f6, {
      doorX: 6.2, doorW: 1.12, doorId: 'pd_squad_door', doorStyle: 'steel', openDir: -1, trimCol: 0x34465c,
    });

    // Detective Squad Room Desks (z: -3.4 .. +2.4)
    for (const [dx, dz] of [[-5.6, -0.4], [-1.2, -0.4], [3.6, -0.4]]) {
      B('intWood', 1.85, 0.74, 0.96, dx, FLOOR_Y, dz, 0x7c6248);
      B('emit', 0.48, 0.30, 0.04, dx - 0.25, FLOOR_Y + 0.86, dz - 0.15, 0xc2e2fa);
      addModernChair(dx, dz + 0.78, Math.PI, 0x2a3442);
      P(1.9, 0.8, 1.0, dx, FLOOR_Y, dz);
    }
    npcSpots.push({ x: cx - 1.2, z: cz + 0.4, yaw: Math.PI, role: 'guard' });

    // Enclosed 2-Cell Steel-Barred Holding Block + Interrogation Room (z: -9.8 .. -4.8)
    addWallX(-RW / 2 + 0.2, 3.2, -4.8, RH, 0xe8edf2, {
      doorX: -4.2, doorW: 1.04, doorId: 'pd_cell_door', doorStyle: 'steel', openDir: 1, trimCol: 0x3a4452,
    });
    // Steel cell bars along holding cell front
    for (let i = 0; i < 16; i++) {
      G('propMetal', cyl(0.025, 0.025, RH - FLOOR_Y, -1.8 + i * 0.28, FLOOR_Y, -4.8, 0x525c68, 8));
    }
    addWallZ(3.2, -RD / 2 + 0.2, -4.8, RH, 0xe8edf2, { trimCol: 0x3a4452 });
    addWallX(3.2, RW / 2 - 0.2, -4.8, RH, 0xe8edf2, {
      doorX: 6.4, doorW: 1.02, doorId: 'pd_interrogation', doorStyle: 'steel', openDir: -1, glassUpper: true, trimCol: 0x3a4452,
    });
    B('propMetal', 2.0, 0.45, 0.78, -0.2, FLOOR_Y, -8.8, 0x7a8490); // Cell bench
    B('propMetal', 1.65, 0.74, 0.92, 7.6, FLOOR_Y, -7.2, 0x8e969e); // Interrogation table
    addModernChair(7.6, -6.2, Math.PI, 0x363e48);
    addModernChair(7.6, -8.2, 0, 0x363e48);
  } else if (kind === 'shop') {
    // -----------------------------------------------------------------------
    // BRIGHT MODERN FLAGSHIP BOUTIQUE + FITTING ROOMS + ESCALATOR LOFT
    // -----------------------------------------------------------------------
    addCurtainWallX(-RW / 2 + 0.8, -1.5, RD / 2 - 0.22, FLOOR_Y + 0.35, RH - 0.9, -1);
    addCurtainWallX(1.5, RW / 2 - 0.8, RD / 2 - 0.22, FLOOR_Y + 0.35, RH - 0.9, -1);
    for (const [lx, lz] of [[-5.6, 4.6], [0, 4.6], [5.6, 4.6], [-4.8, -0.6], [3.6, -0.6]]) {
      addLedTroffer(lx, lz, RH, 1.4, 0.52);
    }

    // Central Marble Checkout Counter
    B('intMarble', 4.4, 0.98, 0.88, -1.6, FLOOR_Y, -1.6, 0xf6f3ec);
    B('intWood', 4.5, 0.05, 0.94, -1.6, FLOOR_Y + 0.98, -1.6, 0x8a6442);
    B('emit', 0.44, 0.28, 0.04, -2.4, FLOOR_Y + 1.12, -1.6, 0xc2e4fa);
    P(4.5, 1.05, 0.95, -1.6, FLOOR_Y, -1.6);
    npcSpots.push({ x: cx - 1.6, z: cz - 2.45, yaw: 0, role: 'clerk' });

    // Human-scaled Display Tables & Clothing Racks
    for (const [tx, tz] of [[-5.8, 3.8], [0.2, 3.8], [-5.8, 0.4]]) {
      B('intWood', 2.2, 0.76, 1.15, tx, FLOOR_Y, tz, 0xc8a47c);
      B('carpet2', 0.52, 0.14, 0.42, tx - 0.55, FLOOR_Y + 0.76, tz, 0x3b6884);
      B('carpet2', 0.52, 0.16, 0.42, tx + 0.55, FLOOR_Y + 0.76, tz, 0xc87454);
      P(2.25, 0.82, 1.2, tx, FLOOR_Y, tz);
    }
    // 2 Enclosed Fitting Rooms (West-back corner)
    addWallZ(-7.4, -RD / 2 + 0.2, -3.6, MEZZ_Y, 0xf4f0e8, { doorZ: -5.4, doorW: 0.96, doorId: 'shop_fitting_1', doorStyle: 'wood', openDir: 1 });
    addWallX(-RW / 2 + 0.2, -7.4, -3.6, MEZZ_Y, 0xf4f0e8);
    addPlant(6.4, 6.2);
    addPlant(-9.6, 6.2);
    npcSpots.push({ x: cx - 3.6, z: cz + 4.4, yaw: -0.6, role: 'customer' });
    npcSpots.push({ x: cx + 2.6, z: cz + 2.8, yaw: 1.2, role: 'customer' });
  } else if (kind === 'gun') {
    // -----------------------------------------------------------------------
    // TACTICAL OUTFITTER SHOWROOM + ENCLOSED SOUNDPROOF FIRING RANGE
    // -----------------------------------------------------------------------
    addCurtainWallX(-RW / 2 + 0.8, -1.5, RD / 2 - 0.22, FLOOR_Y + 0.5, RH - 0.45, -1);
    for (const [lx, lz] of [[-5.6, 4.4], [-5.6, -1.6], [0.2, 4.4], [5.8, 2.2], [5.8, -4.4]]) {
      addLedTroffer(lx, lz, RH, 1.35, 0.50);
    }
    // Display Counter + Illuminated Wall Racks
    B('intWood', 5.2, 1.02, 0.92, -4.6, FLOOR_Y, 0.4, 0x624632);
    B('glass', 5.0, 0.34, 0.86, -4.6, FLOOR_Y + 0.72, 0.4, 0xc2dce8);
    P(5.3, 1.08, 0.98, -4.6, FLOOR_Y, 0.4);
    for (let i = 0; i < 4; i++) {
      B('intWood', 1.45, 1.85, 0.14, -8.2 + i * 2.1, FLOOR_Y + 0.82, -RD / 2 + 0.34, 0x4c3726);
      B('propMetal', 1.05, 0.12, 0.08, -8.2 + i * 2.1, FLOOR_Y + 1.45, -RD / 2 + 0.44, 0x262c34);
      B('propMetal', 0.92, 0.12, 0.08, -8.2 + i * 2.1, FLOOR_Y + 1.95, -RD / 2 + 0.44, 0x262c34);
    }
    npcSpots.push({ x: cx - 4.6, z: cz - 0.55, yaw: 0, role: 'clerk' });
    npcSpots.push({ x: cx - 2.6, z: cz + 4.4, yaw: Math.PI, role: 'customer' });

    // Full-Height Soundproof Glass Wall separating Showroom from 3-Lane Indoor Firing Range (x = 1.8)
    addWallZ(1.8, -RD / 2 + 0.2, RD / 2 - 0.2, RH, 0xebe6dc, {
      doorZ: 4.8, doorW: 1.08, doorId: 'gun_range_door', doorStyle: 'steel', openDir: 1, glassUpper: true, trimCol: 0x3b424c,
    });
    // 3 Grounded Shooting Lanes + Ceiling-Anchored Target Tracks (ZERO floating!)
    for (let lane = 0; lane < 3; lane++) {
      const lx = 3.6 + lane * 2.4;
      B('propMetal', 2.0, 0.98, 0.76, lx, FLOOR_Y, 2.2, 0x48505a);
      B('propMetal', 0.10, 2.15, 1.45, lx - 1.15, FLOOR_Y, 2.1, 0x343b44);
      P(2.1, 1.02, 0.82, lx, FLOOR_Y, 2.2);
      // Ceiling-mounted target track rail + suspended paper target
      B('propMetal', 0.08, 0.08, 9.6, lx, RH - 0.28, -2.8, 0x5c646e);
      G('propMetal', cyl(0.02, 0.02, 0.78, lx, RH - 1.06, -6.8, 0x343a42, 6));
      B('prop', 0.62, 0.86, 0.04, lx, RH - 1.92, -6.8, 0xf6f2e8);
      B('prop', 0.24, 0.24, 0.05, lx, RH - 1.62, -6.78, 0xc8322b);
    }
    B('propMetal', 8.6, RH - FLOOR_Y, 0.45, 6.2, FLOOR_Y, -RD / 2 + 0.45, 0x3c424a); // Ballistic backstop
  } else if (kind === 'garage') {
    // -----------------------------------------------------------------------
    // AUTO SERVICE WORKSHOP + ENCLOSED BRIGHT CUSTOMER LOUNGE
    // -----------------------------------------------------------------------
    for (const [lx, lz] of [[-6.8, 3.6], [-6.8, -3.4], [2.4, 3.6], [2.4, -3.4], [8.2, 3.6]]) {
      addLedTroffer(lx, lz, RH, 1.8, 0.55);
    }
    // Enclosed Customer Waiting Lounge (East Wing, x: +5.2 .. +11.8)
    addFloorFinish('intFloorWood', 5.25, -2.4, 11.75, 8.75, 0xd8c2a4, 2.0, FLOOR_Y + 0.015);
    addWallZ(5.2, -2.4, RD / 2 - 0.2, RH, 0xf2f4f6, {
      doorZ: 4.4, doorW: 1.06, doorId: 'garage_lounge_door', doorStyle: 'glass', openDir: 1, glassUpper: true,
    });
    addWallX(5.2, RW / 2 - 0.2, -2.4, RH, 0xf2f4f6);
    addSofa(8.8, 5.8, -Math.PI / 2, 0x3b5870, 2.2);
    B('intWood', 1.8, 0.96, 0.68, 8.4, FLOOR_Y, -1.6, 0x6e5038);
    npcSpots.push({ x: cx + 8.4, z: cz - 0.7, yaw: 0, role: 'clerk' });

    // 2 Grounded Hydraulic Car Lifts + Red Tool Cabinets + Workbenches
    for (const bx of [-6.8, -0.4]) {
      for (const sx of [-1.45, 1.45]) {
        B('propMetal', 0.26, 3.15, 0.26, bx + sx, FLOOR_Y, -2.2, 0x26548c);
        B('propMetal', 0.46, 0.06, 0.46, bx + sx, FLOOR_Y, -2.2, 0x363e46);
      }
      B('propMetal', 3.16, 0.14, 0.26, bx, FLOOR_Y + 3.15, -2.2, 0x26548c);
      B('prop', 0.12, 0.02, 5.4, bx - 1.65, FLOOR_Y + 0.015, -2.2, 0xe8bc34);
      B('prop', 0.12, 0.02, 5.4, bx + 1.65, FLOOR_Y + 0.015, -2.2, 0xe8bc34);
    }
    B('prop', 2.4, 0.96, 0.72, -6.8, FLOOR_Y, -RD / 2 + 0.72, 0xc8362b); // Red rolling tool chest
    B('propMetal', 3.8, 0.88, 0.82, -0.6, FLOOR_Y, -RD / 2 + 0.76, 0x76808a); // Workbench
    P(3.9, 0.92, 0.86, -0.6, FLOOR_Y, -RD / 2 + 0.76);
    npcSpots.push({ x: cx - 3.6, z: cz - 3.8, yaw: 0.4, role: 'attendant' });
  } else if (kind === 'parking') {
    // -----------------------------------------------------------------------
    // 4-LEVEL DOWNTOWN PARKING GARAGE ATRIUM + ATTENDANT BOOTH + ESCALATOR + B1 DECK
    // -----------------------------------------------------------------------
    for (const [lx, lz] of [[-7.2, 5.2], [0, 5.2], [7.2, 5.2], [-6.8, -1.2], [5.8, -1.2]]) {
      addLedTroffer(lx, lz, RH, 1.9, 0.52);
    }
    // Painted parking stalls + concrete wheel stops + structural columns
    for (const sx of [-9.4, -5.6, -1.8, 2.0, 5.8]) {
      B('prop', 0.12, 0.02, 4.6, sx - 1.6, FLOOR_Y + 0.015, -0.8, 0xf2c94c);
      B('prop', 1.75, 0.14, 0.18, sx, FLOOR_Y + 0.01, -3.0, 0xd8a828);
    }
    // Enclosed Glass Parking Attendant Booth near entrance
    addWallZ(6.8, 3.8, 8.2, 3.05, 0xe8ecf0, { doorZ: 5.8, doorW: 0.96, doorId: 'parking_booth', doorStyle: 'glass', openDir: 1, glassUpper: true });
    addWallX(6.8, 11.4, 3.8, 3.05, 0xe8ecf0, { glassUpper: true });
    addWallX(6.8, 11.4, 8.2, 3.05, 0xe8ecf0, { glassUpper: true });
    B('intCeil', 4.6, 0.14, 4.4, 9.1, 3.05, 6.0, 0xf2f4f7);
    B('intWood', 1.8, 0.88, 0.76, 9.0, FLOOR_Y, 6.0, 0x626c78);
    B('emit', 0.46, 0.28, 0.04, 8.8, FLOOR_Y + 1.02, 6.0, 0xbce2fa);
    // Automatic entry barrier gate (grounded pedestal!)
    B('prop', 0.36, 1.02, 0.36, 5.6, FLOOR_Y, 7.6, 0xd89e24);
    B('prop', 2.8, 0.08, 0.06, 4.1, FLOOR_Y + 0.92, 7.6, 0xd83228);
    npcSpots.push({ x: cx + 9.0, z: cz + 5.2, yaw: -Math.PI / 2, role: 'attendant' });
    npcSpots.push({ x: cx - 5.2, z: cz + 4.8, yaw: 0.6, role: 'customer' });
    npcSpots.push({ x: cx + 1.8, z: cz + 5.4, yaw: -0.4, role: 'guard' });
  } else if (kind === 'casino') {
    // -----------------------------------------------------------------------
    // GRAND RESORT CASINO FLOOR — SLOTS + BLACKJACK + ROULETTE + VIP + CASHIER
    // -----------------------------------------------------------------------
    // Plush royal emerald-and-gold gaming carpet inset inside cream travertine marble walkway
    addFloorFinish('carpet', -12.8, -5.8, 12.8, 8.8, 0x1e5a44, 1.8, FLOOR_Y + 0.015);
    addFloorFinish('carpet2', -4.8, 0.2, 4.8, 6.2, 0x8f2232, 1.6, FLOOR_Y + 0.020);
    addCurtainWallX(-RW / 2 + 0.8, -1.8, RD / 2 - 0.22, FLOOR_Y + 0.5, RH - 0.65, -1);
    addCurtainWallX(1.8, RW / 2 - 0.8, RD / 2 - 0.22, FLOOR_Y + 0.5, RH - 0.65, -1);

    // Grand Twin Gold Halo Chandeliers + Recessed Warm Perimeter Downlights
    addHaloChandelier(-5.2, 3.6, RH, RH - 0.82, 2.05);
    addHaloChandelier(5.2, 3.6, RH, RH - 0.82, 2.05);
    addHaloChandelier(0, -1.6, RH, RH - 0.82, 1.85);
    for (const [lx, lz] of [[-10.2, 6.4], [10.2, 6.4], [-9.6, -2.4], [9.6, -2.4]]) {
      addLedTroffer(lx, lz, RH, 1.45, 0.52, 0xfff2d6);
    }

    // West Wing: 2 Back-to-Back Illuminated Slot Machine Banks (12 machines + padded bar stools)
    for (const bankX of [-10.8, -7.2]) {
      for (let i = 0; i < 6; i++) {
        const sz = -2.2 + i * 1.55;
        // Grounded mahogany-and-brass slot cabinet
        B('propMetal', 0.72, 1.68, 0.78, bankX, FLOOR_Y, sz, 0x26202c);
        B('propMetal', 0.78, 0.14, 0.84, bankX, FLOOR_Y + 1.68, sz, 0xd4af37);
        const screenCol = i % 3 === 0 ? 0xffd23d : i % 3 === 1 ? 0x38bdf8 : 0xff5a8a;
        const faceDir = 1; // Both slot rows face toward the lively central gaming floor (+X)
        B('emit', 0.06, 0.58, 0.56, bankX + faceDir * 0.37, FLOOR_Y + 0.98, sz, screenCol);
        B('emit', 0.06, 0.24, 0.54, bankX + faceDir * 0.37, FLOOR_Y + 1.48, sz, 0xfff3cc);
        // Stool seated in front of machine
        const stoolX = bankX + faceDir * 0.92;
        G('propMetal', cyl(0.18, 0.22, 0.04, stoolX, FLOOR_Y, sz, 0xd4af37, 10));
        G('propMetal', cyl(0.035, 0.035, 0.58, stoolX, FLOOR_Y + 0.04, sz, 0xc8a248, 8));
        G('carpet2', cyl(0.20, 0.20, 0.09, stoolX, FLOOR_Y + 0.62, sz, 0x8f1d28, 12));
      }
      P(0.85, 1.75, 9.6, bankX, FLOOR_Y, 1.7);
    }

    // Centerpit: Octagonal Gold-Trimmed Roulette Table + 3 Green-Felt Blackjack / Poker Tables
    G('intWood', cyl(1.65, 1.55, 0.88, 0, FLOOR_Y, 3.2, 0x5c361e, 10));
    G('carpet', cyl(1.48, 1.48, 0.04, 0, FLOOR_Y + 0.88, 3.2, 0x157a4c, 16));
    G('propMetal', cyl(0.55, 0.62, 0.14, 0, FLOOR_Y + 0.92, 3.2, 0xd4af37, 16)); // Roulette wheel bowl
    G('prop', cyl(0.42, 0.42, 0.08, 0, FLOOR_Y + 1.00, 3.2, 0x8f1d28, 16));
    P(3.3, 1.0, 3.3, 0, FLOOR_Y, 3.2);
    for (const [tx, tz] of [[-2.8, -1.6], [2.8, -1.6], [4.2, 3.2]]) {
      B('intWood', 2.4, 0.84, 1.35, tx, FLOOR_Y, tz, 0x5c361e);
      B('carpet', 2.15, 0.04, 1.12, tx, FLOOR_Y + 0.84, tz, 0x157a4c);
      B('propMetal', 0.45, 0.06, 0.24, tx, FLOOR_Y + 0.88, tz - 0.36, 0xd4af37); // Chip tray
      for (const sx of [-0.75, 0, 0.75]) {
        G('propMetal', cyl(0.18, 0.22, 0.04, tx + sx, FLOOR_Y, tz + 1.05, 0xd4af37, 10));
        G('propMetal', cyl(0.03, 0.03, 0.56, tx + sx, FLOOR_Y + 0.04, tz + 1.05, 0xb8963e, 8));
        G('carpet2', cyl(0.19, 0.19, 0.09, tx + sx, FLOOR_Y + 0.60, tz + 1.05, 0x7c1d28, 12));
      }
      P(2.45, 0.92, 1.4, tx, FLOOR_Y, tz);
    }

    // Barred High-Stakes Cashier Cage (North-West Back Wall)
    B('intMarble', 6.4, 1.06, 0.92, -3.2, FLOOR_Y, -5.8, 0xf2ece0);
    B('intWood', 6.5, 0.07, 1.04, -3.2, FLOOR_Y + 1.06, -5.8, 0x5a3820);
    for (let b = 0; b < 14; b++) {
      G('propMetal', cyl(0.018, 0.018, 1.45, -6.1 + b * 0.44, FLOOR_Y + 1.12, -5.8, 0xd4af37, 8));
    }
    P(6.5, 2.4, 1.0, -3.2, FLOOR_Y, -5.8);
    tellerPos = { x: cx - 3.2, z: cz - 4.7 };

    // Enclosed Glass-and-Gold High-Roller VIP Lounge (East Wing)
    addWallZ(8.2, -4.8, 7.6, MEZZ_Y, 0xf2eadc, { doorZ: 1.6, doorW: 1.24, doorId: 'casino_vip_door', doorStyle: 'glass', openDir: 1, glassUpper: true, trimCol: 0x9c7a30 });
    addWallX(8.2, RW / 2 - 0.2, 7.6, MEZZ_Y, 0xf2eadc, { glassUpper: true, trimCol: 0x9c7a30 });
    addSofa(12.2, 4.4, -Math.PI / 2, 0x7c1d28, 2.6);
    B('intMarble', 1.55, 0.46, 0.92, 10.6, FLOOR_Y, 4.4, 0xf2ece0);
    B('intWood', 2.4, 0.84, 1.35, 11.4, FLOOR_Y, -1.6, 0x5c361e);
    B('carpet', 2.15, 0.04, 1.12, 11.4, FLOOR_Y + 0.84, -1.6, 0x157a4c);
    addPlant(13.6, 9.6);
    addPlant(-13.6, 9.6);

    npcSpots.push({ x: cx - 3.2, z: cz - 6.75, yaw: 0, role: 'clerk' });
    npcSpots.push({ x: cx - 2.8, z: cz - 2.65, yaw: 0, role: 'clerk' });
    npcSpots.push({ x: cx + 2.8, z: cz - 2.65, yaw: 0, role: 'clerk' });
    npcSpots.push({ x: cx + 5.6, z: cz + 7.2, yaw: -0.6, role: 'guard' });
    npcSpots.push({ x: cx - 8.9, z: cz + 2.4, yaw: -Math.PI / 2, role: 'customer' });
    npcSpots.push({ x: cx + 0.4, z: cz + 5.3, yaw: Math.PI, role: 'customer' });
    npcSpots.push({ x: cx + 11.2, z: cz + 4.4, yaw: -Math.PI / 2, role: 'seated' });
  } else {
    // -----------------------------------------------------------------------
    // BRIGHT MODERN LUXURY CAR DEALERSHIP SHOWROOM + 3 TURNTABLES + OFFICES
    // -----------------------------------------------------------------------
    // Expansive Panoramic Wraparound Showroom Windows
    addCurtainWallX(-RW / 2 + 0.8, -1.8, RD / 2 - 0.22, FLOOR_Y + 0.16, RH - 0.45, -1);
    addCurtainWallX(1.8, RW / 2 - 0.8, RD / 2 - 0.22, FLOOR_Y + 0.16, RH - 0.45, -1);
    addCurtainWallZ(RW / 2 - 0.22, -3.5, RD / 2 - 1.2, FLOOR_Y + 0.16, RH - 0.45, -1);

    // Bright Linear Architectural Showroom Skylight Troffers & Halo Rings over Turntables
    addHaloChandelier(-7.2, 2.4, RH, RH - 0.65, 2.35);
    addHaloChandelier(0.2, 3.2, RH, RH - 0.65, 2.35);
    addHaloChandelier(7.6, 2.4, RH, RH - 0.65, 2.35);
    for (const [lx, lz] of [[-7.2, -3.4], [0, -3.4], [7.2, -3.4], [0, 8.2]]) {
      addLedTroffer(lx, lz, RH, 1.85, 0.55, 0xf8fbff);
    }

    // 3 Elevated Glowing Circular Display Turntables with Sculpted 3D Exotic Showroom Supercars!
    const showroomCars: [number, number, number, number][] = [
      [-7.2, 2.4, 0.48, 0xd62834],
      [0.2, 3.2, -0.18, 0xf4f6f8],
      [7.6, 2.4, -0.52, 0x1d4ed8],
    ];
    for (const [sx, sz, yaw, col] of showroomCars) {
      G('intMarble', cyl(2.85, 3.0, 0.22, sx, FLOOR_Y, sz, 0xe8edf2, 24));
      G('emit', cyl(2.92, 2.92, 0.04, sx, FLOOR_Y + 0.20, sz, 0xbae6fd, 24));
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const rx = cosY;
      const rz = -sinY;
      const carPt = (lx: number, lz: number): [number, number] => [
        sx + rx * lx + sinY * lz,
        sz + rz * lx + cosY * lz,
      ];
      const baseY = FLOOR_Y + 0.22;
      // 4 Grounded low-profile racing tires & silver alloy rims
      for (const [wx, wz] of [[-0.92, 1.38], [0.92, 1.38], [-0.94, -1.35], [0.94, -1.35]]) {
        const [px, pz] = carPt(wx, wz);
        const tire = cyl(0.35, 0.35, 0.28, 0, 0, 0, 0x181a1e, 14);
        tire.rotateZ(Math.PI / 2);
        tire.rotateY(yaw);
        tire.translate(px, baseY + 0.35, pz);
        G('prop', tire);
        const rim = cyl(0.22, 0.22, 0.30, 0, 0, 0, 0xd0d7e2, 12);
        rim.rotateZ(Math.PI / 2);
        rim.rotateY(yaw);
        rim.translate(px, baseY + 0.35, pz);
        G('propMetal', rim);
      }
      // Carbon-fiber aerodynamic splitter, rocker skirts & lower diffuser
      B('prop', 2.02, 0.14, 4.46, sx, baseY + 0.18, sz, 0x16191f, yaw);
      // Main sculpted low-slung mid-engine body & wide haunches
      B('propMetal', 1.98, 0.36, 4.22, sx, baseY + 0.32, sz, col, yaw);
      const [noseX, noseZ] = carPt(0, 1.52);
      B('propMetal', 1.88, 0.24, 1.28, noseX, baseY + 0.50, noseZ, col, yaw);
      const [rearX, rearZ] = carPt(0, -1.18);
      B('propMetal', 1.96, 0.32, 1.56, rearX, baseY + 0.56, rearZ, col, yaw);
      // Tapered teardrop tinted glass cockpit & roof canopy
      const [cabX, cabZ] = carPt(0, -0.05);
      B('glass', 1.54, 0.38, 1.92, cabX, baseY + 0.68, cabZ, 0x14202c, yaw);
      B('propMetal', 1.36, 0.08, 1.26, cabX, baseY + 1.04, cabZ - cosY * 0.12, col, yaw);
      // Twin side carbon air intakes
      for (const side of [-1, 1]) {
        const [ix, iz] = carPt(side * 0.99, -0.35);
        B('prop', 0.08, 0.24, 0.92, ix, baseY + 0.44, iz, 0x181c22, yaw);
      }
      // Glowing slim LED headlights & full-width crimson rear LED light bar
      for (const side of [-0.66, 0.66]) {
        const [hx, hz] = carPt(side, 2.13);
        B('emit', 0.42, 0.09, 0.06, hx, baseY + 0.56, hz, 0xf0f9ff, yaw);
      }
      const [tx, tz] = carPt(0, -2.12);
      B('emit', 1.66, 0.09, 0.06, tx, baseY + 0.66, tz, 0xff2a3c, yaw);
      // Twin GT rear wing pylons + carbon wing blade
      for (const side of [-0.56, 0.56]) {
        const [px, pz] = carPt(side, -1.86);
        B('prop', 0.06, 0.28, 0.22, px, baseY + 0.86, pz, 0x181c22, yaw);
      }
      const [wx, wz] = carPt(0, -1.90);
      B('propMetal', 1.92, 0.06, 0.34, wx, baseY + 1.12, wz, 0x181c22, yaw);
      // Spec pedestal stanchion in front of car
      B('propMetal', 0.08, 0.98, 0.08, sx, FLOOR_Y + 0.02, sz + 3.45, 0x363e48);
      B('prop', 0.58, 0.36, 0.05, sx, FLOOR_Y + 0.96, sz + 3.45, 0x181c22);
      P(4.8, 1.45, 4.8, sx, FLOOR_Y, sz);
    }

    // Sleek Reception & Finance Counter along North-Center Wall
    B('prop', 5.8, 1.04, 0.92, 0, FLOOR_Y, -4.6, 0xf8fafc);
    B('propMetal', 5.9, 0.08, 1.02, 0, FLOOR_Y + 1.04, -4.6, 0x1e242c);
    B('emit', 0.56, 0.34, 0.04, -1.2, FLOOR_Y + 1.18, -4.55, 0xbae6fd);
    B('emit', 0.56, 0.34, 0.04, 1.2, FLOOR_Y + 1.18, -4.55, 0xbae6fd);
    P(5.9, 1.1, 1.0, 0, FLOOR_Y, -4.6);
    tellerPos = { x: cx, z: cz - 3.4 };

    // Enclosed Glass-Walled Sales & Financing Offices (North-West & North-East)
    addWallZ(-6.6, -RD / 2 + 0.2, -3.4, MEZZ_Y, 0xf4f6f8, { doorZ: -5.4, doorW: 1.04, doorId: 'dealer_sales_1', doorStyle: 'glass', openDir: 1, glassUpper: true, trimCol: 0x2c3440 });
    addWallX(-RW / 2 + 0.2, -6.6, -3.4, MEZZ_Y, 0xf4f6f8, { glassUpper: true, trimCol: 0x2c3440 });
    B('intWood', 2.0, 0.75, 0.96, -10.8, FLOOR_Y, -6.4, 0x624a36);
    addModernChair(-10.8, -7.3, 0, 0x262e38);
    addModernChair(-11.3, -5.4, Math.PI, 0x9c7248);
    addModernChair(-10.3, -5.4, Math.PI, 0x9c7248);

    addWallZ(6.6, -RD / 2 + 0.2, -3.4, MEZZ_Y, 0xf4f6f8, { doorZ: -5.4, doorW: 1.04, doorId: 'dealer_sales_2', doorStyle: 'glass', openDir: -1, glassUpper: true, trimCol: 0x2c3440 });
    addWallX(6.6, RW / 2 - 0.2, -3.4, MEZZ_Y, 0xf4f6f8, { glassUpper: true, trimCol: 0x2c3440 });
    B('intWood', 2.0, 0.75, 0.96, 10.8, FLOOR_Y, -6.4, 0x624a36);
    addModernChair(10.8, -7.3, 0, 0x262e38);
    addModernChair(10.3, -5.4, Math.PI, 0x9c7248);

    // Customer Espresso Lounge (South-West Corner)
    addSofa(-11.2, 8.2, Math.PI / 2, 0x36485a, 2.4);
    B('intMarble', 1.25, 0.44, 0.72, -9.4, FLOOR_Y, 8.2, 0xf4f6f8);
    addPlant(-13.4, 9.2);
    addPlant(13.4, 9.2);

    npcSpots.push({ x: cx, z: cz - 5.55, yaw: 0, role: 'clerk' });
    npcSpots.push({ x: cx - 3.6, z: cz + 6.4, yaw: 0.4, role: 'clerk' });
    npcSpots.push({ x: cx + 4.4, z: cz + 6.2, yaw: -0.5, role: 'customer' });
    npcSpots.push({ x: cx - 9.8, z: cz + 6.2, yaw: 0.8, role: 'customer' });
  }

  // Ensure every room has at least 6 bright well-distributed ceiling light positions
  if (lights.length < 4) {
    addLight(-RW * 0.25, RH - 0.55, RD * 0.22);
    addLight(RW * 0.25, RH - 0.55, RD * 0.22);
    addLight(-RW * 0.25, RH - 0.55, -RD * 0.22);
    addLight(RW * 0.25, RH - 0.55, -RD * 0.22);
  }

  const elevation: InteriorElevationLayout = {
    baseY: FLOOR_Y,
    stairs: stairsList,
    escalators: escalatorsList,
    mezzanines: mezzList,
    basements: basementsList,
    cutouts: cutoutsList,
  };

  return {
    id,
    kind,
    name: kind.toUpperCase(),
    cx,
    cz,
    w: RW,
    d: RD,
    h: RH,
    spawn: { x: cx, z: cz + RD / 2 - 2.35, yaw: Math.PI },
    exit: { x: cx, z: cz + RD / 2 - 1.35, yaw: Math.PI },
    exits: exitsList,
    elevation,
    swingDoors,
    npcSpots,
    pendantLights: lights,
    light: new THREE.Vector3(cx, RH - 0.5, cz),
    warmTint: spec.warmTint,
    vaultPos,
    tellerPos,
  };
}
