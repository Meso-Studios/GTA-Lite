// Geometry helpers + a batcher that merges thousands of small pieces into a few meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE_H, TILE_W } from './textures';

const _c = new THREE.Color();
const KEEP = ['position', 'normal', 'uv'];

export function finish(
  g: THREE.BufferGeometry,
  color: THREE.ColorRepresentation = 0xffffff,
  o: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number } = {}
): THREE.BufferGeometry {
  let ng = g;
  if (g.index) {
    ng = g.toNonIndexed();
    g.dispose();
  }
  for (const n of Object.keys(ng.attributes)) if (!KEEP.includes(n)) ng.deleteAttribute(n);
  const count = ng.attributes.position.count;
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  if (!ng.attributes.normal) ng.computeVertexNormals();
  if (o.rx) ng.rotateX(o.rx);
  if (o.rz) ng.rotateZ(o.rz);
  if (o.ry) ng.rotateY(o.ry);
  if (o.x || o.y || o.z) ng.translate(o.x || 0, o.y || 0, o.z || 0);
  _c.set(color);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

/** Box with its base-center at (x,y,z). */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, ry = 0, rx = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return finish(g, color, { x, y, z, ry, rx, rz });
}
export function cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 8) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(0, h / 2, 0);
  return finish(g, color, { x, y, z });
}
export function sph(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, sx = 1, sy = 1, sz = 1, seg = 8) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2));
  g.scale(sx, sy, sz);
  return finish(g, color, { x, y, z });
}
/** capsule hanging from its top anchor (local top at y=0) */
export function capsule(r: number, len: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, cap = 4, seg = 14) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), cap, seg);
  g.translate(0, -(len / 2 + r), 0);
  return finish(g, color, { x, y, z });
}
export function cone(r: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seg = 8) {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(0, h / 2, 0);
  return finish(g, color, { x, y, z });
}
/** Horizontal quad facing up. uv in world meters / scale */
export function flat(x0: number, z0: number, x1: number, z1: number, y: number, uvFn: (x: number, z: number) => [number, number], color: THREE.ColorRepresentation = 0xffffff) {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  g.scale(x1 - x0, 1, z1 - z0);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = uvFn(pos.getX(i), pos.getZ(i));
    uv.setXY(i, u, v);
  }
  return finish(g, color);
}
/** Vertical plane with atlas UVs. yaw: normal direction yaw (0 = +z). */
export function sign(w: number, h: number, x: number, y: number, z: number, yaw: number, uv: [number, number, number, number], color: THREE.ColorRepresentation = 0xffffff) {
  const g = new THREE.PlaneGeometry(w, h);
  const t = g.attributes.uv;
  for (let i = 0; i < t.count; i++) t.setXY(i, uv[0] + t.getX(i) * uv[2], uv[1] + t.getY(i) * uv[3]);
  return finish(g, color, { x, y, z, ry: yaw });
}

/** Four facade walls with tile-aligned UVs (no top/bottom). y0..y0+h */
export function walls(
  w: number, h: number, d: number, cx: number, y0: number, cz: number,
  color: THREE.ColorRepresentation, uOff: number[], tileW = TILE_W, tileH = TILE_H, vOff = 0
) {
  const hw = w / 2, hd = d / 2;
  const faces: [number, number, number, number, number, number, number][] = [
    // x0,z0 (left) -> x1,z1 (right), normal x,z, length
    [-hw, hd, hw, hd, 0, 1, w],
    [hw, hd, hw, -hd, 1, 0, d],
    [hw, -hd, -hw, -hd, 0, -1, w],
    [-hw, -hd, -hw, hd, -1, 0, d],
  ];
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  faces.forEach(([x0, z0, x1, z1, nx, nz, len], fi) => {
    const u0 = uOff[fi] ?? 0, u1 = u0 + len / tileW;
    const v0 = vOff + y0 / tileH, v1 = vOff + (y0 + h) / tileH;
    const P = [
      [x0, y0, z0, u0, v0], [x1, y0, z1, u1, v0], [x1, y0 + h, z1, u1, v1],
      [x0, y0, z0, u0, v0], [x1, y0 + h, z1, u1, v1], [x0, y0 + h, z0, u0, v1],
    ];
    for (const p of P) {
      pos.push(p[0] + cx, p[1], p[2] + cz); nor.push(nx, 0, nz); uv.push(p[3], p[4]);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return finish(g, color);
}

/** Gable roof (ridge along local x). returns [slopes, gableEnds] centered on origin, base at y=0 */
export function gable(w: number, d: number, h: number, over: number, roofColor: THREE.ColorRepresentation, wallColor: THREE.ColorRepresentation) {
  const W = w / 2 + over, D = d / 2 + over;
  const t = (arr: number[], a: number[], b: number[], c: number[]) => arr.push(...a, ...b, ...c);
  const s: number[] = [];
  t(s, [-W, 0, D], [W, 0, D], [W, h, 0]); t(s, [-W, 0, D], [W, h, 0], [-W, h, 0]);
  t(s, [W, 0, -D], [-W, 0, -D], [-W, h, 0]); t(s, [W, 0, -D], [-W, h, 0], [W, h, 0]);
  const e: number[] = [];
  const hw = w / 2, hd = d / 2;
  t(e, [hw, 0, hd], [hw, 0, -hd], [hw, h, 0]);
  t(e, [-hw, 0, -hd], [-hw, 0, hd], [-hw, h, 0]);
  const mk = (arr: number[], col: THREE.ColorRepresentation) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return finish(g, col);
  };
  return [mk(s, roofColor), mk(e, wallColor)];
}

export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, s = 1) {
  const c = g.clone();
  if (s !== 1) c.scale(s, s, s);
  if (ry) c.rotateY(ry);
  c.translate(x, y, z);
  return c;
}

/** Collects geometry in local space then flushes with a transform. */
export class Collector {
  items: [string, THREE.BufferGeometry][] = [];
  add(mat: string, g: THREE.BufferGeometry) {
    this.items.push([mat, g]);
  }
  flush(b: Batcher, cx: number, cz: number, yaw: number, chunk: string) {
    for (const [m, g] of this.items) {
      if (yaw) g.rotateY(yaw);
      g.translate(cx, 0, cz);
      b.add(m, g, chunk);
    }
    this.items = [];
  }
}

export class Batcher {
  buckets = new Map<string, THREE.BufferGeometry[]>();
  add(mat: string, g: THREE.BufferGeometry, chunk = '0') {
    const k = chunk + '|' + mat;
    let a = this.buckets.get(k);
    if (!a) this.buckets.set(k, (a = []));
    a.push(g);
  }
  build(parent: THREE.Object3D, mats: Record<string, THREE.Material>) {
    let meshes = 0;
    for (const [k, arr] of this.buckets) {
      const m = k.split('|')[1];
      const mat = mats[m];
      if (!mat) {
        console.warn('missing material', m);
        continue;
      }
      // merge in slices to avoid enormous attribute arrays
      for (let i = 0; i < arr.length; i += 4000) {
        const merged = mergeGeometries(arr.slice(i, i + 4000), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = mat.userData.cast ?? true;
        mesh.receiveShadow = mat.userData.receive ?? true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        parent.add(mesh);
        meshes++;
      }
      arr.forEach((g) => g.dispose());
    }
    this.buckets.clear();
    return meshes;
  }
}
