// Enterable, multi-level furnished interiors with hardwood floorboards, upholstery & wood-grain textures,
// coffered ceilings + 3D pendant chandeliers, walkable interior staircases & mezzanines,
// backlit EXIT doors, and lively customer crowds with stanchion wait lines.
import * as THREE from 'three';
import { box, cone, cyl, finish, flat, flatDown, sign, sph } from './geo';
import { signUV } from './textures';
import {
  InteriorElevationLayout,
  InteriorExitSpec,
  computeWaitLineSlots,
} from './interiorMath';
import type { BCtx, Door } from './buildings';

export type IndoorNpcRole = 'clerk' | 'customer' | 'guard' | 'queue' | 'seated' | 'server';

export interface IndoorNpcSpot {
  x: number;
  z: number;
  y?: number;
  yaw: number;
  role: IndoorNpcRole;
}

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
}

const RW = 24;
const RD = 18;
const RH = 5.8;
const FLOOR_Y = 0.26;
const MEZZ_Y = 2.72;

export function buildInteriors(c: BCtx): Room[] {
  const rooms: Room[] = [];
  const kinds: Door['kind'][] = ['shop', 'diner', 'office', 'apartment', 'bank', 'police', 'hospital', 'gun', 'garage'];
  let idx = 0;
  for (const kind of kinds) {
    for (let variant = 0; variant < 2; variant++) {
      // Positioned cleanly outside the 10km x 10km (-5000..+5000) playable map
      const cx = 6400 + (idx % 6) * 52;
      const cz = 6400 + Math.floor(idx / 6) * 52;
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
  const ch = c.chunk(cx, cz);

  const B = (mat: string, w: number, h: number, d: number, x: number, y: number, z: number, col = 0xffffff, ry = 0) =>
    c.b.add(mat, box(w, h, d, cx + x, y, cz + z, col, ry), ch);
  const P = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    c.world.addBox(cx + x - w / 2, cx + x + w / 2, cz + z - d / 2, cz + z + d / 2, y + h);
  const G = (mat: string, geo: THREE.BufferGeometry) => {
    geo.translate(cx, 0, cz);
    c.b.add(mat, geo, ch);
  };

  // Floor material selection: real hardwood floorboards in diners, shops, apartments, offices & gun shops
  const floorMat =
    kind === 'bank' || kind === 'police'
      ? 'intMarble'
      : kind === 'hospital' || kind === 'garage'
        ? 'intTile'
        : 'intFloorWood';
  const floorTint =
    floorMat === 'intFloorWood'
      ? kind === 'diner'
        ? 0xf0dcc4
        : kind === 'gun'
          ? 0xd9c2a8
          : 0xeedcc8
      : 0xffffff;
  const floorScale = floorMat === 'intFloorWood' ? 2.6 : 2.2;

  const wallCol =
    kind === 'diner'
      ? 0xeee2ca
      : kind === 'apartment'
        ? 0xe8ddd0
        : kind === 'garage'
          ? 0xb5bcc0
          : kind === 'bank'
            ? 0xf0e9d8
            : kind === 'hospital'
              ? 0xe4f0f1
              : 0xe8e2d7;
  const accent =
    kind === 'bank'
      ? 0x8e6e34
      : kind === 'police'
        ? 0x223862
        : kind === 'hospital'
          ? 0x4caea4
          : kind === 'gun'
            ? 0x7a2b2b
            : kind === 'garage'
              ? 0xb8382a
              : variant
                ? 0x2b5a49
                : r.pick([0x7d3632, 0x2b4f41, 0x2d4a5e, 0x8a642e]);
  const warmTint =
    kind === 'diner' || kind === 'apartment' || kind === 'bank'
      ? 0xffdca8
      : kind === 'hospital' || kind === 'police'
        ? 0xdcf0ff
        : 0xffecc8;

  // ---------------------------------------------------------------- Floorboards & Subfloor
  B('intWood', RW + 0.6, 0.25, RD + 0.6, 0, 0, 0, 0x4a3525);
  c.b.add(
    floorMat,
    flat(
      cx - RW / 2,
      cz - RD / 2,
      cx + RW / 2,
      cz + RD / 2,
      FLOOR_Y,
      (x, z) => [(x - cx) / floorScale, (z - cz) / floorScale],
      floorTint,
    ),
    ch,
  );

  // ---------------------------------------------------------------- Coffered Ceiling & Timber/Steel Beams
  B('intCeil', RW + 0.4, 0.24, RD + 0.4, 0, RH + 0.02, 0, 0xf2eee6);
  c.b.add(
    'intCeil',
    flatDown(
      cx - RW / 2,
      cz - RD / 2,
      cx + RW / 2,
      cz + RD / 2,
      RH - 0.01,
      (x, z) => [(x - cx) / 2.4, (z - cz) / 2.4],
      0xf6f2ea,
    ),
    ch,
  );
  const beamCol = kind === 'hospital' || kind === 'police' || kind === 'garage' ? 0xd2d6dc : 0x5c422c;
  const beamMat = kind === 'hospital' || kind === 'police' || kind === 'garage' ? 'propMetal' : 'intWood';
  for (const bz of [-6.0, -1.8, 2.6, 6.6]) {
    B(beamMat, RW - 0.5, 0.24, 0.28, 0, RH - 0.25, bz, beamCol);
  }
  for (const bx of [-6.2, 0, 6.2]) {
    B(beamMat, 0.26, 0.22, RD - 0.5, bx, RH - 0.24, 0, beamCol);
  }

  // ---------------------------------------------------------------- Perimeter Textured Plaster Walls
  B('intWall', RW, RH, 0.4, 0, 0, -RD / 2, wallCol);
  B('intWall', 0.4, RH, RD, -RW / 2, 0, 0, wallCol);
  B('intWall', 0.4, RH, RD, RW / 2, 0, 0, wallCol);
  P(RW, RH, 0.4, 0, 0, -RD / 2);
  P(0.4, RH, RD, -RW / 2, 0, 0);
  P(0.4, RH, RD, RW / 2, 0, 0);

  // Side windows with 4-rail surround frames, mullions & clean daylight panes (zero Z-fighting)
  for (const zoff of [-0.5, 5.2]) {
    for (const sx of [-1, 1]) {
      if (sx === -1 && zoff > 2) continue; // reserve left front wall for Side Emergency Exit door
      const innerFace = sx * (RW / 2 - 0.21);
      // Soft daylight pane recessed slightly ahead of inner wall face, plus glass + vertical mullion
      B('emit', 0.04, 1.88, 2.64, innerFace - sx * 0.03, 1.66, zoff, 0xc8e4f4);
      B('glass', 0.03, 1.88, 2.64, innerFace - sx * 0.075, 1.66, zoff, 0x3b657d);
      // 4-piece frame surround (sill, header, left & right jambs) + center mullion
      B('intTrim', 0.16, 0.1, 2.94, innerFace - sx * 0.06, 1.56, zoff, 0x6f4e32); // sill
      B('intTrim', 0.14, 0.12, 2.88, innerFace - sx * 0.05, 3.54, zoff, 0x6f4e32); // header
      B('intTrim', 0.14, 2.08, 0.12, innerFace - sx * 0.05, 1.58, zoff - 1.38, 0x6f4e32); // jamb 1
      B('intTrim', 0.14, 2.08, 0.12, innerFace - sx * 0.05, 1.58, zoff + 1.38, 0x6f4e32); // jamb 2
      B('intTrim', 0.08, 1.9, 0.07, innerFace - sx * 0.08, 1.64, zoff, 0x5d412a); // center mullion
    }
  }

  // Front wall with glazed entrance double-doors, brass push-bars, storefront windows, welcome mat & backlit EXIT sign
  for (const s of [-1, 1]) {
    const seg = RW / 2 - 3.0;
    const fx = s * (3.0 + seg / 2);
    B('intWall', seg, RH, 0.4, fx, 0, RD / 2, wallCol);
    P(seg, RH, 0.4, fx, 0, RD / 2);
    // Framed front storefront daylight glass with mullions
    const fw = seg - 1.2;
    B('emit', fw, 2.35, 0.04, fx, 1.48, RD / 2 - 0.23, 0xbcd8ea);
    B('glass', fw, 2.35, 0.03, fx, 1.48, RD / 2 - 0.275, 0x264858);
    B('intTrim', fw + 0.24, 0.11, 0.14, fx, 1.38, RD / 2 - 0.26, 0x5c422c);
    B('intTrim', fw + 0.24, 0.11, 0.14, fx, 3.83, RD / 2 - 0.26, 0x5c422c);
    for (const ms of [-1, 0, 1]) {
      B('intTrim', 0.09, 2.48, 0.12, fx + ms * (fw * 0.48), 1.42, RD / 2 - 0.26, 0x5c422c);
    }
  }
  B('intWall', 6.0, RH - 3.1, 0.4, 0, 3.1, RD / 2, wallCol);
  B('glass', 5.2, 2.95, 0.14, 0, FLOOR_Y, RD / 2 - 0.2, 0x264854);
  B('intTrim', 0.22, 3.05, 0.28, -2.65, FLOOR_Y, RD / 2 - 0.15, 0x5c422c);
  B('intTrim', 0.22, 3.05, 0.28, 2.65, FLOOR_Y, RD / 2 - 0.15, 0x5c422c);
  B('intTrim', 5.5, 0.22, 0.28, 0, 3.15, RD / 2 - 0.15, 0x5c422c);
  // Center vertical door divider & horizontal brass crash push-bars
  B('propMetal', 0.08, 2.95, 0.1, 0, FLOOR_Y, RD / 2 - 0.22, 0x454a50);
  B('propMetal', 1.85, 0.09, 0.1, -1.25, 1.25, RD / 2 - 0.36, 0xd9b84a);
  B('propMetal', 1.85, 0.09, 0.1, 1.25, 1.25, RD / 2 - 0.36, 0xd9b84a);
  // Entrance mat on floorboards
  B('carpet', 3.4, 0.03, 1.5, 0, FLOOR_Y, RD / 2 - 1.15, 0x2a2d34);
  P(6.4, RH, 0.5, 0, 0, RD / 2);

  // Helper to mount a crisp backlit glowing green EXIT sign box
  const mountExitSign = (x: number, y: number, z: number, yaw: number) => {
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    B('propMetal', 1.05, 0.42, 0.16, x, y - 0.21, z, 0x1c2228, yaw);
    c.b.add('intExitSign', sign(0.96, 0.34, cx + x + nx * 0.09, y, cz + z + nz * 0.09, yaw, [0, 0, 1, 1], 0xffffff), ch);
  };

  // Front Main Entrance glowing EXIT sign facing inward (-Z)
  mountExitSign(0, 3.65, RD / 2 - 0.36, Math.PI);

  // Side Ground-Floor Emergency Exit Door (left wall at z = +5.4)
  B('propMetal', 0.16, 2.42, 1.45, -RW / 2 + 0.26, FLOOR_Y, 5.4, 0x3b444e);
  B('intTrim', 0.2, 2.52, 1.62, -RW / 2 + 0.22, FLOOR_Y, 5.4, 0x5c422c);
  B('propMetal', 0.12, 0.09, 1.05, -RW / 2 + 0.38, 1.25, 5.4, 0xd6362c); // red panic push-bar
  B('carpet', 1.2, 0.03, 1.5, -RW / 2 + 0.95, FLOOR_Y, 5.4, 0x2d3038);
  mountExitSign(-RW / 2 + 0.32, 3.02, 5.4, Math.PI / 2);

  // Baseboards, chair-rail wainscot, and crown molding
  for (const z of [-RD / 2 + 0.24, RD / 2 - 0.24]) {
    B('intTrim', RW - 0.8, 0.22, 0.12, 0, FLOOR_Y, z, 0x73563c);
    B('intTrim', RW - 0.8, 0.09, 0.1, 0, 1.18, z, 0x9c7b5a);
    B('intTrim', RW - 0.8, 0.18, 0.18, 0, RH - 0.24, z, 0xbdb3a0);
  }
  for (const x of [-RW / 2 + 0.24, RW / 2 - 0.24]) {
    B('intTrim', 0.12, 0.22, RD - 0.8, x, FLOOR_Y, 0, 0x73563c);
    B('intTrim', 0.1, 0.09, RD - 0.8, x, 1.18, 0, 0x9c7b5a);
    B('intTrim', 0.14, 0.18, RD - 0.8, x, RH - 0.24, 0, 0xbdb3a0);
  }

  // ---------------------------------------------------------------- Sculpted 3D Pendant Chandeliers & Ceiling Cans
  const pendantLights: [number, number, number][] = [];
  const pendantFixture = (x: number, z: number, dropLen: number, shadeCol: number) => {
    const canopyY = RH - 0.08;
    const shadeY = RH - dropLen;
    // Ceiling mount canopy + slender brass/black downrod
    G('propMetal', cyl(0.14, 0.16, 0.08, x, canopyY - 0.04, z, 0x2a2c32, 12));
    G('propMetal', cyl(0.025, 0.025, dropLen, x, shadeY, z, 0x30333a, 8));
    // Flared designer pendant shade + brass ring collar
    G('propMetal', cone(0.46, 0.34, x, shadeY - 0.08, z, shadeCol, 16));
    G('propMetal', cyl(0.12, 0.14, 0.1, x, shadeY + 0.22, z, 0xc8a44c, 12));
    // Warm glowing glass diffuser globe inside shade
    c.b.add('emit', sph(0.19, cx + x, shadeY - 0.06, cz + z, warmTint, 1, 0.85, 1, 10), ch);
    pendantLights.push([cx + x, shadeY - 0.38, cz + z]);
  };

  const shadeColor = kind === 'diner' ? 0x8f2d28 : kind === 'bank' ? 0x2e5e46 : kind === 'hospital' ? 0xd8dfe4 : 0x2c3038;
  // 4 grand pendants over the main double-height floor + 2 over the upper mezzanine
  pendantFixture(-5.8, 3.2, 1.25, shadeColor);
  pendantFixture(4.6, 3.2, 1.25, shadeColor);
  pendantFixture(-5.8, -1.6, 1.25, shadeColor);
  pendantFixture(4.2, -1.6, 1.25, shadeColor);
  pendantFixture(-5.4, -6.5, 0.82, shadeColor);
  pendantFixture(3.6, -6.5, 0.82, shadeColor);

  // Subtle recessed architectural ceiling downlights
  for (const lx of [-9.0, 0, 9.0]) {
    for (const lz of [-6.4, 0.4, 6.2]) {
      G('propMetal', cyl(0.22, 0.22, 0.06, lx, RH - 0.07, lz, 0x353840, 12));
      G('emit', cyl(0.15, 0.15, 0.04, lx, RH - 0.09, lz, warmTint, 12));
    }
  }

  // ---------------------------------------------------------------- Walkable Interior Staircase & Upper Mezzanine Balcony
  const mezzZ0 = -RD / 2 + 0.22; // -8.78
  const mezzZ1 = -4.2;
  const mezzX0 = -RW / 2 + 0.22; // -11.78
  const mezzX1 = RW / 2 - 0.22;  // +11.78
  const stairX0 = 8.4;
  const stairX1 = 11.4;
  const stairZ0 = mezzZ1;        // -4.2 (top landing)
  const stairZ1 = 0.6;           // +0.6 (bottom step)

  // Mezzanine structural floor slab + hardwood floorboard top surface
  B('intWood', mezzX1 - mezzX0, 0.24, mezzZ1 - mezzZ0, (mezzX0 + mezzX1) / 2, MEZZ_Y - 0.25, (mezzZ0 + mezzZ1) / 2, 0x543b26);
  c.b.add(
    'intFloorWood',
    flat(
      cx + mezzX0,
      cz + mezzZ0,
      cx + mezzX1,
      cz + mezzZ1,
      MEZZ_Y,
      (x, z) => [(x - cx) / 2.6, (z - cz) / 2.6],
      0xeedbc4,
    ),
    ch,
  );
  // Structural steel/timber support columns under mezzanine front edge (clear of walkways!)
  for (const colX of [-11.3, -4.6, 2.2, 8.15]) {
    B('intWood', 0.34, MEZZ_Y - FLOOR_Y, 0.34, colX, FLOOR_Y, mezzZ1 - 0.18, 0x5b402a);
    B('propMetal', 0.42, 0.14, 0.42, colX, FLOOR_Y, mezzZ1 - 0.18, 0x343840);
    c.world.addCircle(cx + colX, cz + mezzZ1 - 0.18, 0.22, MEZZ_Y, 'column');
  }
  // Mezzanine balcony safety glass + hardwood handrail (stops at stairX0 so top of stairs is wide open!)
  const railW = stairX0 - 0.1 - mezzX0;
  const railCx = (mezzX0 + stairX0 - 0.1) / 2;
  B('glass', railW, 0.94, 0.06, railCx, MEZZ_Y + 0.04, mezzZ1 - 0.06, 0x456e80);
  B('intWood', railW + 0.1, 0.09, 0.14, railCx, MEZZ_Y + 1.0, mezzZ1 - 0.06, 0x6e4b30);
  for (let px = mezzX0 + 0.2; px <= stairX0 - 0.15; px += 2.2) {
    B('propMetal', 0.08, 1.02, 0.08, px, MEZZ_Y, mezzZ1 - 0.06, 0x353942);
  }
  // Under-mezzanine warm cove strip lights so ground-floor alcove is well-lit
  for (const ax of [-8.0, -1.5, 5.0]) {
    B('emit', 2.4, 0.05, 0.22, ax, MEZZ_Y - 0.27, -6.5, warmTint);
  }

  // Walkable 12-tread Interior Staircase ascending from z = +0.6 (y = 0.26) to z = -4.2 (y = 2.72)
  const steps = 12;
  const stairW = stairX1 - stairX0;
  const stairCx = (stairX0 + stairX1) / 2;
  const stepRun = (stairZ1 - stairZ0) / steps;
  const stepRise = (MEZZ_Y - FLOOR_Y) / steps;
  for (let i = 0; i < steps; i++) {
    const sy = FLOOR_Y + i * stepRise;
    const sz = stairZ1 - (i + 0.5) * stepRun;
    // Riser + hardwood tread overhang
    B('intWood', stairW, stepRise, stepRun * 0.92, stairCx, sy, sz, 0x573d28);
    B('intFloorWood', stairW + 0.04, 0.055, stepRun + 0.06, stairCx, sy + stepRise - 0.03, sz + 0.02, 0xf2dfc8);
    // Inner balustrade vertical spindles + sloped handrail caps
    B('propMetal', 0.055, 0.96, 0.055, stairX0 + 0.06, sy + stepRise, sz, 0x353a42);
    B('intWood', 0.1, 0.07, stepRun + 0.16, stairX0 + 0.06, sy + stepRise + 0.94, sz, 0x6f4c30);
    // Wall-side handrail segment
    B('intWood', 0.08, 0.07, stepRun + 0.14, stairX1 - 0.06, sy + stepRise + 0.94, sz, 0x6f4c30);
  }
  // Bottom newel post
  B('intWood', 0.16, 1.18, 0.16, stairX0 + 0.06, FLOOR_Y, stairZ1 + 0.05, 0x5c3e26);
  c.world.addCircle(cx + stairX0 + 0.06, cz + stairZ1 + 0.05, 0.16, 1.5, 'newel');

  // Upper Mezzanine Emergency Fire Exit (left wall at z = -6.5, y = MEZZ_Y)
  B('propMetal', 0.16, 2.32, 1.38, -RW / 2 + 0.26, MEZZ_Y, -6.5, 0x3b444e);
  B('intTrim', 0.2, 2.42, 1.55, -RW / 2 + 0.22, MEZZ_Y, -6.5, 0x5c422c);
  B('propMetal', 0.12, 0.09, 0.98, -RW / 2 + 0.38, MEZZ_Y + 1.0, -6.5, 0xd6362c);
  mountExitSign(-RW / 2 + 0.32, MEZZ_Y + 2.55, -6.5, Math.PI / 2);

  // Brand accent strip + back wall signage + wall clock + security camera
  B('intAccent', RW - 1, 0.42, 0.12, 0, RH - 0.72, -RD / 2 + 0.3, accent);
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
  c.b.add('sign', sign(5.2, 1.25, cx, MEZZ_Y + 1.75, cz - RD / 2 + 0.44, 0, signUV(label)), ch);
  c.b.add('prop', cyl(0.32, 0.32, 0.07, cx + RW / 2 - 0.32, 3.6, cz + 2.4, 0x222222, 16), ch);
  c.b.add('prop', cyl(0.26, 0.26, 0.09, cx + RW / 2 - 0.32, 3.6, cz + 2.4, 0xf4f4f0, 16), ch);
  c.b.add('propMetal', box(0.46, 0.2, 0.22, cx - RW / 2 + 0.45, 4.7, cz - RD / 2 + 1.1, 0xd8dcdc, 0.5), ch);
  c.b.add('red', sph(0.055, cx - RW / 2 + 0.58, 4.66, cz - RD / 2 + 1.22, 0xff3030), ch);

  const npcSpots: IndoorNpcSpot[] = [];

  // ---------------------------------------------------------------- Reusable Textured Furniture & Wait-Line Kits
  const counter = (x: number, z: number, len: number, ry = 0, col = accent, baseY = FLOOR_Y) => {
    B('intWood', len, 1.04, 0.88, x, baseY, z, col, ry);
    B('intMarble', len + 0.26, 0.09, 1.04, x, baseY + 1.04, z, 0xf2eee4, ry);
    B('intTrim', len, 0.14, 0.08, x, baseY + 0.22, z + 0.46, 0xc8b99e, ry);
    if (baseY < 1.0) P(len, 1.15, 1.04, x, baseY, z);
  };

  /** Brass stanchion posts + burgundy velvet ropes framing a customer wait line */
  const stanchionLine = (x0: number, z0: number, x1: number, z1: number, posts = 4, ropeCol = 0x7c1c28) => {
    for (let i = 0; i < posts; i++) {
      const t = posts > 1 ? i / (posts - 1) : 0;
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      G('propMetal', cyl(0.18, 0.2, 0.05, px, FLOOR_Y, pz, 0xc8a44a, 12));
      G('propMetal', cyl(0.032, 0.036, 0.94, px, FLOOR_Y + 0.05, pz, 0xd8b454, 10));
      c.b.add('propMetal', sph(0.055, cx + px, FLOOR_Y + 1.01, cz + pz, 0xe2c262, 1, 1, 1, 8), ch);
      if (i < posts - 1) {
        const nx = x0 + (x1 - x0) * ((i + 1) / (posts - 1));
        const nz = z0 + (z1 - z0) * ((i + 1) / (posts - 1));
        const mx = (px + nx) / 2;
        const mz = (pz + nz) / 2;
        const segLen = Math.hypot(nx - px, nz - pz);
        const yaw = Math.atan2(nx - px, nz - pz);
        B('carpet2', 0.055, 0.065, Math.max(0.2, segLen - 0.1), mx, FLOOR_Y + 0.82, mz, ropeCol, yaw);
      }
    }
  };

  /** Populates a natural wait line queue of customers + optional framing stanchions */
  const addWaitLine = (
    anchorX: number,
    anchorZ: number,
    stepDirX: number,
    stepDirZ: number,
    count: number,
    withRopes = true,
  ) => {
    const slots = computeWaitLineSlots(cx + anchorX, cz + anchorZ, stepDirX, stepDirZ, count, 1.08);
    for (const s of slots) {
      npcSpots.push({ x: s.x, z: s.z, y: FLOOR_Y, yaw: s.yaw, role: 'queue' });
    }
    if (withRopes && count >= 2) {
      const len = Math.hypot(stepDirX, stepDirZ) || 1;
      const dx = stepDirX / len;
      const dz = stepDirZ / len;
      const px = -dz;
      const pz = dx;
      const run = (count - 1) * 1.08 + 0.45;
      // Two velvet rope rails flanking the customer queue
      for (const side of [-0.72, 0.72]) {
        stanchionLine(
          anchorX - dx * 0.25 + px * side,
          anchorZ - dz * 0.25 + pz * side,
          anchorX + dx * run + px * side,
          anchorZ + dz * run + pz * side,
          Math.max(3, Math.min(5, count)),
        );
      }
    }
  };

  const sofa = (x: number, z: number, ry: number, col = 0x3b5566, w = 2.6, baseY = FLOOR_Y) => {
    B('intWood', w, 0.16, 0.96, x, baseY + 0.14, z, 0x5d412a, ry);
    B('carpet2', w - 0.36, 0.22, 0.84, x, baseY + 0.3, z, col, ry);
    const s = Math.sin(ry);
    const co = Math.cos(ry);
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

  const bookshelf = (x: number, z: number, len = 2.6, h = 2.35, ry = 0, baseY = FLOOR_Y) => {
    B('intWood', len, h, 0.48, x, baseY, z, 0x6a4c34, ry);
    for (let l = 0; l < 4; l++) {
      const sy = baseY + 0.45 + l * (h - 0.55) / 4;
      B('intWood', len - 0.12, 0.06, 0.52, x, sy, z, 0x846042, ry);
      const nBooks = Math.floor((len - 0.3) / 0.22);
      for (let i = 0; i < nBooks; i++) {
        if (r.chance(0.16)) continue;
        const bx = -len / 2 + 0.24 + i * 0.22;
        const bh = 0.26 + (i % 3) * 0.05;
        B('prop', 0.15, bh, 0.26, x + bx, sy + 0.06, z + 0.04, r.pick([0xa83232, 0x245d8c, 0x2b7548, 0xc78f24, 0x6c3d82, 0xded9ce]), ry);
      }
    }
    if (baseY < 1.0) P(len, h, 0.56, x, baseY, z);
  };

  const officeDesk = (x: number, z: number, ry = 0, baseY = FLOOR_Y) => {
    B('intWood', 2.2, 0.08, 1.05, x, baseY + 0.74, z, 0x8c7054, ry);
    B('intWood', 0.55, 0.74, 0.96, x - 0.76, baseY, z, 0x6d563f, ry);
    B('intWood', 0.55, 0.74, 0.96, x + 0.76, baseY, z, 0x6d563f, ry);
    B('prop', 0.68, 0.42, 0.06, x, baseY + 0.92, z - 0.22, 0x1c1e22, ry);
    B('emit', 0.62, 0.34, 0.02, x, baseY + 0.96, z - 0.18, 0x7cc8f0, ry);
    B('propMetal', 0.1, 0.16, 0.1, x, baseY + 0.8, z - 0.22, 0x454a52, ry);
    B('prop', 0.48, 0.03, 0.18, x, baseY + 0.82, z + 0.14, 0x26282c, ry);
    B('propMetal', 0.16, 0.34, 0.16, x + 0.75, baseY + 0.82, z - 0.22, 0xc8a44a, ry);
    B('emit', 0.12, 0.08, 0.12, x + 0.75, baseY + 1.12, z - 0.22, 0xffe2a2, ry);
    B('propMetal', 0.08, 0.44, 0.08, x, baseY, z + 0.85, 0x33363b);
    B('carpet2', 0.54, 0.1, 0.52, x, baseY + 0.44, z + 0.85, 0x2a3644);
    B('carpet2', 0.52, 0.58, 0.1, x, baseY + 0.52, z + 1.08, 0x2a3644);
    if (baseY < 1.0) P(2.2, 1.1, 1.1, x, baseY, z);
  };

  /** Textured hardwood dining table with cushioned upholstered chairs & centerpiece lamp */
  const diningSet = (x: number, z: number, baseY = FLOOR_Y, cushionCol = 0x8f2c2c) => {
    B('intWood', 2.0, 0.08, 1.2, x, baseY + 0.76, z, 0x845e3c);
    for (const sx of [-0.82, 0.82]) for (const sz of [-0.46, 0.46]) {
      B('intWood', 0.09, 0.76, 0.09, x + sx, baseY, z + sz, 0x5c3f26);
    }
    // Tableware, plates, menus & warm table lamp
    B('prop', 0.36, 0.03, 0.28, x - 0.55, baseY + 0.84, z - 0.18, 0xf2eee4);
    B('prop', 0.36, 0.03, 0.28, x + 0.55, baseY + 0.84, z + 0.18, 0xf2eee4);
    G('propMetal', cyl(0.08, 0.1, 0.18, x, baseY + 0.84, z, 0xc8a44a, 10));
    B('emit', 0.16, 0.18, 0.16, x, baseY + 1.0, z, 0xffd682);
    // 4 textured wood & upholstered chairs
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.95, 0.95]) {
      B('intWood', 0.48, 0.06, 0.48, x + sx, baseY + 0.42, z + sz, 0x6b4b30);
      B('carpet2', 0.44, 0.07, 0.44, x + sx, baseY + 0.48, z + sz, cushionCol);
      B('intWood', 0.48, 0.54, 0.07, x + sx, baseY + 0.48, z + sz + Math.sign(sz) * 0.21, 0x6b4b30);
      B('carpet2', 0.42, 0.34, 0.06, x + sx, baseY + 0.62, z + sz + Math.sign(sz) * 0.17, cushionCol);
    }
    if (baseY < 1.0) P(2.1, 0.85, 1.3, x, baseY, z);
  };

  const shelf = (x: number, z: number, len: number, h: number, ry = 0, baseY = FLOOR_Y) => {
    B('intWood', len, h, 0.55, x, baseY, z, 0x6c5844, ry);
    for (let l = 0; l < 4; l++) {
      B('intWood', len - 0.1, 0.06, 0.6, x, baseY + 0.5 + l * (h - 0.6) / 4, z, 0x8a7358, ry);
      for (let i = 0; i < Math.floor(len / 0.55); i++) {
        const px = -len / 2 + 0.4 + i * 0.55;
        B('prop', 0.36, 0.34, 0.3, x + px, baseY + 0.58 + l * (h - 0.6) / 4, z, r.pick([0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x7d3c98, 0xe8e8e8]), ry);
      }
    }
    if (baseY < 1.0) P(len, h, 0.62, x, baseY, z);
  };

  const plant = (x: number, z: number, baseY = FLOOR_Y) => {
    G('prop', cyl(0.32, 0.25, 0.56, x, baseY, z, 0xb06a3a, 10));
    c.b.add('prop', sph(0.54, cx + x, baseY + 0.92, cz + z, 0x3a7a30, 1, 1.15, 1, 8), ch);
    c.b.add('prop', sph(0.44, cx + x + 0.18, baseY + 1.24, cz + z - 0.1, 0x4f8f3a, 1, 1.2, 1, 8), ch);
    if (baseY < 1.0) c.world.addCircle(cx + x, cz + z, 0.32, 1.5, 'plant');
  };

  const painting = (x: number, y: number, z: number, ry: number) => {
    B('intTrim', 1.9, 1.32, 0.08, x, y - 0.66, z, 0x8a6a3a, ry);
    c.b.add('ad', sign(1.7, 1.1, cx + x + Math.sin(ry) * 0.06, y, cz + z + Math.cos(ry) * 0.06, ry, [r.int(0, 1) * 0.5, r.chance(0.5) ? 0.5 : 0, 0.5, 0.5]), ch);
  };

  const vendingMachine = (x: number, z: number, baseY = FLOOR_Y) => {
    B('propMetal', 1.15, 2.1, 0.85, x, baseY, z, 0xb82424);
    B('emit', 0.92, 1.25, 0.05, x, baseY + 0.68, z + 0.44, 0xffe8a6);
    B('prop', 0.88, 0.26, 0.1, x, baseY + 0.22, z + 0.44, 0x1a1c20);
    if (baseY < 1.0) P(1.15, 2.1, 0.85, x, baseY, z);
  };

  // Furnish the Upper Mezzanine Balcony in every room so climbing the stairs is immediately rewarding!
  if (kind === 'diner' || kind === 'apartment') {
    diningSet(-6.6, -6.5, MEZZ_Y, 0x8f2c2c);
    diningSet(-1.2, -6.5, MEZZ_Y, 0x2c5c4b);
    diningSet(4.2, -6.5, MEZZ_Y, 0x8f2c2c);
    floorLamp(-9.6, -7.8, MEZZ_Y);
    plant(10.8, -8.0, MEZZ_Y);
    npcSpots.push({ x: cx - 6.6 - 0.55, z: cz - 6.5 + 0.95, y: MEZZ_Y, yaw: Math.PI, role: 'seated' });
    npcSpots.push({ x: cx + 4.2 + 0.55, z: cz - 6.5 - 0.95, y: MEZZ_Y, yaw: 0, role: 'seated' });
    npcSpots.push({ x: cx - 0.4, z: cz - 5.2, y: MEZZ_Y, yaw: 0.15, role: 'customer' });
  } else {
    sofa(-6.2, -7.2, 0, 0x3b5566, 2.8, MEZZ_Y);
    coffeeTable(-6.2, -5.6, 1.5, 0.75, MEZZ_Y);
    officeDesk(2.8, -7.0, 0, MEZZ_Y);
    bookshelf(-1.2, -8.3, 3.0, 2.1, 0, MEZZ_Y);
    floorLamp(-9.0, -7.6, MEZZ_Y);
    plant(10.8, -8.0, MEZZ_Y);
    npcSpots.push({ x: cx - 6.2, z: cz - 7.1, y: MEZZ_Y, yaw: 0, role: 'seated' });
    npcSpots.push({ x: cx + 1.2, z: cz - 5.3, y: MEZZ_Y, yaw: -0.2, role: 'customer' });
  }

  // ---------------------------------------------------------------- Room-Specific Main-Floor Layouts & Crowds
  switch (kind) {
    case 'diner': {
      // Richly textured restaurant order counter with marble top, dual POS terminals & pastry display case
      counter(-5.2, 0.4, 8.8, 0, 0x7c362e);
      // POS registers & illuminated menu display
      for (const rx of [-7.4, -4.6]) {
        B('prop', 0.5, 0.36, 0.38, rx, FLOOR_Y + 1.13, 0.4, 0x1f2228);
        B('emit', 0.34, 0.18, 0.04, rx, FLOOR_Y + 1.24, 0.58, 0xffe4a0);
      }
      // Glass bakery / pastry case on right end of order counter
      B('propMetal', 2.0, 0.55, 0.78, -2.0, FLOOR_Y + 1.12, 0.4, 0xcfd6dc);
      B('glass', 1.9, 0.5, 0.72, -2.0, FLOOR_Y + 1.16, 0.4, 0x345a6b);
      B('emit', 1.7, 0.05, 0.5, -2.0, FLOOR_Y + 1.62, 0.4, 0xfff0c4);
      // Suspended illuminated order menu board hung cleanly from ceiling rods above the counter
      B('propMetal', 4.35, 1.05, 0.12, -5.2, 3.35, 0.35, 0x22252b);
      for (const sx of [-6.8, -3.6]) {
        G('propMetal', cyl(0.025, 0.025, RH - 4.4, sx, 4.4, 0.35, 0x2c3038, 8));
      }
      c.b.add('sign', sign(4.2, 0.96, cx - 5.2, 3.88, cz + 0.43, 0, signUV(label === 'BURGERS' ? 'DINER' : 'BURGERS')), ch);

      // Restaurant Wait Line Queue: brass stanchions + burgundy velvet ropes + 5 queued hungry customers!
      addWaitLine(-4.6, 2.1, 0.36, 0.93, 5, true);

      // Dining floor tables & cozy under-mezzanine booths
      diningSet(3.6, 3.6, FLOOR_Y, 0x942c2c);
      diningSet(3.6, -0.6, FLOOR_Y, 0x2c5b49);
      diningSet(-6.6, -6.5, FLOOR_Y, 0x942c2c);
      diningSet(0.2, -6.5, FLOOR_Y, 0x8f5d2c);

      // Retro jukebox + warm neon trim + woven lounge rug near entrance
      B('intWood', 1.15, 1.85, 0.82, 10.6, FLOOR_Y, 5.2, 0x5c361e);
      B('emit', 0.88, 0.85, 0.1, 10.6, FLOOR_Y + 0.76, 4.76, 0xff6ac2);
      B('emit', 0.8, 0.4, 0.1, 10.6, FLOOR_Y + 0.25, 4.76, 0x5ae2ff);
      B('carpet', 5.2, 0.025, 3.8, 3.6, FLOOR_Y, 3.6, 0x5c2e2c);
      floorLamp(10.4, 7.2);
      plant(10.4, 2.2);
      plant(-10.4, 7.4);
      painting(11.65, 2.5, 2.6, -Math.PI / 2);

      // Servers & clerks behind the order counter facing the wait line
      npcSpots.push({ x: cx - 6.8, z: cz - 0.85, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx - 4.2, z: cz - 0.85, y: FLOOR_Y, yaw: 0.1, role: 'server' });
      // Seated diners enjoying meals at booths & tables
      npcSpots.push({ x: cx + 3.6 - 0.55, z: cz + 3.6 + 0.95, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      npcSpots.push({ x: cx + 3.6 + 0.55, z: cz + 3.6 - 0.95, y: FLOOR_Y, yaw: 0, role: 'seated' });
      npcSpots.push({ x: cx + 3.6 - 0.55, z: cz - 0.6 - 0.95, y: FLOOR_Y, yaw: 0, role: 'seated' });
      npcSpots.push({ x: cx - 6.6 + 0.55, z: cz - 6.5 + 0.95, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      break;
    }

    case 'shop': {
      counter(-5.4, 1.0, 7.6, 0);
      B('prop', 0.52, 0.38, 0.38, -6.2, FLOOR_Y + 1.13, 1.0, 0x24262a);
      B('emit', 0.3, 0.14, 0.24, -6.2, FLOOR_Y + 1.2, 0.86, 0x9fffc0);
      B('prop', 0.52, 0.38, 0.38, -3.4, FLOOR_Y + 1.13, 1.0, 0x24262a);
      // Checkout wait line with 4 queued shoppers
      addWaitLine(-5.0, 2.5, 0.32, 0.95, 4, true);

      shelf(3.6, 2.2, 5.4, 2.2, 0);
      shelf(3.6, -1.6, 5.4, 2.2, 0);
      shelf(-4.8, -6.4, 6.2, 2.2, 0);
      vendingMachine(-10.4, 1.8);
      // Illuminated cold drinks cooler tucked cleanly along the back-right under-mezzanine wall
      B('propMetal', 3.6, 2.2, 1.0, 4.6, FLOOR_Y, -7.8, 0xd4dbe0);
      B('glass', 3.3, 1.65, 0.08, 4.6, FLOOR_Y + 0.35, -7.28, 0x24404f);
      B('emit', 3.1, 1.38, 0.04, 4.6, FLOOR_Y + 0.48, -7.33, 0xc8f4ff);
      P(3.6, 2.2, 1.0, 4.6, FLOOR_Y, -7.8);
      floorLamp(10.2, 6.8);
      plant(10.2, 2.6);
      plant(-10.2, 7.4);

      npcSpots.push({ x: cx - 6.2, z: cz - 0.3, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx - 3.4, z: cz - 0.3, y: FLOOR_Y, yaw: 0.15, role: 'clerk' });
      npcSpots.push({ x: cx + 2.2, z: cz + 0.2, y: FLOOR_Y, yaw: 1.2, role: 'customer' });
      npcSpots.push({ x: cx + 5.2, z: cz + 4.4, y: FLOOR_Y, yaw: -0.6, role: 'customer' });
      break;
    }

    case 'bank': {
      B('intMarble', RW - 3, 0.04, 7.5, 0, FLOOR_Y, 2.4, 0xf6f3ea);
      for (let i = 0; i < 3; i++) {
        const x = -7.2 + i * 5.2;
        counter(x, -1.6, 4.4, 0, 0x6b5330);
        B('glass', 3.8, 1.75, 0.12, x, FLOOR_Y + 1.12, -2.0, 0x1c3440);
        B('emit', 1.4, 0.1, 0.06, x, FLOOR_Y + 2.25, -1.9, 0xffe4a8);
        B('propMetal', 2.6, 0.35, 0.12, x, FLOOR_Y + 2.05, -1.92, 0xd9b84a);
      }
      // Teller wait line with velvet stanchions & 4 queued banking customers
      addWaitLine(-4.2, 0.4, 0.35, 0.94, 4, true);

      sofa(5.0, 5.2, Math.PI, 0x6e2d2d, 2.8);
      coffeeTable(5.0, 3.4, 1.6, 0.75);
      // Steel bank vault door in back-left alcove
      B('propMetal', 3.4, 2.4, 0.4, -8.8, FLOOR_Y, -RD / 2 + 0.6, 0x8a8f94);
      B('propMetal', 2.6, 2.0, 0.2, -8.8, FLOOR_Y + 0.1, -RD / 2 + 0.85, 0x6b7075);
      B('propMetal', 0.6, 0.6, 0.3, -8.8, FLOOR_Y + 1.15, -RD / 2 + 1.0, 0xd9b84a);
      floorLamp(10.0, 6.4);
      painting(11.65, 2.5, 2.8, -Math.PI / 2);

      npcSpots.push({ x: cx - 7.2, z: cz - 2.9, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx - 2.0, z: cz - 2.9, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx + 2.4, z: cz + 0.6, y: FLOOR_Y, yaw: 0.4, role: 'guard' });
      npcSpots.push({ x: cx - 9.2, z: cz + 4.8, y: FLOOR_Y, yaw: 0.8, role: 'guard' });
      npcSpots.push({ x: cx + 5.0, z: cz + 5.1, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      break;
    }

    case 'office': {
      counter(-4.8, 1.2, 7.2, 0, 0x2f4858);
      addWaitLine(-4.6, 2.8, 0.25, 0.96, 3, true);
      for (let i = 0; i < 3; i++) officeDesk(-7.2 + i * 5.2, -6.5);
      sofa(4.8, 4.6, Math.PI, 0x2e4152, 3.2);
      coffeeTable(4.8, 2.8, 1.6, 0.8);
      floorLamp(9.6, 6.2);
      vendingMachine(-10.4, 0.4);
      plant(10.2, 2.4);
      plant(-10.2, 7.4);
      npcSpots.push({ x: cx - 4.8, z: cz - 0.1, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx + 4.8, z: cz + 4.5, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      npcSpots.push({ x: cx + 1.8, z: cz + 1.0, y: FLOOR_Y, yaw: -0.5, role: 'customer' });
      break;
    }

    case 'apartment': {
      B('carpet', 8.2, 0.03, 6.4, 3.6, FLOOR_Y, 2.8, 0x7d4c42);
      // King bed under left back alcove
      B('intWood', 4.4, 0.46, 3.2, -6.8, FLOOR_Y, -6.4, 0x6c4c32);
      B('intWood', 4.6, 1.35, 0.22, -6.8, FLOOR_Y, -8.0, 0x573b26);
      B('carpet2', 4.1, 0.34, 2.9, -6.8, FLOOR_Y + 0.46, -6.3, 0xe4ddd2);
      B('carpet2', 4.0, 0.22, 1.8, -6.8, FLOOR_Y + 0.68, -5.8, 0x3b5972);
      P(4.6, 1.2, 3.4, -6.8, FLOOR_Y, -6.4);
      // Living room sofa, coffee table & entertainment center
      sofa(3.8, 1.4, 0, 0x3d5c6c, 3.4);
      coffeeTable(3.8, 3.4, 1.8, 0.9);
      B('intWood', 3.2, 0.68, 0.78, 3.8, FLOOR_Y, 6.0, 0x4f3928);
      B('prop', 2.1, 1.22, 0.08, 3.8, FLOOR_Y + 0.88, 6.1, 0x16181c);
      B('emit', 1.98, 1.08, 0.04, 3.8, FLOOR_Y + 0.94, 6.06, 0x3c6a94);
      floorLamp(6.6, 1.2);
      // Kitchenette & dining table
      counter(-5.8, 1.2, 5.4, 0, 0x7d5d40);
      B('propMetal', 1.05, 2.2, 1.0, -9.4, FLOOR_Y, 1.2, 0xd4dade);
      diningSet(-5.2, 4.8, FLOOR_Y, 0x3b5972);
      plant(10.0, 6.8);
      npcSpots.push({ x: cx + 3.8, z: cz + 1.5, y: FLOOR_Y, yaw: 0, role: 'seated' });
      npcSpots.push({ x: cx - 5.2 - 0.55, z: cz + 4.8 - 0.95, y: FLOOR_Y, yaw: 0, role: 'seated' });
      npcSpots.push({ x: cx - 2.6, z: cz + 2.4, y: FLOOR_Y, yaw: -0.6, role: 'customer' });
      npcSpots.push({ x: cx + 0.4, z: cz - 1.2, y: FLOOR_Y, yaw: 0.3, role: 'customer' });
      break;
    }

    case 'police': {
      counter(-4.8, 1.0, 8.2, 0, 0x24365c);
      c.b.add('sign', sign(5.4, 1.2, cx - 4.8, 3.4, cz - 0.4, 0, signUV('POLICE')), ch);
      addWaitLine(-4.6, 2.6, 0.3, 0.95, 3, true);
      for (let i = 0; i < 2; i++) officeDesk(-7.0 + i * 5.2, -6.5);
      for (let i = 0; i < 7; i++) B('propMetal', 0.08, 2.4, 0.08, 1.8 + i * 0.55, FLOOR_Y, -7.8, 0x9aa0a5);
      B('prop', 3.4, 0.45, 0.9, 3.6, FLOOR_Y, -6.6, 0x7a7f84);
      sofa(4.8, 5.0, Math.PI, 0x223862, 2.8);
      vendingMachine(-10.4, 0.8);
      npcSpots.push({ x: cx - 5.2, z: cz - 0.3, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx + 2.4, z: cz + 1.6, y: FLOOR_Y, yaw: 0.5, role: 'guard' });
      npcSpots.push({ x: cx + 4.8, z: cz + 4.9, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      break;
    }

    case 'hospital': {
      counter(-4.8, 1.0, 8.0, 0, 0x4caea4);
      c.b.add('sign', sign(5.0, 1.2, cx - 4.8, 3.4, cz - 0.4, 0, signUV('HOSPITAL')), ch);
      addWaitLine(-4.6, 2.6, 0.32, 0.94, 3, true);
      for (let i = 0; i < 3; i++) {
        B('propMetal', 1.0, 0.8, 2.1, -8.2 + i * 2.2, FLOOR_Y, -6.4, 0xcfd4d8);
        B('carpet2', 0.9, 0.18, 2.0, -8.2 + i * 2.2, FLOOR_Y + 0.8, -6.4, 0x8fd6d0);
        B('prop', 0.5, 0.25, 0.5, -8.2 + i * 2.2, FLOOR_Y + 0.98, -7.2, 0xf4f4f4);
        P(1.1, 1.0, 2.2, -8.2 + i * 2.2, FLOOR_Y, -6.4);
      }
      sofa(4.8, 4.8, Math.PI, 0x3b8a8a, 3.2);
      coffeeTable(4.8, 3.0, 1.5, 0.7);
      plant(10.2, 6.8);
      plant(-10.2, 7.4);
      npcSpots.push({ x: cx - 5.4, z: cz - 0.3, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx - 2.8, z: cz - 0.3, y: FLOOR_Y, yaw: 0, role: 'server' });
      npcSpots.push({ x: cx + 4.8, z: cz + 4.7, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
      npcSpots.push({ x: cx + 2.4, z: cz + 0.4, y: FLOOR_Y, yaw: 0.4, role: 'guard' });
      break;
    }

    case 'gun': {
      counter(-4.8, 1.0, 8.8, 0, 0x6b2b2b);
      addWaitLine(-4.6, 2.6, 0.3, 0.95, 3, true);
      for (let i = 0; i < 4; i++) {
        const rx = -8.6 + i * 3.0;
        B('intWood', 2.4, 2.2, 0.42, rx, FLOOR_Y, -RD / 2 + 0.65, 0x4f3a2a);
        B('intTrim', 2.15, 1.3, 0.1, rx, FLOOR_Y + 0.75, -RD / 2 + 0.9, 0x9e7a34);
        B('glass', 2.0, 1.15, 0.05, rx, FLOOR_Y + 0.82, -RD / 2 + 0.86, 0x1c2a30);
        for (let k = 0; k < 3; k++) {
          B('propMetal', 1.15 - k * 0.18, 0.11, 0.12, rx, FLOOR_Y + 1.6 - k * 0.32, -RD / 2 + 0.92, k === 0 ? 0x22252a : 0x383c42);
        }
        B('emit', 1.9, 0.06, 0.08, rx, FLOOR_Y + 2.0, -RD / 2 + 0.88, 0xffe099);
        P(2.4, 2.2, 0.5, rx, FLOOR_Y, -RD / 2 + 0.65);
      }
      B('propMetal', 3.4, 0.95, 1.2, 4.4, FLOOR_Y, 3.2, 0x3a3e44);
      B('glass', 3.2, 0.55, 1.0, 4.4, FLOOR_Y + 0.95, 3.2, 0x243b46);
      B('emit', 3.0, 0.06, 0.8, 4.4, FLOOR_Y + 1.42, 3.2, 0xffcc88);
      c.b.add('sign', sign(4.8, 1.2, cx - 4.8, 3.4, cz - 0.5, 0, signUV('AMMO')), ch);
      floorLamp(10.0, 6.4);
      npcSpots.push({ x: cx - 5.2, z: cz - 0.3, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx + 2.6, z: cz + 1.6, y: FLOOR_Y, yaw: 0.5, role: 'customer' });
      npcSpots.push({ x: cx + 6.4, z: cz + 3.4, y: FLOOR_Y, yaw: -1.4, role: 'customer' });
      break;
    }

    case 'garage': {
      B('propMetal', 6.4, 0.2, 3.4, -2.0, FLOOR_Y, 0.8, 0x3a3d42);
      for (const s of [-1, 1]) B('propMetal', 0.34, 2.8, 0.42, -2.0 + s * 3.0, FLOOR_Y, 0.8, 0xc0392b);
      B('prop', 2.4, 0.9, 1.2, -8.2, FLOOR_Y, -6.2, 0xc0392b);
      B('propMetal', 2.4, 0.08, 1.25, -8.2, FLOOR_Y + 0.9, -6.2, 0xa8adb2);
      for (const [tx, tz] of [[4.8, 1.4], [5.8, 2.2], [4.4, 3.2]]) {
        G('prop', cyl(0.52, 0.52, 0.3, tx, FLOOR_Y, tz, 0x151518, 14));
        G('propMetal', cyl(0.28, 0.28, 0.32, tx, FLOOR_Y, tz, 0x9aa0a5, 12));
      }
      counter(-6.8, 4.8, 4.6, 0, 0x454a52);
      addWaitLine(-6.2, 6.2, 0.95, 0.15, 2, false);
      sofa(4.8, 5.4, Math.PI, 0x3f4c58, 2.8);
      vendingMachine(10.0, 5.6);
      c.b.add('sign', sign(4.4, 1.2, cx - 2.0, 3.5, cz - 1.2, 0, signUV('PAY N SPRAY')), ch);
      npcSpots.push({ x: cx - 6.8, z: cz + 3.6, y: FLOOR_Y, yaw: 0, role: 'clerk' });
      npcSpots.push({ x: cx + 4.8, z: cz + 5.3, y: FLOOR_Y, yaw: Math.PI, role: 'seated' });
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
    { x: cx - RW / 2 + 1.1, z: cz + 5.4, y: FLOOR_Y, yaw: Math.PI / 2, label: 'Side Exit' },
    { x: cx - RW / 2 + 1.1, z: cz - 6.5, y: MEZZ_Y, yaw: Math.PI / 2, label: 'Upstairs Exit' },
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
    spawn: { x: cx, z: cz + RD / 2 - 1.6, yaw: Math.PI },
    exit: { x: cx, z: cz + RD / 2 - 1.0, yaw: Math.PI },
    exits,
    elevation,
    npcSpots,
    pendantLights,
    light: new THREE.Vector3(cx, RH - 0.8, cz),
    warmTint,
  };
}
void finish;
