// GLB 3D Asset Loader & Instantiation Manager (GLTFLoader + DRACOLoader + SkeletonUtils + GitHub Pages BASE_URL safe).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { VehicleType } from './vehicles';
import { microtextures } from './microtextures';

export type CarGlbKey = 'sports' | 'sedan' | 'suv' | 'police';
export type BuildingGlbKey = 'artdeco' | 'tower' | 'havana' | 'wynwood';
export type SiteCarGlbKey = 'ferrari' | 'milktruck';
export type SiteCharGlbKey = 'soldier' | 'cesiumman';
export type PropGlbKey = 'cone' | 'crate' | 'barrel' | 'bin';
export type AircraftGlbKey = 'jet' | 'prop';
export type LandmarkPropKey = 'palm' | 'lamp';

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

export interface SiteCharacterTemplate {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export interface SiteCharacterInstance {
  key: SiteCharGlbKey;
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: {
    idle?: THREE.AnimationAction;
    walk?: THREE.AnimationAction;
    run?: THREE.AnimationAction;
  };
  currentAction: 'idle' | 'walk' | 'run' | null;
}

export const MODEL_SITE_MANIFEST = {
  siteModels: [
    { key: 'ferrari', file: 'sites/ferrari.glb', source: 'Khronos / Three.js official Ferrari 458 .glb' },
    { key: 'milktruck', file: 'sites/CesiumMilkTruck.glb', source: 'Khronos glTF-Sample-Models CesiumMilkTruck .glb' },
    { key: 'cone', file: 'sites/TrafficCone.glb', source: 'Khronos glTF-Sample-Assets TrafficCone .glb' },
    { key: 'soldier', file: 'sites/Soldier.glb', source: 'Mixamo / Three.js official Soldier .glb' },
    { key: 'cesiumman', file: 'sites/CesiumMan.glb', source: 'Khronos glTF-Sample-Models CesiumMan .glb' },
  ],
  localModels: [
    'car_sports.glb',
    'car_sedan.glb',
    'car_suv.glb',
    'car_police.glb',
    'car_wheel.glb',
    'building_artdeco.glb',
    'building_tower.glb',
    'building_havana.glb',
    'building_wynwood.glb',
    'human_base.glb',
    'prop_crate.glb',
    'prop_barrel.glb',
    'prop_bin.glb',
    'prop_palm.glb',
    'prop_lamp.glb',
    'plane_jet.glb',
    'plane_prop.glb',
    'weapon_pack.glb',
  ],
} as const;

function baseUrl(): string {
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? './';
  return base.endsWith('/') ? base : `${base}/`;
}

function modelUrl(filename: string): string {
  return `${baseUrl()}models/${filename}`;
}

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(`${baseUrl()}draco/`);

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const carTemplates = new Map<CarGlbKey, THREE.Group>();
const siteCarTemplates = new Map<SiteCarGlbKey, THREE.Group>();
const buildingTemplates = new Map<BuildingGlbKey, THREE.Group>();
const propTemplates = new Map<PropGlbKey, THREE.Group>();
const aircraftTemplates = new Map<AircraftGlbKey, THREE.Group>();
const landmarkPropTemplates = new Map<LandmarkPropKey, THREE.Group>();
const siteCharTemplates = new Map<SiteCharGlbKey, SiteCharacterTemplate>();
let wheelTemplate: THREE.Group | null = null;
let weaponPackTemplate: THREE.Group | null = null;
let humanTemplates: HumanGlbTemplates | null = null;

let startedLoading = false;
let loadedCount = 0;
const TOTAL_MODELS = MODEL_SITE_MANIFEST.localModels.length + MODEL_SITE_MANIFEST.siteModels.length;
const readyListeners: (() => void)[] = [];
let glbRtxOn = true;
let glbWorldMode = true;
const trackedGlbMats = new Set<THREE.Material>();

export function isGlbWorldMode(): boolean {
  return glbWorldMode;
}

export function setGlbWorldMode(enabled: boolean): void {
  glbWorldMode = enabled;
}

function applyGlbRtxToMat(m: THREE.Material, enabled: boolean) {
  const nameLow = (m.name || '').toLowerCase();
  if (
    (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial &&
    (m.name === 'paint' || nameLow === 'body_color')
  ) {
    const p = m as THREE.MeshPhysicalMaterial;
    p.metalness = enabled ? 0.58 : 0.34;
    p.roughness = enabled ? 0.12 : 0.28;
    p.clearcoat = enabled ? 1.0 : 0.0;
    p.clearcoatRoughness = enabled ? 0.03 : 0.25;
    p.envMapIntensity = enabled ? 2.25 : 0.85;
    p.needsUpdate = true;
  } else if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    const s = m as THREE.MeshStandardMaterial;
    if (nameLow.includes('chrome')) {
      s.metalness = 0.95;
      s.roughness = enabled ? 0.06 : 0.22;
      s.envMapIntensity = enabled ? 2.5 : 0.9;
    } else if (nameLow === 'glass_curtain') {
      s.metalness = enabled ? 0.84 : 0.45;
      s.roughness = enabled ? 0.05 : 0.24;
      s.envMapIntensity = enabled ? 2.5 : 0.8;
    } else if (nameLow.includes('glass')) {
      s.metalness = enabled ? 0.88 : 0.45;
      s.roughness = enabled ? 0.04 : 0.2;
      s.envMapIntensity = enabled ? 2.4 : 0.85;
    } else if (nameLow === 'paint_secondary') {
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
        const nLow = (m.name || '').toLowerCase();
        if (isCar && (m.name === 'paint' || nLow === 'body_color')) {
          const phys = new THREE.MeshPhysicalMaterial({
            color: m.color ? m.color.clone() : new THREE.Color(0xd92626),
            map: m.map ?? null,
            normalMap: m.normalMap ?? null,
            roughnessMap: m.roughnessMap ?? null,
            metalness: 0.58,
            roughness: 0.12,
            clearcoat: 1.0,
            clearcoatRoughness: 0.03,
            envMapIntensity: 2.25,
          });
          phys.name = m.name || 'paint';
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

function normalizeToFootprint(
  rawScene: THREE.Group,
  opts: { targetLen?: number; targetHeight?: number; flipY?: boolean; stripNames?: string[] },
): THREE.Group {
  if (opts.stripNames?.length) {
    const toRemove: THREE.Object3D[] = [];
    rawScene.traverse((obj) => {
      const low = (obj.name || '').toLowerCase();
      if (opts.stripNames!.some((s) => low.includes(s))) {
        toRemove.push(obj);
      }
    });
    for (const r of toRemove) {
      r.parent?.remove(r);
    }
  }

  const wrapper = new THREE.Group();
  rawScene.updateMatrixWorld(true);

  if (opts.flipY) {
    rawScene.rotation.y += Math.PI;
  }

  const box = new THREE.Box3().setFromObject(rawScene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  let scale = 1;
  if (opts.targetLen && size.z > 0.001) {
    scale = opts.targetLen / Math.max(size.z, size.x * 0.5);
  } else if (opts.targetHeight && size.y > 0.001) {
    scale = opts.targetHeight / size.y;
  }

  rawScene.scale.multiplyScalar(scale);
  rawScene.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(rawScene);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  rawScene.position.x -= scaledCenter.x;
  rawScene.position.z -= scaledCenter.z;
  rawScene.position.y -= scaledBox.min.y;

  wrapper.add(rawScene);
  return wrapper;
}

function notifyLoaded() {
  loadedCount++;
  for (const cb of readyListeners) {
    try {
      cb();
    } catch {
      /* ignore listener errors */
    }
  }
}

/** Preloads all local binary .glb models and curated model-site .glb packs from public/models/. */
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
      () => {},
    );
  }

  loader.load(
    modelUrl('car_wheel.glb'),
    (gltf) => {
      calibratePbr(gltf.scene, false);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const sz = new THREE.Vector3();
      const ctr = new THREE.Vector3();
      box.getSize(sz);
      box.getCenter(ctr);
      gltf.scene.position.sub(ctr);
      const diam = Math.max(sz.y, sz.z, 0.001);
      const wrap = new THREE.Group();
      wrap.add(gltf.scene);
      wrap.scale.setScalar(0.70 / diam);
      wheelTemplate = wrap;
      notifyLoaded();
    },
    undefined,
    () => {},
  );

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
      () => {},
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
    () => {},
  );

  for (const pk of ['crate', 'barrel', 'bin'] as const) {
    loader.load(
      modelUrl(`prop_${pk}.glb`),
      (gltf) => {
        calibratePbr(gltf.scene, false);
        propTemplates.set(pk, gltf.scene);
        notifyLoaded();
      },
      undefined,
      () => {},
    );
  }

  for (const lk of ['palm', 'lamp'] as const) {
    loader.load(
      modelUrl(`prop_${lk}.glb`),
      (gltf) => {
        calibratePbr(gltf.scene, false);
        landmarkPropTemplates.set(lk, gltf.scene);
        notifyLoaded();
      },
      undefined,
      () => {},
    );
  }

  for (const ak of ['jet', 'prop'] as const) {
    loader.load(
      modelUrl(`plane_${ak}.glb`),
      (gltf) => {
        calibratePbr(gltf.scene, true);
        aircraftTemplates.set(ak, gltf.scene);
        notifyLoaded();
      },
      undefined,
      () => {},
    );
  }

  loader.load(
    modelUrl('weapon_pack.glb'),
    (gltf) => {
      calibratePbr(gltf.scene, false);
      weaponPackTemplate = gltf.scene;
      notifyLoaded();
    },
    undefined,
    () => {},
  );

  // ---------------- Curated high-detail Model-Site GLB Packs (/public/models/sites/) ----------------
  loader.load(
    modelUrl('sites/ferrari.glb'),
    (gltf) => {
      calibratePbr(gltf.scene, true);
      // Verified wheel axle layout: fl z=-1.155, rl z=+1.496 -> faces -Z -> rotate 180 deg around Y to match +Z forward
      const norm = normalizeToFootprint(gltf.scene, {
        targetLen: 4.5,
        flipY: true,
        stripNames: ['camera', 'light', 'shadow', 'ground'],
      });
      siteCarTemplates.set('ferrari', norm);
      notifyLoaded();
    },
    undefined,
    () => {},
  );

  loader.load(
    modelUrl('sites/CesiumMilkTruck.glb'),
    (gltf) => {
      calibratePbr(gltf.scene, true);
      // Verified Yup2Zup places front axle at +1.43 Z -> already faces +Z
      const norm = normalizeToFootprint(gltf.scene, {
        targetLen: 5.05,
        flipY: false,
      });
      siteCarTemplates.set('milktruck', norm);
      notifyLoaded();
    },
    undefined,
    () => {},
  );

  loader.load(
    modelUrl('sites/TrafficCone.glb'),
    (gltf) => {
      // Strip non-cone studio scene helpers (GroundPlane, Camera, Point Light, Bulb)
      const norm = normalizeToFootprint(gltf.scene, {
        targetHeight: 0.84,
        stripNames: ['groundplane', 'camera', 'point light', 'bulb'],
      });
      calibratePbr(norm, false);
      propTemplates.set('cone', norm);
      notifyLoaded();
    },
    undefined,
    () => {},
  );

  loader.load(
    modelUrl('sites/Soldier.glb'),
    (gltf) => {
      calibratePbr(gltf.scene, false);
      // Mixamo Soldier faces -Z in root pose -> rotate 180 deg around Y to match San Nova +Z forward
      const norm = normalizeToFootprint(gltf.scene, { targetHeight: 1.78, flipY: true });
      siteCharTemplates.set('soldier', { scene: norm, animations: gltf.animations ?? [] });
      notifyLoaded();
    },
    undefined,
    () => {},
  );

  loader.load(
    modelUrl('sites/CesiumMan.glb'),
    (gltf) => {
      calibratePbr(gltf.scene, false);
      const norm = normalizeToFootprint(gltf.scene, { targetHeight: 1.74, flipY: false });
      siteCharTemplates.set('cesiumman', { scene: norm, animations: gltf.animations ?? [] });
      notifyLoaded();
    },
    undefined,
    () => {},
  );
}

export function onGlbAssetReady(cb: () => void): () => void {
  readyListeners.push(cb);
  if (loadedCount > 0) {
    try {
      cb();
    } catch {
      /* ignore */
    }
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
    case 'sports':
      return 'sports';
    case 'sedan':
    case 'taxi':
      return 'sedan';
    case 'suv':
    case 'pickup':
    case 'van':
      return 'suv';
    case 'police':
      return 'police';
    default:
      return null;
  }
}

function tintCarMat(mat: THREE.Material, paintHex: number, isPolice: boolean): THREE.Material {
  const m = mat.clone() as THREE.MeshStandardMaterial;
  const nLow = (m.name || '').toLowerCase();
  if (m.name === 'paint' || nLow === 'body_color') {
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

/** Updates paint color across any active GLB car shell (local or model-site Ferrari). */
export function repaintGlbRoot(root: THREE.Object3D, paintHex: number): void {
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      const nLow = (m.name || '').toLowerCase();
      if ((m.name === 'paint' || nLow === 'body_color') && (m as THREE.MeshStandardMaterial).color) {
        (m as THREE.MeshStandardMaterial).color.setHex(paintHex);
      }
    }
  });
}

export interface ClonedCarGlbResult {
  group: THREE.Group;
  integratedWheels: boolean;
  sourceTag: string;
}

export function desiredCarGlbSource(
  type: VehicleType,
  useSiteModels = glbWorldMode,
  allowHeroSite = true,
): string | null {
  if (useSiteModels && allowHeroSite && type === 'sports' && siteCarTemplates.has('ferrari')) {
    return 'site_ferrari';
  }
  if (useSiteModels && type === 'van' && siteCarTemplates.has('milktruck')) {
    return 'site_milktruck';
  }
  const key = mapVehicleTypeToGlb(type);
  return key && carTemplates.has(key) ? `local_${key}` : null;
}

export function desiredAircraftGlbSource(type: VehicleType, useSiteModels = glbWorldMode): string | null {
  if (!useSiteModels) return null;
  const key: AircraftGlbKey | null =
    type === 'jet' ? 'jet' : type === 'prop_plane' || type === 'seaplane' ? 'prop' : null;
  return key && aircraftTemplates.has(key) ? `aircraft_${key}` : null;
}

export function isCarWheelGlbLoaded(): boolean {
  return wheelTemplate !== null;
}

/** Clones a sculpted .glb car body (model-site Ferrari/MilkTruck when hdGlbMode ON, else local .glb) tinted to paintColor. */
export function cloneCarGlb(
  type: VehicleType,
  paintColor: number,
  useSiteModels = glbWorldMode,
  allowHeroSite = true,
): ClonedCarGlbResult | null {
  let tpl: THREE.Group | undefined;
  let integratedWheels = false;
  let sourceTag = '';

  if (useSiteModels && allowHeroSite && type === 'sports' && siteCarTemplates.has('ferrari')) {
    tpl = siteCarTemplates.get('ferrari');
    integratedWheels = true;
    sourceTag = 'site_ferrari';
  } else if (useSiteModels && type === 'van' && siteCarTemplates.has('milktruck')) {
    tpl = siteCarTemplates.get('milktruck');
    integratedWheels = true;
    sourceTag = 'site_milktruck';
  } else {
    const key = mapVehicleTypeToGlb(type);
    if (!key) return null;
    tpl = carTemplates.get(key);
    sourceTag = `local_${key}`;
  }
  if (!tpl) return null;

  const clone = tpl.clone(true);
  clone.name = `glb_car_${type}`;
  clone.userData.glbSource = sourceTag;
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

  if (!integratedWheels) {
    if (type === 'van') clone.scale.set(1.02, 1.18, 1.04);
    else if (type === 'pickup') clone.scale.set(1.0, 0.96, 1.02);
  }

  microtextures.registerGlbRoot(clone);
  return { group: clone, integratedWheels, sourceTag };
}

/** Clones sculpted multi-spoke alloy car_wheel.glb scaled to the vehicle's wheelR. */
export function cloneCarWheelGlb(wheelRadius: number): THREE.Group | null {
  if (!wheelTemplate) return null;
  const clone = wheelTemplate.clone(true);
  const s = wheelRadius / 0.35;
  clone.scale.setScalar(s);
  clone.name = 'glb_car_wheel';
  return clone;
}

/** Clones flyable aircraft .glb shell (`plane_jet.glb` or `plane_prop.glb`). */
export function cloneAircraftGlb(type: VehicleType): THREE.Group | null {
  const key: AircraftGlbKey | null =
    type === 'jet' ? 'jet' : type === 'prop_plane' || type === 'seaplane' ? 'prop' : null;
  if (!key) return null;
  const tpl = aircraftTemplates.get(key);
  if (!tpl) return null;
  const clone = tpl.clone(true);
  clone.name = `glb_aircraft_${type}`;
  clone.userData.glbSource = `aircraft_${key}`;
  microtextures.registerGlbRoot(clone);
  return clone;
}

/** Clones high-detail prop .glb (`TrafficCone.glb` for cone, or crate/barrel/bin). */
export function clonePropGlb(kind: PropGlbKey): THREE.Group | null {
  const tpl = propTemplates.get(kind);
  if (!tpl) return null;
  const clone = tpl.clone(true);
  clone.name = `glb_prop_${kind}`;
  microtextures.registerGlbRoot(clone);
  return clone;
}

/** Clones weapon crate / tactical pickup visual from weapon_pack.glb. */
export function cloneWeaponPickupGlb(): THREE.Group | null {
  if (!weaponPackTemplate) return null;
  const clone = weaponPackTemplate.clone(true);
  clone.name = 'glb_weapon_pack';
  microtextures.registerGlbRoot(clone);
  return clone;
}

/** Clones sculpted palm tree or ornate deco streetlamp .glb for hero boulevard plazas. */
export function cloneLandmarkPropGlb(kind: LandmarkPropKey): THREE.Group | null {
  const tpl = landmarkPropTemplates.get(kind);
  if (!tpl) return null;
  const clone = tpl.clone(true);
  clone.name = `glb_landmark_${kind}`;
  microtextures.registerGlbRoot(clone);
  return clone;
}

/** Clones a rigged, skeletal-animated model-site character (`Soldier.glb` or `CesiumMan.glb`) via SkeletonUtils. */
export function cloneSiteCharacterGlb(kind: string, seed: number): SiteCharacterInstance | null {
  let key: SiteCharGlbKey | null = null;
  if (kind === 'cop' || kind === 'guard' || kind === 'gang') {
    key = 'soldier';
  } else if (seed % 5 === 0) {
    key = 'cesiumman';
  }
  if (!key) return null;

  const tpl = siteCharTemplates.get(key);
  if (!tpl) return null;

  const cloned = SkeletonUtils.clone(tpl.scene) as THREE.Group;
  cloned.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  microtextures.registerGlbRoot(cloned);

  const mixer = new THREE.AnimationMixer(cloned);
  const actions: SiteCharacterInstance['actions'] = {};

  for (const clip of tpl.animations) {
    const low = clip.name.toLowerCase();
    if (low.includes('idle')) actions.idle = mixer.clipAction(clip);
    else if (low.includes('run')) actions.run = mixer.clipAction(clip);
    else if (low.includes('walk')) actions.walk = mixer.clipAction(clip);
  }
  if (!actions.idle && tpl.animations[0]) {
    actions.idle = mixer.clipAction(tpl.animations[0]);
  }
  if (!actions.walk && tpl.animations[0]) {
    actions.walk = mixer.clipAction(tpl.animations[0]);
  }
  if (!actions.run && actions.walk) {
    actions.run = actions.walk;
  }

  if (actions.idle) {
    actions.idle.play();
  }

  return {
    key,
    root: cloned,
    mixer,
    actions,
    currentAction: 'idle',
  };
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
  microtextures.registerGlbRoot(clone);
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
