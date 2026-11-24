// Procedural vehicle & aircraft models: extruded side-profiles, composite aircraft, clearcoat PBR, wheels, lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cyl, finish, sph } from './geo';
import type { AircraftSpec } from './physics';
import { makeGlow } from './textures';
import { cloneCarGlb } from './glbAssets';

export type VehicleType =
  | 'sedan' | 'sports' | 'suv' | 'pickup' | 'taxi' | 'police' | 'van'
  | 'prop_plane' | 'jet' | 'seaplane';

export interface VehicleSpec {
  name: string;
  L: number;
  W: number;
  wheelR: number;
  wheelBase: number;
  maxSpeed: number;
  accel: number;
  grip: number;
  mass: number;
  hp: number;
  steer: number;
  seat: [number, number, number];
  radius: number;
  isAircraft?: boolean;
  flight?: AircraftSpec;
}

export const SPECS: Record<VehicleType, VehicleSpec> = {
  sedan: { name: 'Orion LX', L: 4.7, W: 1.85, wheelR: 0.34, wheelBase: 2.8, maxSpeed: 42, accel: 11.5, grip: 7, mass: 1400, hp: 100, steer: 0.56, seat: [0.42, 0.7, 0.2], radius: 0.95 },
  sports: { name: 'Vortex GT', L: 4.5, W: 1.92, wheelR: 0.35, wheelBase: 2.7, maxSpeed: 64, accel: 18, grip: 9, mass: 1300, hp: 90, steer: 0.55, seat: [0.42, 0.6, 0.15], radius: 0.97 },
  suv: { name: 'Titan SUV', L: 4.8, W: 1.96, wheelR: 0.4, wheelBase: 2.9, maxSpeed: 39, accel: 10, grip: 6.5, mass: 2100, hp: 150, steer: 0.5, seat: [0.45, 0.98, 0.2], radius: 1.0 },
  pickup: { name: 'Bison Pickup', L: 5.4, W: 2.0, wheelR: 0.41, wheelBase: 3.3, maxSpeed: 37, accel: 9.5, grip: 6, mass: 2200, hp: 150, steer: 0.5, seat: [0.46, 0.98, 0.5], radius: 1.02 },
  taxi: { name: 'Metro Cab', L: 4.7, W: 1.85, wheelR: 0.34, wheelBase: 2.8, maxSpeed: 39, accel: 11, grip: 7, mass: 1450, hp: 110, steer: 0.56, seat: [0.42, 0.7, 0.2], radius: 0.95 },
  police: { name: 'Patrol Cruiser', L: 4.8, W: 1.9, wheelR: 0.35, wheelBase: 2.85, maxSpeed: 50, accel: 14.5, grip: 8, mass: 1700, hp: 140, steer: 0.55, seat: [0.42, 0.7, 0.2], radius: 0.96 },
  van: { name: 'Hauler Van', L: 5.2, W: 2.0, wheelR: 0.38, wheelBase: 3.2, maxSpeed: 33, accel: 8, grip: 5.5, mass: 2800, hp: 170, steer: 0.5, seat: [0.46, 1.2, 1.5], radius: 1.02 },
  prop_plane: {
    name: 'Dodo Classic', L: 8.6, W: 11.4, wheelR: 0.36, wheelBase: 3.4, maxSpeed: 76, accel: 22, grip: 5, mass: 1650, hp: 140, steer: 0.45, seat: [0, 1.25, 0.4], radius: 2.4,
    isAircraft: true,
    flight: {
      maxThrust: 26, maxSpeed: 76, takeoffSpeed: 22, stallSpeed: 15, liftCoeff: 1.05, dragCoeff: 0.0042,
      pitchRate: 1.35, rollRate: 1.9, yawRate: 0.85, ceilingY: 360, gearHeight: 0.0,
    },
  },
  jet: {
    name: 'Viper Strike Jet', L: 11.8, W: 9.8, wheelR: 0.34, wheelBase: 4.6, maxSpeed: 138, accel: 46, grip: 6, mass: 4800, hp: 220, steer: 0.42, seat: [0, 1.35, 1.6], radius: 2.6,
    isAircraft: true,
    flight: {
      maxThrust: 54, maxSpeed: 138, takeoffSpeed: 30, stallSpeed: 20, liftCoeff: 1.08, dragCoeff: 0.0026,
      pitchRate: 1.85, rollRate: 2.75, yawRate: 1.05, ceilingY: 460, gearHeight: 0.0,
    },
  },
  seaplane: {
    name: 'Keys Seaplane', L: 9.0, W: 11.8, wheelR: 0.35, wheelBase: 3.6, maxSpeed: 72, accel: 21, grip: 4.5, mass: 1850, hp: 150, steer: 0.45, seat: [0, 1.55, 0.35], radius: 2.5,
    isAircraft: true,
    flight: {
      maxThrust: 25, maxSpeed: 72, takeoffSpeed: 21, stallSpeed: 14, liftCoeff: 1.08, dragCoeff: 0.0044,
      pitchRate: 1.3, rollRate: 1.75, yawRate: 0.9, ceilingY: 340, gearHeight: 0.0,
    },
  },
};

interface Prof { lower: number[][]; lr: number[]; cabin: number[][]; cr: number[]; cw: number; roof: [number, number, number]; }
const PROF: Record<string, Prof> = {
  sedan: {
    lower: [[0, 0.38], [0, 0.82], [0.35, 0.99], [3.5, 0.99], [4.45, 0.88], [4.7, 0.72], [4.7, 0.38]], lr: [0.1, 0.2, 0.25, 0.5, 0.3, 0.15, 0.1],
    cabin: [[1.05, 0.96], [1.6, 1.46], [2.95, 1.46], [3.65, 0.96]], cr: [0.03, 0.35, 0.35, 0.03], cw: 0.9, roof: [1.6, 2.95, 1.46],
  },
  sports: {
    lower: [[0, 0.36], [0, 0.7], [0.4, 0.92], [3.0, 0.92], [4.1, 0.78], [4.5, 0.58], [4.5, 0.36]], lr: [0.1, 0.25, 0.3, 0.6, 0.4, 0.2, 0.1],
    cabin: [[1.1, 0.9], [1.85, 1.27], [2.85, 1.27], [3.45, 0.9]], cr: [0.03, 0.3, 0.3, 0.03], cw: 0.88, roof: [1.85, 2.85, 1.27],
  },
  suv: {
    lower: [[0, 0.45], [0, 1.05], [0.2, 1.12], [3.7, 1.1], [4.6, 0.98], [4.8, 0.8], [4.8, 0.45]], lr: [0.1, 0.15, 0.2, 0.4, 0.3, 0.2, 0.1],
    cabin: [[0.3, 1.1], [0.45, 1.8], [3.0, 1.8], [3.85, 1.1]], cr: [0.05, 0.2, 0.35, 0.05], cw: 0.92, roof: [0.45, 3.0, 1.8],
  },
  pickup: {
    lower: [[0, 0.45], [0, 1.08], [2.4, 1.08], [3.9, 1.08], [5.2, 0.98], [5.4, 0.8], [5.4, 0.45]], lr: [0.1, 0.1, 0.05, 0.1, 0.3, 0.2, 0.1],
    cabin: [[2.45, 1.06], [2.6, 1.8], [3.35, 1.8], [3.98, 1.06]], cr: [0.03, 0.2, 0.2, 0.03], cw: 0.92, roof: [2.6, 3.35, 1.8],
  },
  van: {
    lower: [[0, 0.42], [0, 2.15], [3.9, 2.15], [4.9, 1.45], [5.2, 1.0], [5.2, 0.42]], lr: [0.1, 0.25, 0.45, 0.3, 0.15, 0.1],
    cabin: [[3.75, 1.5], [3.9, 2.05], [4.55, 1.68], [4.85, 1.5]], cr: [0.03, 0.1, 0.1, 0.03], cw: 1.02, roof: [0, 0, 0],
  },
};
const PMAP: Record<string, string> = { sedan: 'sedan', sports: 'sports', suv: 'suv', pickup: 'pickup', taxi: 'sedan', police: 'sedan', van: 'van' };

function roundedShape(pts: number[][], rad: number[], dx: number): THREE.Shape {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const r = Math.min(rad[i] ?? 0.1, la / 2.2, lb / 2.2);
    const pa = [p[0] + ((a[0] - p[0]) / la) * r, p[1] + ((a[1] - p[1]) / la) * r];
    const pb = [p[0] + ((b[0] - p[0]) / lb) * r, p[1] + ((b[1] - p[1]) / lb) * r];
    if (i === 0) s.moveTo(pa[0] + dx, pa[1]);
    else s.lineTo(pa[0] + dx, pa[1]);
    s.quadraticCurveTo(p[0] + dx, p[1], pb[0] + dx, pb[1]);
  }
  s.closePath();
  return s;
}
function extruded(pts: number[][], rad: number[], L: number, width: number, bevel = 0.09): THREE.BufferGeometry {
  const shape = roundedShape(pts, rad, -L / 2);
  const depth = Math.max(0.05, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 5 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

// shared PBR / Simulated-RTX materials -------------------------------------------------------
let vehicleRtxOn = true;
const paintCache = new Map<number, THREE.MeshPhysicalMaterial>();
export function paintMat(color: number) {
  let m = paintCache.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color,
      vertexColors: true,
      metalness: vehicleRtxOn ? 0.66 : 0.36,
      roughness: vehicleRtxOn ? 0.15 : 0.32,
      clearcoat: vehicleRtxOn ? 1.0 : 0.0,
      clearcoatRoughness: 0.04,
      reflectivity: 0.98,
      envMapIntensity: vehicleRtxOn ? 2.15 : 0.85,
    });
    paintCache.set(color, m);
  }
  return m;
}
export const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x0b1620,
  metalness: 0.94,
  roughness: 0.04,
  clearcoat: 1.0,
  clearcoatRoughness: 0.03,
  envMapIntensity: 2.35,
});
export const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.38, roughness: 0.46 });
export const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.55 });
export const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff0c0, emissiveIntensity: 0.15, roughness: 0.2 });
export const tailDim = new THREE.MeshStandardMaterial({ color: 0x7a0a0a, emissive: 0xff1010, emissiveIntensity: 0.15, roughness: 0.3 });
export const tailBright = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2.5, roughness: 0.3 });
export const sirenRed = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0000, emissiveIntensity: 0.1 });
export const sirenBlue = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x1030ff, emissiveIntensity: 0.1 });
export const taxiSignMat = new THREE.MeshStandardMaterial({ color: 0xfff3c0, emissive: 0xffe9a0, emissiveIntensity: 0.6 });
export const wreckMat = new THREE.MeshStandardMaterial({ color: 0x151515, vertexColors: true, metalness: 0.3, roughness: 0.9 });
export const afterburnerMat = new THREE.MeshBasicMaterial({
  color: 0xff9a30,
  transparent: true,
  opacity: 0.0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

export function setVehicleRtx(enabled: boolean) {
  vehicleRtxOn = enabled;
  for (const m of paintCache.values()) {
    m.metalness = enabled ? 0.66 : 0.36;
    m.clearcoat = enabled ? 1.0 : 0.0;
    m.clearcoatRoughness = enabled ? 0.04 : 0.28;
    m.envMapIntensity = enabled ? 2.15 : 0.85;
    m.roughness = enabled ? 0.15 : 0.32;
    m.needsUpdate = true;
  }
  glassMat.clearcoat = enabled ? 1.0 : 0.0;
  glassMat.roughness = enabled ? 0.04 : 0.18;
  glassMat.envMapIntensity = enabled ? 2.35 : 0.9;
  glassMat.needsUpdate = true;
}

let glowTex: THREE.Texture | null = null;
const beamMat = () => {
  if (!glowTex) glowTex = makeGlow();
  return new THREE.MeshBasicMaterial({ map: glowTex, color: 0xfff1c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
};
export const beamMaterial = beamMat();

export const PAINTS = [0xc0392b, 0x2c3e8f, 0xe8e8e8, 0x15171a, 0x7f8c8d, 0x27ae60, 0xf39c12, 0x8e44ad, 0x5b6b7a, 0xb03a2e, 0x0e6e8c, 0xd7ccc8];

const wheelGeoCache = new Map<number, THREE.BufferGeometry>();
function wheelGeo(R: number) {
  const k = Math.round(R * 100);
  let g = wheelGeoCache.get(k);
  if (!g) {
    const tire = new THREE.CylinderGeometry(R, R, 0.26, 20).rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(R * 0.64, R * 0.64, 0.275, 14).rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(R * 0.18, R * 0.18, 0.3, 8).rotateZ(Math.PI / 2);
    const parts = [finish(tire, 0x121212), finish(rim, 0xb9bdc4), finish(hub, 0x555555)];
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.BoxGeometry(0.29, R * 0.1, R * 1.15);
      sp.rotateX((i / 5) * Math.PI);
      parts.push(finish(sp, 0x70747a));
    }
    g = mergeGeometries(parts, false)!;
    wheelGeoCache.set(k, g);
  }
  return g;
}

export interface VehicleModel {
  group: THREE.Group;
  body: THREE.Mesh;
  glass: THREE.Mesh;
  wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[];
  tail: THREE.Mesh;
  beam: THREE.Mesh;
  bar: THREE.Mesh[] | null;
  driver: THREE.Mesh | null;
  parts: THREE.Mesh[];
  dented: boolean;
  paint: number;
  tiltGroup: THREE.Group;
  propeller?: THREE.Group;
  afterburner?: THREE.Mesh;
  glbShell?: THREE.Group | null;
  vehicleType?: VehicleType;
}

function buildAircraft(type: 'prop_plane' | 'jet' | 'seaplane', paint: number): VehicleModel {
  const sp = SPECS[type];
  const g = new THREE.Group();
  const tilt = new THREE.Group();
  g.add(tilt);
  const body: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const glassGeo: THREE.BufferGeometry[] = [];
  const white = 0xffffff;
  const dark = 0x1c2026;
  const metal = 0x9aa4b2;
  const isJet = type === 'jet';
  const isSea = type === 'seaplane';
  const paintColor = isJet ? 0x3b4450 : isSea ? 0xf5f2e8 : paint;
  const stripeCol = isJet ? 0xd93829 : isSea ? 0x00b4d8 : 0xe63946;

  const cylZ = (r1: number, r2: number, h: number, x: number, y: number, z: number, col: number, seg = 14) =>
    cyl(r1, r2, h, 0, 0, 0, col, seg).rotateX(Math.PI / 2).translate(x, y, z);

  let propeller: THREE.Group | undefined;
  let afterburner: THREE.Mesh | undefined;

  if (isJet) {
    // Sleek supersonic strike jet fuselage, nose cone, swept delta wings, twin angled fins
    const fy = 1.45;
    body.push(cylZ(0.55, 0.72, 4.4, 0, fy, 1.2, white, 14));
    body.push(cylZ(0.72, 0.56, 4.4, 0, fy, -3.2, white, 14));
    body.push(cylZ(0.06, 0.55, 2.4, 0, fy - 0.04, 4.6, 0x2a303a, 14)); // radar nose cone
    // Twin side air intakes
    for (const s of [-1, 1]) {
      body.push(box(0.52, 0.58, 3.6, s * 0.72, fy - 0.05, -0.3, white));
      trim.push(box(0.46, 0.48, 0.25, s * 0.72, fy - 0.05, 1.52, 0x101318));
      // Swept main wings
      body.push(box(4.4, 0.14, 2.3, s * 2.55, fy - 0.12, -1.35, white, s * 0.26));
      trim.push(box(0.28, 0.1, 1.55, s * 4.7, fy - 0.12, -1.9, stripeCol)); // wingtip rails
      // Horizontal tailplanes
      body.push(box(1.9, 0.1, 1.25, s * 1.45, fy - 0.06, -4.6, white, s * 0.22));
      // Twin canted vertical stabilizers
      body.push(box(0.12, 1.65, 1.6, s * 0.92, fy + 0.85, -4.3, white, 0, 0, -s * 0.22));
      trim.push(box(0.14, 0.28, 1.2, s * 1.05, fy + 1.42, -4.35, stripeCol, 0, 0, -s * 0.22));
      // Twin exhaust nozzles
      trim.push(cylZ(0.32, 0.26, 0.7, s * 0.36, fy - 0.04, -5.6, dark, 12));
    }
    // Bubble cockpit canopy
    glassGeo.push(sph(1, 0, fy + 0.54, 1.85, white, 0.46, 0.44, 1.65, 14));
    trim.push(box(0.95, 0.14, 2.9, 0, fy + 0.28, 1.85, dark));
    // Tricycle landing gear struts
    trim.push(cyl(0.06, 0.06, 1.1, 0, 0.68, 3.1, metal, 8));
    for (const s of [-1, 1]) trim.push(cyl(0.07, 0.07, 1.1, s * 1.55, 0.68, -1.3, metal, 8));

    // Afterburner glow cone
    const abGeo = new THREE.ConeGeometry(0.45, 2.8, 12).rotateX(-Math.PI / 2);
    afterburner = new THREE.Mesh(abGeo, afterburnerMat.clone());
    afterburner.position.set(0, fy - 0.04, -7.2);
    tilt.add(afterburner);
  } else {
    // Classic high-wing prop plane or tropical twin-pontoon seaplane
    const fy = isSea ? 1.85 : 1.38;
    // Fuselage cabin + tapered tail boom + engine cowling
    body.push(box(1.42, 1.28, 3.2, 0, fy, 0.35, white));
    body.push(cylZ(0.62, 0.26, 4.1, 0, fy + 0.08, -3.25, white, 12));
    body.push(cylZ(0.48, 0.68, 1.6, 0, fy - 0.02, 2.7, white, 12));
    trim.push(box(1.46, 0.18, 6.4, 0, fy - 0.15, -0.8, stripeCol));
    trim.push(box(0.85, 0.35, 0.12, 0, fy - 0.18, 3.52, 0x12151a)); // intake grille
    // High monoplane wings + struts + wingtip strobes
    body.push(box(sp.W, 0.18, 1.85, 0, fy + 0.72, 0.4, white));
    trim.push(box(sp.W + 0.15, 0.12, 0.35, 0, fy + 0.72, -0.45, stripeCol)); // flaps/ailerons
    for (const s of [-1, 1]) {
      trim.push(box(0.08, 1.55, 0.1, s * 1.6, fy + 0.04, 0.4, metal, 0, 0, -s * 0.65)); // wing strut
    }
    // Tail fin & horizontal stabilizer
    body.push(box(3.8, 0.12, 1.0, 0, fy + 0.18, -4.9, white));
    body.push(box(0.14, 1.75, 1.25, 0, fy + 0.98, -4.75, white));
    trim.push(box(0.16, 0.45, 0.9, 0, fy + 1.55, -4.8, stripeCol));
    // Panoramic wrap-around cockpit glass
    glassGeo.push(box(1.36, 0.56, 1.95, 0, fy + 0.34, 0.9, white));
    glassGeo.push(box(1.26, 0.52, 0.6, 0, fy + 0.32, 1.85, white, 0, -0.42));

    if (isSea) {
      // Twin pontoon floats + crossbars
      for (const s of [-1, 1]) {
        body.push(box(0.62, 0.52, 5.4, s * 1.45, 0.34, 0.4, 0xf2f4f7));
        trim.push(box(0.66, 0.14, 5.45, s * 1.45, 0.12, 0.4, stripeCol));
        trim.push(box(0.08, 1.15, 0.1, s * 1.05, 0.98, 1.15, metal, 0, 0, s * 0.28));
        trim.push(box(0.08, 1.15, 0.1, s * 1.05, 0.98, -0.65, metal, 0, 0, s * 0.28));
      }
      trim.push(box(2.9, 0.08, 0.12, 0, 0.66, 1.1, metal));
      trim.push(box(2.9, 0.08, 0.12, 0, 0.66, -0.6, metal));
    } else {
      // 3-point tricycle gear
      trim.push(cyl(0.055, 0.055, 1.0, 0, 0.68, 2.6, metal, 8));
      for (const s of [-1, 1]) {
        trim.push(box(0.08, 0.92, 0.14, s * 1.12, 0.72, -0.2, metal, 0, 0, s * 0.32));
      }
    }

    // Rotating nose propeller group
    propeller = new THREE.Group();
    propeller.position.set(0, fy - 0.02, 3.62);
    const propGeo = mergeGeometries([
      cylZ(0.06, 0.2, 0.36, 0, 0, 0.12, stripeCol, 10),
      box(2.25, 0.18, 0.04, 0, 0, 0.06, dark),
      box(0.18, 2.25, 0.04, 0, 0, 0.06, dark),
    ], false)!;
    const propMesh = new THREE.Mesh(propGeo, trimMat);
    propeller.add(propMesh);
    tilt.add(propeller);
  }

  const bodyMesh = new THREE.Mesh(mergeGeometries(body, false)!, paintMat(paintColor));
  bodyMesh.castShadow = true;
  tilt.add(bodyMesh);
  const glass = new THREE.Mesh(mergeGeometries(glassGeo.map((x) => (x.attributes.color ? x : finish(x, white))), false)!, glassMat);
  tilt.add(glass);
  const trimMesh = new THREE.Mesh(mergeGeometries(trim, false)!, trimMat);
  trimMesh.castShadow = true;
  tilt.add(trimMesh);

  // Navigation strobes (wingtip red/green + landing light)
  const headMesh = new THREE.Mesh(box(0.28, 0.14, 0.1, 0, 1.15, sp.L * 0.42, white), headMat);
  const tail = new THREE.Mesh(box(0.24, 0.18, 0.1, 0, 2.2, -sp.L * 0.46, white), tailDim);
  tilt.add(headMesh, tail);

  // Landing wheels (hidden on seaplane floats)
  const wheels: VehicleModel['wheels'] = [];
  if (!isSea) {
    const wg = wheelGeo(sp.wheelR);
    const gearCoords: [number, number, boolean][] = isJet
      ? [[0, 3.1, true], [1.55, -1.3, false], [-1.55, -1.3, false]]
      : [[0, 2.6, true], [1.45, -0.2, false], [-1.45, -0.2, false]];
    for (const [wx, wz, fr] of gearCoords) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, sp.wheelR, wz);
      const spin = new THREE.Group();
      const m = new THREE.Mesh(wg, wheelMat);
      m.castShadow = true;
      spin.add(m);
      pivot.add(spin);
      g.add(pivot);
      wheels.push({ pivot, spin, front: fr });
    }
  }

  const beam = new THREE.Mesh(new THREE.PlaneGeometry(10, 22), beamMaterial);
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0.08, sp.L / 2 + 9);
  beam.visible = false;
  g.add(beam);

  return {
    group: g, body: bodyMesh, glass, wheels, tail, beam, bar: null, driver: null,
    parts: [bodyMesh, trimMesh, glass], dented: false, paint: paintColor, tiltGroup: tilt,
    propeller, afterburner,
  };
}

export function buildVehicle(type: VehicleType, paint: number): VehicleModel {
  if (type === 'prop_plane' || type === 'jet' || type === 'seaplane') {
    return buildAircraft(type, paint);
  }
  const sp = SPECS[type];
  const pf = PROF[PMAP[type]];
  const { L, W } = sp;
  const g = new THREE.Group();
  const tilt = new THREE.Group();
  g.add(tilt);
  const zs = (z: number) => z - L / 2; // from rear-based to centred
  const body: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const white = 0xffffff;
  let paintColor = paint;
  if (type === 'taxi') paintColor = 0xf2b705;
  if (type === 'police') paintColor = 0x101114;
  const isVan = type === 'van';

  body.push(finish(extruded(pf.lower, pf.lr, L, W), white));
  const glassGeo: THREE.BufferGeometry[] = [];
  glassGeo.push(extruded(pf.cabin, pf.cr, L, W * pf.cw, 0.05));
  if (!isVan) {
    const [z0, z1, y] = pf.roof;
    body.push(box(W * pf.cw * 0.98, 0.07, z1 - z0 - 0.05, 0, y - 0.03, zs((z0 + z1) / 2), white));
    // B pillar
    const zp = type === 'pickup' ? 3.0 : type === 'suv' ? 1.85 : (z0 + z1) / 2 + 0.1;
    body.push(box(W * pf.cw + 0.02, y - 1.0, 0.08, 0, 1.0, zs(zp), white));
    if (type === 'sedan' || type === 'taxi' || type === 'police') body.push(box(W * pf.cw + 0.02, y - 1.0, 0.07, 0, 1.0, zs(z0 + 0.05), white, 0, -0.65));
  } else {
    // windscreen plate
    glassGeo.push(box(W * 0.88, 0.04, 1.25, 0, 1.82, zs(4.42), 0x000000, 0, 0.61));
    glassGeo[glassGeo.length - 1] = finish(glassGeo[glassGeo.length - 1], white);
  }
  if (type === 'sports') {
    body.push(box(W * 0.9, 0.05, 0.4, 0, 1.0, zs(0.18), white));
    body.push(box(0.06, 0.2, 0.3, W * 0.36, 0.84, zs(0.2), white));
    body.push(box(0.06, 0.2, 0.3, -W * 0.36, 0.84, zs(0.2), white));
  }
  if (type === 'pickup') {
    body.push(box(0.09, 0.4, 2.35, W / 2 - 0.1, 1.06, zs(1.2), white));
    body.push(box(0.09, 0.4, 2.35, -W / 2 + 0.1, 1.06, zs(1.2), white));
    body.push(box(W - 0.1, 0.4, 0.09, 0, 1.06, zs(0.05), white));
    body.push(box(W - 0.1, 0.55, 0.09, 0, 1.06, zs(2.38), white));
    trim.push(box(W - 0.3, 0.04, 2.2, 0, 1.0, zs(1.2), 0x1b1b1b));
  }
  // mirrors
  const mz = isVan ? 4.0 : pf.cabin[3][0] - 0.25;
  const my = isVan ? 1.7 : pf.cabin[3][1] + 0.12;
  body.push(box(0.1, 0.1, 0.16, W / 2 + 0.07, my, zs(mz), white));
  body.push(box(0.1, 0.1, 0.16, -W / 2 - 0.07, my, zs(mz), white));

  // trim: bumpers, grille, plates, arches, door seams
  const trimC = 0x131416;
  trim.push(box(W - 0.05, 0.2, 0.2, 0, 0.36, L / 2 - 0.05, trimC));
  trim.push(box(W - 0.05, 0.2, 0.2, 0, 0.36, -L / 2 + 0.05, trimC));
  trim.push(box(W * 0.55, 0.16, 0.05, 0, isVan ? 0.7 : 0.62, L / 2 + 0.03, 0x0a0a0a));
  trim.push(box(0.5, 0.12, 0.03, 0, 0.5, L / 2 + 0.1, 0xeeeeee));
  trim.push(box(0.5, 0.12, 0.03, 0, 0.62, -L / 2 - 0.02, 0xeeeeee));
  trim.push(box(W + 0.01, 0.06, L * 0.55, 0, 0.36, 0, 0x1a1a1c)); // side skirts
  const seamY = 0.5, seamH = isVan ? 1.3 : 0.5;
  const seamZ = type === 'pickup' ? [2.5, 3.2] : isVan ? [2.0, 4.0] : [1.2, 2.3, 3.5];
  for (const s of [-1, 1]) for (const z of seamZ) trim.push(box(0.012, seamH, 0.012, s * (W / 2 + 0.004), seamY + (isVan ? 0.4 : 0.38), zs(z), 0x101010));
  const hz = type === 'pickup' ? 2.7 : isVan ? 3.7 : 2.0;
  for (const s of [-1, 1]) {
    trim.push(box(0.025, 0.02, 0.13, s * (W / 2 + 0.01), isVan ? 1.35 : 0.96, zs(hz), 0xc8c8c8));
    for (const wz of [-sp.wheelBase / 2, sp.wheelBase / 2]) {
      const d = cyl(sp.wheelR * 1.22, sp.wheelR * 1.22, 0.02, 0, 0, 0, 0x070707, 14);
      d.rotateZ(Math.PI / 2);
      d.translate(s * (W / 2 + 0.005), sp.wheelR, wz + (type === 'pickup' ? 0.1 : 0));
      trim.push(d);
    }
  }
  if (type === 'police') {
    for (const s of [-1, 1]) {
      trim.push(box(0.02, 0.5, 2.0, s * (W / 2 + 0.014), 0.5, zs(2.35), 0xf4f4f4));
      trim.push(box(0.02, 0.28, 0.75, s * (W / 2 + 0.014), 0.52, zs(0.75), 0xf4f4f4));
    }
    trim.push(box(W * 0.8, 0.02, 1.3, 0, 0.995, zs(3.8), 0xf4f4f4));
  }
  if (type === 'taxi') {
    trim.push(box(0.02, 0.1, 1.8, W / 2 + 0.014, 0.65, zs(2.35), 0x111111));
    trim.push(box(0.02, 0.1, 1.8, -W / 2 - 0.014, 0.65, zs(2.35), 0x111111));
  }
  if (type === 'van') trim.push(box(W + 0.02, 0.05, 3.6, 0, 1.28, zs(1.8), 0xdddddd));

  const bodyMesh = new THREE.Mesh(mergeGeometries(body, false)!, paintMat(paintColor));
  bodyMesh.castShadow = true;
  tilt.add(bodyMesh);
  const glass = new THREE.Mesh(mergeGeometries(glassGeo.map((x) => (x.attributes.color ? x : finish(x, white))), false)!, glassMat);
  glass.castShadow = false;
  tilt.add(glass);
  const trimMesh = new THREE.Mesh(mergeGeometries(trim, false)!, trimMat);
  trimMesh.castShadow = true;
  tilt.add(trimMesh);

  // lights
  const hl: THREE.BufferGeometry[] = [], tl: THREE.BufferGeometry[] = [];
  const hy = isVan ? 0.95 : sp.seat[1] + 0.12 > 1 ? 0.95 : 0.8;
  for (const s of [-1, 1]) {
    hl.push(box(0.42, 0.13, 0.06, s * (W / 2 - 0.34), hy, L / 2 + 0.01, white));
    tl.push(box(0.44, 0.12, 0.06, s * (W / 2 - 0.3), hy + 0.05, -L / 2 - 0.01, white));
  }
  const headMesh = new THREE.Mesh(mergeGeometries(hl, false)!, headMat);
  const tail = new THREE.Mesh(mergeGeometries(tl, false)!, tailDim);
  tilt.add(headMesh);
  tilt.add(tail);

  // wheels
  const wheels: VehicleModel['wheels'] = [];
  const wg = wheelGeo(sp.wheelR);
  const wx = W / 2 - 0.1;
  const frontZ = sp.wheelBase / 2 + (type === 'pickup' ? 0.35 : type === 'van' ? 0.55 : 0.1);
  for (const [sx, wz, fr] of [[1, frontZ, true], [-1, frontZ, true], [1, frontZ - sp.wheelBase, false], [-1, frontZ - sp.wheelBase, false]] as [number, number, boolean][]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * wx, sp.wheelR, wz);
    const spin = new THREE.Group();
    const m = new THREE.Mesh(wg, wheelMat);
    m.castShadow = true;
    if (sx < 0) m.rotation.y = Math.PI;
    spin.add(m);
    pivot.add(spin);
    g.add(pivot);
    wheels.push({ pivot, spin, front: fr });
  }

  // headlight beam on the road
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(7, 15), beamMaterial);
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0.06, L / 2 + 6.5);
  beam.visible = false;
  g.add(beam);

  let bar: THREE.Mesh[] | null = null;
  if (type === 'police') {
    const y = pf.roof[2];
    const zc = zs((pf.roof[0] + pf.roof[1]) / 2);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.3), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    base.position.set(0, y + 0.05, zc);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.28), sirenRed);
    r.position.set(0.25, y + 0.14, zc);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.28), sirenBlue);
    b.position.set(-0.25, y + 0.14, zc);
    tilt.add(base, r, b);
    bar = [r, b];
  }
  if (type === 'taxi') {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.28), taxiSignMat);
    s.position.set(0, pf.roof[2] + 0.15, zs((pf.roof[0] + pf.roof[1]) / 2));
    tilt.add(s);
  }

  let driver: THREE.Mesh | null = null;
  const model: VehicleModel = {
    group: g, body: bodyMesh, glass, wheels, tail, beam, bar, driver,
    parts: [bodyMesh, trimMesh, glass], dented: false, paint: paintColor, tiltGroup: tilt,
    glbShell: null, vehicleType: type,
  };
  upgradeVehicleToGlb(model, type);
  return model;
}

/** Upgrades a vehicle's chassis in-place to the sculpted .glb model once loaded via GLTFLoader. */
export function upgradeVehicleToGlb(m: VehicleModel, type: VehicleType): boolean {
  if (m.glbShell) return true;
  const glb = cloneCarGlb(type, m.paint);
  if (!glb) return false;
  m.glbShell = glb;
  m.tiltGroup.add(glb);
  // Hide fallback procedural shell so the sculpted .glb body takes over cleanly (keep wheels, beams, sirens, taxi sign)
  for (const part of m.parts) part.visible = false;
  return true;
}

/** Push vertices of the body inward near a local impact point (fender dents). */
export function dentModel(m: VehicleModel, lx: number, lz: number, amount: number) {
  if (!m.dented) {
    m.body.geometry = m.body.geometry.clone();
    m.dented = true;
  }
  const pos = m.body.geometry.attributes.position as THREE.BufferAttribute;
  const R = 1.5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const dx = x - lx, dz = z - lz;
    const d = Math.hypot(dx, dz);
    if (d < R) {
      const f = (1 - d / R) * amount * (0.6 + 0.4 * Math.sin(i * 12.9898));
      // push towards the car centre axis
      const l = Math.hypot(x, z) || 1;
      pos.setX(i, x - (x / l) * f * 0.6 * (Math.abs(lx) > Math.abs(lz) ? 1 : 0.3));
      pos.setZ(i, z - (z / l) * f * 0.6 * (Math.abs(lz) >= Math.abs(lx) ? 1 : 0.3));
      pos.setY(i, pos.getY(i) - f * 0.12);
    }
  }
  pos.needsUpdate = true;
}
