// Static collision world: spatial hash of boxes and circles + helpers.
import { BOUNDS, PIER_X, PIER_END, clamp, deckHeight, isOceanAt } from './config';

export interface Collider {
  type: 0 | 1; // 0 box, 1 circle
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  x: number;
  z: number;
  r: number;
  h: number;
  tag?: string;
}

const CELL = 32;
// Supports -16km..+16km cleanly without key collisions (including off-map interiors at +6400)
const key = (cx: number, cz: number) => (cx + 1024) * 4096 + (cz + 1024);

export interface PushOut {
  x: number;
  z: number;
  nx: number;
  nz: number;
  hit: boolean;
  depth: number;
  tag?: string;
}

export class World {
  cells = new Map<number, Collider[]>();
  all: Collider[] = [];
  boundsOff = false;

  addBox(minX: number, maxX: number, minZ: number, maxZ: number, h: number, tag?: string) {
    const c: Collider = {
      type: 0, minX, maxX, minZ, maxZ, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, r: 0, h, tag,
    };
    this.insert(c);
  }
  addCircle(x: number, z: number, r: number, h: number, tag?: string) {
    this.insert({ type: 1, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, x, z, r, h, tag });
  }
  private insert(c: Collider) {
    this.all.push(c);
    const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        let a = this.cells.get(k);
        if (!a) this.cells.set(k, (a = []));
        a.push(c);
      }
  }
  at(x: number, z: number): Collider[] | undefined {
    return this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  /** Push a circle out of static colliders. y = feet height (colliders lower than y are ignored). */
  resolve(px: number, pz: number, r: number, y: number, out: PushOut): PushOut {
    out.hit = false; out.depth = 0; out.nx = 0; out.nz = 0; out.tag = undefined;
    let x = px, z = pz;
    const cx0 = Math.floor((x - r) / CELL), cx1 = Math.floor((x + r) / CELL);
    const cz0 = Math.floor((z - r) / CELL), cz1 = Math.floor((z + r) / CELL);
    for (let iter = 0; iter < 2; iter++) {
      for (let cx = cx0; cx <= cx1; cx++)
        for (let cz = cz0; cz <= cz1; cz++) {
          const arr = this.cells.get(key(cx, cz));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const c = arr[i];
            if (c.h <= y) continue;
            if (x + r < c.minX || x - r > c.maxX || z + r < c.minZ || z - r > c.maxZ) continue;
            if (c.type === 1) {
              const dx = x - c.x, dz = z - c.z;
              const rr = r + c.r;
              const d2 = dx * dx + dz * dz;
              if (d2 < rr * rr) {
                const d = Math.sqrt(d2) || 0.0001;
                const push = rr - d;
                const nx = dx / d, nz = dz / d;
                x += nx * push; z += nz * push;
                out.hit = true; out.nx = nx; out.nz = nz; out.depth = Math.max(out.depth, push); out.tag = c.tag;
              }
            } else {
              const qx = clamp(x, c.minX, c.maxX), qz = clamp(z, c.minZ, c.maxZ);
              const dx = x - qx, dz = z - qz;
              const d2 = dx * dx + dz * dz;
              if (d2 < r * r) {
                let nx: number, nz: number, push: number;
                if (d2 > 1e-8) {
                  const d = Math.sqrt(d2);
                  nx = dx / d; nz = dz / d; push = r - d;
                } else {
                  const l = x - c.minX, rr2 = c.maxX - x, t = z - c.minZ, b = c.maxZ - z;
                  const m = Math.min(l, rr2, t, b);
                  if (m === l) { nx = -1; nz = 0; push = l + r; }
                  else if (m === rr2) { nx = 1; nz = 0; push = rr2 + r; }
                  else if (m === t) { nx = 0; nz = -1; push = t + r; }
                  else { nx = 0; nz = 1; push = b + r; }
                }
                x += nx * push; z += nz * push;
                out.hit = true; out.nx = nx; out.nz = nz; out.depth = Math.max(out.depth, push); out.tag = c.tag;
              }
            }
          }
        }
      if (!out.hit) break;
    }
    // 10km world limits
    if (this.boundsOff) { out.x = x; out.z = z; return out; }
    const B = BOUNDS;
    if (x < B.minX + r) { x = B.minX + r; out.hit = true; out.nx = 1; out.nz = 0; }
    if (x > B.maxX - r) { x = B.maxX - r; out.hit = true; out.nx = -1; out.nz = 0; }
    if (z < B.minZ + r) { z = B.minZ + r; out.hit = true; out.nx = 0; out.nz = 1; }
    if (z > B.maxZ - r) { z = B.maxZ - r; out.hit = true; out.nx = 0; out.nz = -1; }
    // Ocean shoreline containment (except when driving on elevated bridge/decks or walking on the pier)
    const onDeck = deckHeight(x, z, y) > 0.5;
    if (!onDeck && isOceanAt(x, z)) {
      const onPier = z > 606 && z <= PIER_END + 2 && Math.abs(x - PIER_X) <= 4.8;
      if (onPier) {
        if (z > PIER_END) { z = PIER_END; out.hit = true; out.nx = 0; out.nz = -1; }
        const lim = 4.5 - r * 0.5;
        if (x < PIER_X - lim) { x = PIER_X - lim; out.hit = true; out.nx = 1; out.nz = 0; }
        if (x > PIER_X + lim) { x = PIER_X + lim; out.hit = true; out.nx = -1; out.nz = 0; }
      } else {
        // Gently push back toward dry land (north toward main shoreline or west toward dunes)
        if (!isOceanAt(px, pz)) {
          const dx = px - x, dz = pz - z;
          const d = Math.hypot(dx, dz) || 1;
          x = px; z = pz;
          out.hit = true; out.nx = dx / d; out.nz = dz / d;
        } else if (x > -680 && z > 610 && z < 1600) {
          z = 610; out.hit = true; out.nx = 0; out.nz = -1;
        }
      }
    }
    out.x = x; out.z = z;
    return out;
  }

  /** Is point (x,y,z) inside a static solid? */
  solidAt(x: number, y: number, z: number): Collider | null {
    const arr = this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!arr) return null;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (y >= c.h) continue;
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      if (c.type === 1) {
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz > c.r * c.r) continue;
      }
      return c;
    }
    return null;
  }

  /** March a ray against static geometry; returns distance or -1 */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number, step = 0.6): number {
    for (let t = step; t <= maxD; t += step) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      if (y < 0.02) return t;
      if (this.solidAt(x, y, z)) return t;
    }
    return -1;
  }
  los(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1) return true;
    return this.ray(ax, ay, az, dx / d, dy / d, dz / d, d - 0.5, 1.2) < 0;
  }
}
