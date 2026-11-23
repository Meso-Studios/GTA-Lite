// Enterable, richly furnished interiors with warm/cool architectural lighting for every shop & civic building.
import * as THREE from 'three';
import { box, cyl, finish, sph } from './geo';
import { signUV } from './textures';
import { sign } from './geo';
import type { BCtx, Door } from './buildings';

export interface Room {
  id: number;
  kind: Door['kind'];
  name: string;
  cx: number;
  cz: number;
  w: number;
  d: number;
  spawn: { x: number; z: number; yaw: number };
  exit: { x: number; z: number; yaw: number };
  npcSpots: { x: number; z: number; yaw: number; role: 'clerk' | 'customer' | 'guard' }[];
  light: THREE.Vector3;
  warmTint: number;
}

const RW = 22, RD = 16, RH = 4.6;

export function buildInteriors(c: BCtx): Room[] {
  const rooms: Room[] = [];
  const kinds: Door['kind'][] = ['shop', 'diner', 'office', 'apartment', 'bank', 'police', 'hospital', 'gun', 'garage'];
  let idx = 0;
  for (const kind of kinds) {
    for (let variant = 0; variant < 2; variant++) {
      // Positioned cleanly outside the 10km x 10km (-5000..+5000) playable map
      const cx = 6400 + (idx % 6) * 48, cz = 6400 + Math.floor(idx / 6) * 48;
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
  const G = (mat: string, geo: THREE.BufferGeometry) => { geo.translate(cx, 0, cz); c.b.add(mat, geo, ch); };

  const floorMat = kind === 'bank' || kind === 'office' ? 'intMarble' : kind === 'apartment' ? 'wood' : 'intTile';
  const wallCol = kind === 'diner' ? 0xebe0c6 : kind === 'apartment' ? 0xe4d9cb : kind === 'garage' ? 0xa6aeb2 : kind === 'bank' ? 0xede6d5 : kind === 'hospital' ? 0xe4eff0 : 0xe5dfd4;
  const accent = kind === 'bank' ? 0x947236 : kind === 'police' ? 0x223862 : kind === 'hospital' ? 0x4caea4 : kind === 'gun' ? 0x7a2b2b : kind === 'garage' ? 0xc0392b : variant ? 0x2c5c4b : r.pick([0x24503f, 0x7d3c3c, 0x2f4858, 0x8a6a2f]);
  const warmTint = kind === 'diner' || kind === 'apartment' || kind === 'bank' ? 0xffdfb0 : kind === 'hospital' || kind === 'police' ? 0xdcf0ff : 0xfff0d4;

  // Shell: floor, ceiling, coffered beams, walls
  B(floorMat, RW + 0.6, 0.24, RD + 0.6, 0, 0, 0, 0xffffff);
  B('intCeil', RW, 0.3, RD, 0, RH, 0, 0xf2efe8);
  for (const bz of [-3.6, 3.6]) B('intTrim', RW - 0.6, 0.24, 0.35, 0, RH - 0.22, bz, 0xd9d2c2);
  B('intWall', RW, RH, 0.4, 0, 0, -RD / 2, wallCol);
  B('intWall', 0.4, RH, RD, -RW / 2, 0, 0, wallCol);
  B('intWall', 0.4, RH, RD, RW / 2, 0, 0, wallCol);
  P(RW, RH, 0.4, 0, 0, -RD / 2); P(0.4, RH, RD, -RW / 2, 0, 0); P(0.4, RH, RD, RW / 2, 0, 0);

  // Side windows with frames, mullions & warm daylight bounce
  for (const zoff of [-4.4, 4.4]) {
    for (const sx of [-1, 1]) {
      B('glass', 0.1, 1.8, 2.6, sx * (RW / 2 - 0.22), 1.9, zoff, 0x365f77);
      B('intTrim', 0.15, 2.0, 2.8, sx * (RW / 2 - 0.26), 1.8, zoff, 0xcac3b5);
      B('intTrim', 0.18, 0.08, 2.9, sx * (RW / 2 - 0.28), 1.78, zoff, 0xb6afa0);
      c.b.add('emit', box(0.08, 1.6, 2.4, cx + sx * (RW / 2 - 0.31), 2.0, cz + zoff, 0xb2d8ee), ch);
    }
  }
  // Front wall with entrance glazing & brass handles
  for (const s of [-1, 1]) {
    const seg = RW / 2 - 3.2;
    B('intWall', seg, RH, 0.4, s * (3.2 + seg / 2), 0, RD / 2, wallCol);
    P(seg, RH, 0.4, s * (3.2 + seg / 2), 0, RD / 2);
    B('glass', seg - 0.7, 2.3, 0.12, s * (3.2 + seg / 2), 1.5, RD / 2 - 0.24, 0x1c3542);
  }
  B('intWall', 6.4, 1.6, 0.4, 0, 3.0, RD / 2, wallCol);
  B('glass', 5.6, 2.9, 0.14, 0, 0.1, RD / 2 - 0.2, 0x274955);
  B('intTrim', 0.22, 3.0, 0.26, -2.85, 0, RD / 2 - 0.15, 0xc9c3b4);
  B('intTrim', 0.22, 3.0, 0.26, 2.85, 0, RD / 2 - 0.15, 0xc9c3b4);
  B('propMetal', 0.07, 0.9, 0.08, -0.3, 1.0, RD / 2 - 0.34, 0xd9b84a);
  B('propMetal', 0.07, 0.9, 0.08, 0.3, 1.0, RD / 2 - 0.34, 0xd9b84a);
  P(6.6, RH, 0.5, 0, 0, RD / 2);
  B('emit', 3.4, 0.08, 0.5, 0, 4.4, RD / 2 - 0.5, 0xfff2dc);

  // Baseboards, wainscot, and crown molding
  for (const z of [-RD / 2 + 0.25, RD / 2 - 0.25]) {
    B('intTrim', RW - 0.8, 0.22, 0.12, 0, 0, z, 0xb8b0a0);
    B('intTrim', RW - 0.8, 0.1, 0.12, 0, 1.02, z, 0xc7bfae);
    B('intTrim', RW - 0.8, 0.18, 0.18, 0, RH - 0.24, z, 0xd6cebd);
  }
  for (const x of [-RW / 2 + 0.25, RW / 2 - 0.25]) {
    B('intTrim', 0.12, 0.22, RD - 0.8, x, 0, 0, 0xb8b0a0);
    B('intTrim', 0.12, 0.1, RD - 0.8, x, 1.02, 0, 0xc7bfae);
    B('intTrim', 0.14, 0.18, RD - 0.8, x, RH - 0.24, 0, 0xd6cebd);
  }
  // Recessed ceiling light panels + suspended warm pendants
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    B('emit', 2.4, 0.08, 1.0, i * 6.4, RH - 0.18, j * 4.4, warmTint);
    B('intTrim', 2.7, 0.12, 1.3, i * 6.4, RH - 0.1, j * 4.4, 0xcfc9bc);
  }
  // Brand accent strip + back wall signage + clock + security cam
  B('intAccent', RW - 1, 0.5, 0.12, 0, 3.95, -RD / 2 + 0.3, accent);
  const label = kind === 'bank' ? 'BANK' : kind === 'police' ? 'POLICE' : kind === 'hospital' ? 'HOSPITAL' : kind === 'gun' ? 'AMMO' : kind === 'garage' ? 'PAY N SPRAY' : kind === 'diner' ? r.pick(['DINER', 'CAFE', 'PIZZA', 'BURGERS']) : kind === 'apartment' ? 'HOTEL' : r.pick(['24H MART', 'PHARMACY', 'COFFEE', 'RECORDS', 'BOOKS']);
  c.b.add('sign', sign(5, 1.25, cx, cz - RD / 2 + 0.42, 2.25, 0, signUV(label)), ch);
  c.b.add('prop', cyl(0.32, 0.32, 0.07, cx + RW / 2 - 0.32, 2.7, cz + 1.2, 0x222222, 16), ch);
  c.b.add('prop', cyl(0.26, 0.26, 0.09, cx + RW / 2 - 0.32, 2.7, cz + 1.2, 0xf4f4f0, 16), ch);
  c.b.add('propMetal', box(0.5, 0.22, 0.24, cx - RW / 2 + 0.4, 3.5, cz - RD / 2 + 1.2, 0xd8dcdc, 0.5), ch);
  c.b.add('red', sph(0.06, cx - RW / 2 + 0.55, 3.46, cz - RD / 2 + 1.32, 0xff3030), ch);

  const npcSpots: Room['npcSpots'] = [];

  // ---------------------------------------------------------------- reusable rich furniture kits
  const counter = (x: number, z: number, len: number, ry = 0, col = accent) => {
    B('intWood', len, 1.02, 0.85, x, 0, z, col, ry);
    B('intMarble', len + 0.24, 0.09, 1.0, x, 1.02, z, 0xede9dc, ry);
    B('intTrim', len, 0.14, 0.08, x, 0.26, z + 0.44, 0xc8c0b0, ry);
    P(len, 1.1, 1.0, x, 0, z);
  };

  const sofa = (x: number, z: number, ry: number, col = 0x3b5566, w = 2.6) => {
    // base frame + wooden legs
    B('intWood', w, 0.16, 0.96, x, 0.14, z, 0x5d412a, ry);
    // plush seat cushions
    B('carpet2', w - 0.36, 0.22, 0.84, x, 0.3, z, col, ry);
    // backrest & armrests (rotated via helper offset)
    const s = Math.sin(ry), co = Math.cos(ry);
    const rot = (lx: number, lz: number): [number, number] => [x + lx * co + lz * s, z - lx * s + lz * co];
    const [bx, bz] = rot(0, -0.38);
    B('carpet2', w - 0.16, 0.56, 0.24, bx, 0.44, bz, col, ry);
    for (const side of [-1, 1]) {
      const [ax, az] = rot(side * (w / 2 - 0.14), 0.04);
      B('carpet2', 0.24, 0.46, 0.9, ax, 0.26, az, col, ry);
      // accent throw pillow
      const [px, pz] = rot(side * (w / 2 - 0.48), -0.18);
      B('prop', 0.34, 0.32, 0.16, px, 0.52, pz, 0xdcb464, ry + side * 0.25);
    }
    P(Math.abs(co) > 0.5 ? w : 1.0, 0.95, Math.abs(co) > 0.5 ? 1.0 : w, x, 0, z);
  };

  const coffeeTable = (x: number, z: number, w = 1.5, d = 0.8) => {
    B('intWood', w, 0.07, d, x, 0.46, z, 0x6f4e32);
    B('intWood', w - 0.18, 0.05, d - 0.18, x, 0.2, z, 0x5c4028);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      B('intWood', 0.07, 0.46, 0.07, x + sx * (w / 2 - 0.1), 0, z + sz * (d / 2 - 0.1), 0x4d3420);
    }
    // coffee mug + magazine stack
    B('prop', 0.34, 0.05, 0.24, x - 0.25, 0.53, z + 0.06, 0x2c6ca0, 0.2);
    G('prop', cyl(0.055, 0.05, 0.11, x + 0.28, 0.53, z - 0.05, 0xf2f0eb, 8));
    P(w, 0.55, d, x, 0, z);
  };

  const floorLamp = (x: number, z: number) => {
    G('propMetal', cyl(0.22, 0.26, 0.05, x, 0, z, 0x3b3d42, 12));
    G('propMetal', cyl(0.03, 0.035, 1.72, x, 0.05, z, 0xb8964c, 8));
    G('prop', cyl(0.18, 0.32, 0.36, x, 1.62, z, 0xf3e7cc, 14));
    B('emit', 0.22, 0.14, 0.22, x, 1.68, z, 0xffe4a8);
    c.world.addCircle(cx + x, cz + z, 0.24, 2.0, 'lamp');
  };

  const bookshelf = (x: number, z: number, len = 2.6, h = 2.35, ry = 0) => {
    B('intWood', len, h, 0.48, x, 0, z, 0x624630, ry);
    for (let l = 0; l < 4; l++) {
      const sy = 0.45 + l * (h - 0.55) / 4;
      B('intWood', len - 0.12, 0.06, 0.52, x, sy, z, 0x7c5a3e, ry);
      const nBooks = Math.floor((len - 0.3) / 0.22);
      for (let i = 0; i < nBooks; i++) {
        if (r.chance(0.16)) continue;
        const bx = -len / 2 + 0.24 + i * 0.22;
        const bh = 0.26 + (i % 3) * 0.05;
        B('prop', 0.15, bh, 0.26, x + bx, sy + 0.06, z + 0.04, r.pick([0xa83232, 0x245d8c, 0x2b7548, 0xc78f24, 0x6c3d82, 0xded9ce]), ry);
      }
    }
    P(len, h, 0.56, x, 0, z);
  };

  const officeDesk = (x: number, z: number, ry = 0) => {
    B('intWood', 2.2, 0.08, 1.05, x, 0.74, z, 0x8c7054, ry);
    B('intWood', 0.55, 0.74, 0.96, x - 0.76, 0, z, 0x6d563f, ry);
    B('intWood', 0.55, 0.74, 0.96, x + 0.76, 0, z, 0x6d563f, ry);
    // dual-bezel monitor + glowing screen + keyboard + desk lamp
    B('prop', 0.68, 0.42, 0.06, x, 0.92, z - 0.22, 0x1c1e22, ry);
    B('emit', 0.62, 0.34, 0.02, x, 0.96, z - 0.18, 0x7cc8f0, ry);
    B('propMetal', 0.1, 0.16, 0.1, x, 0.8, z - 0.22, 0x454a52, ry);
    B('prop', 0.48, 0.03, 0.18, x, 0.82, z + 0.14, 0x26282c, ry);
    B('propMetal', 0.16, 0.34, 0.16, x + 0.75, 0.82, z - 0.22, 0xc8a44a, ry);
    B('emit', 0.12, 0.08, 0.12, x + 0.75, 1.12, z - 0.22, 0xffe2a2, ry);
    // ergonomic swivel chair
    B('propMetal', 0.08, 0.44, 0.08, x, 0, z + 0.85, 0x33363b);
    B('prop', 0.54, 0.1, 0.52, x, 0.44, z + 0.85, 0x222c38);
    B('prop', 0.52, 0.58, 0.1, x, 0.52, z + 1.08, 0x222c38);
    P(2.2, 1.1, 1.1, x, 0, z);
  };

  const diningSet = (x: number, z: number) => {
    B('intWood', 2.0, 0.08, 1.2, x, 0.76, z, 0x7a5738);
    for (const sx of [-0.82, 0.82]) for (const sz of [-0.46, 0.46]) {
      B('intWood', 0.09, 0.76, 0.09, x + sx, 0, z + sz, 0x5c3f26);
    }
    // placemats & lamp centerpiece
    B('prop', 0.35, 0.03, 0.28, x - 0.55, 0.84, z, 0xeee9dd);
    B('prop', 0.35, 0.03, 0.28, x + 0.55, 0.84, z, 0xeee9dd);
    B('emit', 0.14, 0.22, 0.14, x, 0.84, z, 0xffd27a);
    // 4 chairs
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.95, 0.95]) {
      B('intWood', 0.46, 0.07, 0.46, x + sx, 0.45, z + sz, 0x6b4b30);
      B('intWood', 0.46, 0.5, 0.07, x + sx, 0.5, z + sz + Math.sign(sz) * 0.2, 0x6b4b30);
    }
    P(2.1, 0.85, 1.3, x, 0, z);
  };

  const shelf = (x: number, z: number, len: number, h: number, ry = 0) => {
    B('intWood', len, h, 0.55, x, 0, z, 0x6c5844, ry);
    for (let l = 0; l < 4; l++) {
      B('intWood', len - 0.1, 0.06, 0.6, x, 0.5 + l * (h - 0.6) / 4, z, 0x8a7358, ry);
      for (let i = 0; i < Math.floor(len / 0.55); i++) {
        const px = -len / 2 + 0.4 + i * 0.55;
        B('prop', 0.36, 0.34, 0.3, x + px, 0.58 + l * (h - 0.6) / 4, z, r.pick([0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x7d3c98, 0xe8e8e8]), ry);
      }
    }
    P(len, h, 0.62, x, 0, z);
  };

  const plant = (x: number, z: number) => {
    G('prop', cyl(0.32, 0.25, 0.56, x, 0, z, 0xb06a3a, 10));
    c.b.add('prop', sph(0.56, cx + x, 0.92, cz + z, 0x3a7a30, 1, 1.15, 1, 8), ch);
    c.b.add('prop', sph(0.46, cx + x + 0.2, 1.24, cz + z - 0.1, 0x4f8f3a, 1, 1.2, 1, 8), ch);
    c.world.addCircle(cx + x, cz + z, 0.32, 1.5, 'plant');
  };

  const painting = (x: number, z: number, ry: number) => {
    B('intTrim', 1.9, 1.32, 0.08, x, 2.0, z, 0x8a6a3a, ry);
    c.b.add('ad', sign(1.7, 1.1, cx + x, 2.66, cz + z + (Math.abs(ry) < 0.1 ? 0.06 : 0), ry, [(r.int(0, 1)) * 0.5, r.chance(0.5) ? 0.5 : 0, 0.5, 0.5]), ch);
  };

  const vendingMachine = (x: number, z: number) => {
    B('propMetal', 1.15, 2.1, 0.85, x, 0, z, 0xb82424);
    B('emit', 0.92, 1.25, 0.05, x, 0.68, z + 0.44, 0xffe8a6);
    B('prop', 0.88, 0.26, 0.1, x, 0.22, z + 0.44, 0x1a1c20);
    P(1.15, 2.1, 0.85, x, 0, z);
  };

  switch (kind) {
    case 'shop':
      counter(-3.4, 3.2, 6.8, 0);
      shelf(6.2, -3.8, 6.2, 2.4, 0);
      shelf(-6.8, -3.6, 5.4, 2.4, 0);
      shelf(0.2, -0.8, 4.6, 1.7, 0);
      vendingMachine(-9.4, 2.6);
      // illuminated cold drinks cooler
      B('propMetal', 3.4, 2.2, 1.1, 6.8, 0, 4.4, 0xd4dbe0);
      B('glass', 3.1, 1.65, 0.1, 6.8, 0.35, 3.85, 0x24404f);
      B('emit', 2.9, 1.35, 0.06, 6.8, 0.48, 3.8, 0xc8f4ff);
      // cash register + counter scanner
      B('prop', 0.55, 0.4, 0.4, -3.4, 1.12, 3.2, 0x24262a);
      B('emit', 0.3, 0.12, 0.26, -3.4, 1.18, 3.0, 0x9fffc0);
      floorLamp(-9.2, -6.2);
      plant(9.2, 5.8); plant(-9.2, 5.8);
      npcSpots.push({ x: cx - 3.4, z: cz + 4.3, yaw: Math.PI, role: 'clerk' });
      npcSpots.push({ x: cx + 4.2, z: cz - 1.2, yaw: 0.6, role: 'customer' });
      break;

    case 'diner':
      counter(-1.8, 2.8, 11.4, 0, 0x7d3c3c);
      for (let i = 0; i < 6; i++) {
        const sx = -6.8 + i * 2.0;
        B('propMetal', 0.44, 0.1, 0.44, sx, 0.72, 4.25, 0x45484e);
        B('propMetal', 0.11, 0.72, 0.11, sx, 0, 4.25, 0x9aa0a6);
        B('prop', 0.48, 0.12, 0.48, sx, 0.82, 4.25, 0x9e2b2b);
      }
      for (let i = 0; i < 3; i++) diningSet(-7 + i * 6.8, -3.4);
      // jukebox + warm neon glow
      B('intWood', 1.2, 1.8, 0.85, 9.2, 0, 3.8, 0x5c361e);
      B('emit', 0.9, 0.85, 0.12, 9.2, 0.75, 3.35, 0xff6ac2);
      B('emit', 0.82, 0.4, 0.12, 9.2, 0.24, 3.35, 0x5ae2ff);
      floorLamp(-9.6, -6.4); floorLamp(9.6, -6.4);
      c.b.add('sign', sign(5, 1.4, cx, cz - 3.4, 3.1, 0, signUV('BURGERS')), ch);
      painting(9.6, -5.8, -Math.PI / 2);
      npcSpots.push({ x: cx - 2, z: cz + 4.0, yaw: Math.PI, role: 'clerk' });
      npcSpots.push({ x: cx - 7, z: cz - 1.8, yaw: 0.3, role: 'customer' });
      npcSpots.push({ x: cx + 6.6, z: cz - 1.8, yaw: -0.4, role: 'customer' });
      break;

    case 'office':
      counter(0, 3.0, 8.4, 0, 0x2f4858);
      for (let i = 0; i < 4; i++) officeDesk(-5.8 + (i % 2) * 6.0, -3.4 + Math.floor(i / 2) * 3.4);
      bookshelf(-9.6, -5.8, 3.4, 2.4, Math.PI / 2);
      // lounge waiting area
      sofa(6.4, 4.6, Math.PI, 0x2e4152, 3.2);
      coffeeTable(6.4, 2.8, 1.6, 0.8);
      floorLamp(8.8, 5.2);
      vendingMachine(9.4, -5.6);
      plant(-9.2, -6.4); plant(9.2, 5.8);
      painting(-9.5, 0, Math.PI / 2);
      npcSpots.push({ x: cx + 0.4, z: cz + 4.2, yaw: Math.PI, role: 'clerk' });
      npcSpots.push({ x: cx + 4.8, z: cz - 1.5, yaw: 0.8, role: 'customer' });
      break;

    case 'apartment':
      // Woven living room rug
      B('carpet2', 9.2, 0.03, 7.2, 3.2, 0.13, 0.5, 0x7d4c42);
      // King bed + headboard + duvet + pillows + nightstands + bedside lamps
      B('intWood', 4.6, 0.5, 3.3, -6.4, 0, -4.6, 0x6c4c32);
      B('intWood', 4.8, 1.45, 0.22, -6.4, 0, -6.25, 0x573b26);
      B('carpet2', 4.3, 0.36, 3.0, -6.4, 0.5, -4.5, 0xe4ddd2);
      B('carpet2', 4.2, 0.24, 1.9, -6.4, 0.72, -3.9, 0x3b5972);
      for (const s of [-1, 1]) {
        B('carpet2', 1.25, 0.18, 0.7, -6.4 + s * 1.1, 0.88, -5.7, 0xf6f3ec);
        B('intWood', 0.85, 0.58, 0.65, -6.4 + s * 2.95, 0, -5.7, 0x62452e);
        B('emit', 0.24, 0.28, 0.24, -6.4 + s * 2.95, 0.62, -5.7, 0xffe0a4);
      }
      P(4.8, 1.4, 3.5, -6.4, 0, -4.6);
      // Living room sofa, coffee table, entertainment center & bookshelf
      sofa(5.6, -1.2, 0, 0x3d5c6c, 3.4);
      coffeeTable(5.6, 0.8, 1.8, 0.9);
      B('intWood', 3.2, 0.68, 0.8, 5.6, 0, 3.8, 0x4f3928);
      B('prop', 2.1, 1.22, 0.08, 5.6, 0.9, 3.9, 0x16181c);
      B('emit', 1.98, 1.08, 0.04, 5.6, 0.96, 3.86, 0x3c6a94);
      bookshelf(9.4, -4.2, 3.2, 2.35, -Math.PI / 2);
      floorLamp(8.2, -1.6);
      // Kitchenette counter + stove + stainless fridge + dining table
      B('intWood', 5.8, 0.92, 1.1, -5.6, 0, 4.4, 0x7d5d40);
      B('intMarble', 5.9, 0.08, 1.2, -5.6, 0.92, 4.4, 0xe8e5dd);
      B('prop', 1.3, 0.08, 0.85, -5.6, 1.0, 4.4, 0x1e2228);
      B('propMetal', 1.05, 2.2, 1.0, -9.2, 0, 4.4, 0xd4dade);
      diningSet(0.2, -4.4);
      painting(-6.4, -7.85, 0); painting(5.6, -7.85, 0);
      plant(8.8, 5.6);
      npcSpots.push({ x: cx + 0.4, z: cz + 2.2, yaw: Math.PI, role: 'customer' });
      break;

    case 'bank':
      B('intMarble', RW - 2, 0.06, 6, 0, 0.02, 3, 0xf4f1e8);
      for (let i = 0; i < 4; i++) {
        const x = -7.5 + i * 5;
        counter(x, -3.4, 4.2, 0, 0x6b5330);
        B('glass', 3.4, 1.9, 0.12, x, 1.15, -4.7, 0x1c3440);
        B('emit', 1.2, 0.12, 0.06, x, 2.4, -4.6, 0xffe4a8);
        B('propMetal', 2.6, 0.4, 0.12, x, 2.2, -4.62, 0xd9b84a);
      }
      // leather waiting benches + velvet stanchions
      sofa(-4.8, 4.6, Math.PI, 0x6e2d2d, 2.8);
      sofa(4.8, 4.6, Math.PI, 0x6e2d2d, 2.8);
      coffeeTable(0, 4.4, 1.6, 0.75);
      // steel bank vault door
      B('propMetal', 3.6, 4.2, 0.4, 8.6, 0, -RD / 2 + 0.6, 0x8a8f94);
      B('propMetal', 3.0, 3.4, 0.2, 8.6, 0.1, -RD / 2 + 0.85, 0x6b7075);
      B('propMetal', 0.65, 0.65, 0.3, 8.6, 1.8, -RD / 2 + 1.0, 0xd9b84a);
      for (const x of [-8, 8]) {
        G('prop', cyl(0.65, 0.75, 4.5, x, 0, 0.6, 0xf2eee2, 14));
        c.world.addCircle(cx + x, cz + 0.6, 0.7, 4.5, 'column');
        npcSpots.push({ x: cx + x + 1.2, z: cz + 1.5, yaw: Math.PI, role: 'guard' });
      }
      floorLamp(-9.4, 5.4); floorLamp(9.4, 5.4);
      painting(-10, -3, Math.PI / 2); painting(10, -3, -Math.PI / 2);
      break;

    case 'police':
      counter(0, 3.4, 9, 0, 0x24365c);
      c.b.add('sign', sign(6, 1.3, cx, cz + 2.9, 3.2, 0, signUV('POLICE')), ch);
      for (let i = 0; i < 4; i++) officeDesk(-6.6 + (i % 2) * 4.8, -2.6 + Math.floor(i / 2) * 3.2);
      // holding cell with steel bars + bench
      for (let i = 0; i < 7; i++) B('propMetal', 0.08, 3.2, 0.08, 2.4 + i * 0.55, 0, -6.6, 0x9aa0a5);
      B('propMetal', 4.2, 0.12, 0.12, 4.1, 3.1, -6.6, 0x9aa0a5);
      B('prop', 3.4, 0.45, 0.9, 4.2, 0, -5.4, 0x7a7f84);
      bookshelf(9.4, -1.6, 3.2, 2.2, -Math.PI / 2);
      vendingMachine(-9.4, 4.6);
      npcSpots.push({ x: cx - 1, z: cz + 4.4, yaw: Math.PI, role: 'clerk' });
      npcSpots.push({ x: cx + 4, z: cz + 1.6, yaw: 0.4, role: 'guard' });
      break;

    case 'hospital':
      counter(0, 3.4, 8, 0, 0x4caea4);
      c.b.add('sign', sign(5.4, 1.3, cx, cz + 2.9, 3.2, 0, signUV('HOSPITAL')), ch);
      for (let i = 0; i < 4; i++) {
        B('propMetal', 1.0, 0.8, 2.1, -7.6 + i * 1.7, 0, -2.6, 0xcfd4d8);
        B('carpet2', 0.9, 0.18, 2.0, -7.6 + i * 1.7, 0.8, -2.6, 0x8fd6d0);
        B('prop', 0.5, 0.25, 0.5, -7.6 + i * 1.7, 0.98, -3.4, 0xf4f4f4);
        P(1.1, 1, 2.2, -7.6 + i * 1.7, 0, -2.6);
      }
      for (let i = 0; i < 2; i++) {
        B('prop', 2.0, 1.5, 0.9, 4 + i * 3, 0, -4.6, 0xeeeeee);
        B('emit', 0.6, 0.28, 0.06, 4 + i * 3, 1.1, -5.05, 0x8fffcc);
        P(2.0, 1.6, 1.0, 4 + i * 3, 0, -4.6);
      }
      sofa(7.2, 4.4, Math.PI, 0x3b8a8a, 3.2);
      coffeeTable(7.2, 2.6, 1.4, 0.7);
      plant(9.4, 5.6); plant(-9.4, 5.6);
      npcSpots.push({ x: cx + 0.6, z: cz + 4.4, yaw: Math.PI, role: 'clerk' });
      npcSpots.push({ x: cx + 4, z: cz - 1, yaw: 0.6, role: 'guard' });
      break;

    case 'gun':
      counter(-1.2, 2.6, 10.6, 0, 0x6b2b2b);
      // Full Ammu-Nation glass display cases showcasing the expanded 15-weapon arsenal
      for (let i = 0; i < 6; i++) {
        const rx = -8.2 + i * 2.6;
        B('intWood', 2.2, 2.35, 0.42, rx, 0, -RD / 2 + 0.65, 0x4f3a2a);
        B('intTrim', 2.0, 1.35, 0.1, rx, 0.85, -RD / 2 + 0.9, 0x9e7a34);
        B('glass', 1.85, 1.2, 0.05, rx, 0.92, -RD / 2 + 0.86, 0x1c2a30);
        for (let k = 0; k < 3; k++) {
          B('propMetal', 1.15 - k * 0.18, 0.11, 0.12, rx, 1.78 - k * 0.34, -RD / 2 + 0.92, k === 0 ? 0x22252a : 0x383c42);
        }
        B('emit', 1.8, 0.06, 0.08, rx, 2.15, -RD / 2 + 0.88, 0xffe099);
        P(2.2, 2.3, 0.5, rx, 0, -RD / 2 + 0.65);
      }
      // Ammo crates, armor stand, and tactical display table
      B('prop', 1.4, 0.75, 0.9, -8.2, 0, 4.4, 0x3a4d34);
      B('prop', 1.1, 0.65, 0.8, -8.2, 0.75, 4.4, 0x445a3d);
      B('propMetal', 3.4, 0.95, 1.2, 6.8, 0, -1.5, 0x3a3e44);
      B('glass', 3.2, 0.55, 1.0, 6.8, 0.95, -1.5, 0x243b46);
      B('emit', 3.0, 0.06, 0.8, 6.8, 1.42, -1.5, 0xffcc88);
      c.b.add('sign', sign(4.8, 1.3, cx, cz - RD / 2 + 1.1, 3.05, 0, signUV('AMMO')), ch);
      floorLamp(9.2, 5.2);
      npcSpots.push({ x: cx - 1, z: cz + 3.8, yaw: Math.PI, role: 'clerk' });
      break;

    case 'garage':
      // Hydraulic 2-post car lift + tool chests + tire racks + waiting couch
      B('propMetal', 6.8, 0.22, 3.6, 0, 0, -2.4, 0x3a3d42);
      for (const s of [-1, 1]) B('propMetal', 0.36, 3.0, 0.45, s * 3.2, 0, -2.4, 0xc0392b);
      B('prop', 2.4, 0.9, 1.2, -7.8, 0, -5.8, 0xc0392b);
      B('propMetal', 2.4, 0.08, 1.25, -7.8, 0.9, -5.8, 0xa8adb2);
      for (const [x, z] of [[8.6, -2.2], [7.2, -1.6], [8.2, -0.8]]) {
        G('prop', cyl(0.55, 0.55, 0.32, x, 0, z, 0x151518, 14));
        G('propMetal', cyl(0.3, 0.3, 0.34, x, 0, z, 0x9aa0a5, 12));
      }
      sofa(-7.2, 4.4, Math.PI, 0x3f4c58, 2.8);
      vendingMachine(8.8, 4.6);
      c.b.add('sign', sign(4.4, 1.2, cx, cz - RD / 2 + 0.44, 3.2, 0, signUV('PAY N SPRAY')), ch);
      npcSpots.push({ x: cx - 1.2, z: cz + 4.0, yaw: Math.PI, role: 'clerk' });
      break;
    default: break;
  }

  return {
    id, kind, name: label, cx, cz, w: RW, d: RD,
    spawn: { x: cx, z: cz + RD / 2 - 0.3, yaw: Math.PI },
    exit: { x: cx, z: cz + RD / 2 - 0.9, yaw: Math.PI },
    npcSpots,
    light: new THREE.Vector3(cx, RH - 0.65, cz),
    warmTint,
  };
}
void finish;
