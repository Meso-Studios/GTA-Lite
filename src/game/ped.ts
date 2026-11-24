// Pedestrian entity: sidewalk navigation, panic, combat AI and ragdoll.
import * as THREE from 'three';
import { CORNER, NB, applySandFootPhysics, clamp, dampAngle, isMeleeWeapon, nearestNode, redRemaining, roadLine, sandFactorAt, signalState } from './config';
import { AnimIn, GunKind, HumanRig, Look, Ragdoll, animateHuman, createHuman, muzzleWorld, setWeapon } from './humans';
import { computeRagdollImpulse } from './physics';
import { createFreeCityBrain, stepFreeCityNpc, type FreeCityArchetype, type FreeCityBrain, type FreeCityContext } from './freeCityNpc';
import type { Game } from './Game';
import type { PushOut } from './world';

export type PedKind = 'civ' | 'tourist' | 'cop' | 'gang' | 'guard' | 'target' | 'ally';
type Node4 = [number, number, number, number];
type State = 'walk' | 'wait' | 'flee' | 'idle' | 'attack' | 'guard' | 'cower' | 'crowd_stroll' | 'photo';
const _po: PushOut = { x: 0, z: 0, nx: 0, nz: 0, hit: false, depth: 0 };
const _v = new THREE.Vector3();

export function cornerPos(n: Node4): [number, number] {
  return [roadLine(n[0]) + n[2] * CORNER, roadLine(n[1]) + n[3] * CORNER];
}

export class Ped {
  static nid = 1;
  id = Ped.nid++;
  kind: PedKind;
  rig: HumanRig;
  x = 0; z = 0; y = 0; yaw = 0; vx = 0; vz = 0;
  hp = 40; maxHp = 40;
  dead = false;
  state: State = 'walk';
  cur: Node4 = [0, 0, 1, 1];
  prev: Node4 | null = null;
  to: Node4 = [0, 0, 1, 1];
  tx = 0; tz = 0;
  lat = 0;
  wait = 0;
  speed = 1.5;
  crossing = 0;
  panicT = 0;
  threatX = 0; threatZ = 0;
  hostile = false;
  weapon: GunKind | null = null;
  fireT = 0;
  aggro = false;
  sight = 35;
  dmg = 6;
  accuracy = 1;
  rvx = 0; rvy = 0; rvz = 0; spin = 0; rotX = 0; restX = -Math.PI / 2; landed = false; deadT = 0;
  tag = '';
  mission = false;
  handsUp = 0;
  idleT = 0;
  strafe = 1;
  strafeT = 0;
  punchT = 0;
  despawnT = 0;
  inCarOwner: number | null = null;
  followPlayer = false;
  wasKilledByPlayer = false;
  rag: Ragdoll | null = null;
  indoor = false;
  indoorRole: 'clerk' | 'customer' | 'guard' | 'queue' | 'seated' | 'server' | null = null;
  indoorHomeX = 0;
  indoorHomeZ = 0;
  indoorBaseYaw = 0;
  recruited = false;
  formation = 0;
  followT = 0;
  shootT = 0;
  target: Ped | null = null;
  crowdHome: { x: number; z: number; r: number } | null = null;
  photoT = 0;
  sandPuffT = 0;
  flinchT = 0;
  speakingT = 0;
  freeCity: FreeCityBrain | null = null;
  freeCityLastHint: string | null = null;

  constructor(kind: PedKind, look: Look) {
    this.kind = kind;
    this.rig = createHuman(look);
    this.rig.kindHint = kind;
    this.speed = 1.25 + Math.random() * 0.5;
    this.lat = (Math.random() - 0.5) * 2.2;
    if (kind === 'civ' || kind === 'tourist' || kind === 'guard') {
      this.freeCity = createFreeCityBrain(this.id * 13 + 7, kind);
    }
  }

  setFreeCityArchetype(arch: FreeCityArchetype) {
    this.freeCity = createFreeCityBrain(this.id * 13 + 7, this.kind, arch);
    this.rig.kindHint = arch === 'guy' ? 'guy' : this.kind;
  }

  get group() { return this.rig.root; }

  arm(kind: GunKind | null) {
    this.weapon = kind;
    setWeapon(this.rig, kind);
  }

  place(x: number, z: number) {
    this.x = x; this.z = z;
    this.rig.root.position.set(x, 0, z);
  }

  /** begin walking from a corner node */
  startNav(g: Game, n: Node4) {
    this.cur = n;
    this.prev = null;
    const [x, z] = cornerPos(n);
    this.place(x, z);
    this.pickNext(g);
  }

  /** spawn as a tourist or beachgoer strolling around a scenic crowd zone */
  startCrowd(x: number, z: number, homeX: number, homeZ: number, r: number) {
    this.crowdHome = { x: homeX, z: homeZ, r };
    this.place(x, z);
    this.speed = 1.05 + Math.random() * 0.45;
    this.pickCrowdTarget();
  }

  pickCrowdTarget() {
    if (!this.crowdHome) return;
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * this.crowdHome.r * 0.9;
    this.tx = this.crowdHome.x + Math.cos(a) * d;
    this.tz = this.crowdHome.z + Math.sin(a) * d;
    this.state = 'crowd_stroll';
  }

  nearestCorner(): Node4 {
    const [k, l] = nearestNode(this.x, this.z);
    const sx = this.x - roadLine(k) >= 0 ? 1 : -1;
    const sz = this.z - roadLine(l) >= 0 ? 1 : -1;
    return [k, l, sx, sz];
  }

  pickNext(g: Game) {
    const [k, l, sx, sz] = this.cur;
    const opts: { to: Node4; w: number; cross: number }[] = [];
    if (k + sx >= 0 && k + sx <= NB) opts.push({ to: [k + sx, l, -sx, sz], w: 2.5, cross: 0 });
    if (l + sz >= 0 && l + sz <= NB) opts.push({ to: [k, l + sz, sx, -sz], w: 2.5, cross: 0 });
    opts.push({ to: [k, l, sx, -sz], w: 1.5, cross: 1 }, { to: [k, l, -sx, sz], w: 1.5, cross: 2 });
    const p = this.prev;
    const list = opts.filter((o) => !(p && o.to[0] === p[0] && o.to[1] === p[1] && o.to[2] === p[2] && o.to[3] === p[3]));
    let tot = 0;
    for (const o of list) tot += o.w;
    let r = Math.random() * tot;
    let pick = list[0] ?? opts[0];
    for (const o of list) { r -= o.w; if (r <= 0) { pick = o; break; } }
    // crossing safety
    if (pick.cross) {
      const axis = pick.cross === 1 ? 0 : 1;
      const jay = Math.random() < 0.12;
      if (!jay && !(signalState(k, l, axis as 0 | 1, g.time) === 2 && redRemaining(k, l, axis as 0 | 1, g.time) > 7)) {
        // wait at the curb and try again
        this.state = 'wait';
        this.wait = 0.6 + Math.random() * 0.8;
        this.pendingPick = pick;
        return;
      }
    }
    this.commit(pick.to, pick.cross);
  }
  pendingPick: { to: Node4; cross: number } | null = null;
  commit(to: Node4, cross: number) {
    this.prev = this.cur;
    this.to = to;
    this.crossing = cross;
    const [fx, fz] = cornerPos(this.cur);
    const [tx, tz] = cornerPos(to);
    const dx = tx - fx, dz = tz - fz;
    const l = Math.hypot(dx, dz) || 1;
    const px = -dz / l, pz = dx / l;
    const lat = cross ? clamp(this.lat, -1, 1) : this.lat;
    this.tx = tx + px * lat; this.tz = tz + pz * lat;
    this.state = 'walk';
    this.pendingPick = null;
    this.speed = cross ? 2.0 + Math.random() * 0.6 : 1.2 + Math.random() * 0.6;
  }

  flee(g: Game, fx: number, fz: number, dur = 8) {
    if (this.dead || this.hostile) return;
    if (this.indoor) { this.handsUp = Math.max(this.handsUp, dur * 0.6); return; }
    this.state = 'flee';
    this.panicT = dur;
    this.threatX = fx; this.threatZ = fz;
    void g;
  }

  /** applies damage; returns true if died */
  hit(
    g: Game,
    dmg: number,
    dx: number,
    dz: number,
    byPlayer: boolean,
    headshot = false,
    opts?: { shotgun?: boolean; explosive?: boolean; katana?: boolean },
  ): boolean {
    if (this.dead) return false;
    const effDmg = dmg * (headshot ? 2.5 : 1);
    this.hp -= effDmg;
    this.flinchT = 0.28;
    if (byPlayer) {
      if (this.kind === 'civ' || this.kind === 'tourist') g.crime(1, 'assault');
      else if (this.kind === 'cop') g.crime(2, 'assault');
      if (this.hostile) { this.aggro = true; g.alertAround(this, 28); }
    }
    const groundY = g.groundAt(this.x, this.z);
    const hitY = this.y + (headshot ? 1.62 : 1.18);
    // Check for a nearby wall behind the victim along the exit vector for realistic vertical wall blood splatter
    const dLen = Math.hypot(dx, dz) || 1;
    const ux = dx / dLen, uz = dz / dLen;
    let wallHit: { x: number; y: number; z: number; nx: number; nz: number } | null = null;
    const wt = g.world.ray(this.x, hitY, this.z, ux, 0, uz, 4.5, 0.35);
    if (wt > 0.15 && wt < 4.4) {
      wallHit = { x: this.x + ux * (wt - 0.04), y: hitY, z: this.z + uz * (wt - 0.04), nx: -ux, nz: -uz };
    }
    g.fx.bloodBurst(
      this.x,
      hitY,
      this.z,
      dx,
      headshot ? 0.35 : 0.15,
      dz,
      effDmg,
      headshot,
      !!opts?.explosive,
      !!opts?.shotgun || !!opts?.katana,
      groundY,
      wallHit,
    );
    if (this.hp <= 0) {
      const imp = computeRagdollImpulse(dx, dz, effDmg, headshot, !!opts?.explosive);
      this.kill(g, imp.vx, imp.vy, imp.vz, byPlayer, imp.headWhip);
      return true;
    }
    if (!this.hostile) this.flee(g, this.x - dx * 5, this.z - dz * 5, 10);
    return false;
  }

  kill(g: Game, vx: number, vy: number, vz: number, byPlayer: boolean, headWhip = 1.0) {
    if (this.dead) return;
    this.dead = true;
    this.wasKilledByPlayer = byPlayer;
    this.state = 'idle';
    this.rvx = vx; this.rvy = vy; this.rvz = vz;
    this.spin = (Math.random() - 0.5) * 12 + (vy > 5 ? 6 : 0);
    this.restX = Math.random() < 0.5 ? -Math.PI / 2 : Math.PI / 2;
    this.landed = false;
    this.rotX = 0;
    this.deadT = 0;
    const dx = vx, dz = vz;
    this.rag = new Ragdoll(this.rig, Math.min(1.25, Math.hypot(vx, vz) * 0.16 + 0.35), dx, vy * 0.55, dz, headWhip);
    this.rig.hips.position.y = 0;
    const gh = g.groundAt(this.x, this.z);
    g.fx.bloodPuddle(this.x, gh, this.z, headWhip > 2 ? 1.35 : 0.95);
    if (this.tag === 'playerbody') return;
    if (byPlayer) {
      if (this.kind === 'civ' || this.kind === 'tourist') g.crime(1, 'murder');
      if (this.kind === 'cop') g.crime(3, 'cop-kill');
    }
    if ((this.kind === 'civ' || this.kind === 'tourist') && Math.random() < 0.65) g.spawnPickup('cash', this.x, this.z, Math.floor(15 + Math.random() * 190));
    if (this.kind === 'gang' || this.kind === 'guard' || this.kind === 'target') g.spawnPickup('cash', this.x, this.z, Math.floor(50 + Math.random() * 250));
    if (this.kind === 'cop' && Math.random() < 0.4) g.spawnPickup('armor', this.x, this.z, 25);
    g.onPedKilled(this, byPlayer);
    if (this.rig.weapon) {
      // drop the gun visually
      this.rig.handR.remove(this.rig.weapon);
      this.rig.weapon = null; this.rig.weaponKind = null;
    }
  }

  knock(g: Game, vx: number, vz: number, dmg: number, byPlayer: boolean) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flinchT = 0.35;
    const sp = Math.hypot(vx, vz);
    const groundY = g.groundAt(this.x, this.z);
    g.fx.bloodBurst(this.x, this.y + 1.0, this.z, vx, 1.5, vz, dmg * 1.4, false, sp > 22, sp > 14, groundY);
    if (byPlayer) {
      if (this.kind === 'civ' || this.kind === 'tourist') g.crime(1, 'roadkill');
      else if (this.kind === 'cop') g.crime(2, 'roadkill');
    }
    if (this.hp <= 0 || dmg > 20) {
      this.hp = Math.min(this.hp, 0);
      this.kill(g, vx * 1.15, 4.2 + Math.min(6.5, sp * 0.25), vz * 1.15, byPlayer, sp > 18 ? 3.2 : 1.5);
    } else this.flee(g, this.x - vx, this.z - vz, 8);
  }

  // ------------------------------------------------------------------ update
  update(dt: number, g: Game) {
    if (this.dead) { this.ragdoll(dt, g); return; }
    if (this.flinchT > 0) this.flinchT = Math.max(0, this.flinchT - dt);
    if (this.speakingT > 0) this.speakingT = Math.max(0, this.speakingT - dt);
    if (this.kind === 'ally') { this.allyUpdate(dt, g); return; }
    const px = g.playerX, pz = g.playerZ;
    const dxp = px - this.x, dzp = pz - this.z;
    const dp = Math.hypot(dxp, dzp);
    let moveSpeed = 0;
    let faceYaw: number | null = null;

    if (this.handsUp > 0) {
      this.handsUp -= dt;
      this.rig.phase += dt;
      this.animate(dt, 0, true);
      if (this.handsUp <= 0) this.flee(g, px, pz, 8);
      this.finish(g);
      return;
    }

    // hostile behaviour
    if (this.hostile) {
      if (this.kind === 'cop') {
        this.aggro = g.wanted > 0;
        if (!this.aggro) {
          this.despawnT += dt;
        } else this.despawnT = 0;
      } else if (!this.aggro && dp < this.sight && g.playerAlive) {
        const los = g.world.los(this.x, 1.5, this.z, px, 1.4, pz);
        if (los && (dp < this.sight * 0.6 || !g.playerOnFoot || g.playerFiring)) { this.aggro = true; g.alertAround(this, 25); }
      }
      if (this.aggro && g.playerAlive) {
        this.state = 'attack';
        const range = this.kind === 'cop' ? 15 : 17;
        const los = g.world.los(this.x, 1.5, this.z, px, 1.4, pz);
        faceYaw = Math.atan2(dxp, dzp);
        if (dp > range || !los) {
          moveSpeed = 5.3;
          const dir = Math.atan2(dxp, dzp);
          this.moveDir(Math.sin(dir), Math.cos(dir), moveSpeed, dt);
        } else {
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = 1 + Math.random() * 1.5; }
          const sx = Math.cos(faceYaw) * this.strafe, sz = -Math.sin(faceYaw) * this.strafe;
          moveSpeed = dp < 7 ? -2.2 : 1.6;
          if (dp < 7) this.moveDir(-Math.sin(faceYaw), -Math.cos(faceYaw), 2.2, dt);
          else this.moveDir(sx, sz, 1.6, dt);
        }
        this.fireT -= dt;
        if (los && dp < 60 && this.fireT <= 0 && this.weapon) {
          this.fireT = 0.45 + Math.random() * 0.6;
          g.npcShoot(this, this.accuracy);
        }
        this.yaw = dampAngle(this.yaw, faceYaw, 12, dt);
        this.animate(dt, Math.abs(moveSpeed), false, 1);
        this.finish(g);
        return;
      }
      // guard idle
      this.state = 'guard';
      this.vx *= 0.8; this.vz *= 0.8;
      this.animate(dt, 0, false, 0);
      this.finish(g);
      return;
    }

    // Specialized indoor customer / wait-line / seated diner / clerk behavior
    if (this.indoor && !this.hostile) {
      this.vx *= 0.75;
      this.vz *= 0.75;
      if (this.indoorRole === 'seated') {
        this.x = this.indoorHomeX;
        this.z = this.indoorHomeZ;
        const lookYaw = this.indoorBaseYaw + Math.sin(g.time * 0.45 + this.id * 1.9) * 0.14;
        this.yaw = dampAngle(this.yaw, lookYaw, 4, dt);
        this.animate(dt, 0, false, 0, false);
        this.finish(g);
        return;
      }
      if (this.indoorRole === 'queue') {
        // Patient wait-line stance: subtle organic glance toward menu/counter without breaking line
        const swayYaw = this.indoorBaseYaw + Math.sin(g.time * 0.55 + this.id * 2.3) * 0.16;
        this.yaw = dampAngle(this.yaw, swayYaw, 3.5, dt);
        this.animate(dt, 0, false, 0, false);
        this.finish(g);
        return;
      }
      if (this.indoorRole === 'clerk' || this.indoorRole === 'server') {
        const lookTarget = dp < 4.5 && Math.abs(g.player.y - this.y) < 1.5
          ? Math.atan2(dxp, dzp)
          : this.indoorBaseYaw + Math.sin(g.time * 0.4 + this.id) * 0.18;
        this.yaw = dampAngle(this.yaw, lookTarget, 4.5, dt);
        this.animate(dt, 0, false, 0, false);
        this.finish(g);
        return;
      }
    }

    // FREE CITY non-AI algorithmic utility routine (zero LLM — pure routine, pair chat, ride admiration & Tuesday reaction)
    let fcStop = false;
    let fcSpeedMul = 1.0;
    let fcFaceYaw: number | null = null;
    let fcPhoto = false;

    if (this.freeCity && !this.indoor && this.state !== 'flee' && this.state !== 'wait') {
      let nearbyPartner: FreeCityContext['nearbyPartner'] = null;
      let bestPartnerD = 4.8;
      for (const o of g.peds) {
        if (o === this || o.dead || o.hostile || o.indoor) continue;
        const d = Math.hypot(o.x - this.x, o.z - this.z);
        if (d < bestPartnerD) {
          bestPartnerD = d;
          nearbyPartner = { id: o.id, x: o.x, z: o.z, distance: d };
        }
      }
      let nearbyExotic: FreeCityContext['nearbyExotic'] = null;
      let bestVehD = 16.0;
      for (const v of g.vehicles) {
        if (v.type !== 'sports' && !v.spec.isAircraft) continue;
        const d = Math.hypot(v.x - this.x, v.z - this.z);
        if (d < bestVehD) {
          bestVehD = d;
          nearbyExotic = { x: v.x, z: v.z, distance: d, isAircraft: Boolean(v.spec.isAircraft) };
        }
      }
      let nearbyStoreDoor: FreeCityContext['nearbyStoreDoor'] = null;
      let bestDoorD = 11.0;
      for (const dr of g.city.doors) {
        const d = Math.hypot(dr.x - this.x, dr.z - this.z);
        if (d < bestDoorD) {
          bestDoorD = d;
          nearbyStoreDoor = { x: dr.x, z: dr.z, name: dr.name, distance: d };
        }
      }
      const playerArmed = !isMeleeWeapon(g.player.weapon) && (g.player.ammo[g.player.weapon] ?? 0) > 0;
      const fc = stepFreeCityNpc(
        this.freeCity,
        {
          hour: g.hour,
          selfId: this.id,
          selfX: this.x,
          selfZ: this.z,
          selfYaw: this.yaw,
          playerX: px,
          playerZ: pz,
          playerArmed,
          playerAimingNear: playerArmed && (g.input.aim || g.touch.aim || g.playerFiring) && dp < 18,
          nearbyPartner,
          nearbyExotic,
          nearbyStoreDoor,
          nearbyDanger: g.wanted >= 2 && dp < 20,
        },
        dt,
      );
      if (fc.ambientLineHint) this.freeCityLastHint = fc.ambientLineHint;
      if (fc.raiseHands) {
        this.handsUp = Math.max(this.handsUp, 0.45);
        this.vx *= 0.7;
        this.vz *= 0.7;
        if (fc.faceYaw !== null) this.yaw = dampAngle(this.yaw, fc.faceYaw, 10, dt);
        this.animate(dt, 0, true, 0, false);
        this.finish(g);
        return;
      }
      fcStop = fc.shouldStop;
      fcSpeedMul = fc.desiredSpeedMul;
      fcFaceYaw = fc.faceYaw;
      fcPhoto = fc.photoPose;
    }

    switch (this.state) {
      case 'flee': {
        this.panicT -= dt;
        let ax = this.x - this.threatX, az = this.z - this.threatZ;
        const l = Math.hypot(ax, az) || 1;
        ax /= l; az /= l;
        this.moveDir(ax, az, 5.6, dt);
        moveSpeed = 5.6;
        if (this.panicT <= 0) {
          if (this.crowdHome) this.pickCrowdTarget();
          else {
            this.state = 'walk';
            this.cur = this.nearestCorner();
            this.prev = null;
            this.pickNext(g);
          }
        }
        break;
      }
      case 'wait': {
        this.wait -= dt;
        this.vx *= 0.8; this.vz *= 0.8;
        if (this.wait <= 0) {
          if (this.pendingPick) this.pickNext(g);
          else this.pickNext(g);
        }
        break;
      }
      case 'idle': {
        this.idleT -= dt;
        this.vx *= 0.8; this.vz *= 0.8;
        if (this.idleT <= 0) {
          if (this.crowdHome) this.pickCrowdTarget();
          else this.pickNext(g);
        }
        break;
      }
      case 'photo': {
        this.photoT -= dt;
        this.vx *= 0.78; this.vz *= 0.78;
        if (this.photoT <= 0) {
          if (this.crowdHome) this.pickCrowdTarget();
          else this.pickNext(g);
        }
        break;
      }
      case 'crowd_stroll': {
        if (fcStop) {
          this.vx *= 0.78; this.vz *= 0.78;
          break;
        }
        const dx = this.tx - this.x, dz = this.tz - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.3) {
          if (Math.random() < 0.45) {
            this.state = 'photo';
            this.photoT = 2.6 + Math.random() * 4.2;
            // Face ocean / skyline when taking sightseeing photo
            this.yaw = this.z > 520 ? Math.PI * 0.05 + (Math.random() - 0.5) * 0.6 : Math.random() * Math.PI * 2;
          } else {
            this.state = 'idle';
            this.idleT = 1.8 + Math.random() * 3.5;
          }
        } else {
          this.moveDir(dx / d, dz / d, this.speed * fcSpeedMul, dt);
          moveSpeed = this.speed * fcSpeedMul;
        }
        break;
      }
      case 'walk': {
        if (fcStop) {
          this.vx *= 0.78; this.vz *= 0.78;
          break;
        }
        const dx = this.tx - this.x, dz = this.tz - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.1) {
          this.cur = this.to;
          if (this.kind === 'tourist' && Math.random() < 0.22) {
            this.state = 'photo';
            this.photoT = 2.2 + Math.random() * 3.2;
          } else if (Math.random() < 0.06) { this.state = 'idle'; this.idleT = 2 + Math.random() * 5; }
          else this.pickNext(g);
        } else {
          this.moveDir(dx / d, dz / d, this.speed * fcSpeedMul, dt);
          moveSpeed = this.speed * fcSpeedMul;
        }
        break;
      }
      default: break;
    }
    if (fcFaceYaw !== null && (fcStop || Math.hypot(this.vx, this.vz) < 0.35)) {
      this.yaw = dampAngle(this.yaw, fcFaceYaw, 6, dt);
    }
    this.animate(
      dt,
      Math.hypot(this.vx, this.vz),
      this.state === 'flee' && this.panicT > 0 && (this.kind === 'civ' || this.kind === 'tourist') && Math.sin(this.id) > 0.2,
      0,
      this.state === 'photo' || fcPhoto,
    );
    this.finish(g);
  }

  moveDir(dx: number, dz: number, speed: number, dt: number) {
    const k = 1 - Math.exp(-9 * dt);
    this.vx += (dx * speed - this.vx) * k;
    this.vz += (dz * speed - this.vz) * k;
    if (this.state !== 'attack') {
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(this.vx, this.vz), 10, dt);
    }
  }

  animate(dt: number, speed: number, panic: boolean, aim = 0, photo = false) {
    const a: AnimIn = {
      mode: this.indoor && this.indoorRole === 'seated' && !panic && this.handsUp <= 0 ? 'sit' : 'stand',
      speed,
      aim,
      aimPitch: 0,
      punch: 0,
      panic: panic || this.handsUp > 0,
      photo,
      flinch: this.flinchT > 0 ? this.flinchT / 0.28 : 0,
      speaking: this.speakingT > 0,
      onSand: !this.indoor && sandFactorAt(this.x, this.z, this.y) > 0.15,
      isTourist: this.kind === 'tourist',
    };
    animateHuman(this.rig, dt, a);
  }

  finish(g: Game) {
    const sp = Math.hypot(this.vx, this.vz);
    const sf = this.indoor ? 0 : sandFactorAt(this.x, this.z, this.y);
    const sand = applySandFootPhysics(sp, sf);
    this.x += this.vx * sand.speedMul * g.dt;
    this.z += this.vz * sand.speedMul * g.dt;
    if (sand.puffRate > 0.5) {
      this.sandPuffT -= g.dt;
      if (this.sandPuffT <= 0) {
        this.sandPuffT = 0.25 + Math.random() * 0.2;
        g.fx.sandSpray(this.x, this.y, this.z, -this.vx * 0.15, -this.vz * 0.15, 0.32);
      }
    }
    if (!(this.indoor && this.indoorRole === 'seated')) {
      g.world.resolve(this.x, this.z, 0.32, this.y, _po);
      if (_po.hit) { this.x = _po.x; this.z = _po.z; }
    }
    const gh = g.groundAt(this.x, this.z, this.y);
    this.y += (gh - sand.sinkY - this.y) * Math.min(1, g.dt * 14);
    const r = this.rig.root;
    r.position.set(this.x, this.y, this.z);
    r.rotation.set(0, this.yaw, 0);
    const dCam = Math.hypot(this.x - g.camX, this.z - g.camZ);
    const maxDist = g.isSoftwareGl ? 68 : 135;
    r.visible = (!g.interior || this.indoor) && (this.indoor || this.mission || dCam < 18 || (dCam < maxDist && g.inView(this.x, this.z, 2.4)));
  }

  ragdoll(dt: number, g: Game) {
    this.deadT += dt;
    const gh = g.groundAt(this.x, this.z);
    if (this.rag) {
      this.rag.gy = gh;
      if (this.rag.active) {
        this.rag.update(
          dt,
          g.world,
          (ix, iy, iz, impSp, nx, nz) => {
            g.fx.blood(ix, iy + 0.15, iz, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4);
            if (nx !== undefined && nz !== undefined) {
              g.fx.bloodSplatter(ix, iy, iz, -nx * impSp, -1.5, -nz * impSp, nx, 0, nz);
            } else {
              g.fx.bloodPuddle(ix, g.groundAt(ix, iz), iz, clamp(0.48 + impSp * 0.1, 0.48, 1.45));
            }
          },
          (sx, sy, sz, vx, vz) => {
            g.fx.bloodSmear(sx, sy, sz, vx, vz);
          },
        );
        // keep collision roughly in sync for world edges
        this.x = this.rag.parts[2].p.x;
        this.z = this.rag.parts[2].p.z;
        this.y = this.rag.parts[2].p.y;
      }
      // subtle settle twitch
      if (this.rag.settled && this.deadT < 4) {
        const tw = Math.sin(this.deadT * 9) * Math.exp(-this.deadT * 1.6) * 0.05;
        this.rag.parts[3].p.x += tw; this.rag.parts[4].p.x -= tw;
        this.rag.apply();
      }
    }
    const r = this.rig.root;
    const dCam = Math.hypot(this.x - g.camX, this.z - g.camZ);
    const maxDist = g.isSoftwareGl ? 68 : 120;
    r.visible = (!g.interior || this.indoor) && (this.indoor || this.mission || dCam < 18 || (dCam < maxDist && g.inView(this.x, this.z, 2.4)));
    this.rig.phase += dt;
  }

  // ------------------------------------------------------------------ allies
  allyUpdate(dt: number, g: Game) {
    if (g.interior) { this.vx *= 0.8; this.vz *= 0.8; this.animate(dt, 0, false, 0.2); this.finish(g); return; }
    if (!this.recruited) {
      this.vx *= 0.8; this.vz *= 0.8;
      const d = Math.hypot(g.playerX - this.x, g.playerZ - this.z);
      if (d < 9) this.yaw = dampAngle(this.yaw, Math.atan2(g.playerX - this.x, g.playerZ - this.z), 5, dt);
      this.animate(dt, 0, false, this.recruited ? 0.7 : 0);
      this.finish(g);
      return;
    }
    // acquire target
    this.target = null;
    let best = 30;
    for (const p of g.peds) {
      if (p === this || p.dead || !p.hostile) continue;
      if (p.kind === 'cop' && g.wanted === 0 && !p.aggro) continue;
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d > best) continue;
      if (!g.world.los(this.x, 1.5, this.z, p.x, 1.3, p.z)) continue;
      best = d; this.target = p;
    }
    const dx = g.playerX - this.x, dz = g.playerZ - this.z;
    const dp = Math.hypot(dx, dz) || 1;
    const angle = Math.atan2(this.vx, this.vz);
    void angle;
    if (this.target) {
      const t = this.target;
      const face = Math.atan2(t.x - this.x, t.z - this.z);
      this.yaw = dampAngle(this.yaw, face, 12, dt);
      const want = 9 + this.formation * 1.5;
      if (best > want + 2) this.moveDir(Math.sin(face), Math.cos(face), 5.2, dt);
      else if (best < want - 3) this.moveDir(-Math.sin(face), -Math.cos(face), 3.4, dt);
      else {
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = 1.4 + Math.random(); }
        this.moveDir(Math.cos(face) * this.strafe, -Math.sin(face) * this.strafe, 1.7, dt);
      }
      this.shootT -= dt;
      if (this.shootT <= 0) {
        this.shootT = 0.62 + Math.random() * 0.5;
        g.allyShoot(this, t);
      }
      this.animate(dt, Math.hypot(this.vx, this.vz), false, 1);
    } else {
      // formation behind the player
      const fx = Math.sin(g.camYaw), fz = Math.cos(g.camYaw);
      const rx = -fz, rz = fx;
      const side = this.formation % 2 === 0 ? 1 : -1;
      const ox = -fx * (2.2 + this.formation * 0.4) + rx * side * 2.2;
      const oz = -fz * (2.2 + this.formation * 0.4) + rz * side * 2.2;
      const tx = g.playerX + ox, tz = g.playerZ + oz;
      const ddx = tx - this.x, ddz = tz - this.z;
      const dd = Math.hypot(ddx, ddz);
      if (dd > 1.1) {
        this.moveDir(ddx / dd, ddz / dd, dd > 12 ? 6.4 : 3.6, dt);
        this.animate(dt, Math.hypot(this.vx, this.vz), false, 0.25);
      } else {
        this.vx *= 0.8; this.vz *= 0.8;
        this.yaw = dampAngle(this.yaw, this.followT > 0 ? this.yaw : g.camYaw, 3, dt);
        this.animate(dt, 0, false, 0.2);
      }
      if (dp > 40) {
        // teleport stragglers back to the player
        this.x = g.playerX + ox; this.z = g.playerZ + oz;
      }
    }
    this.finish(g);
  }

  muzzle(out: THREE.Vector3) {
    return this.rig.weapon ? muzzleWorld(this.rig, out) : out.set(this.x, 1.4, this.z);
  }
  dispose(g: Game) {
    g.scene.remove(this.rig.root);
  }
}
void _v;
