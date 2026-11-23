// Elevated ring highway, 10km cross-map expressway & beltway network, cable-stayed ocean causeway, and heavy infrastructure.
import * as THREE from 'three';
import { DECK, OUTER_HIGHWAYS, terrainHeightAt } from './config';
import { box, cyl, finish, flat, sign } from './geo';
import type { BCtx } from './buildings';

const H = DECK.H;
const W = DECK.HALF_W * 2;
const CONC = 0x9a9d9f, DARK = 0x767a80, STEEL = 0xa8adb3, YEL = 0xe8ba22;

function beamGeo(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 7);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  g.applyMatrix4(m);
  g.translate(a.x, a.y, a.z);
  return finish(g, color);
}

/** Overhead green interstate highway gantry sign spanning across a highway. */
function gantrySign(c: BCtx, axis: 'x' | 'z', x: number, y: number, z: number, spanW: number, panelIdx: number) {
  const ch = c.chunk(x, z);
  const h = 8.4;
  for (const s of [-1, 1]) {
    const px = axis === 'x' ? x : x + s * (spanW / 2 + 1.2);
    const pz = axis === 'x' ? z + s * (spanW / 2 + 1.2) : z;
    c.b.add('propMetal', cyl(0.32, 0.4, h, px, y, pz, STEEL, 8), ch);
    c.world.addCircle(px, pz, 0.45, y + h, 'gantry');
  }
  if (axis === 'x') {
    c.b.add('propMetal', box(0.42, 0.65, spanW + 2.8, x, y + h - 0.5, z, STEEL), ch);
    c.b.add('propMetal', box(0.28, 0.28, spanW + 2.6, x, y + h - 1.5, z, STEEL), ch);
  } else {
    c.b.add('propMetal', box(spanW + 2.8, 0.65, 0.42, x, y + h - 0.5, z, STEEL), ch);
    c.b.add('propMetal', box(spanW + 2.6, 0.28, 0.28, x, y + h - 1.5, z, STEEL), ch);
  }
  const u = (panelIdx % 2) * 0.5, v = panelIdx < 2 ? 0.5 : 0;
  const uv: [number, number, number, number] = [u, v, 0.5, 0.5];
  if (axis === 'x') {
    c.b.add('hwSign', sign(12, 3.2, x - 0.28, y + h - 1.1, z, -Math.PI / 2, uv), ch);
    c.b.add('hwSign', sign(12, 3.2, x + 0.28, y + h - 1.1, z, Math.PI / 2, uv), ch);
  } else {
    c.b.add('hwSign', sign(12, 3.2, x, y + h - 1.1, z + 0.28, 0, uv), ch);
    c.b.add('hwSign', sign(12, 3.2, x, y + h - 1.1, z - 0.28, Math.PI, uv), ch);
  }
}

/** straight elevated deck along one axis at fixed height, with barriers and pillar supports */
function straight(c: BCtx, axis: 'x' | 'z', fixed: number, a0: number, a1: number, skip: [number, number][], bridge = false) {
  const ch = c.chunk(axis === 'x' ? (a0 + a1) / 2 : fixed, axis === 'x' ? fixed : (a0 + a1) / 2);
  const len = a1 - a0, mid = (a0 + a1) / 2;
  const deckGeo = new THREE.BoxGeometry(axis === 'x' ? len : W, 0.9, axis === 'x' ? W : len);
  deckGeo.translate(axis === 'x' ? mid : fixed, H - 0.45, axis === 'x' ? fixed : mid);
  c.b.add('prop', finish(deckGeo, CONC), ch);
  if (axis === 'x') c.b.add('road', flat(a0, fixed - W / 2, a1, fixed + W / 2, H + 0.01, (px, pz) => [(pz - fixed + W / 2) / W, px / 12]), ch);
  else c.b.add('road', flat(fixed - W / 2, a0, fixed + W / 2, a1, H + 0.01, (px, pz) => [(px - fixed + W / 2) / W, pz / 12]), ch);
  // lane paint
  const paint = (off: number, color: number) => {
    if (axis === 'x') c.b.add('prop', box(len, 0.02, 0.22, mid, H + 0.03, fixed + off, color), ch);
    else c.b.add('prop', box(0.22, 0.02, len, fixed + off, H + 0.03, mid, color), ch);
  };
  paint(0, YEL); paint(-0.5, YEL); paint(-6, 0xdedede); paint(6, 0xdedede);
  // barriers + guardrails with openings for ramps/interchanges/bridge
  const segs: [number, number][] = [];
  const sortedSkip = [...skip].sort((a, b) => a[0] - b[0]);
  let cur = a0;
  for (const [s0, s1] of sortedSkip) { if (s0 > cur) segs.push([cur, s0]); cur = Math.max(cur, s1); }
  if (cur < a1) segs.push([cur, a1]);
  for (const [s0, s1] of segs) {
    const sl = s1 - s0, sm = (s0 + s1) / 2;
    for (const side of [-1, 1]) {
      const off = side * (W / 2 - 0.35);
      if (axis === 'x') {
        c.b.add('prop', box(sl, 1.15, 0.45, sm, H, fixed + off, CONC), ch);
        c.b.add('propMetal', box(sl, 0.12, 0.16, sm, H + 1.15, fixed + off, STEEL), ch);
        c.b.add('propMetal', box(sl, 0.06, 0.12, sm, H + 0.62, fixed + off, STEEL), ch);
        c.world.addBox(s0, s1, fixed + off - 0.65, fixed + off + 0.65, H + 1.6);
      } else {
        c.b.add('prop', box(0.45, 1.15, sl, fixed + off, H, sm, CONC), ch);
        c.b.add('propMetal', box(0.16, 0.12, sl, fixed + off, H + 1.15, sm, STEEL), ch);
        c.b.add('propMetal', box(0.12, 0.06, sl, fixed + off, H + 0.62, sm, STEEL), ch);
        c.world.addBox(fixed + off - 0.65, fixed + off + 0.65, s0, s1, H + 1.6);
      }
    }
  }
  // supports + highway lamps
  const step = bridge ? 48 : 30;
  const n = Math.floor(len / step);
  for (let i = 0; i <= n; i++) {
    const at = a0 + (i / Math.max(1, n)) * len;
    if (segSkip(at, skip)) continue;
    const px = axis === 'x' ? at : fixed, pz = axis === 'x' ? fixed : at;
    if (!bridge) {
      for (const side of [-1, 1]) {
        const ox = axis === 'x' ? 0 : side * (W / 2 - 1.6), oz = axis === 'x' ? side * (W / 2 - 1.6) : 0;
        c.b.add('prop', cyl(1.05, 1.35, H - 0.9, px + ox, 0, pz + oz, DARK, 10), ch);
        c.b.add('prop', box(1.6, 0.7, 1.6, px + ox, H - 1.2, pz + oz, CONC), ch);
        c.world.addCircle(px + ox, pz + oz, 1.3, H, 'pillar');
      }
    }
    if (i % 2 === 0) {
      const side = i % 4 === 0 ? 1 : -1;
      const lx = axis === 'x' ? at : fixed + side * (W / 2 - 0.5);
      const lz = axis === 'x' ? fixed + side * (W / 2 - 0.5) : at;
      c.b.add('propMetal', cyl(0.11, 0.16, 9, lx, H, lz, STEEL, 8), ch);
      const dx = axis === 'x' ? 0 : -side, dz = axis === 'x' ? -side : 0;
      c.b.add('propMetal', box(axis === 'x' ? 2.6 : 0.14, 0.14, axis === 'x' ? 0.14 : 2.6, lx + dx * 1.3, H + 8.9, lz + dz * 1.3, STEEL), ch);
      c.b.add('prop', box(0.7, 0.2, 0.9, lx + dx * 2.5, H + 8.7, lz + dz * 2.5, 0xfff0c0), ch);
      c.b.add('emit', box(0.6, 0.06, 0.75, lx + dx * 2.5, H + 8.6, lz + dz * 2.5, 0xffffff), ch);
      c.lampBulbs.push({ x: lx + dx * 2.5, y: H + 8.5, z: lz + dz * 2.5 });
    }
  }
  c.mapRects.push({ x0: axis === 'x' ? a0 : fixed - W / 2, z0: axis === 'x' ? fixed - W / 2 : a0, x1: axis === 'x' ? a1 : fixed + W / 2, z1: axis === 'x' ? fixed + W / 2 : a1, c: '#5a616d' });
}
function segSkip(at: number, skip: [number, number][]) { return skip.some(([a, b]) => at > a - 2 && at < b + 2); }

function ramp(c: BCtx, axis: 'x' | 'z', fixed: number, lo: number, hi: number, openTop = false, hLo = 0, hHi = H) {
  const run = Math.abs(hi - lo), dH = hHi - hLo;
  const theta = Math.atan2(dH, run);
  const L = Math.hypot(dH, run);
  const mid = (lo + hi) / 2;
  const midY = (hLo + hHi) / 2;
  const g = new THREE.BoxGeometry(axis === 'x' ? L : W, 0.9, axis === 'x' ? W : L);
  const dir = Math.sign(hi - lo);
  if (axis === 'x') g.rotateZ(dir * theta); else g.rotateX(-dir * theta);
  g.translate(axis === 'x' ? mid : fixed, midY - 0.42, axis === 'x' ? fixed : mid);
  c.b.add('prop', finish(g, 0x3b3e44), c.chunk(axis === 'x' ? mid : fixed, axis === 'x' ? fixed : mid));
  // barriers along ramp sides
  for (let i = 0; i < 5; i++) {
    const t0 = i / 5, t1 = (i + 1) / 5;
    const a0 = lo + (hi - lo) * t0, a1 = lo + (hi - lo) * t1;
    const y0 = hLo + dH * t0, y1 = hLo + dH * t1;
    const am = (a0 + a1) / 2, hm = (y0 + y1) / 2, Ls = Math.hypot(a1 - a0, y1 - y0);
    for (const side of [-1, 1]) {
      const bg = new THREE.BoxGeometry(axis === 'x' ? Ls : 0.4, 1.05, axis === 'x' ? 0.4 : Ls);
      if (axis === 'x') bg.rotateZ(dir * theta); else bg.rotateX(-dir * theta);
      bg.translate(axis === 'x' ? am : fixed + side * (W / 2 - 0.3), hm + 0.5, axis === 'x' ? fixed + side * (W / 2 - 0.3) : am);
      c.b.add('prop', finish(bg, CONC), c.chunk(axis === 'x' ? am : fixed, axis === 'x' ? fixed : am));
    }
  }
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const a = lo + (hi - lo) * t, h = hLo + dH * t;
    const px = axis === 'x' ? a : fixed, pz = axis === 'x' ? fixed : a;
    if (h > 1.6) {
      c.b.add('prop', cyl(0.75, 0.95, h, px + (axis === 'x' ? 0 : 7), 0, pz + (axis === 'x' ? 7 : 0), DARK, 8), c.chunk(px, pz));
      c.b.add('prop', cyl(0.75, 0.95, h, px - (axis === 'x' ? 0 : 7), 0, pz - (axis === 'x' ? 7 : 0), DARK, 8), c.chunk(px, pz));
    }
  }
  c.mapRects.push({ x0: axis === 'x' ? Math.min(lo, hi) : fixed - W / 2, z0: axis === 'x' ? fixed - W / 2 : Math.min(lo, hi), x1: axis === 'x' ? Math.max(lo, hi) : fixed + W / 2, z1: axis === 'x' ? fixed + W / 2 : Math.max(lo, hi), c: '#6e7582' });
  void openTop;
}

/** Long cable-stayed Ocean Causeway Bridge leading south across the bay to Nova Keys Resort Island. */
function bridge(c: BCtx) {
  const { x: x0, z0, z1 } = DECK.BRIDGE;
  const flatEnd = z1 - 150;
  straight(c, 'z', x0, z0, flatEnd, [], true);
  // Smooth descent ramp onto Nova Keys Island
  ramp(c, 'z', x0, z1, flatEnd, true, 1.8, H);
  // Three signature cable-stayed pylons spanning the bay
  for (const tz of [820, 1220, 1620]) {
    const ch = c.chunk(x0, tz);
    for (const side of [-1, 1]) {
      const px = x0 + side * (W / 2 + 1.5);
      c.b.add('prop', box(2.8, 42, 2.8, px, -2, tz, 0xe4e8ec), ch);
      c.b.add('prop', box(3.6, 1.4, 3.6, px, 39.5, tz, 0xc8cdd1), ch);
      c.b.add('red', cyl(0.45, 0.45, 1.4, px, 41, tz, 0xff3030, 8), ch);
      c.world.addBox(px - 1.4, px + 1.4, tz - 1.4, tz + 1.4, 42);
    }
    c.b.add('prop', box(W + 6, 2.0, 2.6, x0, 32, tz, 0xe4e8ec), ch);
    c.b.add('prop', box(W + 5, 1.4, 2.0, x0, 20, tz, 0xd8dde2), ch);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 10; i++) {
        const dz = 10 + i * 11;
        for (const dir of [-1, 1]) {
          const bz = tz + dir * dz;
          if (bz < z0 + 6 || bz > flatEnd - 6) continue;
          const a = new THREE.Vector3(x0 + side * (W / 2 + 1.2), 33 - i * 0.9, tz);
          const b = new THREE.Vector3(x0 + side * (W / 2 - 0.6), H + 0.4, bz);
          c.b.add('propMetal', beamGeo(a, b, 0.16, 0xd6dade), ch);
        }
      }
    }
  }
  // Support piers in the ocean
  for (let z = z0 + 60; z < flatEnd; z += 90) {
    const ch = c.chunk(x0, z);
    c.b.add('prop', box(W - 2, H + 2, 2.8, x0, -2, z, DARK), ch);
  }
  gantrySign(c, 'z', x0, H, z0 + 40, W, 2);
}

/** Builds the 10km x 10km outer expressway & beltway highway network (low draw call, terrain-conforming). */
function buildOuterHighways(c: BCtx) {
  for (const hw of OUTER_HIGHWAYS) {
    const segLen = 220;
    const total = hw.a1 - hw.a0;
    const count = Math.max(1, Math.ceil(total / segLen));
    const hwW = hw.halfW * 2;
    for (let i = 0; i < count; i++) {
      const s0 = hw.a0 + (i / count) * total;
      const s1 = hw.a0 + ((i + 1) / count) * total;
      const sm = (s0 + s1) / 2;
      const sl = s1 - s0;
      const mx = hw.axis === 'x' ? sm : hw.fixed;
      const mz = hw.axis === 'x' ? hw.fixed : sm;
      const ch = c.chunk(mx, mz);
      const y = Math.max(0.12, terrainHeightAt(mx, mz) + 0.14);

      // Road asphalt ribbon
      if (hw.axis === 'x') {
        c.b.add('road', flat(s0, hw.fixed - hw.halfW, s1, hw.fixed + hw.halfW, y, (px, pz) => [(pz - hw.fixed + hw.halfW) / hwW, px / 14]), ch);
        // concrete shoulders & jersey barriers
        for (const side of [-1, 1]) {
          const bz = hw.fixed + side * (hw.halfW + 0.4);
          c.b.add('prop', box(sl, 0.85, 0.55, sm, y - 0.15, bz, 0xa8adb2), ch);
          c.b.add('propMetal', box(sl, 0.14, 0.12, sm, y + 0.52, bz, STEEL), ch);
        }
        // central divider
        c.b.add('prop', box(sl, 0.55, 0.42, sm, y - 0.05, hw.fixed, 0xb5b9be), ch);
      } else {
        c.b.add('road', flat(hw.fixed - hw.halfW, s0, hw.fixed + hw.halfW, s1, y, (px, pz) => [(px - hw.fixed + hw.halfW) / hwW, pz / 14]), ch);
        for (const side of [-1, 1]) {
          const bx = hw.fixed + side * (hw.halfW + 0.4);
          c.b.add('prop', box(0.55, 0.85, sl, bx, y - 0.15, sm, 0xa8adb2), ch);
          c.b.add('propMetal', box(0.12, 0.14, sl, bx, y + 0.52, sm, STEEL), ch);
        }
        c.b.add('prop', box(0.42, 0.55, sl, hw.fixed, y - 0.05, sm, 0xb5b9be), ch);
      }

      // Highway light poles spaced cleanly along the corridor
      if (i % 2 === 0) {
        const lx = hw.axis === 'x' ? sm : hw.fixed;
        const lz = hw.axis === 'x' ? hw.fixed : sm;
        c.b.add('propMetal', cyl(0.12, 0.18, 10.5, lx, y, lz, STEEL, 6), ch);
        if (hw.axis === 'x') {
          c.b.add('propMetal', box(0.16, 0.16, 6.2, lx, y + 10.3, lz, STEEL), ch);
          c.b.add('emit', box(0.6, 0.1, 0.9, lx, y + 10.1, lz - 2.9, 0xffe8b0), ch);
          c.b.add('emit', box(0.6, 0.1, 0.9, lx, y + 10.1, lz + 2.9, 0xffe8b0), ch);
        } else {
          c.b.add('propMetal', box(6.2, 0.16, 0.16, lx, y + 10.3, lz, STEEL), ch);
          c.b.add('emit', box(0.9, 0.1, 0.6, lx - 2.9, y + 10.1, lz, 0xffe8b0), ch);
          c.b.add('emit', box(0.9, 0.1, 0.6, lx + 2.9, y + 10.1, lz, 0xffe8b0), ch);
        }
      }
    }
    c.mapRects.push({
      x0: hw.axis === 'x' ? hw.a0 : hw.fixed - hw.halfW,
      z0: hw.axis === 'x' ? hw.fixed - hw.halfW : hw.a0,
      x1: hw.axis === 'x' ? hw.a1 : hw.fixed + hw.halfW,
      z1: hw.axis === 'x' ? hw.fixed + hw.halfW : hw.a1,
      c: '#6e798c',
    });
  }

  // Interchange highway gantries
  gantrySign(c, 'z', 0, 0.14, -920, 28, 0);
  gantrySign(c, 'z', 0, 0.14, -2840, 28, 0);
  gantrySign(c, 'x', -920, 0.14, 0, 28, 1);
  gantrySign(c, 'x', -2840, 0.14, 0, 28, 1);
  gantrySign(c, 'x', 920, 0.14, 0, 28, 3);
  gantrySign(c, 'x', -1400, 0.14, 560, 24, 1);
}

/** decorative heavy infrastructure inside / around the city */
function extras(c: BCtx) {
  // monorail viaduct along the eastern edge
  const zs = -520, ze = 520, mx = 470;
  for (let z = zs; z <= ze; z += 30) {
    const ch = c.chunk(mx, z);
    c.b.add('prop', box(2.4, 9, 2.4, mx, 0, z, 0xa8adb2), ch);
    c.b.add('prop', box(4.6, 0.8, 3, mx, 9, z, 0x8f959b), ch);
    c.world.addBox(mx - 1.2, mx + 1.2, z - 1.2, z + 1.2, 9);
  }
  c.b.add('prop', box(7, 1.0, ze - zs, mx, 9.8, 0, 0xb9bec3), c.chunk(mx, 0));
  c.b.add('propMetal', box(0.3, 0.4, ze - zs, mx - 2.8, 11.1, 0, 0x8a9096), c.chunk(mx, 0));
  c.b.add('propMetal', box(0.3, 0.4, ze - zs, mx + 2.8, 11.1, 0, 0x8a9096), c.chunk(mx, 0));
  c.mapRects.push({ x0: mx - 4, z0: zs, x1: mx + 4, z1: ze, c: '#767b82' });
  // monorail train
  for (let i = 0; i < 4; i++) {
    const z = -220 + i * 17;
    const ch = c.chunk(mx, z);
    c.b.add('propMetal', box(5.6, 3.2, 15, mx, 11.1, z, 0xe4e8ec), ch);
    c.b.add('glass', box(5.7, 1.1, 12.6, mx, 12.4, z, 0x1d2f3c), ch);
    c.b.add('emit', box(5.8, 0.26, 12.4, mx, 13.1, z, 0x8fd8ff), ch);
    c.b.add('prop', box(5.4, 0.4, 14.6, mx, 10.9, z, 0x3f5c74), ch);
  }
  // radio tower on the industrial block
  const rx = 288, rz = -342;
  for (let i = 0; i < 12; i++) {
    const y = i * 7.6, w = 7 - i * 0.45;
    c.b.add('propMetal', box(w, 7.6, w * 0.3, rx, y, rz, 0xc0c5c9), c.chunk(rx, rz));
    c.b.add('propMetal', box(w * 0.3, 7.6, w, rx, y, rz, 0xc0c5c9), c.chunk(rx, rz));
    if (i % 2) c.b.add('propMetal', box(w + 1.8, 0.24, 0.24, rx, y + 5, rz, 0xb0b5b9), c.chunk(rx, rz));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    c.b.add('red', cyl(1.8, 1.8, 2, rx, 22 + i * 15, rz, 0xffffff, 12), c.chunk(rx, rz));
    c.b.add('red', cyl(0.5, 0.5, 3.4, rx + Math.cos(a) * 3, 50, rz + Math.sin(a) * 3, 0xff2a2a, 8), c.chunk(rx, rz));
  }
  c.b.add('red', cyl(0.6, 0.9, 12, rx, 91, rz, 0xff3030, 8), c.chunk(rx, rz));
  c.world.addCircle(rx, rz, 4, 8, 'tower');
  // water tower
  const wx = 216, wz = 288;
  for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) c.b.add('propMetal', box(0.6, 15, 0.6, wx + ox, 0, wz + oz, 0x9aa0a5), c.chunk(wx, wz));
  c.b.add('propMetal', cyl(6, 6, 8, wx, 14, wz, 0xb7bdc2, 16), c.chunk(wx, wz));
  c.b.add('propMetal', cyl(6.2, 6.2, 0.4, wx, 22, wz, 0x8f959a, 16), c.chunk(wx, wz));
  c.b.add('prop', cone2(6.3, 3, wx, 22.4, wz, 0x8f959a), c.chunk(wx, wz));
  c.mapRects.push({ x0: wx - 7, z0: wz - 7, x1: wx + 7, z1: wz + 7, c: '#9aa0a5' });
  // pedestrian skybridges over downtown streets
  for (const [x, z] of [[-171, -57], [171, 57]]) {
    const ch = c.chunk(x, z);
    c.b.add('glass', box(24, 3.2, 3.4, x, 6.2, z, 0x24404f), ch);
    c.b.add('prop', box(24, 0.5, 4.2, x, 5.9, z, 0xb5babf), ch);
    c.b.add('prop', box(24, 0.4, 4.2, x, 9.2, z, 0xb5babf), ch);
    c.b.add('emit', box(22, 0.12, 0.3, x, 8.1, z + 1.6, 0x9fd8f0), ch);
    c.b.add('emit', box(22, 0.12, 0.3, x, 8.1, z - 1.6, 0x9fd8f0), ch);
    for (const ox of [-10, 10]) {
      c.b.add('prop', box(1.4, 6, 1.4, x + ox, 0, z, 0x9a9fa4), ch);
      c.world.addBox(x + ox - 0.7, x + ox + 0.7, z - 0.7, z + 0.7, 6);
    }
    c.mapRects.push({ x0: x - 12, z0: z - 2, x1: x + 12, z1: z + 2, c: '#8fa5b0' });
  }
}
function cone2(r: number, h: number, x: number, y: number, z: number, color: number) {
  const g = new THREE.ConeGeometry(r, h, 16);
  g.translate(0, h / 2, 0);
  return finish(g, color, { x, y, z });
}

export function buildInfrastructure(c: BCtx) {
  const R = DECK.RING;
  const nR = DECK.RAMP_N, eR = DECK.RAMP_E, wR = DECK.RAMP_W, sR = DECK.RAMP_S;
  // Inner elevated ring highway with openings for all 4 city ramps + 3 outer expressway interchanges + ocean bridge
  straight(c, 'x', R.n, R.w, R.e, [[nR.x - W / 2, nR.x + W / 2]]);
  straight(c, 'x', R.s, R.w, R.e, [
    [sR.x - W / 2, sR.x + W / 2],
    [DECK.BRIDGE.x - W / 2, DECK.BRIDGE.x + W / 2],
  ]);
  straight(c, 'z', R.w, R.n, R.s, [[wR.z - W / 2, wR.z + W / 2]]);
  straight(c, 'z', R.e, R.n, R.s, [[eR.z - W / 2, eR.z + W / 2]]);

  // 4 smooth city access ramps onto the inner elevated ring
  ramp(c, 'z', nR.x, nR.z1, nR.z0);
  ramp(c, 'x', eR.z, eR.x0, eR.x1);
  ramp(c, 'x', wR.z, wR.x1, wR.x0);
  ramp(c, 'z', sR.x, sR.z0, sR.z1);

  // 3 smooth outer interchange descent ramps connecting the inner ring to the 10km cross-map expressways
  ramp(c, 'z', 0, -790, -652, true, 0.14, H);
  ramp(c, 'x', 0, -790, -652, true, 0.14, H);
  ramp(c, 'x', 0, 790, 652, true, 0.14, H);

  // Gantries on the inner ring
  gantrySign(c, 'x', -240, H, R.n, W, 3);
  gantrySign(c, 'z', R.w, H, -180, W, 1);

  bridge(c);
  buildOuterHighways(c);
  extras(c);
}
