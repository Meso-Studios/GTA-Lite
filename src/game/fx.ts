import * as THREE from 'three';
import { Particles } from './particles';
import { computeBloodBurst, computePuddleRadius } from './physics';
import { makeGlow } from './textures';

interface Tracer { mesh: THREE.Mesh; life: number }
interface BloodPuddle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  age: number;
  maxR: number;
  rotY: number;
  sx: number;
  sz: number;
}
interface GoreGib {
  active: boolean;
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
  scale: number;
  groundY: number;
  age: number;
  maxAge: number;
}

const MAX_PUDDLES = 140;
const MAX_GIBS = 72;
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export class FX {
  add: Particles;
  alpha: Particles;
  tracers: Tracer[] = [];
  flash: THREE.PointLight;
  flashI = 0;
  tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.6), toneMapped: false, transparent: true });
  tracerGeo = new THREE.BoxGeometry(0.04, 0.04, 1);

  // Gore & Blood Physics state
  goreEnabled = true;
  puddleMesh: THREE.InstancedMesh;
  puddles: BloodPuddle[] = [];
  puddleCursor = 0;
  gibMesh: THREE.InstancedMesh;
  gibs: GoreGib[] = [];
  gibCursor = 0;

  constructor(scene: THREE.Scene) {
    const glow = makeGlow();
    this.add = new Particles(scene, 1100, glow, true);
    this.alpha = new Particles(scene, 1400, glow, false);
    this.flash = new THREE.PointLight(0xffaa55, 0, 40, 1.6);
    scene.add(this.flash);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }

    // Pooled glossy arterial ground blood puddles (clearcoat wet specular sheen!)
    const puddleGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
    const puddleMat = new THREE.MeshPhysicalMaterial({
      color: 0x560408,
      roughness: 0.09,
      metalness: 0.06,
      clearcoat: 0.95,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    this.puddleMesh = new THREE.InstancedMesh(puddleGeo, puddleMat, MAX_PUDDLES);
    this.puddleMesh.frustumCulled = false;
    this.puddleMesh.renderOrder = 2;
    _m4.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_PUDDLES; i++) {
      this.puddles.push({ active: false, x: 0, y: 0, z: 0, age: 0, maxR: 0.5, rotY: 0, sx: 1, sz: 1 });
      this.puddleMesh.setMatrixAt(i, _m4);
    }
    this.puddleMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.puddleMesh);

    // Pooled physical bouncing gore chunks / debris gibs
    const gibGeo = new THREE.DodecahedronGeometry(0.11, 0);
    const gibMat = new THREE.MeshPhysicalMaterial({
      color: 0x6b0b10,
      roughness: 0.24,
      metalness: 0.05,
      clearcoat: 0.72,
      clearcoatRoughness: 0.14,
    });
    this.gibMesh = new THREE.InstancedMesh(gibGeo, gibMat, MAX_GIBS);
    this.gibMesh.frustumCulled = false;
    for (let i = 0; i < MAX_GIBS; i++) {
      this.gibs.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, vrx: 0, vry: 0, scale: 1, groundY: 0, age: 0, maxAge: 10 });
      this.gibMesh.setMatrixAt(i, _m4);
    }
    this.gibMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.gibMesh);
  }

  setGoreEnabled(enabled: boolean) {
    this.goreEnabled = enabled;
    this.puddleMesh.visible = enabled;
    this.gibMesh.visible = enabled;
  }

  spark(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
    for (let i = 0; i < 4; i++) {
      this.add.emit(x, y, z, nx * 3 + (Math.random() - 0.5) * 4, ny * 3 + Math.random() * 3, nz * 3 + (Math.random() - 0.5) * 4, 0.25 + Math.random() * 0.3, 0.12, -0.05, 2.2, 1.3, 0.4, 1, 9, 0.5);
    }
    this.alpha.emit(x, y, z, nx, 0.6, nz, 0.7, 0.2, 0.9, 0.5, 0.5, 0.5, 0.35, -0.3, 1);
  }
  dust(x: number, y: number, z: number) {
    for (let i = 0; i < 3; i++) this.alpha.emit(x, y, z, (Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5, 0.8, 0.3, 1.2, 0.55, 0.52, 0.47, 0.4, -0.2, 2);
  }
  sandSpray(x: number, y: number, z: number, vx: number, vz: number, intensity = 1) {
    const n = Math.max(1, Math.min(5, Math.round(intensity * 3)));
    for (let i = 0; i < n; i++) {
      this.alpha.emit(
        x + (Math.random() - 0.5) * 0.35,
        y + 0.08,
        z + (Math.random() - 0.5) * 0.35,
        vx + (Math.random() - 0.5) * 2.2,
        0.7 + Math.random() * 1.8 * intensity,
        vz + (Math.random() - 0.5) * 2.2,
        0.55 + Math.random() * 0.45,
        0.35 * (0.7 + intensity * 0.45),
        1.45 * (0.7 + intensity * 0.45),
        0.84, 0.74, 0.52,
        Math.min(0.65, 0.32 + intensity * 0.22),
        2.6,
        1.4,
      );
    }
  }
  tireSmoke(x: number, y: number, z: number, vx: number, vz: number) {
    this.alpha.emit(
      x + (Math.random() - 0.5) * 0.25,
      y + 0.06,
      z + (Math.random() - 0.5) * 0.25,
      vx + (Math.random() - 0.5) * 1.1,
      0.55 + Math.random() * 0.85,
      vz + (Math.random() - 0.5) * 1.1,
      0.7 + Math.random() * 0.45,
      0.34,
      1.85,
      0.8, 0.8, 0.82,
      0.38,
      -0.35,
      1.1,
    );
  }
  contrail(x: number, y: number, z: number) {
    this.alpha.emit(
      x, y, z,
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.3,
      1.6 + Math.random() * 0.8,
      0.38,
      2.3,
      0.94, 0.96, 1.0,
      0.32,
      0,
      0.3,
    );
  }
  rocketTrail(x: number, y: number, z: number) {
    this.add.emit(x, y, z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.14, 0.5, -0.3, 2.8, 1.3, 0.25, 0.95, 0, 1);
    this.alpha.emit(x, y, z, (Math.random() - 0.5) * 1.1, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.1, 0.75, 0.42, 2.0, 0.78, 0.76, 0.72, 0.45, -0.2, 0.8);
  }

  /** Lightweight legacy blood puff (respects goreEnabled). */
  blood(x: number, y: number, z: number, dx: number, dz: number) {
    if (!this.goreEnabled) return;
    for (let i = 0; i < 8; i++) {
      this.alpha.emit(x, y, z, dx * 2.8 + (Math.random() - 0.5) * 2.8, 1.1 + Math.random() * 2.6, dz * 2.8 + (Math.random() - 0.5) * 2.8, 0.5 + Math.random() * 0.4, 0.1, 0.05, 0.55, 0.02, 0.02, 0.92, 11, 0.3);
    }
  }

  /** Full ballistic arterial blood burst + mist + optional physical gibs. */
  bloodBurst(x: number, y: number, z: number, dx: number, dy: number, dz: number, damage: number, headshot = false, explosive = false, shotgun = false, groundY = 0) {
    if (!this.goreEnabled) return;
    const spec = computeBloodBurst(damage, headshot, explosive, shotgun);
    const len = Math.hypot(dx, dy, dz) || 1;
    const nx = dx / len, ny = dy / len, nz = dz / len;
    // Fine crimson aerosol mist cloud
    for (let i = 0; i < (headshot ? 7 : 4); i++) {
      this.alpha.emit(
        x + (Math.random() - 0.5) * 0.2,
        y + (Math.random() - 0.5) * 0.2,
        z + (Math.random() - 0.5) * 0.2,
        nx * 1.6 + (Math.random() - 0.5) * 1.8,
        0.5 + Math.random() * 1.3,
        nz * 1.6 + (Math.random() - 0.5) * 1.8,
        0.48 + Math.random() * 0.35,
        0.26,
        0.95,
        0.52, 0.02, 0.03,
        0.52,
        1.2,
        1.6,
      );
    }
    // High-velocity arterial droplets arcing with gravity
    for (let i = 0; i < spec.dropletCount; i++) {
      const sp = spec.spraySpeed * (0.45 + Math.random() * 0.75);
      const sx = nx * sp + (Math.random() - 0.5) * spec.spreadAngle * sp * 1.4;
      const sy = ny * sp * 0.55 + (0.9 + Math.random() * 2.8);
      const sz = nz * sp + (Math.random() - 0.5) * spec.spreadAngle * sp * 1.4;
      const bright = Math.random() < 0.35 ? 0.68 : 0.44;
      this.alpha.emit(
        x, y, z,
        sx, sy, sz,
        0.42 + Math.random() * 0.48,
        0.075 + Math.random() * 0.06,
        0.04,
        bright, 0.015, 0.02,
        0.95,
        14.5,
        0.22,
      );
    }
    if (spec.gibCount > 0) {
      this.goreGibs(x, y, z, nx * spec.spraySpeed * 0.65, 2.2 + Math.random() * 2.5, nz * spec.spraySpeed * 0.65, spec.gibCount, groundY);
    }
    this.bloodPuddle(x + nx * 0.4, groundY, z + nz * 0.4, spec.puddleTargetRadius);
  }

  /** Spawns an expanding glossy ground blood puddle at world (x, y, z). */
  bloodPuddle(x: number, y: number, z: number, maxR = 0.85) {
    if (!this.goreEnabled) return;
    const p = this.puddles[this.puddleCursor];
    this.puddleCursor = (this.puddleCursor + 1) % MAX_PUDDLES;
    p.active = true;
    p.x = x + (Math.random() - 0.5) * 0.35;
    p.y = y + 0.028 + (this.puddleCursor % 7) * 0.0012;
    p.z = z + (Math.random() - 0.5) * 0.35;
    p.age = 0;
    p.maxR = Math.max(0.35, Math.min(1.9, maxR));
    p.rotY = Math.random() * Math.PI * 2;
    p.sx = 0.82 + Math.random() * 0.38;
    p.sz = 0.82 + Math.random() * 0.38;
  }

  /** Spawns tumbling physical gore chunks with gravity and ground bounce. */
  goreGibs(x: number, y: number, z: number, vx: number, vy: number, vz: number, count: number, groundY = 0) {
    if (!this.goreEnabled) return;
    for (let i = 0; i < count; i++) {
      const g = this.gibs[this.gibCursor];
      this.gibCursor = (this.gibCursor + 1) % MAX_GIBS;
      g.active = true;
      g.x = x + (Math.random() - 0.5) * 0.25;
      g.y = y + (Math.random() - 0.5) * 0.25;
      g.z = z + (Math.random() - 0.5) * 0.25;
      g.vx = vx + (Math.random() - 0.5) * 5.2;
      g.vy = vy + Math.random() * 3.8;
      g.vz = vz + (Math.random() - 0.5) * 5.2;
      g.rx = Math.random() * 6;
      g.ry = Math.random() * 6;
      g.rz = Math.random() * 6;
      g.vrx = (Math.random() - 0.5) * 14;
      g.vry = (Math.random() - 0.5) * 14;
      g.scale = 0.65 + Math.random() * 0.85;
      g.groundY = groundY;
      g.age = 0;
      g.maxAge = 18 + Math.random() * 10;
    }
  }

  smoke(x: number, y: number, z: number, size = 1, dark = false) {
    const c = dark ? 0.06 : 0.4;
    this.alpha.emit(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.8, 1.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.8, 1.8 + Math.random() * 1.5, 0.7 * size, 3.4 * size, c, c, c, dark ? 0.55 : 0.4, -0.25, 0.4);
  }
  fire(x: number, y: number, z: number) {
    this.add.emit(x, y, z, (Math.random() - 0.5) * 0.8, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8, 0.45 + Math.random() * 0.35, 0.9, -0.5, 2.4, 0.9 + Math.random() * 0.4, 0.15, 0.9, -0.5, 0.5);
  }
  muzzle(x: number, y: number, z: number) {
    this.add.emit(x, y, z, 0, 0, 0, 0.06, 0.55, 0.3, 3, 2.4, 1.2, 1, 0, 0);
    this.flashI = Math.max(this.flashI, 1);
    this.flash.position.set(x, y, z);
    this.flash.color.setRGB(1, 0.75, 0.4);
    this.flash.distance = 14;
    this.flash.intensity = 6;
  }
  explosion(x: number, y: number, z: number, r: number) {
    const n = 46;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 - 0.2, s = r * (0.4 + Math.random() * 1.6);
      this.add.emit(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s * 0.9 + 3, Math.sin(a) * Math.cos(e) * s, 0.45 + Math.random() * 0.7, 1.8 + Math.random() * 1.6, 3.4, 2.6, 1.1 + Math.random() * 0.7, 0.2, 1, -1, 2.2);
    }
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2, s = r * (0.2 + Math.random() * 0.8);
      this.alpha.emit(x, y + 1, z, Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s, 2 + Math.random() * 2.5, 2.2, 6, 0.09, 0.09, 0.09, 0.65, -0.5, 0.9);
    }
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, s = 8 + Math.random() * 16;
      this.add.emit(x, y, z, Math.cos(a) * s, 6 + Math.random() * 12, Math.sin(a) * s, 0.5 + Math.random() * 0.8, 0.16, -0.08, 3, 1.8, 0.5, 1, 12, 0.3);
    }
    this.flash.position.set(x, y + 2, z);
    this.flash.color.setRGB(1, 0.6, 0.25);
    this.flash.distance = 80;
    this.flash.intensity = 60;
    this.flashI = 3;
  }
  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const t = this.tracers.find((q) => q.life <= 0) ?? this.tracers[0];
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    t.mesh.visible = true;
    t.mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    t.mesh.scale.set(1, 1, len);
    t.mesh.lookAt(bx, by, bz);
    t.life = 0.07;
  }
  update(dt: number, viewH: number, fov: number) {
    this.add.update(dt, viewH, fov);
    this.alpha.update(dt, viewH, fov);
    for (const t of this.tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.mesh.visible = false; }
    if (this.flash.intensity > 0) {
      this.flash.intensity *= Math.exp(-(this.flashI > 2 ? 4 : 40) * dt);
      if (this.flash.intensity < 0.05) this.flash.intensity = 0;
    }

    // Update expanding blood puddles
    let puddleDirty = false;
    for (let i = 0; i < MAX_PUDDLES; i++) {
      const p = this.puddles[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age > 55) {
        p.active = false;
        _m4.makeScale(0, 0, 0);
        this.puddleMesh.setMatrixAt(i, _m4);
        puddleDirty = true;
        continue;
      }
      if (p.age < 4.5 || p.age > 50) {
        const fade = p.age > 50 ? Math.max(0, 1 - (p.age - 50) / 5) : 1;
        const r = computePuddleRadius(p.age, p.maxR) * fade;
        _e.set(0, p.rotY, 0);
        _q.setFromEuler(_e);
        _v.set(p.x, p.y, p.z);
        _s.set(r * p.sx, 1, r * p.sz);
        _m4.compose(_v, _q, _s);
        this.puddleMesh.setMatrixAt(i, _m4);
        puddleDirty = true;
      }
    }
    if (puddleDirty) this.puddleMesh.instanceMatrix.needsUpdate = true;

    // Update bouncing gore gibs
    let gibDirty = false;
    for (let i = 0; i < MAX_GIBS; i++) {
      const gb = this.gibs[i];
      if (!gb.active) continue;
      gb.age += dt;
      if (gb.age > gb.maxAge) {
        gb.active = false;
        _m4.makeScale(0, 0, 0);
        this.gibMesh.setMatrixAt(i, _m4);
        gibDirty = true;
        continue;
      }
      const floor = gb.groundY + 0.07 * gb.scale;
      if (gb.y > floor || Math.abs(gb.vy) > 0.25 || Math.hypot(gb.vx, gb.vz) > 0.15) {
        gb.vy -= 16.5 * dt;
        gb.x += gb.vx * dt;
        gb.y += gb.vy * dt;
        gb.z += gb.vz * dt;
        gb.rx += gb.vrx * dt;
        gb.ry += gb.vry * dt;
        if (gb.y <= floor) {
          gb.y = floor;
          if (gb.vy < -2.2) {
            this.bloodPuddle(gb.x, gb.groundY, gb.z, 0.36);
          }
          gb.vy = Math.abs(gb.vy) > 1.2 ? -gb.vy * 0.34 : 0;
          gb.vx *= 0.56;
          gb.vz *= 0.56;
          gb.vrx *= 0.55;
          gb.vry *= 0.55;
        }
        _e.set(gb.rx, gb.ry, gb.rz);
        _q.setFromEuler(_e);
        _v.set(gb.x, gb.y, gb.z);
        _s.set(gb.scale * 1.25, gb.scale * 0.72, gb.scale * 0.92);
        _m4.compose(_v, _q, _s);
        this.gibMesh.setMatrixAt(i, _m4);
        gibDirty = true;
      }
    }
    if (gibDirty) this.gibMesh.instanceMatrix.needsUpdate = true;
  }
}

