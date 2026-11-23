import * as THREE from 'three';
import { Particles } from './particles';
import { makeGlow } from './textures';

interface Tracer { mesh: THREE.Mesh; life: number }

export class FX {
  add: Particles;
  alpha: Particles;
  tracers: Tracer[] = [];
  flash: THREE.PointLight;
  flashI = 0;
  tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.6), toneMapped: false, transparent: true });
  tracerGeo = new THREE.BoxGeometry(0.04, 0.04, 1);

  constructor(scene: THREE.Scene) {
    const glow = makeGlow();
    this.add = new Particles(scene, 900, glow, true);
    this.alpha = new Particles(scene, 900, glow, false);
    this.flash = new THREE.PointLight(0xffaa55, 0, 40, 1.6);
    scene.add(this.flash);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
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
  rocketTrail(x: number, y: number, z: number) {
    this.add.emit(x, y, z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.14, 0.5, -0.3, 2.8, 1.3, 0.25, 0.95, 0, 1);
    this.alpha.emit(x, y, z, (Math.random() - 0.5) * 1.1, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.1, 0.75, 0.42, 2.0, 0.78, 0.76, 0.72, 0.45, -0.2, 0.8);
  }
  blood(x: number, y: number, z: number, dx: number, dz: number) {
    for (let i = 0; i < 7; i++) {
      this.alpha.emit(x, y, z, dx * 2.5 + (Math.random() - 0.5) * 2.5, 1 + Math.random() * 2.5, dz * 2.5 + (Math.random() - 0.5) * 2.5, 0.5 + Math.random() * 0.4, 0.09, 0.05, 0.5, 0.02, 0.02, 0.9, 10, 0.3);
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
  }
}
