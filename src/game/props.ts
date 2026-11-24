// Dynamic physics props (cones, barrels, bins, crates, debris) and collectible pickups.
import * as THREE from 'three';
import { clamp, groundHeight } from './config';
import { gunMesh } from './humans';
import { clonePropGlb, cloneWeaponPickupGlb, isGlbWorldMode, type PropGlbKey } from './glbAssets';
import type { Game } from './Game';
import type { PushOut } from './world';
import type { Vehicle } from './vehicle';

export type PropKind = 'cone' | 'barrel' | 'xbarrel' | 'bin' | 'crate' | 'debris';
const _po: PushOut = { x: 0, z: 0, nx: 0, nz: 0, hit: false, depth: 0 };

const geos: Record<string, THREE.BufferGeometry> = {};
const mats: Record<string, THREE.Material> = {};
function G(k: string, f: () => THREE.BufferGeometry) {
  return geos[k] ?? (geos[k] = f());
}
function M(k: string, f: () => THREE.Material) {
  return mats[k] ?? (mats[k] = f());
}

interface Def { r: number; hh: number; mass: number; hp: number }
const DEFS: Record<PropKind, Def> = {
  cone: { r: 0.25, hh: 0.4, mass: 1, hp: 999 },
  barrel: { r: 0.36, hh: 0.5, mass: 6, hp: 999 },
  xbarrel: { r: 0.36, hh: 0.5, mass: 6, hp: 30 },
  bin: { r: 0.32, hh: 0.45, mass: 3, hp: 999 },
  crate: { r: 0.6, hh: 0.55, mass: 10, hp: 999 },
  debris: { r: 0.3, hh: 0.2, mass: 2, hp: 999 },
};

export class Prop {
  mesh: THREE.Group;
  private procMesh: THREE.Mesh;
  private glbVisual: THREE.Group | null = null;
  kind: PropKind;
  def: Def;
  x: number; y: number; z: number;
  vx = 0; vy = 0; vz = 0;
  rx = 0; rz = 0; ry = 0;
  wx = 0; wz = 0;
  awake = false;
  hp: number;
  life = -1;
  expired = false;
  settle = 0;
  exploded = false;

  constructor(kind: PropKind, x: number, z: number, scale = 1) {
    this.kind = kind;
    this.def = DEFS[kind];
    this.hp = this.def.hp;
    let geo: THREE.BufferGeometry, mat: THREE.Material;
    switch (kind) {
      case 'cone':
        geo = G('cone', () => new THREE.ConeGeometry(0.22, 0.8, 12).translate(0, 0.4, 0));
        mat = M('cone', () => new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }));
        break;
      case 'barrel':
      case 'xbarrel':
        geo = G('barrel', () => new THREE.CylinderGeometry(0.36, 0.36, 1, 14).translate(0, 0.5, 0));
        mat = M(kind, () => new THREE.MeshStandardMaterial({ color: kind === 'xbarrel' ? 0xc0201a : 0x2a5a8a, roughness: 0.5, metalness: 0.4 }));
        break;
      case 'bin':
        geo = G('bin', () => new THREE.CylinderGeometry(0.34, 0.28, 0.9, 10).translate(0, 0.45, 0));
        mat = M('bin', () => new THREE.MeshStandardMaterial({ color: 0x3f6b4f, roughness: 0.7, metalness: 0.3 }));
        break;
      case 'crate':
        geo = G('crate', () => new THREE.BoxGeometry(1.1, 1.1, 1.1).translate(0, 0.55, 0));
        mat = M('crate', () => new THREE.MeshStandardMaterial({ color: 0x9a6b3a, roughness: 0.9 }));
        break;
      default:
        geo = G('debris', () => new THREE.BoxGeometry(0.6, 0.15, 0.4));
        mat = M('debris', () => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.4 }));
    }
    this.mesh = new THREE.Group();
    this.procMesh = new THREE.Mesh(geo, mat);
    this.procMesh.castShadow = true;
    this.procMesh.receiveShadow = true;
    this.mesh.add(this.procMesh);
    this.mesh.scale.setScalar(scale);
    this.x = x; this.z = z; this.y = 0;
    this.mesh.position.set(x, 0, z);
    this.ry = Math.random() * 6.28;
    this.mesh.rotation.y = this.ry;
    this.setGlbMode(isGlbWorldMode());
  }

  setGlbMode(enabled: boolean): boolean {
    const glbKey: PropGlbKey | null =
      this.kind === 'cone'
        ? 'cone'
        : this.kind === 'crate'
          ? 'crate'
          : this.kind === 'bin'
            ? 'bin'
            : this.kind === 'barrel' || this.kind === 'xbarrel'
              ? 'barrel'
              : null;
    if (!glbKey) {
      this.procMesh.visible = true;
      return false;
    }
    if (enabled) {
      if (!this.glbVisual) {
        const g = clonePropGlb(glbKey);
        if (g) {
          if (this.kind === 'xbarrel') {
            g.traverse((obj) => {
              if ((obj as THREE.Mesh).isMesh) {
                const m = obj as THREE.Mesh;
                const tintHazard = (mat: THREE.Material) => {
                  const cm = mat.clone() as THREE.MeshStandardMaterial;
                  if (cm.color) cm.color.setHex(0xc8241c);
                  return cm;
                };
                m.material = Array.isArray(m.material) ? m.material.map(tintHazard) : tintHazard(m.material);
              }
            });
          }
          this.glbVisual = g;
          this.mesh.add(g);
        }
      }
      if (this.glbVisual) {
        this.glbVisual.visible = true;
        this.procMesh.visible = false;
        return true;
      }
    } else if (this.glbVisual) {
      this.glbVisual.visible = false;
    }
    this.procMesh.visible = true;
    return false;
  }

  impulse(vx: number, vy: number, vz: number, spin = 4) {
    this.vx += vx / Math.max(1, this.def.mass * 0.35); this.vy += vy; this.vz += vz / Math.max(1, this.def.mass * 0.35);
    this.wx += (Math.random() - 0.5) * spin; this.wz += (Math.random() - 0.5) * spin;
    this.awake = true; this.settle = 0;
  }

  update(dt: number, g: Game) {
    if (this.expired || g.interior) {
      this.mesh.visible = false;
      return;
    }
    const dCam = Math.hypot(this.x - g.camX, this.z - g.camZ);
    const maxDist = g.isSoftwareGl ? 62 : 125;
    const vis = this.awake || dCam < 16 || (dCam < maxDist && g.inView(this.x, this.z, 2.5));
    this.mesh.visible = vis;
    if (!vis) return;
    // wake from vehicles
    if (!this.awake) {
      for (const v of g.vehicles) {
        const dx = this.x - v.x, dz = this.z - v.z;
        if (dx * dx + dz * dz > 30) continue;
        const sp = v.speed;
        if (sp < 0.8 && v.mode !== 'player') continue;
        const c = v.circles();
        for (let i = 0; i < c.length; i += 3) {
          const ox = this.x - c[i], oz = this.z - c[i + 1];
          const rr = c[i + 2] + this.def.r;
          const d2 = ox * ox + oz * oz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.01;
            const nx = ox / d, nz = oz / d;
            this.impulse(v.vx * 1.15 + nx * 3, 2.5 + sp * 0.15, v.vz * 1.15 + nz * 3, 8);
            if (this.kind === 'xbarrel' && sp > 9) this.hp -= 40;
            g.audio.hit(0.6);
            break;
          }
        }
        if (this.awake) break;
      }
      if (this.hp <= 0 && !this.exploded) this.blow(g);
      return;
    }
    this.vy -= 16 * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    this.rx += this.wx * dt; this.rz += this.wz * dt;
    const lying = Math.round(this.rx / (Math.PI / 2)) % 2 !== 0 || Math.round(this.rz / (Math.PI / 2)) % 2 !== 0;
    const gy = g.groundAt(this.x, this.z) + (this.kind === 'debris' ? 0.1 : 0);
    const rest = this.settle > 0 ? (lying ? this.def.r : 0) : 0;
    if (this.y <= gy + rest * 0 ) {
      this.y = gy;
      if (this.vy < -2) { this.vy *= -0.3; this.wx *= 0.7; this.wz *= 0.7; this.vx *= 0.8; this.vz *= 0.8; }
      else this.vy = 0;
      const f = Math.exp(-2.2 * dt);
      this.vx *= f; this.vz *= f;
      this.wx *= Math.exp(-3 * dt); this.wz *= Math.exp(-3 * dt);
    }
    g.world.resolve(this.x, this.z, this.def.r, this.y, _po);
    if (_po.hit) {
      this.x = _po.x; this.z = _po.z;
      const vn = this.vx * _po.nx + this.vz * _po.nz;
      if (vn < 0) { this.vx -= 1.6 * vn * _po.nx; this.vz -= 1.6 * vn * _po.nz; }
    }
    const sp = Math.hypot(this.vx, this.vz);
    if (this.y <= gy + 0.01 && sp < 0.35 && Math.abs(this.wx) + Math.abs(this.wz) < 0.8) {
      this.settle += dt;
      if (this.settle > 0.25) {
        // snap to nearest axis-aligned rest orientation
        const qx = Math.round(this.rx / (Math.PI / 2)), qz = Math.round(this.rz / (Math.PI / 2));
        this.rx += (qx * (Math.PI / 2) - this.rx) * 0.3;
        this.rz += (qz * (Math.PI / 2) - this.rz) * 0.3;
        if (Math.abs(qx * (Math.PI / 2) - this.rx) < 0.01 && Math.abs(qz * (Math.PI / 2) - this.rz) < 0.01) {
          this.awake = false; this.vx = this.vz = 0; this.wx = this.wz = 0;
        }
      }
    } else this.settle = 0;
    if (this.life > 0) {
      this.life -= dt;
      if (this.life <= 0) {
        this.expired = true;
        this.mesh.visible = false;
      }
    }
    const tilt = Math.max(Math.abs(Math.sin(this.rx)), Math.abs(Math.sin(this.rz)));
    const lift = this.kind === 'debris' ? 0 : tilt * this.def.r;
    this.mesh.position.set(this.x, this.y + lift, this.z);
    this.mesh.rotation.set(this.rx, this.ry, this.rz, 'YXZ');
    if (this.hp <= 0 && !this.exploded) this.blow(g);
  }

  hurt(g: Game, dmg: number) {
    this.hp -= dmg;
    if (this.hp <= 0 && !this.exploded) this.blow(g);
  }
  blow(g: Game) {
    if (this.kind !== 'xbarrel') return;
    this.exploded = true;
    this.expired = true;
    this.mesh.visible = false;
    this.life = 0;
    g.explode(this.x, 0.6, this.z, 8, 55, null);
  }
}

// ---------------------------------------------------------------------------- pickups
export type PickKind = 'cash' | 'health' | 'armor' | 'weapon' | 'package';
export class Pickup {
  kind: PickKind;
  x: number; z: number;
  baseY: number;
  value: number;
  group: THREE.Group;
  private procVisual: THREE.Object3D | null = null;
  private glbVisual: THREE.Group | null = null;
  taken = false;
  t = Math.random() * 6;
  weapon = '';
  life = -1;
  constructor(kind: PickKind, x: number, z: number, value = 0, weapon = '') {
    this.kind = kind; this.x = x; this.z = z; this.baseY = groundHeight(x, z); this.value = value; this.weapon = weapon;
    const g = new THREE.Group();
    const col = { cash: 0x2ecc71, health: 0xff3b3b, armor: 0x3b82f6, weapon: 0xffd23d, package: 0xff9d2e }[kind];
    if (kind === 'cash') {
      const m = new THREE.Mesh(G('cash', () => new THREE.BoxGeometry(0.5, 0.06, 0.26)), M('cash', () => new THREE.MeshStandardMaterial({ color: 0x3cc46c, emissive: 0x0b5a25, emissiveIntensity: 0.8 })));
      for (let i = 0; i < 3; i++) {
        const c = m.clone();
        c.position.y = i * 0.07;
        c.rotation.y = i * 0.5;
        g.add(c);
      }
    } else if (kind === 'health') {
      const mat = M('health', () => new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xaa0000, emissiveIntensity: 0.9 }));
      const a = new THREE.Mesh(G('hcross1', () => new THREE.BoxGeometry(0.5, 0.16, 0.16)), mat);
      const b = new THREE.Mesh(G('hcross2', () => new THREE.BoxGeometry(0.16, 0.5, 0.16)), mat);
      g.add(a, b);
    } else if (kind === 'armor') {
      const m = new THREE.Mesh(G('armor', () => new THREE.CylinderGeometry(0.34, 0.2, 0.5, 6)), M('armor', () => new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x0a2a8a, emissiveIntensity: 0.9, metalness: 0.5 })));
      g.add(m);
    } else if (kind === 'weapon') {
      const gm = gunMesh((weapon as any) || 'smg');
      gm.scale.setScalar(1.6);
      this.procVisual = gm;
      g.add(gm);
    } else {
      const m = new THREE.Mesh(G('pkg', () => new THREE.BoxGeometry(0.55, 0.55, 0.55)), M('pkg', () => new THREE.MeshStandardMaterial({ color: 0xff9d2e, emissive: 0xff6a00, emissiveIntensity: 1.4, roughness: 0.4 })));
      g.add(m);
      const beam = new THREE.Mesh(
        G('pkgBeam', () => new THREE.CylinderGeometry(0.25, 0.25, 40, 8, 1, true).translate(0, 20, 0)),
        M('pkgBeamM', () => new THREE.MeshBasicMaterial({ color: 0xff9d2e, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
      );
      beam.position.y = -0.9;
      g.add(beam);
    }
    void col;
    g.position.set(x, this.baseY + 0.95, z);
    this.group = g;
    this.setGlbMode(isGlbWorldMode());
  }

  setGlbMode(enabled: boolean): void {
    if (this.kind !== 'weapon' || !this.procVisual) return;
    if (enabled) {
      if (!this.glbVisual) {
        const w = cloneWeaponPickupGlb();
        if (w) {
          w.scale.setScalar(1.3);
          this.glbVisual = w;
          this.group.add(w);
        }
      }
      if (this.glbVisual) {
        this.glbVisual.visible = true;
        this.procVisual.visible = false;
        return;
      }
    } else if (this.glbVisual) {
      this.glbVisual.visible = false;
    }
    this.procVisual.visible = true;
  }

  update(dt: number) {
    this.t += dt;
    this.group.rotation.y = this.t * 1.8;
    this.group.position.y = this.baseY + 0.95 + Math.sin(this.t * 2.4) * 0.12;
    if (this.life > 0) { this.life -= dt; if (this.life <= 0) this.taken = true; }
  }
}

export function vehicleCircleDist(v: Vehicle, x: number, z: number): number {
  const c = v.circles();
  let best = 1e9;
  for (let i = 0; i < c.length; i += 3) best = Math.min(best, Math.hypot(x - c[i], z - c[i + 1]) - c[i + 2]);
  return best;
}
void clamp;


// ---------------------------------------------------------------------------- thrown grenades
const grenGeo = new THREE.SphereGeometry(0.11, 12, 10);
const grenMat = new THREE.MeshStandardMaterial({ color: 0x3f5a32, roughness: 0.55, metalness: 0.35, emissive: 0x0c120a, emissiveIntensity: 1 });
export class Grenade {
  mesh: THREE.Mesh;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  fuse = 2.7;
  done = false;
  t = 0;
  constructor(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    this.mesh = new THREE.Mesh(grenGeo, grenMat);
    this.mesh.castShadow = true;
    this.x = x; this.y = y; this.z = z; this.vx = vx; this.vy = vy; this.vz = vz;
    this.mesh.position.set(x, y, z);
  }
  update(dt: number, g: Game) {
    if (this.done) return;
    this.t += dt;
    this.fuse -= dt;
    this.vy -= 19 * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    const gh = g.groundAt(this.x, this.z, this.y);
    if (this.y < gh + 0.1) {
      this.y = gh + 0.1;
      if (this.vy < -1.5) { this.vy *= -0.42; this.vx *= 0.7; this.vz *= 0.7; g.audio.hit(0.35); }
      else { this.vy = 0; this.vx *= Math.exp(-4 * dt); this.vz *= Math.exp(-4 * dt); }
    }
    g.world.resolve(this.x, this.z, 0.1, this.y, _po);
    if (_po.hit) { this.x = _po.x; this.z = _po.z; this.vx -= 1.5 * (this.vx * _po.nx + this.vz * _po.nz) * _po.nx; }
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.x += this.vx * dt * 2;
    this.mesh.rotation.z += this.vz * dt * 2;
    if (Math.random() < dt * 20) g.fx.smoke(this.x, this.y + 0.1, this.z, 0.25, false);
    if (this.mesh.material instanceof THREE.MeshStandardMaterial) this.mesh.material.emissiveIntensity = this.fuse < 0.7 && Math.floor(this.fuse * 12) % 2 ? 6 : 1;
    if (this.fuse <= 0) { this.done = true; g.explode(this.x, this.y, this.z, 8, 95, null); }
  }
}

// ---------------------------------------------------------------------------- RPG rockets
const rocketBodyGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.56, 8).rotateX(Math.PI / 2);
const rocketMat = new THREE.MeshStandardMaterial({ color: 0x3b4d30, roughness: 0.45, metalness: 0.4, emissive: 0xff6600, emissiveIntensity: 0.5 });

export class Rocket {
  mesh: THREE.Mesh;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life = 4.5;
  done = false;

  constructor(x: number, y: number, z: number, dx: number, dy: number, dz: number, speed = 56) {
    this.mesh = new THREE.Mesh(rocketBodyGeo, rocketMat);
    this.x = x; this.y = y; this.z = z;
    this.vx = dx * speed; this.vy = dy * speed; this.vz = dz * speed;
    this.mesh.position.set(x, y, z);
    this.mesh.lookAt(x + dx, y + dy, z + dz);
  }

  update(dt: number, g: Game) {
    if (this.done) return;
    this.life -= dt;
    this.vy -= 1.8 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this.mesh.position.set(this.x, this.y, this.z);
    g.fx.rocketTrail(this.x, this.y, this.z);

    let hit = this.life <= 0;
    const gh = g.groundAt(this.x, this.z, this.y);
    if (this.y <= gh + 0.15) hit = true;
    if (!hit && g.world.solidAt(this.x, this.y, this.z)) hit = true;
    if (!hit) {
      for (const v of g.vehicles) {
        if (Math.hypot(v.x - this.x, v.z - this.z) < v.spec.L * 0.55 && Math.abs(v.y + 0.9 - this.y) < 1.6) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) {
      for (const p of g.peds) {
        if (!p.dead && Math.hypot(p.x - this.x, p.z - this.z) < 0.9 && Math.abs(p.y + 1.0 - this.y) < 1.2) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      this.done = true;
      g.explode(this.x, Math.max(gh + 0.3, this.y), this.z, 12, 165, null);
    }
  }
}

