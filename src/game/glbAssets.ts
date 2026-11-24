// GLB 3D Asset Loader & Instantiation Manager (GLTFLoader + GitHub Pages BASE_URL safe).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VehicleType } from './vehicles';

export type CarGlbKey = 'sports' | 'sedan' | 'suv' | 'police';
export type BuildingGlbKey = 'artdeco' | 'tower' | 'havana' | 'wynwood';

export interface HumanGlbTemplates {
  HeadMesh?: THREE.Object3D;
  TorsoMesh?: THREE.Object3D;
  PelvisMesh?: THREE.Object3D;
  UpperArmMesh?: THREE.Object3D;
  ForeArmMesh?: THREE.Object3D;
  HandMesh?: THREE.Object3D;
  ThighMesh?: THREE.Object3D;
  ShinMesh?: THREE.Object3D;
  ShoeMesh?: THREE.Object3D;
}

const loader = new GLTFLoader();
const carTemplates = new Map<CarGlbKey, THREE.Group>();
const buildingTemplates = new Map<BuildingGlbKey, THREE.Group>();
let humanTemplates: HumanGlbTemplates | null = null;
let startedLoading = false;
let loadedCount = 0;
const TOTAL_MODELS = 9;
const readyListeners: (() => void)[] = [];
let glbRtxOn = true;
const trackedGlbMats = new Set<THREE.Material>();

function applyGlbRtxToMat(m: THREE.Material, enabled: boolean) {
  if ((m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial && m.name === 'paint') {
    const p = m as THREE.MeshPhysicalMaterial;
    p.metalness = enabled ? 0.56 : 0.34;
    p.roughness = enabled ? 0.12 : 0.28;
    p.clearcoat = enabled ? 1.0 : 0.0;
    p.clearcoatRoughness = enabled ? 0.03 : 0.25;
    p.envMapIntensity = enabled ? 2.25 : 0.85;
    p.needsUpdate = true;
  } else if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    const s = m as THREE.MeshStandardMaterial;
    if (s.name === 'chrome') {
      s.metalness = 0.95;
      s.roughness = enabled ? 0.06 : 0.22;
      s.envMapIntensity = enabled ? 2.5 : 0.9;
    } else if (s.name === 'glass_curtain') {
      s.metalness = enabled ? 0.84 : 0.45;
      s.roughness = enabled ? 0.05 : 0.24;
      s.envMapIntensity = enabled ? 2.5 : 0.8;
    } else if (s.name === 'glass') {
      s.metalness = enabled ? 0.88 : 0.45;
      s.roughness = enabled ? 0.04 : 0.2;
      s.envMapIntensity = enabled ? 2.4 : 0.85;
    } else if (s.name === 'paint_secondary') {
      s.roughness = enabled ? 0.2 : 0.38;
      s.envMapIntensity = enabled ? 1.6 : 0.7;
    } else {
      s.envMapIntensity = enabled ? 1.15 : 0.65;
    }
    s.needsUpdate = true;
  }
}

export function setGlbRtx(enabled: boolean): void {
  glbRtxOn = enabled;
  for (const m of trackedGlbMats) {
    applyGlbRtxToMat(m, enabled);
  }
}

function modelUrl(filename: string): string {
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? './';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}models/${filename}`;
}

function calibratePbr(root: THREE.Object3D, isCar = false) {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i] as THREE.MeshStandardMaterial;
        if (!m) continue;
        if (isCar && m.name === 'paint') {
          const phys = new THREE.MeshPhysicalMaterial({
            color: m.color.clone(),
            metalness: 0.56,
            roughness: 0.12,
            clearcoat: 1.0,
            clearcoatRoughness: 0.03,
            envMapIntensity: 2.25,
          });
          phys.name = 'paint';
          applyGlbRtxToMat(phys, glbRtxOn);
          trackedGlbMats.add(phys);
          if (Array.isArray(mesh.material)) mesh.material[i] = phys;
          else mesh.material = phys;
        } else if (m.isMeshStandardMaterial) {
          applyGlbRtxToMat(m, glbRtxOn);
          trackedGlbMats.add(m);
        }
      }
    }
  });
}

function notifyLoaded() {
  loadedCount++;
  for (const cb of readyListeners) {
    try { cb(); } catch { /* ignore listener errors */ }
  }
}

/** Preloads all 9 real binary .glb models from public/models/ via GLTFLoader. */
export function preloadGlbAssets(): void {
  if (startedLoading) return;
  startedLoading = true;

  const carKeys: CarGlbKey[] = ['sports', 'sedan', 'suv', 'police'];
  for (const key of carKeys) {
    loader.load(
      modelUrl(`car_${key}.glb`),
      (gltf) => {
        calibratePbr(gltf.scene, true);
        carTemplates.set(key, gltf.scene);
        notifyLoaded();
      },
      undefined,
      () => { /* fallback procedural geometry stays active */ },
    );
  }

  const bldgKeys: BuildingGlbKey[] = ['artdeco', 'tower', 'havana', 'wynwood'];
  for (const key of bldgKeys) {
    loader.load(
      modelUrl(`building_${key}.glb`),
      (gltf) => {
        calibratePbr(gltf.scene, false);
        buildingTemplates.set(key, gltf.scene);
        notifyLoaded();
      },
      undefined,
      () => { /* graceful fallback */ },
    );
  }

  loader.load(
    modelUrl('human_base.glb'),
    (gltf) => {
      calibratePbr(gltf.scene, false);
      const parts: HumanGlbTemplates = {};
      gltf.scene.traverse((child) => {
        if (child.name in parts || child.name.endsWith('Mesh')) {
          (parts as Record<string, THREE.Object3D>)[child.name] = child;
        }
      });
      humanTemplates = parts;
      notifyLoaded();
    },
    undefined,
    () => { /* graceful fallback */ },
  );
}

export function onGlbAssetReady(cb: () => void): () => void {
  readyListeners.push(cb);
  if (loadedCount > 0) {
    try { cb(); } catch { /* ignore */ }
  }
  return () => {
    const idx = readyListeners.indexOf(cb);
    if (idx >= 0) readyListeners.splice(idx, 1);
  };
}

export function getGlbStatus(): { loaded: number; total: number } {
  return { loaded: loadedCount, total: TOTAL_MODELS };
}

export function mapVehicleTypeToGlb(type: VehicleType): CarGlbKey | null {
  switch (type) {
    case 'sports': return 'sports';
    case 'sedan':
    case 'taxi': return 'sedan';
    case 'suv':
    case 'pickup':
    case 'van': return 'suv';
    case 'police': return 'police';
    default: return null;
  }
}

/** Clones a sculpted .glb car body tinted to the vehicle's paint & secondary color. */
export function cloneCarGlb(type: VehicleType, paintColor: number): THREE.Group | null {
  const key = mapVehicleTypeToGlb(type);
  if (!key) return null;
  const tpl = carTemplates.get(key);
  if (!tpl) return null;

  const clone = tpl.clone(true);
  clone.name = `glb_car_${type}`;
  const isTaxi = type === 'taxi';
  const isPolice = type === 'police';
  const effectivePaint = isTaxi ? 0xf2b705 : isPolice ? 0xf0f2f5 : paintColor;

  clone.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => tintCarMat(m, effectivePaint, isPolice));
      } else if (mesh.material) {
        mesh.material = tintCarMat(mesh.material, effectivePaint, isPolice);
      }
    }
  });

  // Match wheelbase proportions slightly for pickup/van variants
  if (type === 'van') clone.scale.set(1.02, 1.18, 1.04);
  else if (type === 'pickup') clone.scale.set(1.0, 0.96, 1.02);

  return clone;
}

function tintCarMat(mat: THREE.Material, paintHex: number, isPolice: boolean): THREE.Material {
  const m = mat.clone() as THREE.MeshStandardMaterial;
  if (m.name === 'paint') {
    m.color.setHex(paintHex);
  } else if (m.name === 'paint_secondary') {
    m.color.setHex(isPolice ? 0x151a24 : 0x16181f);
  } else if (m.name === 'headlight') {
    m.emissiveIntensity = 1.1;
  } else if (m.name === 'taillight') {
    m.emissiveIntensity = 1.1;
  }
  applyGlbRtxToMat(m, glbRtxOn);
  trackedGlbMats.add(m);
  return m;
}

/** Clones a hero architectural .glb building landmark with optional facade tinting. */
export function cloneBuildingGlb(key: BuildingGlbKey, tintHex?: number): THREE.Group | null {
  const tpl = buildingTemplates.get(key);
  if (!tpl) return null;
  const clone = tpl.clone(true);
  clone.name = `glb_building_${key}`;
  if (tintHex !== undefined) {
    clone.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const applyTint = (orig: THREE.Material) => {
          const m = orig.clone() as THREE.MeshStandardMaterial;
          if (m.name === 'stucco_cream' || m.name === 'accent_coral') {
            m.color.multiply(new THREE.Color(tintHex));
          }
          applyGlbRtxToMat(m, glbRtxOn);
          trackedGlbMats.add(m);
          return m;
        };
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(applyTint)
          : applyTint(mesh.material);
      }
    });
  }
  return clone;
}

/** Clones an individual anatomical human body-part node from human_base.glb and applies the character's material. */
export function cloneHumanGlbPart(
  partName: keyof HumanGlbTemplates,
  primaryMat: THREE.Material,
  secondaryMat?: THREE.Material,
): THREE.Object3D | null {
  if (!humanTemplates) return null;
  const tpl = humanTemplates[partName];
  if (!tpl) return null;

  const clone = tpl.clone(true);
  clone.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((orig, idx) =>
          idx === 0 ? primaryMat : (secondaryMat ?? orig),
        );
      } else {
        const name = (mesh.material as THREE.Material)?.name;
        if (name === 'sole' || name === 'accent') {
          if (secondaryMat) mesh.material = secondaryMat;
        } else {
          mesh.material = primaryMat;
        }
      }
    }
  });
  return clone;
}

export function isHumanGlbLoaded(): boolean {
  return humanTemplates !== null;
}

export interface LandmarkGlbSpec {
  key: BuildingGlbKey;
  x: number;
  z: number;
  yaw: number;
  scale?: number;
  tint?: number;
  halfW: number;
  halfD: number;
  height: number;
  label: string;
}

/** Curated architectural .glb landmarks integrated into San Nova districts without blocking roads. */
export const GLB_CITY_LANDMARKS: LandmarkGlbSpec[] = [
  // Prominent near player spawn (-297, 30) on sidewalk plaza edge so player sees ultra-detailed GLB architecture immediately
  { key: 'artdeco', x: -274, z: 46, yaw: -Math.PI / 2, scale: 0.92, tint: 0xffe6d6, halfW: 9, halfD: 11, height: 32, label: 'Starlight Deco Hotel' },
  { key: 'tower', x: -252, z: -18, yaw: 0, scale: 0.95, halfW: 12, halfD: 12, height: 76, label: 'San Nova Spire' },
  // Ocean Beach Art Deco strip
  { key: 'artdeco', x: -120, z: 468, yaw: Math.PI, scale: 1.05, tint: 0xffd2ec, halfW: 11, halfD: 9, height: 34, label: 'Ocean Drive Palace' },
  { key: 'artdeco', x: 140, z: 468, yaw: Math.PI, scale: 1.0, tint: 0xd9f8ff, halfW: 10, halfD: 9, height: 33, label: 'Vice Palms Hotel' },
  // Downtown Financial Skyline
  { key: 'tower', x: 42, z: -48, yaw: Math.PI / 4, scale: 1.15, halfW: 14, halfD: 14, height: 88, label: 'Leonida Trade Tower' },
  { key: 'tower', x: -46, z: -162, yaw: 0, scale: 1.05, halfW: 13, halfD: 13, height: 80, label: 'Meridian Plaza' },
  // Little Havana Colonnade
  { key: 'havana', x: -348, z: 168, yaw: Math.PI / 2, scale: 1.0, tint: 0xffdfb8, halfW: 9, halfD: 10, height: 16, label: 'Casa Havana Club' },
  { key: 'havana', x: -252, z: 168, yaw: -Math.PI / 2, scale: 1.0, tint: 0xffd1c4, halfW: 9, halfD: 10, height: 16, label: 'Cafe Calle Ocho' },
  // Wynwood Arts District
  { key: 'wynwood', x: 256, z: -166, yaw: Math.PI, scale: 1.0, tint: 0xffffff, halfW: 11, halfD: 9, height: 12, label: 'Wynwood Mural Lofts' },
  { key: 'wynwood', x: 348, z: -48, yaw: -Math.PI / 2, scale: 1.0, tint: 0xf4e8ff, halfW: 9, halfD: 11, height: 12, label: 'Neon Gallery Annex' },
];
