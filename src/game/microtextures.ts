// REAL PBR Microtexture Generator (tangent-space RGB normalMap + roughnessMap + metallic-flake clearcoatNormalMap).
// Zero distortion of existing map UVs: Three.js transforms normalMap/roughnessMap independently via their own UV matrices.
import * as THREE from 'three';

export type MicroSurfaceKind =
  | 'asphalt'
  | 'concrete'
  | 'masonry'
  | 'wood'
  | 'sand'
  | 'cloth'
  | 'car_flake';

export interface MicroMapBuffers {
  normalData: Uint8Array;
  roughData: Uint8Array;
  size: number;
}

function hash2Periodic(ix: number, iy: number, period: number, seed: number): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  const n = Math.sin(px * 127.1 + py * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function periodicNoise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2Periodic(ix, iy, cells, seed);
  const b = hash2Periodic(ix + 1, iy, cells, seed);
  const c = hash2Periodic(ix, iy + 1, cells, seed);
  const d = hash2Periodic(ix + 1, iy + 1, cells, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

function periodicFbm(u: number, v: number, baseCells: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicNoise(u, v, cells, seed + o * 19);
    norm += amp;
    amp *= 0.5;
    cells *= 2;
  }
  return sum / norm;
}

/** Pure deterministic generator producing seamless tangent-space normal & roughness RGBA pixel buffers. */
export function buildMicroMaps(kind: MicroSurfaceKind, size = 128): MicroMapBuffers {
  const count = size * size;
  const heights = new Float32Array(count);
  const rough = new Float32Array(count);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      let h = 0.5;
      let r = 0.65;

      if (kind === 'asphalt') {
        const macro = periodicFbm(u, v, 8, 3, 11);
        const grit = hash2Periodic(x, y, size, 37);
        const chip = grit > 0.72 ? (grit - 0.72) * 2.2 : grit * 0.25;
        h = macro * 0.42 + chip * 0.58;
        r = 0.68 + (1 - chip) * 0.26;
      } else if (kind === 'concrete') {
        const broom = periodicNoise(u * 0.25, v * 2.0, 16, 43);
        const pores = periodicFbm(u, v, 16, 3, 53);
        const speck = hash2Periodic(x, y, size, 61);
        h = pores * 0.58 + broom * 0.24 + speck * 0.18;
        r = 0.78 + (1 - h) * 0.18;
      } else if (kind === 'masonry') {
        const row = Math.floor(v * 6);
        const offset = (row % 2) * 0.5;
        const bu = (u * 3 + offset) % 1;
        const bv = (v * 6) % 1;
        const mortar = bu < 0.06 || bv < 0.1 ? 1 : 0;
        const grain = periodicFbm(u, v, 12, 3, 71);
        h = mortar ? 0.12 + grain * 0.12 : 0.62 + grain * 0.35;
        r = mortar ? 0.94 : 0.72 + grain * 0.22;
      } else if (kind === 'wood') {
        const plank = Math.floor(u * 4);
        const seam = ((u * 4) % 1) < 0.035 ? 1 : 0;
        const rings = Math.sin((u * 18 + periodicFbm(u, v, 6, 3, 83 + plank * 7) * 5.2) * Math.PI * 2) * 0.5 + 0.5;
        const fibers = periodicNoise(u, v * 0.25, 32, 97);
        h = seam ? 0.08 : 0.42 + rings * 0.35 + fibers * 0.23;
        r = seam ? 0.92 : 0.34 + (1 - rings) * 0.28;
      } else if (kind === 'sand') {
        const ripple = Math.sin((v * 7 + periodicFbm(u, v, 6, 2, 101) * 0.9) * Math.PI * 2) * 0.5 + 0.5;
        const grain = hash2Periodic(x, y, size, 109);
        h = ripple * 0.68 + grain * 0.32;
        r = 0.86 + (1 - grain) * 0.12;
      } else if (kind === 'cloth') {
        const warp = Math.sin(u * 24 * Math.PI * 2) * 0.5 + 0.5;
        const weft = Math.sin(v * 24 * Math.PI * 2) * 0.5 + 0.5;
        const weave = (x + y) % 2 === 0 ? warp * 0.65 + weft * 0.35 : weft * 0.65 + warp * 0.35;
        h = 0.25 + weave * 0.6 + periodicNoise(u, v, 8, 121) * 0.15;
        r = 0.82 + (1 - weave) * 0.15;
      } else {
        // 'car_flake': ultra-fine metallic aluminum flake sparkle in tangent space
        const rx = (hash2Periodic(x, y, size, 131) - 0.5) * 0.95;
        const ry = (hash2Periodic(x, y, size, 149) - 0.5) * 0.95;
        const mag = Math.hypot(rx, ry);
        h = 0.5 + mag * 0.2;
        r = 0.12 + mag * 0.08;
      }

      heights[idx] = h;
      rough[idx] = Math.min(1, Math.max(0.05, r));
    }
  }

  const strengthMap: Record<MicroSurfaceKind, number> = {
    asphalt: 2.8,
    concrete: 1.9,
    masonry: 3.1,
    wood: 2.2,
    sand: 2.4,
    cloth: 1.65,
    car_flake: 1.0,
  };
  const strength = strengthMap[kind];

  const normalData = new Uint8Array(count * 4);
  const roughData = new Uint8Array(count * 4);

  for (let y = 0; y < size; y++) {
    const yPrev = (y - 1 + size) % size;
    const yNext = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xPrev = (x - 1 + size) % size;
      const xNext = (x + 1) % size;
      const idx = y * size + x;
      const o = idx * 4;

      let nx: number;
      let ny: number;
      let nz: number;

      if (kind === 'car_flake') {
        // Directly perturb tangent normal per microscopic aluminum flake orientation
        nx = (hash2Periodic(x, y, size, 131) - 0.5) * 0.34;
        ny = (hash2Periodic(x, y, size, 149) - 0.5) * 0.34;
        nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      } else {
        const dx = (heights[y * size + xNext] - heights[y * size + xPrev]) * strength;
        const dy = (heights[yNext * size + x] - heights[yPrev * size + x]) * strength;
        const len = Math.hypot(-dx, -dy, 1) || 1;
        nx = -dx / len;
        ny = -dy / len;
        nz = 1 / len;
      }

      normalData[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normalData[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalData[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalData[o + 3] = 255;

      const rv = Math.round(rough[idx] * 255);
      roughData[o] = rv;
      roughData[o + 1] = rv;
      roughData[o + 2] = rv;
      roughData[o + 3] = 255;
    }
  }

  return { normalData, roughData, size };
}

export function sampleTangentNormal(
  normalData: Uint8Array,
  size: number,
  x: number,
  y: number,
): { nx: number; ny: number; nz: number } {
  const px = ((x % size) + size) % size;
  const py = ((y % size) + size) % size;
  const o = (py * size + px) * 4;
  return {
    nx: (normalData[o] / 255) * 2 - 1,
    ny: (normalData[o + 1] / 255) * 2 - 1,
    nz: (normalData[o + 2] / 255) * 2 - 1,
  };
}

interface MaterialBackup {
  normalMap: THREE.Texture | null;
  normalScale: THREE.Vector2 | null;
  bumpMap: THREE.Texture | null;
  bumpScale: number;
  roughnessMap: THREE.Texture | null;
  clearcoatNormalMap: THREE.Texture | null;
  clearcoatNormalScale: THREE.Vector2 | null;
}

interface RegisteredMat {
  mat: THREE.MeshStandardMaterial;
  kind: MicroSurfaceKind;
  rx: number;
  ry: number;
  scale: number;
  backup: MaterialBackup;
}

const CITY_MAT_PROFILE: Record<string, { kind: MicroSurfaceKind; rx: number; ry: number; scale: number }> = {
  road: { kind: 'asphalt', rx: 7, ry: 22, scale: 0.72 },
  inter: { kind: 'asphalt', rx: 7, ry: 7, scale: 0.72 },
  runway: { kind: 'asphalt', rx: 9, ry: 34, scale: 0.65 },
  g_asph: { kind: 'asphalt', rx: 8, ry: 8, scale: 0.65 },
  g_sidewalk: { kind: 'concrete', rx: 6, ry: 6, scale: 0.58 },
  conc: { kind: 'concrete', rx: 6, ry: 6, scale: 0.55 },
  f_brick: { kind: 'masonry', rx: 3, ry: 3, scale: 0.75 },
  f_stone: { kind: 'masonry', rx: 2.5, ry: 2.5, scale: 0.72 },
  f_apartment: { kind: 'masonry', rx: 3, ry: 3, scale: 0.65 },
  f_office: { kind: 'concrete', rx: 3, ry: 3, scale: 0.48 },
  f_industrial: { kind: 'concrete', rx: 4, ry: 4, scale: 0.6 },
  store: { kind: 'masonry', rx: 3, ry: 2, scale: 0.62 },
  intFloorWood: { kind: 'wood', rx: 3, ry: 3, scale: 0.68 },
  intWood: { kind: 'wood', rx: 2, ry: 2, scale: 0.55 },
  intWall: { kind: 'concrete', rx: 3, ry: 2, scale: 0.45 },
  carpet: { kind: 'cloth', rx: 8, ry: 8, scale: 0.62 },
  carpet2: { kind: 'cloth', rx: 8, ry: 8, scale: 0.62 },
  g_sand: { kind: 'sand', rx: 6, ry: 6, scale: 0.7 },
  prop: { kind: 'concrete', rx: 2, ry: 2, scale: 0.45 },
  roof: { kind: 'asphalt', rx: 5, ry: 5, scale: 0.75 },
};

export class PbrMicrotextureSystem {
  private enabled = true;
  private texCache = new Map<MicroSurfaceKind, { normal: THREE.DataTexture; rough: THREE.DataTexture }>();
  private repeatedCache = new Map<string, THREE.DataTexture>();
  private entries = new Map<THREE.MeshStandardMaterial, RegisteredMat>();

  private getTextures(kind: MicroSurfaceKind) {
    let pair = this.texCache.get(kind);
    if (!pair) {
      const { normalData, roughData, size } = buildMicroMaps(kind, 128);
      const makeTex = (data: Uint8Array) => {
        const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        tex.colorSpace = THREE.NoColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
        return tex;
      };
      pair = { normal: makeTex(normalData), rough: makeTex(roughData) };
      this.texCache.set(kind, pair);
    }
    return pair;
  }

  private cloneRepeated(src: THREE.DataTexture, tag: string, rx: number, ry: number): THREE.DataTexture {
    const key = `${tag}_${rx}_${ry}`;
    const existing = this.repeatedCache.get(key);
    if (existing) return existing;
    const t = src.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    this.repeatedCache.set(key, t);
    return t;
  }

  private captureBackup(mat: THREE.MeshStandardMaterial): MaterialBackup {
    const phys = mat as THREE.MeshPhysicalMaterial;
    return {
      normalMap: mat.normalMap,
      normalScale: mat.normalScale ? mat.normalScale.clone() : null,
      bumpMap: mat.bumpMap,
      bumpScale: mat.bumpScale,
      roughnessMap: mat.roughnessMap,
      clearcoatNormalMap: phys.isMeshPhysicalMaterial ? phys.clearcoatNormalMap : null,
      clearcoatNormalScale: phys.isMeshPhysicalMaterial && phys.clearcoatNormalScale ? phys.clearcoatNormalScale.clone() : null,
    };
  }

  registerMaterial(
    mat: THREE.MeshStandardMaterial,
    kind: MicroSurfaceKind,
    rx = 4,
    ry = 4,
    scale = 0.65,
  ): void {
    if (!mat || !mat.isMeshStandardMaterial) return;
    if (this.entries.has(mat)) return;
    const entry: RegisteredMat = {
      mat,
      kind,
      rx,
      ry,
      scale,
      backup: this.captureBackup(mat),
    };
    this.entries.set(mat, entry);
    this.applyEntry(entry, this.enabled);
  }

  registerCityMaterials(mats: Record<string, THREE.Material>): void {
    for (const [key, prof] of Object.entries(CITY_MAT_PROFILE)) {
      const m = mats[key];
      if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        this.registerMaterial(m as THREE.MeshStandardMaterial, prof.kind, prof.rx, prof.ry, prof.scale);
      }
    }
  }

  registerVehiclePaint(mat: THREE.Material): void {
    if ((mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
      this.registerMaterial(mat as THREE.MeshPhysicalMaterial, 'car_flake', 14, 14, 0.24);
    }
  }

  registerHumanMat(mat: THREE.Material): void {
    if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
      this.registerMaterial(mat as THREE.MeshStandardMaterial, 'cloth', 5, 5, 0.36);
    }
  }

  registerGlbRoot(root: THREE.Object3D): void {
    root.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list) {
        if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
        const std = m as THREE.MeshStandardMaterial;
        const n = (std.name || '').toLowerCase();
        if (n.includes('glass') || n.includes('light') || n.includes('lens') || n.includes('chrome')) continue;
        if (n === 'paint' || n === 'body_color') {
          this.registerVehiclePaint(std);
        } else if (n.includes('tire') || n.includes('rubber') || n.includes('asphalt')) {
          this.registerMaterial(std, 'asphalt', 4, 4, 0.45);
        } else if (n.includes('stucco') || n.includes('brick') || n.includes('stone') || n.includes('wall')) {
          this.registerMaterial(std, 'masonry', 4, 4, 0.58);
        } else if (n.includes('wood') || n.includes('trunk')) {
          this.registerMaterial(std, 'wood', 3, 3, 0.52);
        } else {
          this.registerMaterial(std, 'concrete', 3, 3, 0.4);
        }
      }
    });
  }

  private applyEntry(entry: RegisteredMat, on: boolean): void {
    const { mat, kind, rx, ry, scale, backup } = entry;
    const phys = mat as THREE.MeshPhysicalMaterial;

    if (!on) {
      mat.normalMap = backup.normalMap;
      if (backup.normalScale) mat.normalScale.copy(backup.normalScale);
      mat.bumpMap = backup.bumpMap;
      mat.bumpScale = backup.bumpScale;
      mat.roughnessMap = backup.roughnessMap;
      if (phys.isMeshPhysicalMaterial) {
        phys.clearcoatNormalMap = backup.clearcoatNormalMap;
        if (backup.clearcoatNormalScale) phys.clearcoatNormalScale.copy(backup.clearcoatNormalScale);
      }
      mat.needsUpdate = true;
      return;
    }

    const pair = this.getTextures(kind);
    if (kind === 'car_flake' && phys.isMeshPhysicalMaterial) {
      phys.clearcoatNormalMap = this.cloneRepeated(pair.normal, `${kind}_norm`, rx, ry);
      phys.clearcoatNormalScale.set(scale, scale);
    } else {
      if (!backup.normalMap) {
        mat.normalMap = this.cloneRepeated(pair.normal, `${kind}_norm`, rx, ry);
        mat.normalScale.set(scale, scale);
      }
      if (!backup.roughnessMap) {
        mat.roughnessMap = this.cloneRepeated(pair.rough, `${kind}_rough`, rx, ry);
      }
    }
    mat.needsUpdate = true;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    for (const entry of this.entries.values()) {
      this.applyEntry(entry, enabled);
    }
  }
}

export const microtextures = new PbrMicrotextureSystem();
