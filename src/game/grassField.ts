// Real 3D Instanced Grass Blade Field with curved multi-segment tapered blades,
// root-to-tip botanical vertex color gradient, and GPU vertex-shader coastal wind sway.
import * as THREE from 'three';
import {
  DISTRICTS,
  HALF,
  INNER_HALF,
  NB,
  Rng,
  SUBURBAN_ZONES,
  blockCenter,
  groundHeight,
  isOceanAt,
  isOnOuterHighway,
  sandFactorAt,
} from './config';
import type { World } from './world';

/** Pure deterministic eligibility check so grass blades ONLY grow on genuine lawns, parks, and verges. */
export function isGrassEligible(x: number, z: number): boolean {
  if (isOceanAt(x, z)) return false;
  if (sandFactorAt(x, z, 0) > 0.25) return false;
  if (isOnOuterHighway(x, z, 15)) return false;

  // Core city grid: parks ('P') and residential block lawns ('R') only
  if (Math.abs(x) <= HALF + 18 && Math.abs(z) <= HALF + 18) {
    for (let bj = 0; bj < NB; bj++) {
      for (let bi = 0; bi < NB; bi++) {
        const t = DISTRICTS[bj][bi];
        if (t !== 'P' && t !== 'R') continue;
        const bx = blockCenter(bi);
        const bz = blockCenter(bj);
        const dx = Math.abs(x - bx);
        const dz = Math.abs(z - bz);
        if (dx <= INNER_HALF - 1.0 && dz <= INNER_HALF - 1.0) {
          // Keep central park paved cross-paths and pond clear
          if (t === 'P') {
            if (dx < 3.2 || dz < 3.2) return false;
            if (Math.hypot((x - (bx - 22)) / 1.4, z - (bz - 20)) < 14.5) return false;
            if (Math.hypot(x - (bx + 22), z - (bz + 22)) < 6.0) return false;
          }
          return true;
        }
      }
    }
    return false;
  }

  // Suburban green lawns and lush hills north/east of downtown
  for (const sub of SUBURBAN_ZONES) {
    if (x >= sub.x0 + 4 && x <= sub.x1 - 4 && z >= sub.z0 + 4 && z <= sub.z1 - 4) return true;
  }

  // Rolling green hills surrounding the north/east perimeter of downtown
  if (z < 460 && x > -680 && Math.hypot(x, z) < 1650) {
    return true;
  }
  return false;
}

/** Builds a lush curved 9-blade realistic 3D grass tuft BufferGeometry (3 vertical segments per tapered blade). */
export function createGrassTuftGeometry(): THREE.BufferGeometry {
  const blades = 9;
  const segs = 3; // 3 height segments per blade -> smooth arch bend
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const rootCol = new THREE.Color(0x3e7328);
  const midCol = new THREE.Color(0x6ca83b);
  const tipCol = new THREE.Color(0xa3d458);
  const tmpCol = new THREE.Color();

  let vOffset = 0;
  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI * 2 + (b % 2) * 0.28;
    const rad = b === 0 ? 0.0 : 0.08 + (b % 3) * 0.055;
    const bx = Math.cos(angle) * rad;
    const bz = Math.sin(angle) * rad;
    const bladeH = 0.27 + (b % 3) * 0.075;
    const baseHalfW = 0.032 + (b % 2) * 0.008;
    const arch = 0.085 + (b % 3) * 0.038;

    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const sideX = -dirZ;
    const sideZ = dirX;

    for (let s = 0; s <= segs; s++) {
      const t = s / segs; // 0 = root, 1 = pointed tip
      const y = t * bladeH;
      const bend = t * t * arch;
      const halfW = baseHalfW * (1 - t * 0.94);

      if (t < 0.5) tmpCol.copy(rootCol).lerp(midCol, t * 2);
      else tmpCol.copy(midCol).lerp(tipCol, (t - 0.5) * 2);

      // Left & right vertex of blade cross-section (or single apex at tip)
      if (s < segs) {
        const cx = bx + dirX * bend;
        const cz = bz + dirZ * bend;
        // Normal tilts upward & outward for soft sunlight translucency
        const nx = dirX * 0.35;
        const ny = 0.92;
        const nz = dirZ * 0.35;

        positions.push(
          cx - sideX * halfW, y, cz - sideZ * halfW,
          cx + sideX * halfW, y, cz + sideZ * halfW,
        );
        normals.push(nx, ny, nz, nx, ny, nz);
        colors.push(tmpCol.r, tmpCol.g, tmpCol.b, tmpCol.r, tmpCol.g, tmpCol.b);
      } else {
        const cx = bx + dirX * bend;
        const cz = bz + dirZ * bend;
        positions.push(cx, y, cz);
        normals.push(dirX * 0.25, 0.96, dirZ * 0.25);
        colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
      }
    }

    // Build triangles for each quad segment + pointed apex triangle
    for (let s = 0; s < segs - 1; s++) {
      const r0 = vOffset + s * 2;
      const r1 = r0 + 2;
      indices.push(r0, r0 + 1, r1, r0 + 1, r1 + 1, r1);
    }
    const lastRow = vOffset + (segs - 1) * 2;
    const tipIdx = vOffset + segs * 2;
    indices.push(lastRow, lastRow + 1, tipIdx);
    vOffset = tipIdx + 1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export interface GrassFieldHandle {
  mesh: THREE.InstancedMesh;
  tuftCount: number;
  bladeCount: number;
  update(time: number): void;
}

/**
 * Generates an instanced field of real 3D curved grass blades across Central Park,
 * residential yards, suburban lawns, and lush green hills with GPU wind sway.
 */
export function buildRealisticGrassField(world: World, rng: Rng): GrassFieldHandle {
  const geo = createGrassTuftGeometry();
  const windUniform = { value: 0 };

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.14,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWindTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float hWeight = clamp(position.y / 0.34, 0.0, 1.0);
        hWeight *= hWeight;
        vec3 instOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float gust = sin(uWindTime * 2.1 + instOrigin.x * 0.19 + instOrigin.z * 0.14) * 0.068
                   + sin(uWindTime * 4.3 + instOrigin.x * 0.52 - instOrigin.z * 0.37) * 0.022;
        transformed.x += gust * hWeight;
        transformed.z += gust * 0.55 * hWeight;`,
      );
  };

  // Gather lush grounded grass blade tuft positions across parks, residential yards & green meadows
  const pts: { x: number; y: number; z: number; yaw: number; sx: number; sy: number; tint: number }[] = [];
  const pushTuft = (x: number, z: number, dense = false) => {
    if (!isGrassEligible(x, z)) return;
    const gy = groundHeight(x, z);
    if (gy < 0.02) return;
    // Never place grass inside buildings, ponds, gazebos, or solid obstacles
    if (world.solidAt(x, gy + 0.55, z)) return;
    pts.push({
      x,
      y: gy - 0.02,
      z,
      yaw: rng.range(0, Math.PI * 2),
      sx: rng.range(0.85, 1.38),
      sy: rng.range(dense ? 0.95 : 0.78, dense ? 1.55 : 1.32),
      tint: rng.range(0.84, 1.16),
    });
  };

  // 1. Dense manicured & wildflower-rich Central Park + Residential Yards inside Core City
  for (let bj = 0; bj < NB; bj++) {
    for (let bi = 0; bi < NB; bi++) {
      const t = DISTRICTS[bj][bi];
      if (t !== 'P' && t !== 'R') continue;
      const bx = blockCenter(bi);
      const bz = blockCenter(bj);
      const count = t === 'P' ? 5600 : 340;
      for (let i = 0; i < count; i++) {
        pushTuft(
          bx + rng.range(-INNER_HALF + 1.1, INNER_HALF - 1.1),
          bz + rng.range(-INNER_HALF + 1.1, INNER_HALF - 1.1),
          t === 'P',
        );
      }
    }
  }

  // 2. Suburban lawns (Palm Crest, Oakridge, Sunset Estates, Pinewood Hills)
  for (const sub of SUBURBAN_ZONES) {
    for (let i = 0; i < 620; i++) {
      pushTuft(
        rng.range(sub.x0 + 5, sub.x1 - 5),
        rng.range(sub.z0 + 5, sub.z1 - 5),
        false,
      );
    }
  }

  // 3. Lush green perimeter hills & roadside meadows around downtown
  for (let i = 0; i < 2400; i++) {
    const ang = rng.range(-Math.PI * 0.95, Math.PI * 0.25);
    const rad = rng.range(545, 1480);
    pushTuft(Math.cos(ang) * rad, Math.sin(ang) * rad, true);
  }

  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.yaw, 0);
    dummy.scale.set(p.sx, p.sy, p.sx);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    col.setRGB(
      Math.min(1.15, p.tint * (0.94 + (i % 5) * 0.025)),
      Math.min(1.15, p.tint * (0.98 + (i % 3) * 0.025)),
      Math.min(1.15, p.tint * (0.86 + (i % 7) * 0.02)),
    );
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return {
    mesh,
    tuftCount: pts.length,
    bladeCount: pts.length * 9,
    update(time: number) {
      windUniform.value = time;
    },
  };
}
