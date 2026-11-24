// Real binary .GLB 3D asset loader, throttled queue, material-cached instancing, and safe disposal.
// Eliminates WASM/GPU OOM crashes in HD GLB mode via single-worker Draco decoding, shared cached
// materials, bounded active skinned character slots, debounced sync callbacks, and clean disposal.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { microtextures } from './microtextures';

export type CarGlbKey = 'sports' | 'sedan' | 'suv' | 'police';
export type BuildingGlbKey = 'artdeco' | 'tower' | 'havana' | 'wynwood';
export type PropGlbKey = 'crate' | 'barrel' | 'bin' | 'cone' | 'palm' | 'lamp';
export type AircraftGlbKey = 'jet' | 'prop';
export type SiteCarGlbKey = 'ferrari' | 'milktruck';
export type SiteCharGlbKey = 'soldier' | 'cesium';

export interface HumanGlbParts {
  head?: THREE.Object3D;
  torso?: THREE.Object3D;
  arm_u?: THREE.Object3D;
  arm_l?: THREE.Object3D;
  hand?: THREE.Object3D;
  leg_u?: THREE.Object3D;
  leg_l?: THREE.Object3D;
  shoe?: THREE.Object3D;
}

export interface SiteCharacterInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: {
    idle?: THREE.AnimationAction;
    walk?: THREE.AnimationAction;
    run?: THREE.AnimationAction;
  };
  activeClip: 'idle' | 'walk' | 'run';
  kind: SiteCharGlbKey;
  disposed?: boolean;
}

const LOCAL_CAR_FILES: Record<CarGlbKey, string> = {
  sports: 'models/car_sports.glb',
  sedan: 'models/car_sedan.glb',
  suv: 'models/car_suv.glb',
  police: 'models/car_police.glb',
};

const BUILDING_FILES: Record<BuildingGlbKey, string> = {
  artdeco: 'models/building_artdeco.glb',
  tower: 'models/building_tower.glb',
  havana: 'models/building_havana.glb',
  wynwood: 'models/building_wynwood.glb',
};

const PROP_FILES: Record<PropGlbKey, string> = {
  crate: 'models/prop_crate.glb',
  barrel: 'models/prop_barrel.glb',
  bin: 'models/prop_bin.glb',
  cone: 'models/sites/TrafficCone.glb',
  palm: 'models/prop_palm.glb',
  lamp: 'models/prop_lamp.glb',
};

const AIRCRAFT_FILES: Record<AircraftGlbKey, string> = {
  jet: 'models/plane_jet.glb',
  prop: 'models/plane_prop.glb',
};

const SITE_CAR_FILES: Record<SiteCarGlbKey, string> = {
  ferrari: 'models/sites/ferrari.glb',
  milktruck: 'models/sites/CesiumMilkTruck.glb',
};

const SITE_CHAR_FILES: Record<SiteCharGlbKey, string> = {
  soldier: 'models/sites/Soldier.glb',
  cesium: 'models/sites/CesiumMan.glb',
};

const HUMAN_FILE = 'models/human_base.glb';
const WHEEL_FILE = 'models/car_wheel.glb';
const WEAPON_PACK_FILE = 'models/weapon_pack.glb';

const carTemplates = new Map<CarGlbKey, THREE.Group>();
const siteCarTemplates = new Map<SiteCarGlbKey, THREE.Group>();
const siteCharTemplates = new Map<SiteCharGlbKey, { scene: THREE.Group; animations: THREE.AnimationClip[]; scale: number }>();
const buildingTemplates = new Map<BuildingGlbKey, THREE.Group>();
const propTemplates = new Map<PropGlbKey, THREE.Group>();
const aircraftTemplates = new Map<AircraftGlbKey, THREE.Group>();
const weaponTemplates = new Map<string, THREE.Object3D>();
let wheelTemplate: THREE.Group | null = null;
let humanParts: HumanGlbParts | null = null;

// Shared material caches so 50 vehicles/props share ~15 materials instead of leaking 600+
const trackedGlbMats = new Set<THREE.MeshStandardMaterial>();
const sharedPaintMats = new Map<string, THREE.MeshStandardMaterial>();
const sharedTintedBuildingMats = new Map<string, THREE.MeshStandardMaterial>();

// Strict cap on simultaneous skinned SiteCharacterInstances to prevent GPU bone-buffer OOM
const MAX_SITE_CHARACTERS = 6;
let activeSiteCharacters = 0;

let rtxEnabledState = true;
let glbWorldMode = true;
let started = false;
let loadedCount = 0;
let failedCount = 0;
const totalCount =
  Object.keys(LOCAL_CAR_FILES).length +
  Object.keys(BUILDING_FILES).length +
  Object.keys(PROP_FILES).length +
  Object.keys(AIRCRAFT_FILES).length +
  Object.keys(SITE_CAR_FILES).length +
  Object.keys(SITE_CHAR_FILES).length +
  3; // human_base + car_wheel + weapon_pack

const readyListeners = new Set<() => void>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

function notifyLoaded(): void {
  if (notifyTimer !== null) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    for (const cb of readyListeners) {
      try {
        cb();
      } catch (err) {
        console.warn('[GLB] listener error isolated:', err);
      }
    }
  }, 140);
}

function resolveModelUrl(relPath: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${relPath}`;
}

function enhanceMaterial(mat: THREE.Material, role: 'car' | 'building' | 'human' | 'prop'): THREE.Material {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
  const n = (mat.name || '').toLowerCase();
  let out: THREE.MeshStandardMaterial = mat;

  if (role === 'car' && (n === 'paint' || n === 'body_color' || n === 'body')) {
    const phys = new THREE.MeshPhysicalMaterial({
      color: mat.color.clone(),
      map: mat.map ?? null,
      normalMap: mat.normalMap ?? null,
      roughnessMap: mat.roughnessMap ?? null,
      metalness: Math.max(0.42, mat.metalness),
      roughness: Math.min(0.24, Math.max(0.1, mat.roughness)),
      clearcoat: rtxEnabledState ? 0.96 : 0.35,
      clearcoatRoughness: rtxEnabledState ? 0.08 : 0.25,
      envMapIntensity: rtxEnabledState ? 1.55 : 0.72,
      name: mat.name || 'paint',
    });
    mat.dispose();
    out = phys;
  } else if (role === 'car' && (n === 'glass' || n.includes('glass') || n.includes('windshield'))) {
    const phys = new THREE.MeshPhysicalMaterial({
      color: mat.color.clone(),
      metalness: 0.14,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.68,
      envMapIntensity: rtxEnabledState ? 2.0 : 0.9,
      name: mat.name || 'glass',
    });
    mat.dispose();
    out = phys;
  } else if (role === 'car' && (n === 'chrome' || n.includes('rim') || n.includes('alloy') || n.includes('metal'))) {
    out.metalness = Math.max(0.86, out.metalness);
    out.roughness = Math.min(0.22, out.roughness);
    out.envMapIntensity = rtxEnabledState ? 1.7 : 0.8;
  } else if (role === 'car' && (n === 'headlight' || n === 'taillight' || n === 'siren_red' || n === 'siren_blue' || n.includes('light') || n.includes('led'))) {
    out.emissiveIntensity = Math.max(out.emissiveIntensity || 1.1, 1.35);
    out.envMapIntensity = rtxEnabledState ? 1.2 : 0.7;
  } else if (role === 'building') {
    if (n.includes('glass')) {
      out.metalness = 0.74;
      out.roughness = 0.14;
      out.envMapIntensity = rtxEnabledState ? 1.7 : 0.75;
    } else if (n.includes('neon')) {
      out.emissiveIntensity = Math.max(out.emissiveIntensity || 1.2, 1.45);
      out.envMapIntensity = 1.0;
    } else {
      out.envMapIntensity = rtxEnabledState ? 0.92 : 0.52;
    }
  } else if (role === 'prop') {
    out.envMapIntensity = rtxEnabledState ? 1.15 : 0.65;
  } else {
    out.envMapIntensity = rtxEnabledState ? 0.9 : 0.55;
  }

  trackedGlbMats.add(out);
  return out;
}

function prepareScene(scene: THREE.Group, role: 'car' | 'building' | 'human' | 'prop', castShadow = true): THREE.Group {
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => enhanceMaterial(m, role));
      } else if (mesh.material) {
        mesh.material = enhanceMaterial(mesh.material, role);
      }
    }
  });
  microtextures.registerGlbRoot(scene);
  return scene;
}

function normalizeModelToFootprint(
  raw: THREE.Group,
  targetLength: number,
  targetWidth: number,
  rotateY = 0,
): THREE.Group {
  const wrap = new THREE.Group();
  raw.rotation.y += rotateY;
  raw.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(raw);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const scaleZ = size.z > 0.01 ? targetLength / size.z : 1;
  const scaleX = size.x > 0.01 ? targetWidth / size.x : scaleZ;
  const uniform = Math.min(scaleZ, scaleX * 1.12);

  raw.scale.multiplyScalar(uniform);
  raw.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(raw);
  const center2 = new THREE.Vector3();
  box2.getCenter(center2);
  raw.position.x -= center2.x;
  raw.position.z -= center2.z;
  raw.position.y -= box2.min.y;
  wrap.add(raw);
  return wrap;
}

function normalizeModelToHeight(raw: THREE.Group, targetHeight: number, rotateY = 0): THREE.Group {
  const wrap = new THREE.Group();
  raw.rotation.y += rotateY;
  raw.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(raw);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = size.y > 0.01 ? targetHeight / size.y : 1;
  raw.scale.multiplyScalar(scale);
  raw.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(raw);
  const center2 = new THREE.Vector3();
  box2.getCenter(center2);
  raw.position.x -= center2.x;
  raw.position.z -= center2.z;
  raw.position.y -= box2.min.y;
  wrap.add(raw);
  return wrap;
}

export function isGlbWorldMode(): boolean {
  return glbWorldMode;
}

export function setGlbWorldMode(enabled: boolean): void {
  glbWorldMode = enabled;
}

interface LoadJob {
  relPath: string;
  usesDraco: boolean;
  onSuccess: (gltf: GLTF) => void;
}

/** Preloads all .glb models using a crash-safe throttled queue (max 2 concurrent, single Draco worker). */
export function preloadGlbAssets(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(resolveModelUrl('draco/'));
  draco.setDecoderConfig({ type: 'wasm' });
  draco.setWorkerLimit(1); // Prevent multi-worker WASM OOM spikes on Chrome/Safari/mobile
  loader.setDRACOLoader(draco);

  const jobs: LoadJob[] = [];

  // Priority 1: Fast local handcrafted models (zero Draco overhead)
  for (const [k, relPath] of Object.entries(LOCAL_CAR_FILES) as [CarGlbKey, string][]) {
    jobs.push({
      relPath,
      usesDraco: false,
      onSuccess: (gltf) => {
        carTemplates.set(k, prepareScene(gltf.scene, 'car', true));
      },
    });
  }

  jobs.push({
    relPath: WHEEL_FILE,
    usesDraco: false,
    onSuccess: (gltf) => {
      wheelTemplate = prepareScene(gltf.scene, 'car', false);
    },
  });

  jobs.push({
    relPath: HUMAN_FILE,
    usesDraco: false,
    onSuccess: (gltf) => {
      const root = prepareScene(gltf.scene, 'human', true);
      const parts: HumanGlbParts = {};
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const n = obj.name.toLowerCase();
          if (n === 'head') parts.head = obj;
          else if (n === 'torso') parts.torso = obj;
          else if (n === 'arm_u') parts.arm_u = obj;
          else if (n === 'arm_l') parts.arm_l = obj;
          else if (n === 'hand') parts.hand = obj;
          else if (n === 'leg_u') parts.leg_u = obj;
          else if (n === 'leg_l') parts.leg_l = obj;
          else if (n === 'shoe') parts.shoe = obj;
        }
      });
      humanParts = parts;
    },
  });

  for (const [k, relPath] of Object.entries(BUILDING_FILES) as [BuildingGlbKey, string][]) {
    jobs.push({
      relPath,
      usesDraco: false,
      onSuccess: (gltf) => {
        buildingTemplates.set(k, prepareScene(gltf.scene, 'building', true));
      },
    });
  }

  for (const [k, relPath] of Object.entries(PROP_FILES) as [PropGlbKey, string][]) {
    if (k === 'cone') continue; // schedule site cone with site models below
    jobs.push({
      relPath,
      usesDraco: false,
      onSuccess: (gltf) => {
        propTemplates.set(k, prepareScene(gltf.scene, 'prop', k !== 'palm' && k !== 'lamp'));
      },
    });
  }

  for (const [k, relPath] of Object.entries(AIRCRAFT_FILES) as [AircraftGlbKey, string][]) {
    jobs.push({
      relPath,
      usesDraco: false,
      onSuccess: (gltf) => {
        aircraftTemplates.set(k, prepareScene(gltf.scene, 'car', true));
      },
    });
  }

  jobs.push({
    relPath: WEAPON_PACK_FILE,
    usesDraco: false,
    onSuccess: (gltf) => {
      const root = prepareScene(gltf.scene, 'prop', false);
      root.traverse((obj) => {
        if (obj.name && obj.name.startsWith('weapon_')) {
          weaponTemplates.set(obj.name.toLowerCase(), obj);
        }
      });
    },
  });

  // Priority 2: External Model-Site .glb packs (loaded calmly one-by-one to prevent memory spikes)
  jobs.push({
    relPath: PROP_FILES.cone,
    usesDraco: false,
    onSuccess: (gltf) => {
      propTemplates.set('cone', normalizeModelToHeight(prepareScene(gltf.scene, 'prop', true), 0.78));
    },
  });

  jobs.push({
    relPath: SITE_CAR_FILES.milktruck,
    usesDraco: false,
    onSuccess: (gltf) => {
      const norm = normalizeModelToFootprint(prepareScene(gltf.scene, 'car', true), 5.1, 2.08, -Math.PI / 2);
      siteCarTemplates.set('milktruck', norm);
    },
  });

  jobs.push({
    relPath: SITE_CAR_FILES.ferrari,
    usesDraco: true,
    onSuccess: (gltf) => {
      const root = gltf.scene;
      // Hide separate baked shadow plane inside ferrari.glb so it never z-fights or floats above asphalt
      root.traverse((obj) => {
        if (obj.name && obj.name.toLowerCase().includes('shadow')) obj.visible = false;
      });
      const norm = normalizeModelToFootprint(prepareScene(root, 'car', true), 4.46, 1.94, Math.PI);
      siteCarTemplates.set('ferrari', norm);
    },
  });

  for (const [k, relPath] of Object.entries(SITE_CHAR_FILES) as [SiteCharGlbKey, string][]) {
    jobs.push({
      relPath,
      usesDraco: false,
      onSuccess: (gltf) => {
        const root = prepareScene(gltf.scene, 'human', true);
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const scale = size.y > 0.1 ? 1.78 / size.y : 1;
        siteCharTemplates.set(k, { scene: root, animations: gltf.animations || [], scale });
      },
    });
  }

  let cursor = 0;
  let inFlight = 0;
  let dracoPending = jobs.filter((j) => j.usesDraco).length;
  let dracoDisposed = false;

  const pump = () => {
    if (cursor >= jobs.length) {
      if (inFlight === 0 && !dracoDisposed) {
        dracoDisposed = true;
        try { draco.dispose(); } catch { /* ignore */ }
      }
      return;
    }

    // Keep concurrency strictly <= 2 (and <= 1 when a Draco job is running)
    const maxConcurrent = jobs[cursor]?.usesDraco ? 1 : 2;
    while (inFlight < maxConcurrent && cursor < jobs.length) {
      if (jobs[cursor].usesDraco && inFlight > 0) break;
      const job = jobs[cursor++];
      inFlight++;
      loader.load(
        resolveModelUrl(job.relPath),
        (gltf) => {
          try {
            job.onSuccess(gltf);
            loadedCount++;
            notifyLoaded();
          } catch (err) {
            failedCount++;
            console.warn(`[GLB] Post-process failed for ${job.relPath}:`, err);
          } finally {
            inFlight--;
            if (job.usesDraco) {
              dracoPending--;
              if (dracoPending <= 0 && !dracoDisposed) {
                dracoDisposed = true;
                try { draco.dispose(); } catch { /* ignore */ }
              }
            }
            setTimeout(pump, 16);
          }
        },
        undefined,
        () => {
          failedCount++;
          inFlight--;
          if (job.usesDraco) dracoPending--;
          setTimeout(pump, 16);
        },
      );
    }
  };

  pump();
}

export function onGlbAssetReady(cb: () => void): () => void {
  readyListeners.add(cb);
  return () => readyListeners.delete(cb);
}

export function getGlbStatus(): { loaded: number; total: number; failed: number } {
  return { loaded: loadedCount, total: totalCount, failed: failedCount };
}

export function setGlbRtx(enabled: boolean): void {
  rtxEnabledState = enabled;
  for (const mat of trackedGlbMats) {
    const n = (mat.name || '').toLowerCase();
    if (mat instanceof THREE.MeshPhysicalMaterial) {
      if (n === 'paint' || n === 'body_color' || n === 'body') {
        mat.clearcoat = enabled ? 0.96 : 0.35;
        mat.clearcoatRoughness = enabled ? 0.08 : 0.25;
        mat.envMapIntensity = enabled ? 1.55 : 0.72;
      } else if (n === 'glass' || n.includes('glass')) {
        mat.envMapIntensity = enabled ? 2.0 : 0.9;
      }
    } else if (n === 'chrome' || n.includes('rim')) {
      mat.envMapIntensity = enabled ? 1.7 : 0.8;
    } else if (n.includes('glass')) {
      mat.envMapIntensity = enabled ? 1.7 : 0.75;
    } else {
      mat.envMapIntensity = enabled ? 0.92 : 0.55;
    }
    mat.needsUpdate = true;
  }
}

export function mapVehicleTypeToGlbKey(type: string): CarGlbKey | null {
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

function getCachedPaintMat(templateKey: string, src: THREE.Material, paintHex: number): THREE.Material {
  if (!(src instanceof THREE.MeshStandardMaterial)) return src;
  const n = (src.name || '').toLowerCase();
  const isPaint = n === 'paint' || n === 'body_color' || n === 'body' || n === 'main';
  if (!isPaint) return src; // SHARE non-paint materials — zero per-car material cloning leak!

  const cacheKey = `${templateKey}|${src.uuid}|${paintHex.toString(16)}`;
  const existing = sharedPaintMats.get(cacheKey);
  if (existing) return existing;

  const cloned = src.clone() as THREE.MeshStandardMaterial;
  cloned.color.setHex(paintHex);
  trackedGlbMats.add(cloned);
  microtextures.registerVehiclePaint(cloned);
  sharedPaintMats.set(cacheKey, cloned);
  return cloned;
}

export function desiredCarGlbSource(
  type: string,
  hdGlbMode = glbWorldMode,
  allowHeroSite = true,
): string | null {
  if (hdGlbMode && allowHeroSite && type === 'sports' && siteCarTemplates.has('ferrari')) return 'site_ferrari';
  if (hdGlbMode && type === 'van' && siteCarTemplates.has('milktruck')) return 'site_milktruck';
  const key = mapVehicleTypeToGlbKey(type);
  if (key && carTemplates.has(key)) return `local_${key}`;
  return null;
}

export function desiredAircraftGlbSource(type: string, hdGlbMode = glbWorldMode): string | null {
  if (!hdGlbMode) return null;
  const key: AircraftGlbKey = type === 'jet' ? 'jet' : 'prop';
  return aircraftTemplates.has(key) ? `air_${key}` : null;
}

export function isCarWheelGlbLoaded(): boolean {
  return Boolean(wheelTemplate);
}

/** Clones a loaded binary .glb vehicle body using shared cached paint materials (zero GPU memory leak). */
export function cloneCarGlb(
  vehicleType: string,
  paintHex: number,
  hdGlbMode = glbWorldMode,
  allowHeroSite = true,
): { group: THREE.Group; integratedWheels: boolean; sourceTag: string } | null {
  const key = mapVehicleTypeToGlbKey(vehicleType);
  let tpl: THREE.Group | undefined;
  let sourceTag = '';
  let integratedWheels = false;
  let isSiteMilkTruck = false;

  if (hdGlbMode && allowHeroSite && vehicleType === 'sports' && siteCarTemplates.has('ferrari')) {
    tpl = siteCarTemplates.get('ferrari');
    sourceTag = 'site_ferrari';
    integratedWheels = true;
  } else if (hdGlbMode && vehicleType === 'van' && siteCarTemplates.has('milktruck')) {
    tpl = siteCarTemplates.get('milktruck');
    sourceTag = 'site_milktruck';
    integratedWheels = true;
    isSiteMilkTruck = true;
  } else if (key && carTemplates.has(key)) {
    tpl = carTemplates.get(key);
    sourceTag = `local_${key}`;
    integratedWheels = false;
  }
  if (!tpl) return null;

  const clone = tpl.clone(true);
  clone.userData.isSiteMilkTruck = isSiteMilkTruck;
  clone.userData.templateKey = sourceTag;

  if (!isSiteMilkTruck) {
    clone.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => getCachedPaintMat(sourceTag, m, paintHex));
      } else if (mesh.material) {
        mesh.material = getCachedPaintMat(sourceTag, mesh.material, paintHex);
      }
    });
  }
  return { group: clone, integratedWheels, sourceTag };
}

export function repaintGlbRoot(shell: THREE.Object3D, paintHex: number): void {
  if (shell.userData?.isSiteMilkTruck) return;
  const templateKey = String(shell.userData?.templateKey ?? 'car');
  shell.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const swap = (m: THREE.Material) => {
      if (!(m instanceof THREE.MeshStandardMaterial)) return m;
      const n = (m.name || '').toLowerCase();
      if (n === 'paint' || n === 'body_color' || n === 'body' || n === 'main') {
        return getCachedPaintMat(templateKey, m, paintHex);
      }
      return m;
    };
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(swap);
    else if (mesh.material) mesh.material = swap(mesh.material);
  });
}

export function cloneCarWheelGlb(targetRadius: number, targetWidth = 0.24): THREE.Group | null {
  if (!wheelTemplate) return null;
  const clone = wheelTemplate.clone(true);
  const sR = targetRadius / 0.34;
  const sW = targetWidth / 0.24;
  clone.scale.set(sW, sR, sR);
  return clone;
}

export function cloneAircraftGlb(vehicleType: string, paintHex = 0xe8edf2): THREE.Group | null {
  const key: AircraftGlbKey = vehicleType === 'jet' ? 'jet' : 'prop';
  const tpl = aircraftTemplates.get(key);
  if (!tpl) return null;
  const clone = tpl.clone(true);
  clone.userData.glbSource = `air_${key}`;
  clone.userData.templateKey = `air_${key}`;
  clone.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => getCachedPaintMat(`air_${key}`, m, paintHex));
    } else if (mesh.material) {
      mesh.material = getCachedPaintMat(`air_${key}`, mesh.material, paintHex);
    }
  });
  return clone;
}

export function clonePropGlb(key: PropGlbKey): THREE.Group | null {
  const tpl = propTemplates.get(key);
  if (!tpl) return null;
  return tpl.clone(true);
}

export function cloneWeaponGlb(weaponKind: string): THREE.Object3D | null {
  if (weaponTemplates.size === 0) return null;
  const mapKey =
    weaponKind === 'pistol' || weaponKind === 'silenced' || weaponKind === 'revolver'
      ? 'weapon_pistol'
      : weaponKind === 'smg'
        ? 'weapon_smg'
        : weaponKind === 'rpg'
          ? 'weapon_rpg'
          : 'weapon_rifle';
  const tpl = weaponTemplates.get(mapKey);
  return tpl ? tpl.clone(true) : null;
}

export function cloneWeaponPickupGlb(): THREE.Group | null {
  const obj = cloneWeaponGlb('rifle');
  if (!obj) return null;
  const g = new THREE.Group();
  g.add(obj);
  return g;
}

/** Clones an animated Site Character (Soldier/CesiumMan) with strict active cap to prevent GPU OOM. */
export function cloneSiteCharacterGlb(kind: SiteCharGlbKey): SiteCharacterInstance | null {
  if (!glbWorldMode) return null;
  if (activeSiteCharacters >= MAX_SITE_CHARACTERS) return null;
  const tpl = siteCharTemplates.get(kind);
  if (!tpl) return null;

  try {
    const clonedScene = SkeletonUtils.clone(tpl.scene) as THREE.Group;
    const root = new THREE.Group();
    clonedScene.scale.setScalar(tpl.scale);
    if (kind === 'soldier') clonedScene.rotation.y = Math.PI;
    root.add(clonedScene);

    const mixer = new THREE.AnimationMixer(clonedScene);
    const actions: SiteCharacterInstance['actions'] = {};
    for (const clip of tpl.animations) {
      const n = clip.name.toLowerCase();
      if (n.includes('idle')) actions.idle = mixer.clipAction(clip);
      else if (n.includes('walk')) actions.walk = mixer.clipAction(clip);
      else if (n.includes('run')) actions.run = mixer.clipAction(clip);
      else if (!actions.walk) actions.walk = mixer.clipAction(clip);
    }
    if (!actions.idle && actions.walk) actions.idle = actions.walk;
    if (!actions.run && actions.walk) actions.run = actions.walk;

    if (actions.idle) {
      actions.idle.play();
      if (kind === 'cesium') actions.idle.timeScale = 0.08;
    }

    activeSiteCharacters++;
    return { root, mixer, actions, activeClip: 'idle', kind, disposed: false };
  } catch (err) {
    console.warn('[GLB] SiteCharacter clone failed, falling back to anatomical human_base.glb:', err);
    return null;
  }
}

export function disposeSiteCharacterGlb(inst: SiteCharacterInstance | null | undefined): void {
  if (!inst || inst.disposed) return;
  inst.disposed = true;
  try {
    inst.mixer.stopAllAction();
    inst.mixer.uncacheRoot(inst.mixer.getRoot());
  } catch { /* ignore */ }
  activeSiteCharacters = Math.max(0, activeSiteCharacters - 1);
}

export function updateSiteCharacterGlb(
  inst: SiteCharacterInstance,
  dt: number,
  speed: number,
  crouch = false,
): void {
  if (inst.disposed) return;
  const target: 'idle' | 'walk' | 'run' = speed > 4.2 ? 'run' : speed > 0.35 ? 'walk' : 'idle';
  if (inst.kind === 'cesium') {
    const a = inst.actions.walk ?? inst.actions.idle;
    if (a) {
      if (!a.isRunning()) a.play();
      a.timeScale = speed < 0.25 ? 0.06 : THREE.MathUtils.clamp(speed * 0.42, 0.45, 2.2);
    }
  } else if (target !== inst.activeClip) {
    const prev = inst.actions[inst.activeClip];
    const next = inst.actions[target] ?? inst.actions.idle;
    if (next && next !== prev) {
      next.reset().fadeIn(0.2).play();
      prev?.fadeOut(0.2);
      inst.activeClip = target;
    }
  }
  inst.root.scale.y = crouch ? 0.78 : 1.0;
  inst.mixer.update(Math.min(dt, 0.05));
}

export function cloneBuildingGlb(key: BuildingGlbKey, tintHex?: number): THREE.Group | null {
  const tpl = buildingTemplates.get(key);
  if (!tpl) return null;
  const clone = tpl.clone(true);
  if (tintHex !== undefined) {
    clone.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const applyTint = (mat: THREE.Material) => {
        if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
        const n = (mat.name || '').toLowerCase();
        if (!n.includes('stucco') && !n.includes('wall') && !n.includes('brick')) return mat;
        const ck = `${key}|${mat.uuid}|${tintHex.toString(16)}`;
        let cached = sharedTintedBuildingMats.get(ck);
        if (!cached) {
          cached = mat.clone();
          cached.color.lerp(new THREE.Color(tintHex), 0.42);
          trackedGlbMats.add(cached);
          sharedTintedBuildingMats.set(ck, cached);
        }
        return cached;
      };
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(applyTint);
      else if (mesh.material) mesh.material = applyTint(mesh.material);
    });
  }
  return clone;
}

const sharedHumanPartMats = new Map<string, THREE.MeshStandardMaterial>();
function getSharedHumanMat(colorHex: number, roughness: number): THREE.MeshStandardMaterial {
  const k = `${colorHex.toString(16)}_${Math.round(roughness * 100)}`;
  let m = sharedHumanPartMats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness,
      metalness: 0.06,
      envMapIntensity: rtxEnabledState ? 0.92 : 0.55,
    });
    trackedGlbMats.add(m);
    sharedHumanPartMats.set(k, m);
  }
  return m;
}

export function cloneHumanGlbPart(
  part: keyof HumanGlbParts,
  colorHex: number,
  roughness = 0.72,
): THREE.Mesh | null {
  if (!humanParts || !humanParts[part]) return null;
  const src = humanParts[part] as THREE.Mesh;
  const mesh = new THREE.Mesh(src.geometry, getSharedHumanMat(colorHex, roughness));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function hasHumanGlb(): boolean {
  return Boolean(humanParts && humanParts.torso && humanParts.head);
}

export function hasCarGlb(key: CarGlbKey): boolean {
  return carTemplates.has(key);
}

export function cloneLandmarkPropGlb(key: 'palm' | 'lamp'): THREE.Group | null {
  return clonePropGlb(key);
}

/** Curated showcase .GLB hero buildings placed on clean open waterfront/suburban/rural plaza lots (zero overlap with existing procedural buildings!). */
export interface GlbLandmarkPlacement {
  key: BuildingGlbKey;
  x: number;
  z: number;
  yaw: number;
  halfW: number;
  halfD: number;
  height: number;
  label: string;
  tint?: number;
  scale?: number;
}

export const GLB_CITY_LANDMARKS: GlbLandmarkPlacement[] = [
  // Clean open waterfront & plaza parcels outside procedural block footprints (zero clipping/floating!)
  { key: 'artdeco', x: -348, z: 545, yaw: 0, halfW: 9.2, halfD: 7.2, height: 18, label: 'Ocean View Art Deco Hotel', tint: 0xffd2dc },
  { key: 'artdeco', x: 248, z: 545, yaw: 0, halfW: 9.2, halfD: 7.2, height: 18, label: 'Sunset Palms Boutique', tint: 0xc2f5ea },
  { key: 'tower', x: 556, z: -228, yaw: -Math.PI / 2, halfW: 11.2, halfD: 11.2, height: 42, label: 'Nova Bay Tower', tint: 0xc8e4ff },
  { key: 'tower', x: 556, z: 114, yaw: -Math.PI / 2, halfW: 11.2, halfD: 11.2, height: 42, label: 'Leonida Spire', tint: 0xd8e8ff },
  { key: 'havana', x: -556, z: 228, yaw: Math.PI / 2, halfW: 8.6, halfD: 7.0, height: 14, label: 'Calle Nova Cultural House', tint: 0xffe0b2 },
  { key: 'wynwood', x: -556, z: -114, yaw: Math.PI / 2, halfW: 10.2, halfD: 7.8, height: 15, label: 'Wynwood Mural Pavilion', tint: 0xe6e0f8 },
];
