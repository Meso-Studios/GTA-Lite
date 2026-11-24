// Visual effects: tracers, point flashes, particles, and 10x ultra-realistic gore/blood physics
// (pulsing arterial jets, ballistic directional splatter streaks, coagulating clearcoat pools, and tissue/bone gibs).
import * as THREE from 'three';
import { Particles } from './particles';
import { makeGlow } from './textures';
import {
  computeArterialJet,
  computeBloodBurst,
  computeBloodSplatterStreak,
  computeCoagulationColor,
  computePuddleRadius,
} from './physics';

interface Tracer { line: THREE.Line; life: number; max: number }
interface Flash { light: THREE.PointLight; life: number; max: number; peak: number }
interface Puddle {
  x: number;
  y: number;
  z: number;
  age: number;
  maxAge: number;
  maxRadius: number;
  rotY: number;
  squash: number;
  active: boolean;
}
interface Splatter {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  length: number;
  width: number;
  yaw: number;
  age: number;
  maxAge: number;
  active: boolean;
}
interface Gib {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  groundY: number;
  age: number;
  maxAge: number;
  bounces: number;
  isBone: boolean;
  trailT: number;
  active: boolean;
}
interface ArterialSpurt {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  groundY: number;
  pulsesLeft: number;
  pulseInterval: number;
  timer: number;
  dropletsPerPulse: number;
  jetSpeed: number;
  arcUp: number;
}

const MAX_PUDDLES = 220;
const MAX_SPLATTERS = 280;
const MAX_GIBS = 120;

const _dummy = new THREE.Object3D();
const _col = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _nrm = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _spinQ = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);

function makeBloodPuddleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);
  // Organic multi-lobed coagulating pool silhouette (white-tinted so per-instance color drives arterial->coagulated shift)
  const blobs: [number, number, number][] = [
    [64, 64, 42], [44, 54, 24], [84, 56, 22], [54, 84, 26], [80, 82, 20],
    [35, 72, 14], [93, 68, 15], [64, 34, 17], [46, 38, 12],
  ];
  for (const [bx, by, br] of blobs) {
    const gr = g.createRadialGradient(bx, by, br * 0.12, bx, by, br);
    gr.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    gr.addColorStop(0.68, 'rgba(215, 215, 215, 0.94)');
    gr.addColorStop(0.92, 'rgba(140, 140, 140, 0.55)');
    gr.addColorStop(1, 'rgba(90, 90, 90, 0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
  }
  // Satellite arterial micro-droplets around pool perimeter
  let s = 91823;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 30; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 42 + rnd() * 20;
    const r = 1.6 + rnd() * 3.8;
    g.fillStyle = 'rgba(240, 240, 240, 0.92)';
    g.beginPath();
    g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSplatterStreakTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 128);
  // Teardrop / directional impact streak with trailing micro-tails
  const gr = g.createRadialGradient(32, 86, 4, 32, 70, 50);
  gr.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  gr.addColorStop(0.6, 'rgba(210, 210, 210, 0.88)');
  gr.addColorStop(1, 'rgba(120, 120, 120, 0)');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(32, 76, 15, 40, 0, 0, Math.PI * 2);
  g.fill();
  // Forward ballistic droplets
  const drops: [number, number, number][] = [
    [32, 24, 5.5], [24, 38, 4], [41, 34, 3.8], [31, 12, 3], [18, 52, 3.2], [46, 56, 3.4],
  ];
  g.fillStyle = 'rgba(245, 245, 245, 0.92)';
  for (const [dx, dy, dr] of drops) {
    g.beginPath();
    g.ellipse(dx, dy, dr * 0.72, dr * 1.45, 0, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class FX {
  scene: THREE.Scene;
  pt: Particles;
  add: Particles;
  tracers: Tracer[] = [];
  flashes: Flash[] = [];
  goreEnabled = true;

  // Coagulating wet clearcoat blood pools
  private puddles: Puddle[] = [];
  private puddleCursor = 0;
  private puddleMesh: THREE.InstancedMesh;
  private puddlesDirty = false;

  // Directional ballistic splatter streaks (ground & walls)
  private splatters: Splatter[] = [];
  private splatterCursor = 0;
  private splatterMesh: THREE.InstancedMesh;
  private splattersDirty = false;

  // Tumbling anatomical gore/bone gibs
  private gibs: Gib[] = [];
  private gibCursor = 0;
  private gibMesh: THREE.InstancedMesh;
  private gibsDirty = false;

  // Active pressurized arterial spurts
  private spurts: ArterialSpurt[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const softTex = makeGlow();
    this.pt = new Particles(scene, 750, softTex, false);
    this.add = new Particles(scene, 420, softTex, true);

    // 1. Coagulating Blood Puddles
    const pGeo = new THREE.PlaneGeometry(2, 2);
    pGeo.rotateX(-Math.PI / 2);
    const pMat = new THREE.MeshPhysicalMaterial({
      map: makeBloodPuddleTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      roughness: 0.06,
      metalness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.35,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.puddleMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_PUDDLES);
    this.puddleMesh.frustumCulled = false;
    this.puddleMesh.renderOrder = 2;
    this.puddleMesh.receiveShadow = true;
    for (let i = 0; i < MAX_PUDDLES; i++) {
      this.puddles.push({ x: 0, y: -999, z: 0, age: 0, maxAge: 1, maxRadius: 0.5, rotY: 0, squash: 1, active: false });
      _dummy.position.set(0, -999, 0);
      _dummy.scale.set(0.001, 0.001, 0.001);
      _dummy.updateMatrix();
      this.puddleMesh.setMatrixAt(i, _dummy.matrix);
      this.puddleMesh.setColorAt(i, _col.setRGB(0.65, 0.03, 0.05));
    }
    this.puddleMesh.instanceMatrix.needsUpdate = true;
    if (this.puddleMesh.instanceColor) this.puddleMesh.instanceColor.needsUpdate = true;
    scene.add(this.puddleMesh);

    // 2. Ballistic Directional Splatter Streaks (ground + walls)
    const sGeo = new THREE.PlaneGeometry(1, 1);
    sGeo.rotateX(-Math.PI / 2);
    const sMat = new THREE.MeshPhysicalMaterial({
      map: makeSplatterStreakTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      roughness: 0.08,
      metalness: 0.05,
      clearcoat: 0.95,
      clearcoatRoughness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    this.splatterMesh = new THREE.InstancedMesh(sGeo, sMat, MAX_SPLATTERS);
    this.splatterMesh.frustumCulled = false;
    this.splatterMesh.renderOrder = 3;
    for (let i = 0; i < MAX_SPLATTERS; i++) {
      this.splatters.push({ x: 0, y: -999, z: 0, nx: 0, ny: 1, nz: 0, length: 0.2, width: 0.1, yaw: 0, age: 0, maxAge: 1, active: false });
      _dummy.position.set(0, -999, 0);
      _dummy.scale.set(0.001, 0.001, 0.001);
      _dummy.updateMatrix();
      this.splatterMesh.setMatrixAt(i, _dummy.matrix);
      this.splatterMesh.setColorAt(i, _col.setRGB(0.68, 0.03, 0.05));
    }
    this.splatterMesh.instanceMatrix.needsUpdate = true;
    if (this.splatterMesh.instanceColor) this.splatterMesh.instanceColor.needsUpdate = true;
    scene.add(this.splatterMesh);

    // 3. Tumbling Anatomical Tissue & Bone Gibs
    const gGeo = new THREE.DodecahedronGeometry(0.11, 0);
    const gMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
    });
    this.gibMesh = new THREE.InstancedMesh(gGeo, gMat, MAX_GIBS);
    this.gibMesh.frustumCulled = false;
    this.gibMesh.castShadow = true;
    for (let i = 0; i < MAX_GIBS; i++) {
      this.gibs.push({
        x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, vrx: 0, vry: 0, vrz: 0,
        scaleX: 1, scaleY: 1, scaleZ: 1, groundY: 0, age: 0, maxAge: 1, bounces: 0, isBone: false, trailT: 0, active: false,
      });
      _dummy.position.set(0, -999, 0);
      _dummy.scale.set(0.001, 0.001, 0.001);
      _dummy.updateMatrix();
      this.gibMesh.setMatrixAt(i, _dummy.matrix);
      this.gibMesh.setColorAt(i, _col.setHex(0x6e080d));
    }
    this.gibMesh.instanceMatrix.needsUpdate = true;
    if (this.gibMesh.instanceColor) this.gibMesh.instanceColor.needsUpdate = true;
    scene.add(this.gibMesh);
  }

  setGoreEnabled(on: boolean) {
    this.goreEnabled = on;
    this.puddleMesh.visible = on;
    this.splatterMesh.visible = on;
    this.gibMesh.visible = on;
    if (!on) this.spurts.length = 0;
  }

  tracer(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color = 0xfff0b0) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.075, max: 0.075 });
  }

  flash(x: number, y: number, z: number, color: number, peak: number, dist: number, dur: number) {
    if (this.flashes.length >= 6) {
      const f = this.flashes.shift()!;
      this.scene.remove(f.light);
    }
    const light = new THREE.PointLight(color, peak, dist, 1.8);
    light.position.set(x, y, z);
    this.scene.add(light);
    this.flashes.push({ light, life: dur, max: dur, peak });
  }

  muzzle(x: number, y: number, z: number) {
    this.add.emit(x, y, z, 0, 0, 0, 0.06, 0.95, 0.25, 1, 0.85, 0.4, 1, 0, 0);
    this.flash(x, y, z, 0xffc864, 5.5, 11, 0.055);
  }

  spark(x: number, y: number, z: number, nx = 0, ny = 1, nz = 0) {
    for (let i = 0; i < 6; i++) {
      this.add.emit(
        x, y, z,
        nx * 2 + (Math.random() - 0.5) * 6,
        ny * 2 + Math.random() * 4,
        nz * 2 + (Math.random() - 0.5) * 6,
        0.18 + Math.random() * 0.2, 0.24, -0.1, 1, 0.82, 0.35, 0.95, 14, 0.2,
      );
    }
  }

  /** Fast directional blood mist & droplet spray on light hits or ragdoll collisions. */
  blood(x: number, y: number, z: number, dx = 0, dz = 0) {
    if (!this.goreEnabled) return;
    // Fine arterial mist cloud
    for (let i = 0; i < 4; i++) {
      this.pt.emit(
        x + (Math.random() - 0.5) * 0.14,
        y + (Math.random() - 0.5) * 0.14,
        z + (Math.random() - 0.5) * 0.14,
        dx * (1.2 + Math.random() * 1.4) + (Math.random() - 0.5) * 1.8,
        0.5 + Math.random() * 1.4,
        dz * (1.2 + Math.random() * 1.4) + (Math.random() - 0.5) * 1.8,
        0.24 + Math.random() * 0.18,
        0.38, 0.55,
        0.62, 0.03, 0.04,
        0.42, 3.2, 1.4,
      );
    }
    // Crisp high-speed ballistic droplets
    for (let i = 0; i < 12; i++) {
      const sp = 2.6 + Math.random() * 4.4;
      this.pt.emit(
        x, y, z,
        dx * sp + (Math.random() - 0.5) * 3.0,
        0.9 + Math.random() * 3.0,
        dz * sp + (Math.random() - 0.5) * 3.0,
        0.34 + Math.random() * 0.34,
        0.2, -0.06,
        0.74 + Math.random() * 0.16, 0.025, 0.04,
        0.92, 15.5, 0.3,
      );
    }
  }

  /** Spawns an elongated directional splatter decal on the ground or a vertical wall surface. */
  bloodSplatter(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    nx = 0,
    ny = 1,
    nz = 0,
  ) {
    if (!this.goreEnabled) return;
    const streak = computeBloodSplatterStreak(vx, vy, vz);
    const s = this.splatters[this.splatterCursor];
    this.splatterCursor = (this.splatterCursor + 1) % MAX_SPLATTERS;
    s.x = x + nx * 0.03;
    s.y = y + ny * 0.03;
    s.z = z + nz * 0.03;
    s.nx = nx;
    s.ny = ny;
    s.nz = nz;
    s.length = streak.length * (0.85 + Math.random() * 0.45);
    s.width = streak.width * (0.8 + Math.random() * 0.45);
    s.yaw = streak.yaw + (Math.random() - 0.5) * 0.25;
    s.age = 0;
    s.maxAge = 34 + Math.random() * 14;
    s.active = true;
    this.splattersDirty = true;
  }

  /** Continuous ragdoll drag/tumble smear trail across asphalt or sand. */
  bloodSmear(x: number, groundY: number, z: number, vx: number, vz: number) {
    if (!this.goreEnabled) return;
    this.bloodSplatter(x, groundY + 0.015, z, vx * 1.4, -1.2, vz * 1.4, 0, 1, 0);
    if (Math.random() < 0.45) {
      this.bloodPuddle(x + (Math.random() - 0.5) * 0.25, groundY, z + (Math.random() - 0.5) * 0.25, 0.32 + Math.random() * 0.25);
    }
  }

  /** Full 10x ballistic gore burst: arterial mist, directional splatter fan, pulsing arterial jet, coagulating pool, and tumbling tissue/bone gibs. */
  bloodBurst(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    damage: number,
    headshot: boolean,
    explosive: boolean,
    shotgun: boolean,
    groundY: number,
    wallHit?: { x: number; y: number; z: number; nx: number; nz: number } | null,
  ) {
    if (!this.goreEnabled) return;
    const spec = computeBloodBurst(damage, headshot, explosive, shotgun);
    const len = Math.hypot(dx, dy, dz) || 1;
    const ndx = dx / len, ndy = dy / len, ndz = dz / len;

    // 1. Aerosolized arterial mist cloud right at wound exit
    const mistCount = headshot ? 10 : explosive ? 14 : 6;
    for (let i = 0; i < mistCount; i++) {
      this.pt.emit(
        x + (Math.random() - 0.5) * 0.2,
        y + (Math.random() - 0.5) * 0.2,
        z + (Math.random() - 0.5) * 0.2,
        ndx * (1.8 + Math.random() * 2.5) + (Math.random() - 0.5) * 2.2,
        ndy * 1.4 + 0.4 + Math.random() * 1.6,
        ndz * (1.8 + Math.random() * 2.5) + (Math.random() - 0.5) * 2.2,
        0.3 + Math.random() * 0.26,
        0.48, 0.75,
        0.66, 0.025, 0.04,
        0.45, 2.6, 1.5,
      );
    }

    // 2. High-velocity ballistic blood droplet cone
    for (let i = 0; i < spec.dropletCount; i++) {
      const sp = spec.spraySpeed * (0.45 + Math.random() * 0.85);
      const rx = (Math.random() - 0.5) * spec.spreadAngle * 2;
      const ry = (Math.random() - 0.25) * spec.spreadAngle * 1.45;
      const rz = (Math.random() - 0.5) * spec.spreadAngle * 2;
      const bright = Math.random() < 0.65;
      this.pt.emit(
        x + (Math.random() - 0.5) * 0.14,
        y + (Math.random() - 0.5) * 0.14,
        z + (Math.random() - 0.5) * 0.14,
        (ndx + rx) * sp,
        Math.max(0.6, (ndy + ry) * sp + 1.5),
        (ndz + rz) * sp,
        0.38 + Math.random() * 0.48,
        bright ? 0.22 : 0.3,
        -0.06,
        bright ? 0.82 : 0.46,
        0.02,
        0.035,
        0.94,
        15.5,
        0.28,
      );
    }

    // 3. Ballistic directional ground splatter fan along exit trajectory
    for (let i = 0; i < spec.splatterCount; i++) {
      const dist = 0.35 + Math.random() * (headshot ? 3.2 : shotgun ? 2.8 : 2.1);
      const lat = (Math.random() - 0.5) * (0.4 + dist * 0.55);
      const px = -ndz, pz = ndx;
      const sx = x + ndx * dist + px * lat;
      const sz = z + ndz * dist + pz * lat;
      this.bloodSplatter(
        sx, groundY + 0.015, sz,
        ndx * spec.spraySpeed * 0.85 + px * lat,
        -2.4,
        ndz * spec.spraySpeed * 0.85 + pz * lat,
        0, 1, 0,
      );
    }

    // 4. Vertical wall splatter if a nearby surface was behind the victim
    if (wallHit) {
      for (let i = 0; i < (headshot ? 7 : 4); i++) {
        this.bloodSplatter(
          wallHit.x + (Math.random() - 0.5) * 0.6,
          Math.max(groundY + 0.3, wallHit.y + (Math.random() - 0.5) * 0.65),
          wallHit.z + (Math.random() - 0.5) * 0.6,
          ndx * 3.5, -1.8, ndz * 3.5,
          wallHit.nx, 0, wallHit.nz,
        );
      }
    }

    // 5. Pressurized pulsing arterial jet fountain
    if (damage >= 26 || headshot || shotgun || explosive) {
      const jet = computeArterialJet(damage, headshot, shotgun);
      if (this.spurts.length > 18) this.spurts.shift();
      this.spurts.push({
        x, y, z,
        dx: ndx, dy: ndy, dz: ndz,
        groundY,
        pulsesLeft: jet.pulses,
        pulseInterval: jet.pulseInterval,
        timer: 0.04,
        dropletsPerPulse: jet.dropletsPerPulse,
        jetSpeed: jet.jetSpeed,
        arcUp: jet.arcUp,
      });
    }

    // 6. Primary + satellite coagulating ground blood pools
    this.bloodPuddle(x + ndx * 0.35, groundY, z + ndz * 0.35, spec.puddleTargetRadius);
    if (headshot || explosive || shotgun) {
      this.bloodPuddle(
        x + ndx * 1.15 + (Math.random() - 0.5) * 0.6,
        groundY,
        z + ndz * 1.15 + (Math.random() - 0.5) * 0.6,
        spec.puddleTargetRadius * 0.62,
      );
    }

    // 7. Tumbling anatomical tissue & bone gibs
    for (let i = 0; i < spec.gibCount; i++) {
      const g = this.gibs[this.gibCursor];
      this.gibCursor = (this.gibCursor + 1) % MAX_GIBS;
      const sp = 3.2 + Math.random() * (explosive ? 9.5 : 5.8);
      g.x = x + (Math.random() - 0.5) * 0.25;
      g.y = y + (Math.random() - 0.5) * 0.25;
      g.z = z + (Math.random() - 0.5) * 0.25;
      g.vx = ndx * sp + (Math.random() - 0.5) * (explosive ? 7.5 : 4.2);
      g.vy = 2.4 + Math.random() * (explosive ? 6.8 : 4.4);
      g.vz = ndz * sp + (Math.random() - 0.5) * (explosive ? 7.5 : 4.2);
      g.rx = Math.random() * 6;
      g.ry = Math.random() * 6;
      g.rz = Math.random() * 6;
      g.vrx = (Math.random() - 0.5) * 16;
      g.vry = (Math.random() - 0.5) * 16;
      g.vrz = (Math.random() - 0.5) * 16;
      g.isBone = i % 4 === 0;
      const baseSc = g.isBone ? 0.55 + Math.random() * 0.55 : 0.72 + Math.random() * 0.85;
      g.scaleX = baseSc * (g.isBone ? 1.7 : 0.8 + Math.random() * 0.6);
      g.scaleY = baseSc * (g.isBone ? 0.55 : 0.7 + Math.random() * 0.5);
      g.scaleZ = baseSc * (g.isBone ? 0.55 : 0.8 + Math.random() * 0.6);
      g.groundY = groundY;
      g.age = 0;
      g.maxAge = 24 + Math.random() * 10;
      g.bounces = 0;
      g.trailT = 0;
      g.active = true;
      this.gibsDirty = true;
    }
  }

  /** Spawns an expanding, coagulating wet clearcoat ground blood pool. */
  bloodPuddle(x: number, groundY: number, z: number, maxRadius = 0.85) {
    if (!this.goreEnabled) return;
    const p = this.puddles[this.puddleCursor];
    this.puddleCursor = (this.puddleCursor + 1) % MAX_PUDDLES;
    p.x = x;
    p.y = groundY + 0.02 + (this.puddleCursor % 7) * 0.0014;
    p.z = z;
    p.age = 0;
    p.maxAge = 38 + Math.random() * 14;
    p.maxRadius = maxRadius;
    p.rotY = Math.random() * Math.PI * 2;
    p.squash = 0.78 + Math.random() * 0.44;
    p.active = true;
    this.puddlesDirty = true;
  }

  dust(x: number, y: number, z: number) {
    for (let i = 0; i < 4; i++) {
      this.pt.emit(x, y, z, (Math.random() - 0.5) * 2.2, 0.5 + Math.random() * 1.4, (Math.random() - 0.5) * 2.2, 0.45, 0.35, 0.9, 0.78, 0.74, 0.68, 0.3, 1.0, 2.2);
    }
  }

  sandSpray(x: number, y: number, z: number, vx = 0, vz = 0, intensity = 0.6) {
    const n = Math.max(2, Math.round(5 * intensity));
    for (let i = 0; i < n; i++) {
      this.pt.emit(
        x + (Math.random() - 0.5) * 0.35, y + 0.06, z + (Math.random() - 0.5) * 0.35,
        vx + (Math.random() - 0.5) * 2.4 * intensity,
        0.5 + Math.random() * 1.6 * intensity,
        vz + (Math.random() - 0.5) * 2.4 * intensity,
        0.38 + Math.random() * 0.25,
        0.24 + intensity * 0.22,
        0.65 + intensity * 0.4,
        0.92, 0.83, 0.64, 0.42, 3.5, 1.8,
      );
    }
  }

  smoke(x: number, y: number, z: number, scale = 1, dark = false) {
    const c = dark ? 0.14 : 0.48;
    this.pt.emit(
      x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.9, 1.4 + Math.random() * 1.2, (Math.random() - 0.5) * 0.9,
      1.3 + Math.random() * 0.8, 0.7 * scale, 2.2 * scale, c, c, c, 0.55, -0.4, 0.4,
    );
  }

  flame(x: number, y: number, z: number, scale = 1) {
    this.add.emit(
      x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 1.4, 2.4 + Math.random() * 2.5, (Math.random() - 0.5) * 1.4,
      0.38 + Math.random() * 0.22, 0.85 * scale, -0.4 * scale, 1, 0.42 + Math.random() * 0.35, 0.06, 0.9, -2.0, 0.6,
    );
  }

  fire(x: number, y: number, z: number, scale = 1) {
    this.flame(x, y, z, scale);
    if (Math.random() < 0.45) this.smoke(x, y + 0.6 * scale, z, 0.9 * scale, true);
  }

  skid(x: number, y: number, z: number) {
    this.pt.emit(x, y + 0.15, z, (Math.random() - 0.5) * 1.4, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.4, 0.6, 0.4, 1.1, 0.82, 0.82, 0.85, 0.28, -0.3, 1.5);
  }

  tireSmoke(x: number, y: number, z: number, vx = 0, vz = 0) {
    this.pt.emit(x, y + 0.12, z, vx + (Math.random() - 0.5) * 1.1, 0.55 + Math.random() * 0.7, vz + (Math.random() - 0.5) * 1.1, 0.65, 0.42, 1.15, 0.84, 0.84, 0.86, 0.3, -0.35, 1.5);
  }

  rocketTrail(x: number, y: number, z: number) {
    this.pt.emit(x, y, z, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, 0.55, 0.42, 1.4, 0.82, 0.8, 0.78, 0.48, -0.4, 1.1);
    this.add.emit(x, y, z, 0, 0, 0, 0.12, 0.45, -0.2, 1, 0.65, 0.18, 0.9, 0, 0);
  }

  contrail(x: number, y: number, z: number) {
    this.pt.emit(x, y, z, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 1.1, 0.55, 1.8, 0.94, 0.96, 1.0, 0.32, 0, 0.5);
  }

  explosion(x: number, y: number, z: number, scale = 1) {
    this.flash(x, y + 1.5, z, 0xff922b, 26 * scale, 48 * scale, 0.45);
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2, s = (3 + Math.random() * 12) * scale;
      this.add.emit(x, y + 0.5, z, Math.cos(a) * s, (2 + Math.random() * 11) * scale, Math.sin(a) * s, 0.45 + Math.random() * 0.4, (1.6 + Math.random() * 1.4) * scale, 2.4 * scale, 1, 0.5 + Math.random() * 0.4, 0.08, 0.92, 4, 1.6);
    }
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2, s = (2 + Math.random() * 8) * scale;
      this.pt.emit(x, y + 0.8, z, Math.cos(a) * s, (2 + Math.random() * 7) * scale, Math.sin(a) * s, 1.4 + Math.random() * 1.4, 1.4 * scale, 4.2 * scale, 0.14, 0.13, 0.12, 0.72, -1.2, 1.2);
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, s = (5 + Math.random() * 15) * scale;
      this.add.emit(x, y + 0.5, z, Math.cos(a) * s, (5 + Math.random() * 10) * scale, Math.sin(a) * s, 0.7 + Math.random() * 0.6, 0.35 * scale, -0.15, 1, 0.8, 0.3, 1.0, 15, 0.2);
    }
  }

  update(dt: number, canvasHeight: number, fovDeg: number) {
    this.pt.update(dt, canvasHeight, fovDeg);
    this.add.update(dt, canvasHeight, fovDeg);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      } else (t.line.material as THREE.LineBasicMaterial).opacity = t.life / t.max;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) { this.scene.remove(f.light); this.flashes.splice(i, 1); }
      else f.light.intensity = f.peak * (f.life / f.max);
    }

    // Update pulsing arterial spurts
    if (this.goreEnabled && this.spurts.length > 0) {
      for (let i = this.spurts.length - 1; i >= 0; i--) {
        const sp = this.spurts[i];
        sp.timer -= dt;
        if (sp.timer <= 0) {
          const pressure = 0.5 + 0.5 * (sp.pulsesLeft / 7);
          for (let d = 0; d < sp.dropletsPerPulse; d++) {
            const spd = sp.jetSpeed * pressure * (0.75 + Math.random() * 0.4);
            const vx = (sp.dx + (Math.random() - 0.5) * 0.34) * spd;
            const vy = sp.arcUp * pressure + Math.random() * 1.4;
            const vz = (sp.dz + (Math.random() - 0.5) * 0.34) * spd;
            this.pt.emit(
              sp.x, sp.y, sp.z,
              vx, vy, vz,
              0.42 + Math.random() * 0.25,
              0.19, -0.05,
              0.84, 0.025, 0.04,
              0.96, 15.5, 0.22,
            );
          }
          // Spawn landing splatter where the arterial arc strikes the pavement
          const flightT = Math.max(0.18, (sp.arcUp * pressure + Math.sqrt(Math.max(0.2, sp.arcUp * sp.arcUp + 31 * Math.max(0.2, sp.y - sp.groundY)))) / 15.5);
          const landX = sp.x + sp.dx * sp.jetSpeed * pressure * flightT * 0.72 + (Math.random() - 0.5) * 0.35;
          const landZ = sp.z + sp.dz * sp.jetSpeed * pressure * flightT * 0.72 + (Math.random() - 0.5) * 0.35;
          this.bloodSplatter(landX, sp.groundY + 0.015, landZ, sp.dx * sp.jetSpeed * pressure, -3.5, sp.dz * sp.jetSpeed * pressure, 0, 1, 0);

          sp.pulsesLeft--;
          sp.timer = sp.pulseInterval;
          if (sp.pulsesLeft <= 0) this.spurts.splice(i, 1);
        }
      }
    }

    // Update coagulating blood puddles (smooth radial spread + arterial->coagulated color darkening)
    let puddleAny = this.puddlesDirty;
    for (let i = 0; i < MAX_PUDDLES; i++) {
      const p = this.puddles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        _dummy.position.set(0, -999, 0);
        _dummy.scale.set(0.001, 0.001, 0.001);
        _dummy.updateMatrix();
        this.puddleMesh.setMatrixAt(i, _dummy.matrix);
        puddleAny = true;
      } else {
        const rad = computePuddleRadius(p.age, p.maxRadius);
        const fade = p.age > p.maxAge - 5 ? Math.max(0.01, (p.maxAge - p.age) / 5) : 1;
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.rotation.set(0, p.rotY, 0);
        _dummy.scale.set(rad * fade, 1, rad * p.squash * fade);
        _dummy.updateMatrix();
        this.puddleMesh.setMatrixAt(i, _dummy.matrix);
        const cc = computeCoagulationColor(p.age);
        this.puddleMesh.setColorAt(i, _col.setRGB(cc.r, cc.g, cc.b));
        puddleAny = true;
      }
    }
    if (puddleAny) {
      this.puddleMesh.instanceMatrix.needsUpdate = true;
      if (this.puddleMesh.instanceColor) this.puddleMesh.instanceColor.needsUpdate = true;
      this.puddlesDirty = false;
    }

    // Update directional ballistic splatter streaks (ground & wall decals with coagulation darkening)
    let splatAny = this.splattersDirty;
    for (let i = 0; i < MAX_SPLATTERS; i++) {
      const s = this.splatters[i];
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= s.maxAge) {
        s.active = false;
        _dummy.position.set(0, -999, 0);
        _dummy.scale.set(0.001, 0.001, 0.001);
        _dummy.updateMatrix();
        this.splatterMesh.setMatrixAt(i, _dummy.matrix);
        splatAny = true;
      } else {
        const fade = s.age > s.maxAge - 4 ? Math.max(0.01, (s.maxAge - s.age) / 4) : 1;
        _dummy.position.set(s.x, s.y, s.z);
        _nrm.set(s.nx, s.ny, s.nz).normalize();
        _quat.setFromUnitVectors(_up, _nrm);
        _spinQ.setFromAxisAngle(_yAxis, s.yaw);
        _dummy.quaternion.copy(_quat).multiply(_spinQ);
        _dummy.scale.set(s.width * fade, 1, s.length * fade);
        _dummy.updateMatrix();
        this.splatterMesh.setMatrixAt(i, _dummy.matrix);
        const cc = computeCoagulationColor(s.age + 2);
        this.splatterMesh.setColorAt(i, _col.setRGB(cc.r, cc.g, cc.b));
        splatAny = true;
      }
    }
    if (splatAny) {
      this.splatterMesh.instanceMatrix.needsUpdate = true;
      if (this.splatterMesh.instanceColor) this.splatterMesh.instanceColor.needsUpdate = true;
      this.splattersDirty = false;
    }

    // Update tumbling anatomical gore & bone gibs with airborne blood trails + bounce smears
    let gibAny = this.gibsDirty;
    for (let i = 0; i < MAX_GIBS; i++) {
      const g = this.gibs[i];
      if (!g.active) continue;
      g.age += dt;
      if (g.age >= g.maxAge) {
        g.active = false;
        _dummy.position.set(0, -999, 0);
        _dummy.scale.set(0.001, 0.001, 0.001);
        _dummy.updateMatrix();
        this.gibMesh.setMatrixAt(i, _dummy.matrix);
        gibAny = true;
        continue;
      }
      const sp = Math.hypot(g.vx, g.vy, g.vz);
      if (sp > 0.14 || g.y > g.groundY + 0.08) {
        g.vy -= 18.5 * dt;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.z += g.vz * dt;
        g.rx += g.vrx * dt;
        g.ry += g.vry * dt;
        g.rz += g.vrz * dt;
        // Mid-air micro-droplet trail while flying fast
        if (sp > 2.4 && g.bounces < 2) {
          g.trailT -= dt;
          if (g.trailT <= 0) {
            g.trailT = 0.045;
            this.pt.emit(g.x, g.y, g.z, g.vx * 0.2, g.vy * 0.15, g.vz * 0.2, 0.26, 0.13, -0.04, 0.72, 0.025, 0.04, 0.85, 14, 0.2);
          }
        }
        if (g.y < g.groundY + 0.05) {
          g.y = g.groundY + 0.05;
          if (Math.abs(g.vy) > 1.2 && g.bounces < 3) {
            // Impact splatter streak on every bounce!
            this.bloodSplatter(g.x, g.groundY + 0.015, g.z, g.vx, g.vy, g.vz, 0, 1, 0);
            if (g.bounces === 0) this.bloodPuddle(g.x, g.groundY, g.z, 0.38);
            g.vy = -g.vy * 0.34;
            g.vx *= 0.56;
            g.vz *= 0.56;
            g.vrx *= 0.58;
            g.vry *= 0.58;
            g.vrz *= 0.58;
            g.bounces++;
          } else {
            g.vy = 0;
            g.vx *= Math.exp(-9 * dt);
            g.vz *= Math.exp(-9 * dt);
            g.vrx *= Math.exp(-9 * dt);
            g.vry *= Math.exp(-9 * dt);
            g.vrz *= Math.exp(-9 * dt);
          }
        }
      }
      const fade = g.age > g.maxAge - 3 ? Math.max(0.01, (g.maxAge - g.age) / 3) : 1;
      _dummy.position.set(g.x, g.y, g.z);
      _dummy.rotation.set(g.rx, g.ry, g.rz);
      _dummy.scale.set(g.scaleX * fade, g.scaleY * fade, g.scaleZ * fade);
      _dummy.updateMatrix();
      this.gibMesh.setMatrixAt(i, _dummy.matrix);
      if (g.isBone) {
        this.gibMesh.setColorAt(i, _col.setHex(0xd8cbb8));
      } else {
        const cc = computeCoagulationColor(g.age * 0.7);
        this.gibMesh.setColorAt(i, _col.setRGB(cc.r * 0.85, cc.g * 1.1, cc.b * 1.1));
      }
      gibAny = true;
    }
    if (gibAny) {
      this.gibMesh.instanceMatrix.needsUpdate = true;
      if (this.gibMesh.instanceColor) this.gibMesh.instanceColor.needsUpdate = true;
      this.gibsDirty = false;
    }
  }
}
