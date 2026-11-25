// Unique, handcrafted multi-level furnished interiors for all 9 building kinds:
// Distinct architectural footprints, ceiling heights, flooring/lighting palettes, bespoke furniture & models,
// walkable staircases & mezzanines, ceiling-mounted fixtures (zero floating signs/props), and live wait-lines.
import * as THREE from 'three';
import { box, cone, cyl, finish, flat, flatDown, sign, sph } from './geo';
import { signUV } from './textures';
import {
  InteriorElevationLayout,
  InteriorExitSpec,
  computeWaitLineSlots,
} from './interiorMath';
import type { BCtx, Door } from './buildings';

export type IndoorNpcRole = 'clerk' | 'customer' | 'guard' | 'queue' | 'seated' | 'server' | 'doctor' | 'nurse' | 'chef' | 'attendant';

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
  diner: {
    w: 24, d: 19, h: 5.8, mezzY: 2.74, mezzDepth: 4.8, stairSide: 'right',
    floorMat: 'intFloorWood', floorTint: 0xf0d8be, wallCol: 0xf1e4cc, ceilCol: 0xf6f0e4,
    beamMat: 'intWood', beamCol: 0x5c3e26, warmTint: 0xffd59c, shadeCol: 0x942a26,
  },
  shop: {
    w: 22, d: 17, h: 5.2, mezzY: 2.66, mezzDepth: 4.2, stairSide: 'right',
    floorMat: 'intFloorWood', floorTint: 0xeedcc8, wallCol: 0xede6da, ceilCol: 0xf5f2eb,
    beamMat: 'intWood', beamCol: 0x6b4e34, warmTint: 0xffe8c2, shadeCol: 0x2c4b42,
  },
  bank: {
    w: 28, d: 22, h: 7.0, mezzY: 3.2, mezzDepth: 5.2, stairSide: 'right',
    floorMat: 'intMarble', floorTint: 0xfaf7f0, wallCol: 0xf1eadb, ceilCol: 0xf7f3ea,
    beamMat: 'intWood', beamCol: 0x7a5c32, warmTint: 0xffe0a8, shadeCol: 0x24563f,
  },
  office: {
    w: 26, d: 20, h: 6.2, mezzY: 2.9, mezzDepth: 5.0, stairSide: 'left',
    floorMat: 'intFloorWood', floorTint: 0xe3cfb8, wallCol: 0xe6e8ec, ceilCol: 0xf4f6f8,
    beamMat: 'propMetal', beamCol: 0x3b424c, warmTint: 0xf2f4ff, shadeCol: 0x252c36,
  },
  apartment: {
    w: 18, d: 16, h: 5.4, mezzY: 2.68, mezzDepth: 5.4, stairSide: 'right',
    floorMat: 'intFloorWood', floorTint: 0xe8cfb4, wallCol: 0xeadfd2, ceilCol: 0xf5f0e8,
    beamMat: 'intWood', beamCol: 0x62442c, warmTint: 0xffd8a4, shadeCol: 0x3f5362,
  },
  police: {
    w: 26, d: 20, h: 5.6, mezzY: 2.74, mezzDepth: 4.8, stairSide: 'left',
    floorMat: 'intMarble', floorTint: 0xe4e8ee, wallCol: 0xdfe4ea, ceilCol: 0xf0f3f6,
    beamMat: 'propMetal', beamCol: 0x5c6672, warmTint: 0xd8ecff, shadeCol: 0x223862,
  },
  hospital: {
    w: 26, d: 21, h: 5.6, mezzY: 2.74, mezzDepth: 4.6, stairSide: 'right',
    floorMat: 'intTile', floorTint: 0xf4fafb, wallCol: 0xe2f1f2, ceilCol: 0xf4f9fa,
    beamMat: 'propMetal', beamCol: 0xcbd6dc, warmTint: 0xe2f6ff, shadeCol: 0xd0e2e6,
  },
  gun: {
    w: 24, d: 20, h: 5.6, mezzY: 2.74, mezzDepth: 4.5, stairSide: 'left',
    floorMat: 'intFloorWood', floorTint: 0xd7bfa4, wallCol: 0xded5c8, ceilCol: 0xebe6dc,
    beamMat: 'intWood', beamCol: 0x4b3524, warmTint: 0xffe2b4, shadeCol: 0x3b2c24,
  },
  garage: {
    w: 28, d: 22, h: 6.8, mezzY: 3.1, mezzDepth: 4.8, stairSide: 'right',
    floorMat: 'intTile', floorTint: 0xd8dde2, wallCol: 0xbcc3c8, ceilCol: 0x9aa2a8,
    beamMat: 'propMetal', beamCol: 0x4a5058, warmTint: 0xfff0d4, shadeCol: 0xb8382a,
  },
  parking: {
    w: 32, d: 24, h: 6.8, mezzY: 3.15, mezzDepth: 6.4, stairSide: 'right',
    floorMat: 'intTile', floorTint: 0xc2c8ce, wallCol: 0x9da5ae, ceilCol: 0x89919a,
    beamMat: 'propMetal', beamCol: 0x4b5563, warmTint: 0xf4f8ff, shadeCol: 0x1e3a8a,
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
  npcSpots: IndoorNpcSpot[];
  pendantLights: [number, number, number][];
  light: THREE.Vector3;
  warmTint: number;
  vaultPos?: { x: number; z: number };
  tellerPos?: { x: number; z: number };
}

const FLOOR_Y = 0.26;

export function buildInteriors(c: BCtx): Room[] {
  const rooms: Room[] = [];
  const kinds: Door['kind'][] = ['shop', 'diner', 'office', 'apartment', 'bank', 'police', 'hospital', 'gun', 'garage', 'parking'];
  let idx = 0;
  for (const kind of kinds) {
    for (let variant = 0; variant < 2; variant++) {
      // Positioned cleanly outside the 10km x 10km (-5000..+5000) playable map with generous 60m separation
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

function buildRoom(c: BCtx, kind: Door['kind'], cx: number, cz: number, id: number, variant: number): Room {
  const r = c.rng;
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

  const floorScale = spec.floorMat === 'intFloorWood' ? 2.6 : 2.1;
  const accent =
    kind === 'bank'
      ? 0x8e6e34
      : kind === 'police'
        ? 0x223862
        : kind === 'hospital'
          ? 0x3ca39a
          : kind === 'gun'
            ? 0x7c2a2a
            : kind === 'garage'
              ? 0xb8382a
              : kind === 'office'
                ? 0x2c475c
                : variant
                  ? 0x2b5a49
                  : 0x8a342e;

  // ---------------------------------------------------------------- Floorboards / Marble / Epoxy Subfloor
  B('intWood', RW + 0.6, 0.25, RD + 0.6, 0, 0, 0, 0x3d2c1e);
  c.b.add(
    spec.floorMat,
    flat(
      cx - RW / 2,
      cz - RD / 2,
      cx + RW / 2,
      cz + RD / 2,
      FLOOR_Y,
      (x, z) => [(x - cx) / floorScale, (z - cz) / floorScale],
      spec.floorTint,
    ),
    ch,
  );

  // ---------------------------------------------------------------- Architectural Ceiling & Structural Beams/Trusses
  B('intCeil', RW + 0.4, 0.26, RD + 0.4, 0, RH + 0.02, 0, spec.ceilCol);
  c.b.add(
    'intCeil',
    flatDown(
      cx - RW / 2,
      cz - RD / 2,
      cx + RW / 2,
      cz + RD / 2,
      RH - 0.01,
      (x, z) => [(x - cx) / 2.4, (z - cz) / 2.4],
      spec.ceilCol,
    ),
    ch,
  );
  const beamStep = RD / 4;
  for (let i = 1; i <= 3; i++) {
    const bz = -RD / 2 + i * beamStep;
    B(spec.beamMat, RW - 0.5, kind === 'garage' ? 0.36 : 0.22, 0.26, 0, RH - (kind === 'garage' ? 0.38 : 0.24), bz, spec.beamCol);
  }
  for (const bx of [-RW * 0.26, 0, RW * 0.26]) {
    B(spec.beamMat, 0.24, 0.2, RD - 0.5, bx, RH - 0.22, 0, spec.beamCol);
  }

  // ---------------------------------------------------------------- Perimeter Textured Walls
  B('intWall', RW, RH, 0.42, 0, 0, -RD / 2, spec.wallCol);
  B('intWall', 0.42, RH, RD, -RW / 2, 0, 0, spec.wallCol);
  B('intWall', 0.42, RH, RD, RW / 2, 0, 0, spec.wallCol);
  P(RW, RH, 0.42, 0, 0, -RD / 2);
  P(0.42, RH, RD, -RW / 2, 0, 0);
  P(0.42, RH, RD, RW / 2, 0, 0);

  // Side windows with 4-piece frames & mullions (clean daylight, zero Z-fighting)
  const sideWinZs = [-RD * 0.04, RD * 0.28];
  for (const zoff of sideWinZs) {
    for (const sx of [-1, 1]) {
      if (sx === -1 && zoff > 0) continue; // reserve left front wall for Side Emergency Exit door
      if (kind === 'gun' && sx === 1) continue; // reserve right wall of gun shop for indoor shooting range
      const innerFace = sx * (RW / 2 - 0.22);
      B('emit', 0.04, 1.85, 2.5, innerFace - sx * 0.03, 1.65, zoff, 0xcce6f6);
      B('glass', 0.03, 1.85, 2.5, innerFace - sx * 0.075, 1.65, zoff, 0x3b657d);
      B('intTrim', 0.16, 0.1, 2.8, innerFace - sx * 0.06, 1.56, zoff, 0x6a4b30);
      B('intTrim', 0.14, 0.11, 2.76, innerFace - sx * 0.05, 3.5, zoff, 0x6a4b30);
      B('intTrim', 0.14, 2.04, 0.11, innerFace - sx * 0.05, 1.58, zoff - 1.32, 0x6a4b30);
      B('intTrim', 0.14, 2.04, 0.11, innerFace - sx * 0.05, 1.58, zoff + 1.32, 0x6a4b30);
      B('intTrim', 0.08, 1.86, 0.07, innerFace - sx * 0.08, 1.64, zoff, 0x593e28);
    }
  }

  // Front wall with glazed entrance double-doors, brass crash push-bars, storefront windows & welcome mat
  const doorHalfW = kind === 'garage' ? 3.8 : 2.8;
  for (const s of [-1, 1]) {
    const seg = RW / 2 - doorHalfW;
    const fx = s * (doorHalfW + seg / 2);
    B('intWall', seg, RH, 0.42, fx, 0, RD / 2, spec.wallCol);
    P(seg, RH, 0.42, fx, 0, RD / 2);
    if (seg > 2.4 && kind !== 'garage') {
      const fw = seg - 1.2;
      B('emit', fw, 2.25, 0.04, fx, 1.48, RD / 2 - 0.24, 0xbcd8ea);
      B('glass', fw, 2.25, 0.03, fx, 1.48, RD / 2 - 0.285, 0x264858);
      B('intTrim', fw + 0.22, 0.1, 0.14, fx, 1.38, RD / 2 - 0.26, 0x5c422c);
      B('intTrim', fw + 0.22, 0.1, 0.14, fx, 3.74, RD / 2 - 0.26, 0x5c422c);
      for (const ms of [-1, 0, 1]) {
        B('intTrim', 0.09, 2.38, 0.12, fx + ms * (fw * 0.48), 1.42, RD / 2 - 0.26, 0x5c422c);
      }
    }
  }
  const doorH = kind === 'garage' ? 4.2 : 3.05;
  B('intWall', doorHalfW * 2, RH - doorH, 0.42, 0, doorH, RD / 2, spec.wallCol);
  if (kind === 'garage') {
    // Corrugated steel roll-up garage bay door
    B('propMetal', doorHalfW * 2 - 0.2, doorH - FLOOR_Y, 0.16, 0, FLOOR_Y, RD / 2 - 0.2, 0x5a6068);
    for (let k = 0; k < 8; k++) {
      B('propMetal', doorHalfW * 2 - 0.3, 0.06, 0.22, 0, FLOOR_Y + 0.35 + k * 0.46, RD / 2 - 0.22, 0x3a3f46);
    }
    B('prop', doorHalfW * 2 + 0.4, 0.18, 0.28, 0, doorH, RD / 2 - 0.18, 0xd4a428);
  } else {
    B('glass', doorHalfW * 2 - 0.4, doorH - FLOOR_Y - 0.05, 0.14, 0, FLOOR_Y, RD / 2 - 0.2, 0x264854);
    B('intTrim', 0.22, doorH, 0.28, -doorHalfW + 0.12, FLOOR_Y, RD / 2 - 0.15, 0x5c422c);
    B('intTrim', 0.22, doorH, 0.28, doorHalfW - 0.12, FLOOR_Y, RD / 2 - 0.15, 0x5c422c);
    B('intTrim', doorHalfW * 2 + 0.1, 0.22, 0.28, 0, doorH + 0.05, RD / 2 - 0.15, 0x5c422c);
    B('propMetal', 0.08, doorH - FLOOR_Y, 0.1, 0, FLOOR_Y, RD / 2 - 0.22, 0x454a50);
    B('propMetal', doorHalfW - 0.85, 0.09, 0.1, -doorHalfW * 0.46, 1.25, RD / 2 - 0.36, 0xd9b84a);
    B('propMetal', doorHalfW - 0.85, 0.09, 0.1, doorHalfW * 0.46, 1.25, RD / 2 - 0.36, 0xd9b84a);
    B('carpet', 3.4, 0.03, 1.45, 0, FLOOR_Y, RD / 2 - 1.15, 0x2a2d34);
  }
  P(doorHalfW * 2 + 0.4, RH, 0.5, 0, 0, RD / 2);

  // Backlit EXIT sign helper (always mounted flush on wall!)
  const mountExitSign = (x: number, y: number, z: number, yaw: number) => {
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    B('propMetal', 1.05, 0.42, 0.16, x, y - 0.21, z, 0x1c2228, yaw);
    c.b.add('intExitSign', sign(0.96, 0.34, cx + x + nx * 0.09, y, cz + z + nz * 0.09, yaw, [0, 0, 1, 1], 0xffffff), ch);
  };
  // Ceiling-suspended sign helper (ALWAYS has twin steel downrods connecting to ceiling — NEVER floats!)
  const mountHangingSign = (x: number, y: number, z: number, w: number, h: number, uvLabel: string, yaw = 0) => {
    const topY = y + h / 2;
    const rodLen = Math.max(0.25, RH - topY);
    const s = Math.sin(yaw), co = Math.cos(yaw);
    B('propMetal', w + 0.16, h + 0.12, 0.12, x, y - h / 2 - 0.06, z, 0x20242a, yaw);
    for (const side of [-1, 1]) {
      const rx = x + co * side * (w * 0.38);
      const rz = z - s * side * (w * 0.38);
      G('propMetal', cyl(0.025, 0.025, rodLen, rx, topY, rz, 0x2b3038, 8));
      G('propMetal', cyl(0.075, 0.075, 0.05, rx, RH - 0.05, rz, 0x24282e, 10));
    }
    const nx = Math.sin(yaw), nz = Math.cos(yaw);
    c.b.add('sign', sign(w, h, cx + x + nx * 0.08, y, cz + z + nz * 0.08, yaw, signUV(uvLabel)), ch);
  };

  // Front Main Entrance EXIT sign
  mountExitSign(0, doorH + 0.55, RD / 2 - 0.34, Math.PI);

  // Side Ground-Floor Emergency Exit Door (left wall)
  const sideExitZ = RD * 0.28;
  B('propMetal', 0.16, 2.4, 1.42, -RW / 2 + 0.27, FLOOR_Y, sideExitZ, 0x3b444e);
  B('intTrim', 0.2, 2.5, 1.58, -RW / 2 + 0.23, FLOOR_Y, sideExitZ, 0x5c422c);
  B('propMetal', 0.12, 0.09, 1.0, -RW / 2 + 0.39, 1.25, sideExitZ, 0xd6362c);
  B('carpet', 1.15, 0.03, 1.45, -RW / 2 + 0.94, FLOOR_Y, sideExitZ, 0x2d3038);
  mountExitSign(-RW / 2 + 0.32, 3.0, sideExitZ, Math.PI / 2);

  // Baseboards, wainscot rail, and crown molding
  const trimCol = kind === 'garage' || kind === 'hospital' || kind === 'police' ? 0x626b74 : 0x73563c;
  for (const z of [-RD / 2 + 0.24, RD / 2 - 0.24]) {
    B('intTrim', RW - 0.8, 0.22, 0.1, 0, FLOOR_Y, z, trimCol);
    B('intTrim', RW - 0.8, 0.08, 0.08, 0, 1.15, z, trimCol);
    B('intTrim', RW - 0.8, 0.16, 0.16, 0, RH - 0.22, z, 0xbdb3a0);
  }
  for (const x of [-RW / 2 + 0.24, RW / 2 - 0.24]) {
    B('intTrim', 0.1, 0.22, RD - 0.8, x, FLOOR_Y, 0, trimCol);
    B('intTrim', 0.08, 0.08, RD - 0.8, x, 1.15, 0, trimCol);
    B('intTrim', 0.14, 0.16, RD - 0.8, x, RH - 0.22, 0, 0xbdb3a0);
  }

  // ---------------------------------------------------------------- Sculpted 3D Pendant Chandeliers & Ceiling Downlights
  const pendantLights: [number, number, number][] = [];
  const pendantFixture = (x: number, z: number, dropLen: number, shadeCol: number) => {
    const canopyY = RH - 0.07;
    const shadeY = RH - dropLen;
    G('propMetal', cyl(0.14, 0.16, 0.08, x, canopyY - 0.04, z, 0x2a2c32, 12));
    G('propMetal', cyl(0.025, 0.025, dropLen, x, shadeY, z, 0x30333a, 8));
    G('propMetal', cone(0.44, 0.32, x, shadeY - 0.08, z, shadeCol, 16));
    G('propMetal', cyl(0.12, 0.14, 0.1, x, shadeY + 0.2, z, 0xc8a44c, 12));
    c.b.add('emit', sph(0.18, cx + x, shadeY - 0.06, cz + z, spec.warmTint, 1, 0.85, 1, 10), ch);
    pendantLights.push([cx + x, shadeY - 0.35, cz + z]);
  };
  const pxSpan = RW * 0.24;
  pendantFixture(-pxSpan, RD * 0.18, Math.min(1.4, RH - 4.0), spec.shadeCol);
  pendantFixture(pxSpan, RD * 0.18, Math.min(1.4, RH - 4.0), spec.shadeCol);
  pendantFixture(-pxSpan, -RD * 0.08, Math.min(1.4, RH - 4.0), spec.shadeCol);
  pendantFixture(pxSpan, -RD * 0.08, Math.min(1.4, RH - 4.0), spec.shadeCol);
  pendantFixture(-pxSpan * 0.85, -RD / 2 + spec.mezzDepth * 0.5, Math.max(0.55, RH - MEZZ_Y - 2.3), spec.shadeCol);
  pendantFixture(pxSpan * 0.85, -RD / 2 + spec.mezzDepth * 0.5, Math.max(0.55, RH - MEZZ_Y - 2.3), spec.shadeCol);

  for (const lx of [-RW * 0.35, 0, RW * 0.35]) {
    for (const lz of [-RD * 0.34, 0, RD * 0.34]) {
      G('propMetal', cyl(0.2, 0.2, 0.06, lx, RH - 0.07, lz, 0x353840, 12));
      G('emit', cyl(0.14, 0.14, 0.04, lx, RH - 0.09, lz, spec.warmTint, 12));
    }
  }

  // ---------------------------------------------------------------- Walkable Staircase & Upper Mezzanine (Left or Right per Kind!)
  const mezzZ0 = -RD / 2 + 0.22;
  const mezzZ1 = mezzZ0 + spec.mezzDepth;
  const mezzX0 = -RW / 2 + 0.22;
  const mezzX1 = RW / 2 - 0.22;
  const stairW = 2.85;
  const stairRunLen = 4.6;
  const stairX0 = spec.stairSide === 'right' ? mezzX1 - stairW : mezzX0;
  const stairX1 = spec.stairSide === 'right' ? mezzX1 : mezzX0 + stairW;
  const stairZ0 = mezzZ1;
  const stairZ1 = mezzZ1 + stairRunLen;

  // Mezzanine slab + hardwood/steel top
  B(spec.beamMat, mezzX1 - mezzX0, 0.24, mezzZ1 - mezzZ0, (mezzX0 + mezzX1) / 2, MEZZ_Y - 0.25, (mezzZ0 + mezzZ1) / 2, spec.beamCol);
  c.b.add(
    kind === 'garage' ? 'intTile' : 'intFloorWood',
    flat(
      cx + mezzX0,
      cz + mezzZ0,
      cx + mezzX1,
      cz + mezzZ1,
      MEZZ_Y,
      (x, z) => [(x - cx) / 2.6, (z - cz) / 2.6],
      kind === 'garage' ? 0xcad0d6 : 0xeedbc4,
    ),
    ch,
  );
  // Support columns cleanly placed along mezzanine edge
  const colPositions = [-RW * 0.46, -RW * 0.16, RW * 0.16, RW * 0.46];
  for (const colX of colPositions) {
    if (colX > stairX0 - 0.3 && colX < stairX1 + 0.3) continue;
    B(spec.beamMat, 0.32, MEZZ_Y - FLOOR_Y, 0.32, colX, FLOOR_Y, mezzZ1 - 0.18, spec.beamCol);
    B('propMetal', 0.4, 0.12, 0.4, colX, FLOOR_Y, mezzZ1 - 0.18, 0x343840);
    c.world.addCircle(cx + colX, cz + mezzZ1 - 0.18, 0.22, MEZZ_Y, 'column');
  }
  // Mezzanine safety railing (stops cleanly at staircase opening)
  const railStart = spec.stairSide === 'right' ? mezzX0 : stairX1 + 0.1;
  const railEnd = spec.stairSide === 'right' ? stairX0 - 0.1 : mezzX1;
  const railW = Math.max(2, railEnd - railStart);
  const railCx = (railStart + railEnd) / 2;
  B('glass', railW, 0.94, 0.06, railCx, MEZZ_Y + 0.04, mezzZ1 - 0.06, 0x456e80);
  B(spec.beamMat, railW + 0.1, 0.09, 0.14, railCx, MEZZ_Y + 1.0, mezzZ1 - 0.06, spec.beamCol);
  for (let px = railStart + 0.2; px <= railEnd - 0.15; px += 2.2) {
    B('propMetal', 0.08, 1.02, 0.08, px, MEZZ_Y, mezzZ1 - 0.06, 0x353942);
  }
  for (const ax of [-RW * 0.3, 0, RW * 0.3]) {
    B('emit', 2.2, 0.05, 0.2, ax, MEZZ_Y - 0.27, (mezzZ0 + mezzZ1) / 2, spec.warmTint);
  }

  // Walkable 12-tread Staircase
  const steps = 12;
  const stairCx = (stairX0 + stairX1) / 2;
  const stepRun = (stairZ1 - stairZ0) / steps;
  const stepRise = (MEZZ_Y - FLOOR_Y) / steps;
  const innerRailX = spec.stairSide === 'right' ? stairX0 + 0.06 : stairX1 - 0.06;
  const wallRailX = spec.stairSide === 'right' ? stairX1 - 0.06 : stairX0 + 0.06;
  for (let i = 0; i < steps; i++) {
    const sy = FLOOR_Y + i * stepRise;
    const sz = stairZ1 - (i + 0.5) * stepRun;
    B(spec.beamMat, stairW, stepRise, stepRun * 0.92, stairCx, sy, sz, spec.beamCol);
    B(kind === 'garage' ? 'propMetal' : 'intFloorWood', stairW + 0.04, 0.055, stepRun + 0.06, stairCx, sy + stepRise - 0.03, sz + 0.02, kind === 'garage' ? 0x6f7780 : 0xf2dfc8);
    B('propMetal', 0.055, 0.96, 0.055, innerRailX, sy + stepRise, sz, 0x353a42);
    B(spec.beamMat, 0.1, 0.07, stepRun + 0.16, innerRailX, sy + stepRise + 0.94, sz, spec.beamCol);
    B(spec.beamMat, 0.08, 0.07, stepRun + 0.14, wallRailX, sy + stepRise + 0.94, sz, spec.beamCol);
  }
  B(spec.beamMat, 0.16, 1.18, 0.16, innerRailX, FLOOR_Y, stairZ1 + 0.05, spec.beamCol);
  c.world.addCircle(cx + innerRailX, cz + stairZ1 + 0.05, 0.16, 1.5, 'newel');

  // Upper Mezzanine Fire Exit (opposite side of staircase when stair is on left, or left wall otherwise)
  const upExitSide = spec.stairSide === 'left' ? 1 : -1;
  const upExitX = upExitSide * (RW / 2 - 0.27);
  const upExitZ = (mezzZ0 + mezzZ1) / 2;
  B('propMetal', 0.16, 2.3, 1.36, upExitX, MEZZ_Y, upExitZ, 0x3b444e);
  B('intTrim', 0.2, 2.4, 1.52, upExitX - upExitSide * 0.04, MEZZ_Y, upExitZ, 0x5c422c);
  B('propMetal', 0.12, 0.09, 0.96, upExitX - upExitSide * 0.12, MEZZ_Y + 1.0, upExitZ, 0xd6362c);
  mountExitSign(upExitX - upExitSide * 0.08, MEZZ_Y + 2.52, upExitZ, upExitSide === -1 ? Math.PI / 2 : -Math.PI / 2);

  // Back wall brand accent fascia & flush-mounted wall signage
  B('intAccent', RW - 1, 0.42, 0.12, 0, RH - 0.68, -RD / 2 + 0.28, accent);
  const label =
    kind === 'bank'
      ? 'BANK'
      : kind === 'police'
        ? 'POLICE'
        : kind === 'hospital'
          ? 'HOSPITAL'
          : kind === 'gun'
            ? 'AMMO'
            : kind === 'garage'
              ? 'PAY N SPRAY'
              : kind === 'diner'
                ? r.pick(['DINER', 'CAFE', 'PIZZA', 'BURGERS'])
                : kind === 'apartment'
                  ? 'HOTEL'
                  : r.pick(['24H MART', 'PHARMACY', 'COFFEE', 'RECORDS', 'BOOKS']);
  c.b.add('sign', sign(5.0, 1.2, cx, Math.min(RH - 1.45, MEZZ_Y + 1.65), cz - RD / 2 + 0.43, 0, signUV(label)), ch);
  // Wall security camera cleanly bracketed to corner
  B('propMetal', 0.14, 0.14, 0.35, -RW / 2 + 0.35, RH - 1.05, -RD / 2 + 0.48, 0x262a30);
  B('propMetal', 0.42, 0.18, 0.2, -RW / 2 + 0.55, RH - 1.08, -RD / 2 + 0.72, 0xd8dcdc, 0.55);
  c.b.add('red', sph(0.05, cx - RW / 2 + 0.68, RH - 1.1, cz - RD / 2 + 0.82, 0xff3030), ch);

  const npcSpots: IndoorNpcSpot[] = [];

  // ---------------------------------------------------------------- Reusable Grounded Furniture Kits
  const counter = (x: number, z: number, len: number, ry = 0, col = accent, baseY = FLOOR_Y) => {
    B('intWood', len, 1.04, 0.88, x, baseY, z, col, ry);
    B('intMarble', len + 0.24, 0.09, 1.04, x, baseY + 1.04, z, 0xf2eee4, ry);
    B('intTrim', len, 0.12, 0.08, x, baseY + 0.2, z + 0.45 * Math.cos(ry), 0xc8b99e, ry);
    if (baseY < 1.0) P(Math.abs(Math.cos(ry)) > 0.5 ? len : 1.04, 1.15, Math.abs(Math.cos(ry)) > 0.5 ? 1.04 : len, x, baseY, z);
  };

  const stanchionLine = (x0: number, z0: number, x1: number, z1: number, posts = 4, ropeCol = 0x7c1c28) => {
    for (let i = 0; i < posts; i++) {
      const t = posts > 1 ? i / (posts - 1) : 0;
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      G('propMetal', cyl(0.17, 0.19, 0.05, px, FLOOR_Y, pz, 0xc8a44a, 12));
      G('propMetal', cyl(0.032, 0.036, 0.92, px, FLOOR_Y + 0.05, pz, 0xd8b454, 10));
      c.b.add('propMetal', sph(0.052, cx + px, FLOOR_Y + 0.99, cz + pz, 0xe2c262, 1, 1, 1, 8), ch);
      if (i < posts - 1) {
        const nx = x0 + (x1 - x0) * ((i + 1) / (posts - 1));
        const nz = z0 + (z1 - z0) * ((i + 1) / (posts - 1));
        const segLen = Math.hypot(nx - px, nz - pz);
        const yaw = Math.atan2(nx - px, nz - pz);
        B('carpet2', 0.055, 0.065, Math.max(0.2, segLen - 0.1), (px + nx) / 2, FLOOR_Y + 0.8, (pz + nz) / 2, ropeCol, yaw);
      }
    }
  };

  const addWaitLine = (anchorX: number, anchorZ: number, stepDirX: number, stepDirZ: number, count: number, withRopes = true) => {
    const slots = computeWaitLineSlots(cx + anchorX, cz + anchorZ, stepDirX, stepDirZ, count, 1.08);
    for (const s of slots) npcSpots.push({ x: s.x, z: s.z, y: FLOOR_Y, yaw: s.yaw, role: 'queue' });
    if (withRopes && count >= 2) {
      const len = Math.hypot(stepDirX, stepDirZ) || 1;
      const dx = stepDirX / len, dz = stepDirZ / len;
      const px = -dz, pz = dx;
      const run = (count - 1) * 1.08 + 0.45;
      for (const side of [-0.72, 0.72]) {
        stanchionLine(
          anchorX - dx * 0.22 + px * side, anchorZ - dz * 0.22 + pz * side,
          anchorX + dx * run + px * side, anchorZ + dz * run + pz * side,
          Math.max(3, Math.min(5, count)),
        );
      }
    }
  };

  const sofa = (x: number, z: number, ry: number, col = 0x3b5566, w = 2.6, baseY = FLOOR_Y) => {
    B('intWood', w, 0.16, 0.96, x, baseY + 0.14, z, 0x5d412a, ry);
    B('carpet2', w - 0.36, 0.22, 0.84, x, baseY + 0.3, z, col, ry);
    const s = Math.sin(ry), co = Math.cos(ry);
    const rot = (lx: number, lz: number): [number, number] => [x + lx * co + lz * s, z - lx * s + lz * co];
    const [bx, bz] = rot(0, -0.38);
    B('carpet2', w - 0.16, 0.56, 0.24, bx, baseY + 0.44, bz, col, ry);
    for (const side of [-1, 1]) {
      const [ax, az] = rot(side * (w / 2 - 0.14), 0.04);
      B('carpet2', 0.24, 0.46, 0.9, ax, baseY + 0.26, az, col, ry);
      const [px, pz] = rot(side * (w / 2 - 0.48), -0.18);
      B('carpet', 0.34, 0.32, 0.16, px, baseY + 0.52, pz, 0xdcb464, ry + side * 0.25);
    }
    if (baseY < 1.0) P(Math.abs(co) > 0.5 ? w : 1.0, 0.95, Math.abs(co) > 0.5 ? 1.0 : w, x, baseY, z);
  };

  const coffeeTable = (x: number, z: number, w = 1.5, d = 0.8, baseY = FLOOR_Y) => {
    B('intWood', w, 0.07, d, x, baseY + 0.46, z, 0x7a5738);
    B('intWood', w - 0.18, 0.05, d - 0.18, x, baseY + 0.2, z, 0x5c4028);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      B('intWood', 0.07, 0.46, 0.07, x + sx * (w / 2 - 0.1), baseY, z + sz * (d / 2 - 0.1), 0x4d3420);
    }
    B('prop', 0.34, 0.05, 0.24, x - 0.25, baseY + 0.53, z + 0.06, 0x2c6ca0, 0.2);
    G('prop', cyl(0.055, 0.05, 0.11, x + 0.28, baseY + 0.53, z - 0.05, 0xf2f0eb, 8));
    if (baseY < 1.0) P(w, 0.55, d, x, baseY, z);
  };

  const floorLamp = (x: number, z: number, baseY = FLOOR_Y) => {
    G('propMetal', cyl(0.22, 0.26, 0.05, x, baseY, z, 0x3b3d42, 12));
    G('propMetal', cyl(0.03, 0.035, 1.72, x, baseY + 0.05, z, 0xb8964c, 8));
    G('carpet2', cyl(0.18, 0.32, 0.36, x, baseY + 1.62, z, 0xf3e7cc, 14));
    B('emit', 0.22, 0.14, 0.22, x, baseY + 1.68, z, 0xffe4a8);
    if (baseY < 1.0) c.world.addCircle(cx + x, cz + z, 0.24, 2.0, 'lamp');
  };

  const plant = (x: number, z: number, baseY = FLOOR_Y) => {
    G('prop', cyl(0.32, 0.25, 0.56, x, baseY, z, 0xb06a3a, 10));
    c.b.add('prop', sph(0.54, cx + x, baseY + 0.92, cz + z, 0x3a7a30, 1, 1.15, 1, 8), ch);
    c.b.add('prop', sph(0.42, cx + x + 0.16, baseY + 1.24, cz + z - 0.1, 0x4f8f3a, 1, 1.2, 1, 8), ch);
    if (baseY < 1.0) c.world.addCircle(cx + x, cz + z, 0.32, 1.5, 'plant');
  };

  const officeDesk = (x: number, z: number, ry = 0, baseY = FLOOR_Y, dualMonitor = false) => {
    B('intWood', 2.2, 0.08, 1.05, x, baseY + 0.74, z, 0x8c7054, ry);
    B('intWood', 0.55, 0.74, 0.96, x - 0.76, baseY, z, 0x6d563f, ry);
    B('intWood', 0.55, 0.74, 0.96, x + 0.76, baseY, z, 0x6d563f, ry);
    const offsets = dualMonitor ? [-0.36, 0.36] : [0];
    for (const ox of offsets) {
      B('prop', 0.62, 0.38, 0.06, x + ox, baseY + 0.92, z - 0.22, 0x1c1e22, ry);
      B('emit', 0.56, 0.31, 0.02, x + ox, baseY + 0.96, z - 0.18, 0x7cc8f0, ry);
      B('propMetal', 0.08, 0.16, 0.08, x + ox, baseY + 0.8, z - 0.22, 0x454a52, ry);
    }
    B('prop', 0.48, 0.03, 0.18, x, baseY + 0.82, z + 0.14, 0x26282c, ry);
    B('propMetal', 0.08, 0.44, 0.08, x, baseY, z + 0.85, 0x33363b);
    B('carpet2', 0.54, 0.1, 0.52, x, baseY + 0.44, z + 0.85, 0x2a3644);
    B('carpet2', 0.52, 0.58, 0.1, x, baseY + 0.52, z + 1.08, 0x2a3644);
    if (baseY < 1.0) P(2.2, 1.1, 1.1, x, baseY, z);
  };

  const diningBooth = (x: number, z: number, baseY = FLOOR_Y, leatherCol = 0x9b2626) => {
    // Glossy chrome pedestal table + twin tufted leather diner benches
    G('propMetal', cyl(0.32, 0.38, 0.06, x, baseY, z, 0xc8d0d8, 12));
    G('propMetal', cyl(0.08, 0.08, 0.72, x, baseY + 0.06, z, 0xd8dfe6, 10));
    B('intMarble', 1.85, 0.07, 1.1, x, baseY + 0.76, z, 0xf6f2e8);
    B('propMetal', 1.9, 0.05, 1.14, x, baseY + 0.74, z, 0xc8d0d8);
    // Condiment caddy & tabletop menu
    B('prop', 0.14, 0.22, 0.14, x - 0.55, baseY + 0.83, z, 0xc0392b);
    B('prop', 0.14, 0.2, 0.14, x - 0.35, baseY + 0.83, z, 0xe8b923);
    for (const sz of [-0.96, 0.96]) {
      B('intWood', 1.85, 0.42, 0.58, x, baseY, z + sz, 0x4b3320);
      B('carpet2', 1.8, 0.12, 0.54, x, baseY + 0.42, z + sz, leatherCol);
      B('carpet2', 1.82, 0.72, 0.16, x, baseY + 0.48, z + sz + Math.sign(sz) * 0.26, leatherCol);
    }
    if (baseY < 1.0) P(1.9, 0.95, 2.5, x, baseY, z);
  };

  const shelfGondola = (x: number, z: number, len: number, h: number, baseY = FLOOR_Y) => {
    B('intWood', len, h, 0.62, x, baseY, z, 0x6c5844);
    for (let l = 0; l < 4; l++) {
      const sy = baseY + 0.48 + l * (h - 0.55) / 4;
      B('intWood', len - 0.08, 0.06, 0.68, x, sy, z, 0x8a7358);
      for (let i = 0; i < Math.floor(len / 0.52); i++) {
        const px = -len / 2 + 0.38 + i * 0.52;
        B('prop', 0.34, 0.32, 0.32, x + px, sy + 0.06, z, r.pick([0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x7d3c98, 0xe8e8e8]));
      }
    }
    if (baseY < 1.0) P(len, h, 0.7, x, baseY, z);
  };

  const vendingMachine = (x: number, z: number, baseY = FLOOR_Y) => {
    B('propMetal', 1.15, 2.1, 0.85, x, baseY, z, 0xb82424);
    B('emit', 0.92, 1.25, 0.05, x, baseY + 0.68, z + 0.44, 0xffe8a6);
    B('prop', 0.88, 0.26, 0.1, x, baseY + 0.22, z + 0.44, 0x1a1c20);
    if (baseY < 1.0) P(1.15, 2.1, 0.85, x, baseY, z);
  };

  // ---------------------------------------------------------------- BESPOKE LAYOUT PER INTERIOR KIND
  switch (kind) {
    case 'diner': {
      // Classic Vice/Leonida Coastal Restaurant & Full Commercial Kitchen:
      // Front dining hall with checkered tile, chrome stools, booths, wait line, jukebox;
      // Rear Commercial Kitchen behind pass-through warming window with flat-top grill, range burners,
      // stainless exhaust hood, deep fryers, prep island, twin walk-in fridges, dishwashing sink & chefs!
      B('intTile', 11.5, 0.025, 11.5, 4.2, FLOOR_Y, 1.2, 0xf2ece0);
      // Hygienic commercial quarry tile floor in kitchen zone
      B('intTile', 12.2, 0.028, 7.6, -5.2, FLOOR_Y, -5.0, 0xd8dfe6);

      // Front service & pass-through counter separating dining from kitchen
      counter(-5.2, 0.4, 9.2, 0, 0x882c26);
      // Overhead stainless pass-through shelf & glowing amber heat lamps
      B('propMetal', 8.4, 0.12, 0.45, -5.2, FLOOR_Y + 2.05, 0.35, 0xcad2d9);
      B('emit', 7.6, 0.06, 0.14, -5.2, FLOOR_Y + 1.97, 0.35, 0xffaa44);
      for (const px of [-9.2, -1.2]) {
        B('propMetal', 0.12, 1.0, 0.12, px, FLOOR_Y + 1.08, 0.35, 0xadb5bd);
      }
      // Chrome diner counter stools facing the counter
      for (let i = 0; i < 4; i++) {
        const sx = -8.4 + i * 1.9;
        G('propMetal', cyl(0.2, 0.24, 0.05, sx, FLOOR_Y, 1.55, 0xc8d0d8, 12));
        G('propMetal', cyl(0.05, 0.05, 0.68, sx, FLOOR_Y + 0.05, 1.55, 0xd8dfe6, 10));
        G('carpet2', cyl(0.24, 0.24, 0.1, sx, FLOOR_Y + 0.72, 1.55, 0x9b2626, 12));
      }
      // Espresso bar + glass pastry case + POS register
      B('propMetal', 1.2, 0.68, 0.62, -8.4, FLOOR_Y + 1.12, 0.35, 0xd4dade);
      B('prop', 0.5, 0.36, 0.38, -5.8, FLOOR_Y + 1.12, 0.4, 0x1f2228);
      B('emit', 0.34, 0.18, 0.04, -5.8, FLOOR_Y + 1.24, 0.58, 0xffe4a0);
      B('propMetal', 2.2, 0.58, 0.78, -2.0, FLOOR_Y + 1.12, 0.4, 0xcfd6dc);
      B('glass', 2.1, 0.52, 0.72, -2.0, FLOOR_Y + 1.16, 0.4, 0x345a6b);
      B('emit', 1.85, 0.05, 0.5, -2.0, FLOOR_Y + 1.62, 0.4, 0xfff0c4);

      // --- COMMERCIAL RESTAURANT KITCHEN (back-left under mezzanine) ---
      // Kitchen partition half-wall with swinging double-door entry on right of kitchen
      B('intTile', 0.2, 2.35, 5.2, -0.3, FLOOR_Y, -6.4, 0xe8eef2);
      B('propMetal', 0.1, 1.55, 1.05, -0.3, FLOOR_Y + 0.42, -3.1, 0xc2cbd2); // Swinging kitchen door
      B('glass', 0.14, 0.42, 0.36, -0.3, FLOOR_Y + 1.38, -3.1, 0x2a4554); // Porthole window on kitchen door
      P(0.28, 2.35, 5.2, -0.3, FLOOR_Y, -6.4);

      // Back cooking line: Commercial Flat-Top Grill, 4-Burner Range, Dual Deep Fryers & Exhaust Hood
      B('propMetal', 7.4, 0.92, 1.15, -5.6, FLOOR_Y, -RD / 2 + 1.05, 0xbec6ce);
      // Glowing stove burners & flat-top griddle plate + cast-iron skillets & stockpot
      B('propMetal', 2.6, 0.08, 0.85, -7.2, FLOOR_Y + 0.92, -RD / 2 + 1.05, 0x363b42);
      for (const [bx, bz] of [[-5.0, -RD / 2 + 0.85], [-4.2, -RD / 2 + 0.85], [-5.0, -RD / 2 + 1.25], [-4.2, -RD / 2 + 1.25]]) {
        G('emit', cyl(0.18, 0.18, 0.04, bx, FLOOR_Y + 0.94, bz, 0xff6b2b, 12));
      }
      G('propMetal', cyl(0.24, 0.22, 0.34, -5.0, FLOOR_Y + 0.97, -RD / 2 + 0.85, 0xd4dce3, 12)); // Stainless stockpot
      G('propMetal', cyl(0.2, 0.16, 0.09, -4.2, FLOOR_Y + 0.97, -RD / 2 + 1.25, 0x24282e, 12)); // Cast-iron skillet
      // Dual Deep Fryers with baskets
      B('propMetal', 1.4, 0.95, 1.05, -2.5, FLOOR_Y, -RD / 2 + 1.05, 0xa8b2bc);
      B('prop', 0.48, 0.06, 0.56, -2.8, FLOOR_Y + 0.94, -RD / 2 + 1.05, 0xd99b26);
      B('prop', 0.48, 0.06, 0.56, -2.2, FLOOR_Y + 0.94, -RD / 2 + 1.05, 0xd99b26);
      // Full-width brushed stainless overhead exhaust hood + warm kitchen task light
      B('propMetal', 7.8, 0.68, 1.55, -5.6, MEZZ_Y - 0.85, -RD / 2 + 1.15, 0xc8d0d8);
      B('emit', 7.0, 0.05, 0.22, -5.6, MEZZ_Y - 0.88, -RD / 2 + 1.05, 0xfff5d6);
      P(7.8, 1.0, 1.2, -5.6, FLOOR_Y, -RD / 2 + 1.05);

      // Center Stainless Prep Island with cutting board, stacked plates & garnish trays
      B('propMetal', 4.6, 0.9, 1.15, -5.6, FLOOR_Y, -4.3, 0xcad2da);
      B('intWood', 1.1, 0.06, 0.65, -6.8, FLOOR_Y + 0.9, -4.3, 0xd4a373); // Butcher block cutting board
      G('prop', cyl(0.22, 0.22, 0.24, -4.4, FLOOR_Y + 0.9, -4.3, 0xf8fafc, 12)); // Stack of white dinner plates
      G('prop', cyl(0.2, 0.2, 0.18, -3.8, FLOOR_Y + 0.9, -4.3, 0xf8fafc, 12));
      B('prop', 0.95, 0.12, 0.45, -5.5, FLOOR_Y + 0.9, -4.55, 0x2f855a); // Fresh prep garnish tray
      P(4.7, 0.95, 1.2, -5.6, FLOOR_Y, -4.3);

      // Twin Commercial Walk-In / Reach-In Stainless Refrigerators & Dishwashing Triple Sink along left kitchen wall
      B('propMetal', 1.15, 2.28, 2.4, -RW / 2 + 0.95, FLOOR_Y, -7.2, 0xd2dae2);
      B('propMetal', 0.08, 0.72, 0.08, -RW / 2 + 1.56, FLOOR_Y + 1.05, -6.7, 0x4a5568);
      B('propMetal', 0.08, 0.72, 0.08, -RW / 2 + 1.56, FLOOR_Y + 1.05, -7.7, 0x4a5568);
      P(1.2, 2.3, 2.5, -RW / 2 + 0.95, FLOOR_Y, -7.2);
      // Triple Dishwashing Sink with curved chrome faucet & dish rack
      B('propMetal', 1.0, 0.92, 2.6, -RW / 2 + 0.9, FLOOR_Y, -3.9, 0xb8c2cc);
      B('propMetal', 0.06, 0.52, 0.06, -RW / 2 + 0.62, FLOOR_Y + 0.92, -3.9, 0xe2e8f0);
      B('propMetal', 0.34, 0.06, 0.06, -RW / 2 + 0.76, FLOOR_Y + 1.42, -3.9, 0xe2e8f0);
      P(1.05, 1.0, 2.7, -RW / 2 + 0.9, FLOOR_Y, -3.9);

      mountHangingSign(-5.2, 3.85, 0.35, 4.2, 0.96, label === 'BURGERS' ? 'DINER' : 'BURGERS', 0);

      // Restaurant Wait Line Queue with velvet stanchions
      addWaitLine(-4.6, 2.7, 0.32, 0.94, 5, true);

      // Retro Tufted Leather Booths (main dining hall + upstairs mezzanine)
      diningBooth(4.2, 3.8, FLOOR_Y, 0x9b2626);
      diningBooth(4.2, -0.6, FLOOR_Y, 0x266350);
      diningBooth(3.2, -6.8, FLOOR_Y, 0x9b2626);
      diningBooth(-5.6, -6.8, MEZZ_Y, 0x9b2626);
      diningBooth(1.4, -6.8, MEZZ_Y, 0x266350);
      floorLamp(-9.8, -7.2, MEZZ_Y);

      // Neon Retro Jukebox
      B('intWood', 1.2, 1.9, 0.84, 10.4, FLOOR_Y, 5.6, 0x5c341c);
      B('emit', 0.92, 0.88, 0.1, 10.4, FLOOR_Y + 0.78, 5.14, 0xff6ac2);
      B('emit', 0.82, 0.4, 0.1, 10.4, FLOOR_Y + 0.25, 5.14, 0x5ae2ff);
      plant(10.4, 2.4);
      plant(-10.4, 7.6);

      // Restaurant & Kitchen Staff + Diners
      npcSpots.push({ x: cx - 6.8, z: cz - 0.85, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx - 3.6, z: cz - 0.85, y: FLOOR_Y, yaw: 0.1, role: 'server' });
      npcSpots.push({ x: cx - 6.2, z: cz - 6.9, y: FLOOR_Y, yaw: Math.PI, role: 'chef' });
      npcSpots.push({ x: cx - 3.8, z: cz - 5.9, y: FLOOR_Y, yaw: 0.2, role: 'chef' });
      npcSpots.push({ x: cx + 4.2 - 0.45, z: cz + 3.8 + 0.96, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      npcSpots.push({ x: cx + 4.2 + 0.45, z: cz + 3.8 - 0.96, y: FLOOR_Y, yaw: 0, role: 'seated' });
      npcSpots.push({ x: cx + 4.2 - 0.4, z: cz - 0.6 - 0.96, y: FLOOR_Y, yaw: 0, role: 'seated' });
      npcSpots.push({ x: cx - 5.6, z: cz - 6.8 + 0.96, y: MEZZ_Y, yaw: Math.PI, role: 'seated' });
      npcSpots.push({ x: cx + 1.4, z: cz - 6.8 - 0.96, y: MEZZ_Y, yaw: 0, role: 'seated' });
      break;
    }

    case 'shop': {
      // Boutique Urban Market: L-shaped checkout counter, 3 timber merchandising aisles,
      // glowing cold-beverage wall coolers, display pedestal island & upstairs lounge
      counter(-5.0, 1.2, 7.0, 0, accent);
      B('prop', 0.52, 0.36, 0.38, -6.2, FLOOR_Y + 1.13, 1.2, 0x24262a);
      B('emit', 0.3, 0.14, 0.24, -6.2, FLOOR_Y + 1.2, 1.06, 0x9fffc0);
      B('prop', 0.52, 0.36, 0.38, -3.2, FLOOR_Y + 1.13, 1.2, 0x24262a);
      addWaitLine(-4.8, 2.7, 0.3, 0.95, 4, true);

      shelfGondola(3.2, 2.4, 5.2, 2.05);
      shelfGondola(3.2, -1.2, 5.2, 2.05);
      shelfGondola(-4.6, -6.0, 5.6, 2.05);
      // Glowing cold beverage coolers along back-right wall
      B('propMetal', 4.4, 2.2, 1.0, 3.8, FLOOR_Y, -RD / 2 + 0.95, 0xd4dbe0);
      B('glass', 4.1, 1.65, 0.08, 3.8, FLOOR_Y + 0.34, -RD / 2 + 1.48, 0x24404f);
      B('emit', 3.9, 1.38, 0.04, 3.8, FLOOR_Y + 0.48, -RD / 2 + 1.43, 0xc8f4ff);
      P(4.4, 2.2, 1.0, 3.8, FLOOR_Y, -RD / 2 + 0.95);
      vendingMachine(-9.4, 1.2);
      plant(9.2, 6.2);
      plant(-9.2, 6.6);
      // Mezzanine stockroom & manager desk
      officeDesk(-4.8, -6.4, 0, MEZZ_Y, false);
      shelfGondola(2.2, -6.6, 4.4, 1.9, MEZZ_Y);

      npcSpots.push({ x: cx - 6.0, z: cz - 0.1, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx - 3.2, z: cz - 0.1, y: FLOOR_Y, yaw: 0.15, role: 'clerk' });
      npcSpots.push({ x: cx + 2.0, z: cz + 0.6, y: FLOOR_Y, yaw: 1.2, role: 'customer' });
      npcSpots.push({ x: cx + 4.8, z: cz + 4.2, y: FLOOR_Y, yaw: -0.6, role: 'customer' });
      npcSpots.push({ x: cx - 1.2, z: cz - 5.8, y: MEZZ_Y, yaw: 0.2, role: 'customer' });
      break;
    }

    case 'bank': {
      // Grand Monumental Financial Hall: Tall fluted marble columns, 3-bay brass teller arcade,
      // heavy open circular steel vault door + gleaming gold bullion cart, executive gallery mezzanine!
      B('intMarble', RW - 4, 0.04, 8.5, 0, FLOOR_Y, 2.6, 0xf7f2e6);
      // Fluted marble grand columns rising full ceiling height
      for (const cxCol of [-10.6, 10.6]) {
        for (const czCol of [-1.2, 4.8]) {
          G('intMarble', cyl(0.46, 0.52, RH - FLOOR_Y, cxCol, FLOOR_Y, czCol, 0xf2ece0, 16));
          B('intMarble', 1.2, 0.28, 1.2, cxCol, FLOOR_Y, czCol, 0xe6dfd0);
          B('intMarble', 1.25, 0.3, 1.25, cxCol, RH - 0.34, czCol, 0xe6dfd0);
          c.world.addCircle(cx + cxCol, cz + czCol, 0.58, RH, 'column');
        }
      }
      // 3 Mahogany & Brass Ballistic Teller Windows
      for (let i = 0; i < 3; i++) {
        const x = -7.6 + i * 5.6;
        counter(x, -2.0, 4.6, 0, 0x694e2c);
        B('glass', 4.0, 1.85, 0.12, x, FLOOR_Y + 1.12, -2.35, 0x1c3440);
        B('propMetal', 2.8, 0.32, 0.12, x, FLOOR_Y + 2.1, -2.28, 0xd9b84a);
        B('emit', 1.6, 0.1, 0.06, x, FLOOR_Y + 2.32, -2.26, 0xffe4a8);
      }
      addWaitLine(-4.2, 0.8, 0.3, 0.95, 5, true);

      // Massive Open Circular Steel Bank Vault Door + Gold Bullion Cart inside back-left alcove
      B('propMetal', 4.6, 2.8, 0.5, -9.2, FLOOR_Y, -RD / 2 + 0.72, 0x7a8086);
      G('propMetal', cyl(1.22, 1.22, 0.28, -9.2, FLOOR_Y + 1.4, -RD / 2 + 1.02, 0x5c6268, 20).rotateX(Math.PI / 2));
      G('propMetal', cyl(0.46, 0.46, 0.36, -9.2, FLOOR_Y + 1.4, -RD / 2 + 1.12, 0xd8b44c, 12).rotateX(Math.PI / 2));
      // Gold bullion bars stacked on armored trolley near vault
      B('propMetal', 1.4, 0.45, 0.85, -4.6, FLOOR_Y + 0.15, -RD / 2 + 2.2, 0x3b4046);
      for (let g = 0; g < 6; g++) {
        B('propMetal', 0.36, 0.16, 0.22, -5.0 + (g % 3) * 0.42, FLOOR_Y + 0.62 + Math.floor(g / 3) * 0.17, -RD / 2 + 2.2, 0xe8bc38);
      }
      sofa(6.2, 5.6, Math.PI, 0x6e2d2d, 3.0);
      coffeeTable(6.2, 3.8, 1.6, 0.75);
      floorLamp(9.2, 6.2);
      // Executive mezzanine
      officeDesk(-5.6, -8.2, 0, MEZZ_Y, true);
      sofa(2.4, -8.2, 0, 0x6e2d2d, 3.0, MEZZ_Y);

      // Glowing NovaBank Self-Service ATM Terminal near lobby entrance
      B('propMetal', 0.95, 2.05, 0.72, 9.8, FLOOR_Y, 1.4, 0x16242b);
      B('emit', 0.68, 0.56, 0.06, 9.8, FLOOR_Y + 1.24, 1.78, 0x18f2a2);
      B('propMetal', 0.72, 0.14, 0.24, 9.8, FLOOR_Y + 0.88, 1.84, 0xc8d2da);
      P(0.95, 2.05, 0.72, 9.8, FLOOR_Y, 1.4);

      npcSpots.push({ x: cx - 7.6, z: cz - 3.3, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx - 2.0, z: cz - 3.3, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx + 3.6, z: cz - 3.3, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx + 2.6, z: cz + 0.9, y: FLOOR_Y, yaw: 0.4, role: 'guard' });
      npcSpots.push({ x: cx - 9.8, z: cz + 5.2, y: FLOOR_Y, yaw: 0.8, role: 'guard' });
      npcSpots.push({ x: cx + 6.2, z: cz + 5.5, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      npcSpots.push({ x: cx + 2.4, z: cz - 8.1, y: MEZZ_Y, yaw: 0, role: 'seated' });
      break;
    }

    case 'office': {
      // Sleek San Nova Tech & Brokerage HQ: walnut acoustic slat wall, reception monolith,
      // glass-walled boardroom with oval conference table, dual-monitor trading desks!
      // Walnut acoustic slat feature wall behind reception
      for (let i = 0; i < 14; i++) {
        B('intWood', 0.12, 3.2, 0.12, -3.6 + i * 0.56, FLOOR_Y, -RD / 2 + 0.35, 0x6b4a2e);
      }
      counter(0, 3.4, 7.6, 0, 0x263846);
      B('emit', 6.8, 0.08, 0.08, 0, FLOOR_Y + 0.92, 3.88, 0x70d8ff);
      addWaitLine(-1.2, 5.1, 0.85, 0.52, 3, true);

      // Frosted-glass conference room on right side with oval conference table & 6 chairs
      B('glass', 0.12, 3.4, 7.4, 4.4, FLOOR_Y, -0.6, 0x3b687e);
      B('propMetal', 0.16, 3.5, 0.16, 4.4, FLOOR_Y, -4.3, 0x282d34);
      B('propMetal', 0.16, 3.5, 0.16, 4.4, FLOOR_Y, 3.1, 0x282d34);
      B('intWood', 2.4, 0.09, 5.2, 8.6, FLOOR_Y + 0.74, -0.6, 0x5c3e26);
      B('propMetal', 0.45, 0.74, 3.6, 8.6, FLOOR_Y, -0.6, 0x2a2f36);
      P(2.5, 0.9, 5.3, 8.6, FLOOR_Y, -0.6);
      for (const sx of [-1.65, 1.65]) {
        for (const sz of [-1.6, 0, 1.6]) {
          B('carpet2', 0.55, 0.48, 0.55, 8.6 + sx, FLOOR_Y, -0.6 + sz, 0x243444);
          B('carpet2', 0.1, 0.58, 0.52, 8.6 + sx + Math.sign(sx) * 0.24, FLOOR_Y + 0.46, -0.6 + sz, 0x243444);
        }
      }
      // Dual-monitor trading workstations under mezzanine
      for (let i = 0; i < 3; i++) officeDesk(-6.8 + i * 4.8, -7.2, 0, FLOOR_Y, true);
      // Mezzanine lounge & executive desks
      sofa(6.2, -7.4, 0, 0x2d4354, 3.4, MEZZ_Y);
      coffeeTable(6.2, -5.8, 1.6, 0.8, MEZZ_Y);
      officeDesk(-1.8, -7.4, 0, MEZZ_Y, true);
      plant(11.0, 7.6);
      plant(-11.0, 7.6);

      npcSpots.push({ x: cx, z: cz + 2.1, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx + 8.6 - 1.65, z: cz - 0.6, y: FLOOR_Y, yaw: Math.PI / 2, role: 'seated' });
      npcSpots.push({ x: cx + 8.6 + 1.65, z: cz - 2.2, y: FLOOR_Y, yaw: -Math.PI / 2, role: 'seated' });
      npcSpots.push({ x: cx + 6.2, z: cz - 7.3, y: MEZZ_Y, yaw: 0, role: 'seated' });
      npcSpots.push({ x: cx - 3.6, z: cz + 1.4, y: FLOOR_Y, yaw: -0.5, role: 'customer' });
      break;
    }

    case 'apartment': {
      // Stylish Split-Level Coastal Penthouse Loft: cozy living sectional + woven rug + TV wall,
      // granite kitchen island with barstools, and elevated UPSTAIRS MASTER BEDROOM LOFT!
      B('carpet', 6.8, 0.03, 5.4, 3.4, FLOOR_Y, 2.2, 0x864d3e);
      sofa(3.4, 0.6, 0, 0x3b5c6e, 3.4);
      sofa(6.0, 2.6, -Math.PI / 2, 0x3b5c6e, 2.2);
      coffeeTable(3.4, 2.4, 1.6, 0.85);
      // Floating media console & widescreen OLED TV on front-right wall
      B('intWood', 3.0, 0.56, 0.65, 3.4, FLOOR_Y, 5.6, 0x4f3928);
      B('prop', 2.2, 1.25, 0.08, 3.4, FLOOR_Y + 0.88, 5.68, 0x16181c);
      B('emit', 2.06, 1.12, 0.04, 3.4, FLOOR_Y + 0.94, 5.64, 0x3c76a8);
      floorLamp(6.6, 0.5);

      // Granite Kitchen Island & stainless fridge on left side
      counter(-4.4, 1.8, 4.8, 0, 0x6b4d34);
      for (const sx of [-5.6, -4.4, -3.2]) {
        G('propMetal', cyl(0.18, 0.2, 0.04, sx, FLOOR_Y, 3.0, 0x2c3038, 10));
        G('propMetal', cyl(0.04, 0.04, 0.72, sx, FLOOR_Y + 0.04, 3.0, 0x2c3038, 8));
        B('intWood', 0.42, 0.08, 0.42, sx, FLOOR_Y + 0.74, 3.0, 0x8b623c);
      }
      B('propMetal', 1.05, 2.25, 0.95, -7.8, FLOOR_Y, 1.6, 0xd4dade);
      // Study nook under mezzanine
      officeDesk(-4.6, -5.6, 0, FLOOR_Y, false);
      plant(-7.4, 6.2);

      // UPSTAIRS LOFT MASTER BEDROOM (King bed, headboard, pillows, nightstands & wardrobe!)
      B('intWood', 3.6, 0.42, 2.8, -3.2, MEZZ_Y, -5.4, 0x5c3e26);
      B('intWood', 3.8, 1.3, 0.2, -3.2, MEZZ_Y, -6.9, 0x4b311e);
      B('carpet2', 3.4, 0.3, 2.6, -3.2, MEZZ_Y + 0.42, -5.35, 0xf0eae0);
      B('carpet2', 3.35, 0.2, 1.65, -3.2, MEZZ_Y + 0.62, -4.85, 0x2e5874);
      B('carpet', 0.85, 0.18, 0.52, -4.1, MEZZ_Y + 0.72, -6.35, 0xffffff);
      B('carpet', 0.85, 0.18, 0.52, -2.3, MEZZ_Y + 0.72, -6.35, 0xffffff);
      floorLamp(-6.0, -6.4, MEZZ_Y);
      B('intWood', 2.4, 2.1, 0.7, 2.2, MEZZ_Y, -7.2, 0x62442c);

      npcSpots.push({ x: cx + 3.4, z: cz + 0.7, y: FLOOR_Y, yaw: 0, role: 'seated' });
      npcSpots.push({ x: cx - 3.6, z: cz + 3.6, y: FLOOR_Y, yaw: -0.6, role: 'customer' });
      npcSpots.push({ x: cx - 0.8, z: cz - 1.2, y: FLOOR_Y, yaw: 0.4, role: 'customer' });
      npcSpots.push({ x: cx + 0.6, z: cz - 4.4, y: MEZZ_Y, yaw: 0.2, role: 'customer' });
      break;
    }

    case 'police': {
      // San Nova PD Precinct: Ballistic booking desk, hanging precinct banner with ceiling rods,
      // detective bullpen desks + evidence corkboards, twin steel-barred holding cells with metal bunks!
      counter(-2.0, 2.6, 8.6, 0, 0x1e3358);
      B('glass', 8.0, 1.35, 0.1, -2.0, FLOOR_Y + 1.12, 2.22, 0x244256);
      mountHangingSign(-2.0, 3.85, 2.4, 4.6, 1.0, 'POLICE', 0);
      addWaitLine(-2.0, 4.3, 0.3, 0.95, 3, true);

      // Detective bullpen desks & cork evidence board on right side
      officeDesk(7.4, 1.2, 0, FLOOR_Y, true);
      officeDesk(7.4, -2.6, 0, FLOOR_Y, false);
      B('intWood', 0.14, 1.6, 3.2, RW / 2 - 0.34, FLOOR_Y + 1.25, -0.8, 0xa87c4f);

      // Twin Steel-Barred Holding Cells under back-right mezzanine
      for (const cellX of [1.8, 7.2]) {
        for (let i = 0; i < 8; i++) {
          B('propMetal', 0.08, MEZZ_Y - FLOOR_Y - 0.24, 0.08, cellX - 2.1 + i * 0.6, FLOOR_Y, -RD / 2 + 4.4, 0x8a929a);
        }
        B('propMetal', 2.2, 0.45, 0.95, cellX, FLOOR_Y, -RD / 2 + 1.4, 0x6f7780);
        G('propMetal', cyl(0.24, 0.2, 0.55, cellX + 1.6, FLOOR_Y, -RD / 2 + 1.2, 0xd8dfe6, 12));
        P(4.4, 2.4, 0.3, cellX, FLOOR_Y, -RD / 2 + 4.4);
      }
      // Captain's briefing mezzanine upstairs
      officeDesk(-4.8, -7.4, 0, MEZZ_Y, true);
      officeDesk(4.6, -7.4, 0, MEZZ_Y, false);
      sofa(6.4, 6.2, Math.PI, 0x223862, 3.0);
      vendingMachine(-11.4, 1.0);

      npcSpots.push({ x: cx - 3.2, z: cz + 1.2, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx - 0.6, z: cz + 1.2, y: FLOOR_Y, yaw: 0.1, role: 'guard' });
      npcSpots.push({ x: cx + 3.4, z: cz + 2.4, y: FLOOR_Y, yaw: -0.4, role: 'guard' });
      npcSpots.push({ x: cx + 6.4, z: cz + 6.1, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      npcSpots.push({ x: cx + 1.6, z: cz - 6.8, y: MEZZ_Y, yaw: 0, role: 'guard' });
      break;
    }

    case 'hospital': {
      // Modern San Nova Medical Center:
      // Dedicated Front Hospital Waiting Room (3 linked rows of medical waiting chairs, magazine coffee table,
      // wall-mounted TV & triage queue display, wheelchair, water cooler, hand-sanitizer dispenser, vending machine),
      // Glass-screened Triage Check-in Desk with monitors, 3 privacy-curtained ER Exam Bays with hospital beds/IV/ECG,
      // medical supply cabinets, and full medical staff (doctors, nurses, triage clerk, security guard, waiting patients)!
      counter(-4.4, 2.6, 8.4, 0, 0x2b8a83);
      // Protective glass triage sneeze guard + dual check-in monitors
      B('glass', 7.8, 1.05, 0.08, -4.4, FLOOR_Y + 1.12, 2.15, 0x38bdf8);
      for (const mx of [-6.4, -2.6]) {
        B('prop', 0.56, 0.42, 0.06, mx, FLOOR_Y + 1.18, 2.55, 0x1e242b);
        B('emit', 0.48, 0.34, 0.04, mx, FLOOR_Y + 1.22, 2.59, 0x7dd3fc);
      }
      mountHangingSign(-4.4, 3.85, 2.4, 4.6, 1.0, 'HOSPITAL', 0);
      addWaitLine(-4.6, 4.3, 0.28, 0.96, 4, true);

      // --- DEDICATED HOSPITAL WAITING ROOM ZONE (right half: x = +2.2..+11.4, z = +0.4..+8.2) ---
      // Soft hygienic waiting-room floor mat
      B('carpet', 9.2, 0.025, 7.6, 6.8, FLOOR_Y, 4.2, 0x457b87);
      // Helper for linked 4-seat medical waiting room bench rows
      const waitingRow = (rx: number, rz: number, faceDir: 1 | -1) => {
        B('propMetal', 4.4, 0.1, 0.14, rx, FLOOR_Y + 0.36, rz, 0x94a3b8); // Horizontal steel beam
        for (const lx of [-1.9, 1.9]) {
          B('propMetal', 0.1, 0.38, 0.52, rx + lx, FLOOR_Y, rz, 0x64748b);
        }
        for (let s = 0; s < 4; s++) {
          const sx = rx - 1.65 + s * 1.1;
          B('carpet2', 0.86, 0.1, 0.54, sx, FLOOR_Y + 0.42, rz, 0x2b6cb0); // Padded blue waiting seat
          B('carpet2', 0.86, 0.54, 0.1, sx, FLOOR_Y + 0.46, rz - faceDir * 0.24, 0x2b6cb0); // Backrest
          B('propMetal', 0.06, 0.2, 0.42, sx - 0.46, FLOOR_Y + 0.48, rz, 0x94a3b8); // Armrest
        }
        P(4.5, 0.95, 0.65, rx, FLOOR_Y, rz);
      };
      waitingRow(6.6, 6.4, -1); // Back waiting row facing TV/triage
      waitingRow(6.6, 2.0, 1);  // Front waiting row facing magazine table
      waitingRow(6.6, 0.2, -1); // Back-to-back middle waiting row
      // Magazine Coffee Table between waiting rows with colorful brochures
      coffeeTable(6.6, 4.2, 2.4, 0.9);
      B('prop', 0.36, 0.04, 0.28, 6.0, FLOOR_Y + 0.5, 4.2, 0xe11d48);
      B('prop', 0.36, 0.04, 0.28, 6.6, FLOOR_Y + 0.5, 4.1, 0x0ea5e9);
      B('prop', 0.36, 0.04, 0.28, 7.2, FLOOR_Y + 0.5, 4.3, 0x10b981);

      // Wall-mounted Waiting Room TV & Queue Status Screen on right wall
      B('prop', 0.12, 1.45, 2.6, RW / 2 - 0.32, FLOOR_Y + 1.95, 4.2, 0x111827);
      B('emit', 0.08, 1.25, 2.38, RW / 2 - 0.38, FLOOR_Y + 2.05, 4.2, 0x38bdf8);
      // Cold Water Cooler Dispenser + Snack Vending Machine + Wheelchair parked by waiting room entrance
      B('prop', 0.52, 1.05, 0.52, 11.4, FLOOR_Y, 7.6, 0xf1f5f9);
      G('glass', cyl(0.2, 0.2, 0.58, 11.4, FLOOR_Y + 1.05, 7.6, 0x38bdf8, 12));
      vendingMachine(11.3, 1.2);
      // Wheelchair next to waiting chairs
      B('propMetal', 0.68, 0.52, 0.68, 2.4, FLOOR_Y + 0.28, 6.2, 0x334155);
      B('carpet2', 0.62, 0.56, 0.08, 2.4, FLOOR_Y + 0.64, 6.52, 0x1e293b);
      for (const wx of [-0.38, 0.38]) {
        G('propMetal', cyl(0.32, 0.32, 0.06, 2.4 + wx, FLOOR_Y + 0.32, 6.25, 0x94a3b8, 14).rotateZ(Math.PI / 2));
      }

      // --- 3 PRIVACY-CURTAINED ER TREATMENT BAYS & MEDICAL CABINETS (back-left under mezzanine) ---
      for (let i = 0; i < 3; i++) {
        const bx = -9.4 + i * 3.8;
        B('propMetal', 1.15, 0.72, 2.2, bx, FLOOR_Y, -7.2, 0xcfd6dc);
        B('carpet2', 1.05, 0.2, 2.08, bx, FLOOR_Y + 0.72, -7.2, 0x8ad4ce);
        B('prop', 0.62, 0.2, 0.45, bx, FLOOR_Y + 0.92, -8.0, 0xffffff);
        // IV drip stand + glowing ECG vitals monitor
        G('propMetal', cyl(0.22, 0.22, 0.04, bx + 0.95, FLOOR_Y, -7.7, 0x9aa4ae, 10));
        G('propMetal', cyl(0.025, 0.025, 1.85, bx + 0.95, FLOOR_Y + 0.04, -7.7, 0xc8d0d8, 8));
        B('propMetal', 0.46, 0.42, 0.22, bx - 0.92, FLOOR_Y + 1.15, -7.9, 0x262c32);
        B('emit', 0.38, 0.28, 0.04, bx - 0.92, FLOOR_Y + 1.22, -7.78, 0x4dff9e);
        // Privacy divider curtain
        if (i < 2) B('carpet2', 0.08, 2.0, 2.6, bx + 1.9, FLOOR_Y + 0.25, -7.2, 0xa8d8d6);
        P(1.25, 1.0, 2.3, bx, FLOOR_Y, -7.2);
      }
      // Medical supply cabinets & wall red-cross emblem along back wall
      B('propMetal', 3.4, 2.05, 0.72, 2.4, FLOOR_Y, -RD / 2 + 0.85, 0xe2eef2);
      B('prop', 0.26, 0.9, 0.06, 2.4, FLOOR_Y + 1.05, -RD / 2 + 1.24, 0xdc2626);
      B('prop', 0.9, 0.26, 0.06, 2.4, FLOOR_Y + 1.37, -RD / 2 + 1.24, 0xdc2626);
      P(3.4, 2.1, 0.8, 2.4, FLOOR_Y, -RD / 2 + 0.85);

      plant(11.4, 8.6);
      plant(-11.4, 8.6);
      // Upstairs Doctor Consultation Deck
      officeDesk(-5.6, -7.8, 0, MEZZ_Y, true);
      sofa(2.4, -7.8, 0, 0x3b8a8a, 3.0, MEZZ_Y);

      // Hospital Medical Staff + Waiting Room Patients + Security
      npcSpots.push({ x: cx - 5.8, z: cz + 1.3, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx - 3.0, z: cz + 1.3, y: FLOOR_Y, yaw: 0, role: 'nurse' });
      npcSpots.push({ x: cx - 5.6, z: cz - 5.1, y: FLOOR_Y, yaw: 0.3, role: 'doctor' });
      npcSpots.push({ x: cx - 1.6, z: cz - 5.3, y: FLOOR_Y, yaw: -0.4, role: 'nurse' });
      npcSpots.push({ x: cx - 5.6, z: cz - 6.9, y: MEZZ_Y, yaw: 0, role: 'doctor' });
      npcSpots.push({ x: cx + 1.4, z: cz + 2.8, y: FLOOR_Y, yaw: 0.5, role: 'guard' });
      // Seated patients in the Hospital Waiting Room rows
      npcSpots.push({ x: cx + 5.5, z: cz + 6.3, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      npcSpots.push({ x: cx + 7.7, z: cz + 6.3, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      npcSpots.push({ x: cx + 6.1, z: cz + 2.1, y: FLOOR_Y, yaw: 0, role: 'seated' });
      npcSpots.push({ x: cx + 2.4, z: cz - 7.7, y: MEZZ_Y, yaw: 0, role: 'seated' });
      break;
    }

    case 'gun': {
      // Ammu-Nation Tactical Outfitter: Heavy walnut counter, hanging AMMO sign on ceiling rods,
      // 4 illuminated glass rifle/pistol display cabinets, AND a glass-walled 3-LANE INDOOR SHOOTING RANGE!
      counter(-4.4, 2.0, 8.2, 0, 0x6b2828);
      mountHangingSign(-4.4, 3.85, 1.8, 4.4, 1.0, 'AMMO', 0);
      addWaitLine(-4.4, 3.6, 0.28, 0.96, 3, true);

      // 4 Illuminated Rifle & Tactical Gear Wall Racks along back wall
      for (let i = 0; i < 4; i++) {
        const rx = -6.2 + i * 3.1;
        B('intWood', 2.45, 2.2, 0.44, rx, FLOOR_Y, -RD / 2 + 0.65, 0x4a3424);
        B('intTrim', 2.2, 1.35, 0.1, rx, FLOOR_Y + 0.72, -RD / 2 + 0.9, 0x9e7a34);
        B('glass', 2.05, 1.2, 0.05, rx, FLOOR_Y + 0.8, -RD / 2 + 0.86, 0x1c2a30);
        for (let k = 0; k < 3; k++) {
          B('propMetal', 1.2 - k * 0.18, 0.11, 0.12, rx, FLOOR_Y + 1.62 - k * 0.34, -RD / 2 + 0.94, k === 0 ? 0x22252a : 0x383c42);
        }
        B('emit', 1.95, 0.06, 0.08, rx, FLOOR_Y + 2.02, -RD / 2 + 0.88, 0xffe099);
        P(2.45, 2.2, 0.5, rx, FLOOR_Y, -RD / 2 + 0.65);
      }

      // Glass-walled 3-Lane Indoor Shooting Range on the right side (x = +4.2..+11.5)
      B('propMetal', 0.2, 1.05, 11.4, 4.4, FLOOR_Y, -0.4, 0x32363e);
      B('glass', 0.12, 2.4, 11.4, 4.4, FLOOR_Y + 1.05, -0.4, 0x1e323d);
      P(0.28, 3.4, 11.4, 4.4, FLOOR_Y, -0.4);
      // 3 Firing Booth Dividers & Hanging Bullseye Targets downrange
      for (let lane = 0; lane < 3; lane++) {
        const lx = 6.2 + lane * 2.2;
        B('propMetal', 0.1, 2.1, 1.5, lx - 1.1, FLOOR_Y, 4.0, 0x2a2e36);
        B('intWood', 1.8, 0.08, 0.7, lx, FLOOR_Y + 1.02, 4.1, 0x5c3e26);
        // Hanging paper target silhouette attached to ceiling rail
        G('propMetal', cyl(0.02, 0.02, RH - 2.35, lx, 2.35, -4.6, 0x383d46, 6));
        B('prop', 0.72, 0.98, 0.05, lx, 1.38, -4.6, 0xf2eee4);
        B('prop', 0.42, 0.42, 0.06, lx, 1.68, -4.57, 0x1e2228);
        B('prop', 0.16, 0.16, 0.07, lx, 1.81, -4.55, 0xd6322c);
      }
      // Mezzanine lounge
      sofa(2.4, -7.6, 0, 0x5c2b2b, 3.0, MEZZ_Y);
      coffeeTable(2.4, -6.0, 1.5, 0.75, MEZZ_Y);

      npcSpots.push({ x: cx - 4.8, z: cz + 0.7, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx + 1.2, z: cz + 2.2, y: FLOOR_Y, yaw: 0.6, role: 'customer' });
      npcSpots.push({ x: cx + 2.4, z: cz - 7.5, y: MEZZ_Y, yaw: 0, role: 'seated' });
      break;
    }

    case 'garage': {
      // Spacious High-Bay Pay 'N' Spray Auto Shop: Dual red 2-post hydraulic car lifts,
      // raised coupe car frame on lift #1, red rolling tool chests, stacked alloy wheels & tire racks,
      // oil drums, air compressor, hanging PAY N SPRAY sign on steel rods, and catwalk office mezzanine!
      // Yellow safety bay border markings on epoxy floor
      for (const bayX of [-5.8, 3.2]) {
        B('prop', 5.8, 0.025, 0.16, bayX, FLOOR_Y + 0.005, 4.6, 0xe8b923);
        B('prop', 5.8, 0.025, 0.16, bayX, FLOOR_Y + 0.005, -2.6, 0xe8b923);
        // 2-Post Hydraulic Lift Columns + Crossbeam
        for (const s of [-1, 1]) {
          B('propMetal', 0.36, 3.6, 0.44, bayX + s * 2.5, FLOOR_Y, 1.0, 0xc03228);
          B('propMetal', 0.7, 0.12, 0.7, bayX + s * 2.5, FLOOR_Y, 1.0, 0x2a2d32);
          P(0.45, 3.6, 0.5, bayX + s * 2.5, FLOOR_Y, 1.0);
        }
        B('propMetal', 5.3, 0.24, 0.28, bayX, FLOOR_Y + 3.45, 1.0, 0xc03228);
        // Lifting arms
        B('propMetal', 4.4, 0.14, 2.8, bayX, FLOOR_Y + (bayX < 0 ? 1.55 : 0.22), 1.0, 0x363a42);
      }
      // Sculpted red coupe chassis suspended cleanly on Hydraulic Lift #1 (bayX = -5.8, y = FLOOR_Y + 1.68)
      const carY = FLOOR_Y + 1.68;
      B('propMetal', 2.0, 0.62, 4.4, -5.8, carY, 1.0, 0xd62834);
      B('glass', 1.66, 0.48, 2.0, -5.8, carY + 0.62, 0.85, 0x1b2c38);
      B('propMetal', 1.58, 0.08, 1.55, -5.8, carY + 1.1, 0.85, 0xd62834);
      for (const sx of [-1.02, 1.02]) for (const sz of [-1.35, 1.35]) {
        G('prop', cyl(0.36, 0.36, 0.24, -5.8 + sx, carY + 0.18, 1.0 + sz, 0x16181c, 14).rotateZ(Math.PI / 2));
      }
      P(2.4, 2.6, 4.6, -5.8, FLOOR_Y, 1.0);

      // Red Rolling Tool Chests, Oil Drums & Tire Stacks along walls
      B('prop', 2.6, 1.05, 0.95, -9.8, FLOOR_Y, -6.4, 0xc03228);
      B('propMetal', 2.65, 0.08, 1.0, -9.8, FLOOR_Y + 1.05, -6.4, 0xa8adb2);
      P(2.65, 1.15, 1.0, -9.8, FLOOR_Y, -6.4);
      // Blue air compressor tank + oil drums
      G('propMetal', cyl(0.45, 0.45, 1.5, -11.4, FLOOR_Y, -3.2, 0x2663a8, 14));
      for (const [dx, dz, col] of [[-11.4, -1.2, 0xc03228], [-11.4, -0.2, 0x2663a8], [-10.5, -0.7, 0xd8a020]] as const) {
        G('propMetal', cyl(0.34, 0.34, 0.96, dx, FLOOR_Y, dz, col, 14));
      }
      for (const [tx, tz] of [[9.4, 2.4], [10.4, 3.2], [9.2, 4.0]]) {
        G('prop', cyl(0.5, 0.5, 0.3, tx, FLOOR_Y, tz, 0x151518, 14));
        G('prop', cyl(0.5, 0.5, 0.3, tx, FLOOR_Y + 0.3, tz, 0x151518, 14));
        G('propMetal', cyl(0.26, 0.26, 0.62, tx, FLOOR_Y, tz, 0x9aa0a5, 12));
      }

      // Service Advisor Desk + Waiting Lounge + Hanging Sign on steel rods
      counter(-9.2, 6.2, 4.4, 0, 0x3b424c);
      mountHangingSign(-1.2, 4.65, 1.0, 4.6, 1.05, 'PAY N SPRAY', 0);
      addWaitLine(-8.6, 7.6, 0.95, 0.15, 2, false);
      sofa(7.8, 7.2, Math.PI, 0x3b4856, 3.0);
      vendingMachine(11.8, 7.2);
      // Upstairs Catwalk Parts Office
      officeDesk(-4.8, -8.2, 0, MEZZ_Y, true);
      shelfGondola(2.4, -8.4, 5.0, 2.0, MEZZ_Y);

      npcSpots.push({ x: cx - 9.2, z: cz + 4.9, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx - 2.4, z: cz + 1.0, y: FLOOR_Y, yaw: -Math.PI / 2, role: 'server' });
      npcSpots.push({ x: cx + 7.8, z: cz + 7.1, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      npcSpots.push({ x: cx - 1.2, z: cz - 7.6, y: MEZZ_Y, yaw: 0.2, role: 'customer' });
      break;
    }

    case 'parking': {
      // Multi-Level Downtown Concrete Parking Garage Interior:
      // Painted parking stalls + concrete wheel stops on Ground & Upper Deck, hazard-striped concrete columns,
      // overhead fluorescent tube lights, glass Parking Attendant Booth with barrier arm, automated PAY HERE kiosk,
      // detailed static parked vehicles, and live parking attendant + security guard + drivers!
      const parkedCar = (px: number, pz: number, baseY: number, col: number, yaw = 0) => {
        B('propMetal', 2.02, 0.62, 4.35, px, baseY + 0.24, pz, col, yaw);
        B('glass', 1.72, 0.48, 2.05, px, baseY + 0.86, pz, 0x1e293b, yaw);
        B('propMetal', 1.62, 0.08, 1.52, px, baseY + 1.34, pz, col, yaw);
        // Headlights & taillights
        B('emit', 1.65, 0.14, 0.08, px, baseY + 0.56, pz + (yaw === 0 ? 2.18 : -2.18), 0xfff4c2);
        B('emit', 1.65, 0.14, 0.08, px, baseY + 0.56, pz + (yaw === 0 ? -2.18 : 2.18), 0xef4444);
        for (const sx of [-1.02, 1.02]) for (const sz of [-1.35, 1.35]) {
          G('prop', cyl(0.34, 0.34, 0.24, px + sx, baseY + 0.34, pz + sz, 0x141619, 12).rotateZ(Math.PI / 2));
        }
        if (baseY < 1.0) P(2.3, 1.6, 4.6, px, baseY, pz);
      };

      // Painted parking bay stall lines + concrete wheel stops (Ground Floor back row + side bays)
      for (let i = 0; i <= 5; i++) {
        const sx = -12.8 + i * 4.2;
        B('prop', 0.14, 0.025, 5.2, sx, FLOOR_Y + 0.005, -7.8, 0xf8fafc);
        if (i < 5) {
          B('conc', 1.9, 0.16, 0.24, sx + 2.1, FLOOR_Y, -9.9, 0x9ca3af); // Concrete wheel stop
        }
      }
      // Yellow driving lane centerlines
      B('prop', 22.0, 0.025, 0.18, -1.5, FLOOR_Y + 0.005, 0.5, 0xfacc15);
      B('prop', 22.0, 0.025, 0.18, -1.5, FLOOR_Y + 0.005, 1.0, 0xfacc15);

      // Structural concrete columns with yellow/black hazard bumper wraps
      for (const [colX, colZ] of [[-8.6, -2.5], [0.0, -2.5], [8.4, -2.5], [-8.6, 5.2], [4.2, 5.2]]) {
        B('conc', 0.95, RH - FLOOR_Y, 0.95, colX, FLOOR_Y, colZ, 0x8e96a0);
        B('prop', 1.04, 0.95, 1.04, colX, FLOOR_Y + 0.1, colZ, 0xf2b705);
        B('prop', 1.06, 0.22, 1.06, colX, FLOOR_Y + 0.45, colZ, 0x1e242b);
        c.world.addBox(cx + colX - 0.56, cx + colX + 0.56, cz + colZ - 0.56, cz + colZ + 0.56, RH);
      }

      // Linear overhead fluorescent tube fixtures
      for (const lz of [-6.0, 0.8, 6.2]) {
        for (const lx of [-8.0, 0.0, 8.0]) {
          B('propMetal', 2.8, 0.12, 0.28, lx, RH - 0.24, lz, 0x475569);
          B('emit', 2.6, 0.06, 0.18, lx, RH - 0.3, lz, 0xf0f9ff);
        }
      }

      // Glass Parking Attendant Booth + Striped Barrier Gate near entrance (front-left)
      B('propMetal', 3.4, 2.55, 2.8, -11.4, FLOOR_Y, 7.0, 0x1e3a8a);
      B('glass', 3.1, 1.2, 2.88, -11.4, FLOOR_Y + 1.08, 7.0, 0x38bdf8);
      B('prop', 0.56, 0.42, 0.08, -11.4, FLOOR_Y + 1.12, 7.8, 0x111827);
      B('emit', 0.48, 0.32, 0.04, -11.4, FLOOR_Y + 1.16, 7.84, 0x34d399);
      B('prop', 4.6, 0.14, 0.14, -7.2, FLOOR_Y + 1.05, 8.2, 0xef4444); // Barrier arm
      P(3.5, 2.6, 2.9, -11.4, FLOOR_Y, 7.0);

      // Automated Ticket Pay-Here Kiosk on front-right wall
      B('propMetal', 1.15, 2.1, 0.82, 11.4, FLOOR_Y, 7.4, 0x1e293b);
      B('emit', 0.78, 0.62, 0.06, 11.4, FLOOR_Y + 1.25, 7.0, 0x38bdf8);
      P(1.2, 2.1, 0.9, 11.4, FLOOR_Y, 7.4);

      mountHangingSign(0, 4.45, 5.2, 5.0, 1.05, 'PARKING', 0);

      // Detailed Parked Cars in Ground Bays & Upper Mezzanine Deck
      parkedCar(-10.7, -7.8, FLOOR_Y, 0xd62834, 0);
      parkedCar(-6.5, -7.8, FLOOR_Y, 0x2563eb, 0);
      parkedCar(1.9, -7.8, FLOOR_Y, 0xf59e0b, 0);
      parkedCar(6.1, -7.8, FLOOR_Y, 0xf8fafc, 0);
      // Upper Mezzanine Parking Bays + 2 Parked Cars upstairs
      for (let i = 0; i <= 4; i++) {
        B('prop', 0.14, 0.025, 4.8, -12.0 + i * 4.6, MEZZ_Y + 0.005, -8.8, 0xf8fafc);
      }
      parkedCar(-9.7, -8.8, MEZZ_Y, 0x10b981, 0);
      parkedCar(-0.5, -8.8, MEZZ_Y, 0x06b6d4, 0);

      // Parking Garage Staff (Attendant + Security Guard) & Drivers
      npcSpots.push({ x: cx - 9.0, z: cz + 6.9, y: FLOOR_Y, yaw: Math.PI / 2, role: 'attendant' });
      npcSpots.push({ x: cx + 3.6, z: cz + 2.8, y: FLOOR_Y, yaw: -0.5, role: 'guard' });
      npcSpots.push({ x: cx - 2.4, z: cz - 3.6, y: FLOOR_Y, yaw: 0.4, role: 'customer' });
      npcSpots.push({ x: cx + 8.6, z: cz + 6.6, y: FLOOR_Y, yaw: -0.8, role: 'customer' });
      npcSpots.push({ x: cx - 4.8, z: cz - 7.0, y: MEZZ_Y, yaw: 0.2, role: 'attendant' });
      break;
    }
    default:
      break;
  }

  const elevation: InteriorElevationLayout = {
    baseY: FLOOR_Y,
    stairs: [
      {
        x0: cx + stairX0,
        x1: cx + stairX1,
        z0: cz + stairZ0,
        z1: cz + stairZ1,
        y0: FLOOR_Y,
        y1: MEZZ_Y,
        axis: 'z',
        dir: -1,
      },
    ],
    mezzanines: [
      {
        x0: cx + mezzX0,
        x1: cx + mezzX1,
        z0: cz + mezzZ0,
        z1: cz + mezzZ1,
        y: MEZZ_Y,
      },
    ],
  };

  const exits: InteriorExitSpec[] = [
    { x: cx, z: cz + RD / 2 - 1.0, y: FLOOR_Y, yaw: Math.PI, label: 'Main Exit' },
    { x: cx - RW / 2 + 1.1, z: cz + sideExitZ, y: FLOOR_Y, yaw: Math.PI / 2, label: 'Side Exit' },
    { x: cx + upExitX - upExitSide * 0.9, z: cz + upExitZ, y: MEZZ_Y, yaw: upExitSide === -1 ? Math.PI / 2 : -Math.PI / 2, label: 'Upstairs Exit' },
  ];

  return {
    id,
    kind,
    name: label,
    cx,
    cz,
    w: RW,
    d: RD,
    h: RH,
    spawn: { x: cx, z: cz + RD / 2 - 1.7, yaw: Math.PI },
    exit: { x: cx, z: cz + RD / 2 - 1.0, yaw: Math.PI },
    exits,
    elevation,
    npcSpots,
    pendantLights,
    light: new THREE.Vector3(cx, RH - 0.8, cz),
    warmTint: spec.warmTint,
    vaultPos: kind === 'bank' ? { x: cx - 9.2, z: cz - RD / 2 + 2.2 } : undefined,
    tellerPos: kind === 'bank' ? { x: cx - 2.0, z: cz - 0.2 } : undefined,
  };
}
void finish;
