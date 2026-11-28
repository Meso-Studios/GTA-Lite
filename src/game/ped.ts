// Pedestrian entity: sidewalk navigation, panic, combat AI and ragdoll.
import * as THREE from 'three';
import { CORNER, NB, applySandFootPhysics, clamp, dampAngle, isMeleeWeapon, nearestNode, redRemaining, roadLine, sandFactorAt, signalState } from './config';
import { AnimIn, GunKind, HumanRig, Look, Ragdoll, animateHuman, createHuman, disposeHumanRig, muzzleWorld, setWeapon } from './humans';
import { computeRagdollImpulse, computeVehiclePedImpact } from './physics';
import { createFreeCityBrain, stepFreeCityNpc, type FreeCityArchetype, type FreeCityBrain, type FreeCityContext } from './freeCityNpc';
import {
  BRAWL_TAUNTS,
  PANIC_SHOUTS,
  type BareHandMove,
  type ViolenceWeaponKind,
  evaluateViolenceReaction,
  shouldNpcFightBack,
} from './subAnimations';
import {
  type GunfightState,
  type MeleeCombatState,
  createGunfightState,
  createMeleeCombatState,
  resolveIncomingMeleeHit,
  stepGunfightAI,
  stepMeleeCombat,
} from './combatAI';
import type { CitizenProfile } from './npcLifeSim';
import { computeGeminiSteering, type GeminiNpcDecision } from './geminiNpc';
import type { Game } from './Game';
import type { PushOut } from './world';

export type PedKind = 'civ' | 'tourist' | 'cop' | 'gang' | 'guard' | 'target' | 'ally';
type Node4 = [number, number, number, number];
type State = 'walk' | 'wait' | 'flee' | 'idle' | 'attack' | 'guard' | 'cower' | 'crowd_stroll' | 'photo' | 'brawl';
const _po: PushOut = { x: 0, z: 0, nx: 0, nz: 0, hit: false, depth: 0 };
const _v = new THREE.Vector3();

export function cornerPos(n: Node4): [number, number] {
  return [roadLine(n[0]) + n[2] * CORNER, roadLine(n[1]) + n[3] * CORNER];
}

export class Ped {
  static nid = 1;
  id = Ped.nid++;
  kind: PedKind;
  look: Look;
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
  indoorRole: 'clerk' | 'customer' | 'guard' | 'queue' | 'seated' | 'server' | 'doctor' | 'nurse' | 'chef' | 'attendant' | null = null;
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
  canFightBack = false;
  brawlT = 0;
  brawlPunchT = 0;
  brawlPunchDur = 0.36;
  brawlPunchMove: BareHandMove = 'jab_left';
  brawlPunchProgress = 0;
  brawlBlocking = false;
  brawlDodgeDir = 0;
  brawlComboIdx = 0;
  brawlCooldown = 0;
  brawlHitApplied = false;
  gunCrouching = false;
  gunAiming = false;
  underFireT = 0;
  guardT = 0;
  prevYaw = 0;
  turnRate = 0;
  meleeAI: MeleeCombatState;
  gunAI: GunfightState;
  lifeProfile: CitizenProfile | null = null;
  experimentalBodyLogic = false;
  geminiDecision: GeminiNpcDecision | null = null;

  constructor(kind: PedKind, look: Look) {
    this.kind = kind;
    this.look = { ...look };
    this.rig = createHuman(look);
    this.rig.kindHint = kind;
    this.speed = 1.25 + Math.random() * 0.5;
    this.lat = (Math.random() - 0.5) * 2.2;
    this.meleeAI = createMeleeCombatState(this.id * 19 + 5);
    this.gunAI = createGunfightState(kind === 'cop' ? 10 : 14, this.id * 23 + 3);
    if (kind === 'civ' || kind === 'tourist' || kind === 'guard') {
      this.freeCity = createFreeCityBrain(this.id * 13 + 7, kind);
    }
    this.canFightBack = shouldNpcFightBack(this.id, kind, this.freeCity?.archetype, 'fists');
  }

  setFreeCityArchetype(arch: FreeCityArchetype) {
    this.freeCity = createFreeCityBrain(this.id * 13 + 7, this.kind, arch);
    this.rig.kindHint = arch === 'guy' ? 'guy' : this.kind;
    this.canFightBack = shouldNpcFightBack(this.id, this.kind, arch, 'fists');
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
    this.state = 'flee';
    this.panicT = Math.max(this.panicT, dur);
    this.threatX = fx;
    this.threatZ = fz;
    this.handsUp = 0;
    if (!this.freeCityLastHint || Math.random() < 0.35) {
      this.freeCityLastHint = PANIC_SHOUTS[this.id % PANIC_SHOUTS.length];
    }
    void g;
  }

  /** Evaluates and executes a realistic flee, brawl, gunfight, or cower response to nearby or direct violence. */
  reactToViolence(
    g: Game,
    threatX: number,
    threatZ: number,
    weaponKind: ViolenceWeaponKind,
    isVictim: boolean,
    byPlayer: boolean,
  ) {
    if (this.dead || this.kind === 'ally') return;
    const dist = Math.hypot(this.x - threatX, this.z - threatZ);
    const reaction = evaluateViolenceReaction({
      pedId: this.id,
      kind: this.kind,
      archetype: this.freeCity?.archetype,
      indoor: this.indoor,
      indoorRole: this.indoorRole,
      weaponKind,
      isVictim,
      dist,
      hpRatio: this.hp / Math.max(1, this.maxHp),
    });

    if (reaction === 'attack_gun') {
      if (byPlayer) {
        this.hostile = true;
        this.aggro = true;
        this.state = 'attack';
        this.handsUp = 0;
        if (!this.weapon) this.arm('pistol');
        this.freeCityLastHint = this.kind === 'cop'
          ? 'San Nova PD! Drop the weapon now!'
          : this.indoor
            ? 'Security! Drop it or get dropped!'
            : 'Wrong street to start shooting!';
        if (this.kind === 'cop' || this.indoorRole === 'guard') g.alertAround(this, 26);
      }
      return;
    }

    if (reaction === 'brawl' && byPlayer && this.hp > 6) {
      const wasBrawl = this.state === 'brawl';
      this.state = 'brawl';
      this.brawlT = 20;
      this.guardT = 4.5;
      this.brawlCooldown = Math.max(this.brawlCooldown, 0.32 + Math.random() * 0.2);
      this.handsUp = 0;
      if (!wasBrawl) {
        this.meleeAI = createMeleeCombatState(this.id * 19 + 5);
        this.freeCityLastHint = BRAWL_TAUNTS[this.id % BRAWL_TAUNTS.length];
      }
      return;
    }

    if (reaction === 'cower') {
      this.handsUp = Math.max(this.handsUp, 7);
      this.panicT = Math.max(this.panicT, 7);
      this.freeCityLastHint = PANIC_SHOUTS[this.id % PANIC_SHOUTS.length];
      return;
    }

    this.flee(g, threatX, threatZ, isVictim ? 11 : 8 + Math.random() * 4);
  }

  /** applies damage; returns true if died */
  hit(
    g: Game,
    dmg: number,
    dx: number,
    dz: number,
    byPlayer: boolean,
    headshot = false,
    opts?: { shotgun?: boolean; explosive?: boolean; katana?: boolean; meleeKind?: 'fists' | 'melee'; blunt?: boolean },
  ): boolean {
    if (this.dead) return false;
    let effDmg = dmg * (headshot ? 2.5 : 1);
    const isBlunt = !!opts?.blunt || opts?.meleeKind === 'fists';
    this.underFireT = 2.4;

    // Active melee blocking / bob-and-weave slip deflection when brawling
    if (this.state === 'brawl' && (opts?.meleeKind === 'fists' || opts?.meleeKind === 'melee')) {
      const def = resolveIncomingMeleeHit(this.meleeAI, effDmg);
      effDmg = def.appliedDamage;
      if (def.blocked) {
        this.flinchT = 0.1;
        if (effDmg <= 0) {
          // Cleanly slipped the punch — zero blood, ready to counter!
          return false;
        }
      }
    }

    this.hp -= effDmg;
    this.flinchT = Math.max(this.flinchT, 0.28);
    if (byPlayer) {
      if (this.kind === 'civ' || this.kind === 'tourist') g.crime(1, 'assault');
      else if (this.kind === 'cop') g.crime(2, 'assault');
      if (this.hostile) { this.aggro = true; g.alertAround(this, 28); }
    }
    const groundY = g.groundAt(this.x, this.z, this.y);
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
      isBlunt && !opts?.katana,
    );
    if (this.indoor && (!isBlunt || effDmg >= 14)) {
      g.recordIndoorImpact({
        kind: 'blood',
        x: this.x,
        y: groundY + 0.02,
        z: this.z,
        nx: 0,
        ny: 1,
        nz: 0,
        radius: this.hp <= 0 ? 0.65 : 0.32,
      });
      if (wallHit) {
        g.recordIndoorImpact({
          kind: 'blood',
          x: wallHit.x,
          y: wallHit.y,
          z: wallHit.z,
          nx: wallHit.nx,
          ny: 0,
          nz: wallHit.nz,
          radius: 0.32,
        });
      }
    }
    if (this.hp <= 0) {
      const imp = computeRagdollImpulse(dx, dz, effDmg, headshot, !!opts?.explosive);
      this.kill(g, imp.vx, imp.vy, imp.vz, byPlayer, imp.headWhip);
      return true;
    }
    const attackerWeapon: ViolenceWeaponKind = opts?.meleeKind ?? (opts?.explosive ? 'explosion' : 'gun');
    if (!this.hostile) {
      this.reactToViolence(g, this.x - dx * 5, this.z - dz * 5, attackerWeapon, true, byPlayer);
    } else if (byPlayer) {
      this.aggro = true;
    }
    if (byPlayer) {
      g.onViolenceEvent(this.x, this.z, attackerWeapon === 'fists' ? 14 : 26, attackerWeapon, true, this);
    }
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
    const gh = g.groundAt(this.x, this.z, this.y);
    g.fx.bloodPuddle(this.x, gh, this.z, headWhip > 2 ? 1.35 : 0.95);
    if (this.indoor) {
      g.recordIndoorImpact({
        kind: 'blood',
        x: this.x,
        y: gh + 0.02,
        z: this.z,
        nx: 0,
        ny: 1,
        nz: 0,
        radius: 0.72,
      });
    }
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

  knock(g: Game, vx: number, vz: number, _dmgHint: number, byPlayer: boolean, vehicleMassKg = 1450) {
    if (this.dead) return;
    const sp = Math.hypot(vx, vz);
    const impact = computeVehiclePedImpact(sp, vehicleMassKg);
    if (impact.severity === 'none') return;

    const l = sp || 1;
    const ux = vx / l, uz = vz / l;
    this.hp -= impact.damage;
    this.flinchT = impact.severity === 'tap' ? 0.36 : 0.45;
    const groundY = g.groundAt(this.x, this.z);

    // Light bumper tap (< 5.5 m/s): realistic stumble/pushback, ZERO blood explosion, non-lethal!
    if (impact.severity === 'tap') {
      this.vx += ux * impact.pushSpeed;
      this.vz += uz * impact.pushSpeed;
      this.x += ux * 0.32;
      this.z += uz * 0.32;
      this.freeCityLastHint = "Hey! Watch where you're driving—you almost ran me over!";
      if (this.hp <= 0) this.hp = 6; // A gentle tap cannot kill a healthy pedestrian
      this.flee(g, this.x - ux * 6, this.z - uz * 6, 5.5);
      return;
    }

    // Moderate / Severe / Catastrophic impact: kinetic-energy scaled gore (blunt unless catastrophic)
    if (impact.bloodDamage > 0) {
      g.fx.bloodBurst(
        this.x,
        this.y + 1.0,
        this.z,
        vx,
        1.2,
        vz,
        impact.bloodDamage,
        false,
        impact.allowGibs,
        impact.severity === 'severe' || impact.severity === 'catastrophic',
        groundY,
        null,
        impact.severity === 'moderate',
      );
    }
    if (byPlayer) {
      if (this.kind === 'civ' || this.kind === 'tourist') g.crime(1, 'roadkill');
      else if (this.kind === 'cop') g.crime(2, 'roadkill');
    }
    if (impact.lethal || this.hp <= 0) {
      this.hp = Math.min(this.hp, 0);
      this.kill(
        g,
        ux * impact.pushSpeed,
        impact.launchUp,
        uz * impact.pushSpeed,
        byPlayer,
        impact.severity === 'catastrophic' ? 3.2 : 1.6,
      );
    } else {
      // Moderate non-lethal bump: knock back & scramble away
      this.vx += ux * impact.pushSpeed * 0.65;
      this.vz += uz * impact.pushSpeed * 0.65;
      this.flee(g, this.x - ux * 8, this.z - uz * 8, 9);
    }
  }

  // ------------------------------------------------------------------ update
  update(dt: number, g: Game) {
    this.experimentalBodyLogic = g.experimentalBodyLogic;
    if (this.dead) { this.ragdoll(dt, g); return; }
    if (this.flinchT > 0) this.flinchT = Math.max(0, this.flinchT - dt);
    if (this.speakingT > 0) this.speakingT = Math.max(0, this.speakingT - dt);
    if (this.guardT > 0) this.guardT = Math.max(0, this.guardT - dt);
    if (this.brawlCooldown > 0) this.brawlCooldown = Math.max(0, this.brawlCooldown - dt);
    if (this.underFireT > 0) this.underFireT = Math.max(0, this.underFireT - dt);
    this.brawlBlocking = false;
    this.brawlDodgeDir = 0;
    this.brawlPunchProgress = 0;
    this.gunCrouching = false;
    this.gunAiming = false;
    if (this.kind === 'ally') { this.allyUpdate(dt, g); return; }
    const px = g.playerX, pz = g.playerZ;
    const dxp = px - this.x, dzp = pz - this.z;
    const dp = Math.hypot(dxp, dzp);
    let faceYaw: number | null = null;

    if (this.handsUp > 0) {
      this.handsUp -= dt;
      this.rig.phase += dt;
      this.animate(dt, 0, true);
      if (this.handsUp <= 0) this.flee(g, px, pz, 8);
      this.finish(g);
      return;
    }

    // Tactical Bare-Hand Street Brawler AI (styles, blocking, bob-and-weave dodges, combos, attack tokens)
    if (this.state === 'brawl' && !this.hostile) {
      this.brawlT -= dt;
      this.guardT = Math.max(this.guardT, 0.9);
      const playerArmedGun = !isMeleeWeapon(g.player.weapon) && (g.player.ammo[g.player.weapon] ?? 0) > 0 && (g.input.aim || g.playerFiring);
      if (!g.playerAlive || !g.playerOnFoot || dp > 28 || this.brawlT <= 0) {
        this.brawlPunchT = 0;
        this.brawlPunchProgress = 0;
        if (this.indoor) {
          this.state = 'idle';
        } else if (this.crowdHome) this.pickCrowdTarget();
        else {
          this.state = 'walk';
          this.cur = this.nearestCorner();
          this.prev = null;
          this.pickNext(g);
        }
      } else if (playerArmedGun && dp < 14) {
        this.brawlPunchT = 0;
        this.flee(g, px, pz, 9);
      } else {
        faceYaw = Math.atan2(dxp, dzp);
        this.yaw = dampAngle(this.yaw, faceYaw, 12, dt);
        const playerPunchProg = g.player.punchT > 0 ? clamp(g.player.punchT / Math.max(0.15, g.player.punchDur), 0, 1) : 0;
        const hasToken = g.claimMeleeToken(this.id, dp);
        const out = stepMeleeCombat(this.meleeAI, {
          distToTarget: dp,
          playerAttacking: g.player.punchT > 0,
          playerPunchProgress: playerPunchProg,
          hasAttackToken: hasToken,
          dt,
        });
        this.brawlBlocking = out.blocking;
        this.brawlDodgeDir = out.dodging ? out.dodgeDir : 0;
        this.brawlPunchMove = out.punchMove;
        this.brawlPunchProgress = out.punchProgress;

        const fwdX = Math.sin(faceYaw), fwdZ = Math.cos(faceYaw);
        const strX = Math.cos(faceYaw), strZ = -Math.sin(faceYaw);
        const mx = fwdX * out.moveForward + strX * out.moveStrafe;
        const mz = fwdZ * out.moveForward + strZ * out.moveStrafe;
        const ml = Math.hypot(mx, mz);
        if (ml > 0.05 && out.moveSpeed > 0.05) {
          this.moveDir(mx / ml, mz / ml, out.moveSpeed, dt);
        } else {
          this.vx *= 0.78;
          this.vz *= 0.78;
        }

        if (out.deliverHit && g.playerOnFoot && g.playerAlive && dp < 2.55) {
          g.hurtPlayer(out.hitDamage, 'melee');
          const ux = dxp / (dp || 1), uz = dzp / (dp || 1);
          g.player.vx += ux * out.hitKnockback;
          g.player.vz += uz * out.hitKnockback;
          g.audio.punch();
        }
        this.animate(dt, Math.hypot(this.vx, this.vz), false, 0, false);
        this.finish(g);
        return;
      }
    }

    // Tactical Hostile Gunfight AI (cover crouch, peek-and-aim telegraph, burst fire, flanking, reload)
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
        const los = g.world.los(this.x, 1.5, this.z, px, 1.4, pz);
        faceYaw = Math.atan2(dxp, dzp);
        const coverNearby = dp > 9 && dp < 30 && !g.world.los(this.x + Math.cos(faceYaw) * 1.4, 0.85, this.z - Math.sin(faceYaw) * 1.4, px, 1.3, pz);
        const gunOut = stepGunfightAI(this.gunAI, {
          distToTarget: dp,
          hasLos: los,
          coverAvailable: coverNearby,
          underFire: this.underFireT > 0 || (g.playerFiring && dp < 34),
          dt,
        });
        this.gunCrouching = gunOut.crouching;
        this.gunAiming = gunOut.aiming;

        const fwdX = Math.sin(faceYaw), fwdZ = Math.cos(faceYaw);
        const strX = Math.cos(faceYaw), strZ = -Math.sin(faceYaw);
        const mx = fwdX * gunOut.moveForward + strX * gunOut.moveStrafe;
        const mz = fwdZ * gunOut.moveForward + strZ * gunOut.moveStrafe;
        const ml = Math.hypot(mx, mz);
        if (ml > 0.05 && gunOut.moveSpeed > 0.05) {
          this.moveDir(mx / ml, mz / ml, gunOut.moveSpeed, dt);
        } else {
          this.vx *= 0.78;
          this.vz *= 0.78;
        }
        if (gunOut.shootNow && los && dp < 62 && this.weapon) {
          g.npcShoot(this, this.accuracy);
        }
        this.yaw = dampAngle(this.yaw, faceYaw, 12, dt);
        this.animate(dt, Math.hypot(this.vx, this.vz), false, gunOut.aiming ? 1 : 0.25);
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

    // Specialized indoor customer / wait-line / seated diner / medical & kitchen staff behavior
    // (yields immediately when panicking/fleeing, brawling, or engaging in security gunfight!)
    if (this.indoor && !this.hostile && this.state !== 'flee' && this.state !== 'brawl') {
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
      if (
        this.indoorRole === 'clerk' ||
        this.indoorRole === 'server' ||
        this.indoorRole === 'doctor' ||
        this.indoorRole === 'nurse' ||
        this.indoorRole === 'chef' ||
        this.indoorRole === 'attendant' ||
        this.indoorRole === 'guard'
      ) {
        const activeRange = this.indoorRole === 'chef' ? 3.4 : 4.8;
        const lookTarget = dp < activeRange && Math.abs(g.player.y - this.y) < 1.6
          ? Math.atan2(dxp, dzp)
          : this.indoorBaseYaw + Math.sin(g.time * (this.indoorRole === 'chef' ? 0.9 : 0.45) + this.id) * 0.24;
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

    // Deep Non-AI Life Simulation steering: cooperative plans & independent everyday life situations
    if (this.lifeProfile && !this.indoor && this.state !== 'flee' && this.state !== 'wait') {
      const lp = this.lifeProfile;
      if (lp.situationLine && lp.situation !== 'none') {
        this.freeCityLastHint = lp.situationLine;
      }
      if (lp.activePlanId !== null) {
        const plan = g.npcLife.plans.get(lp.activePlanId);
        if (plan) {
          const dMeet = Math.hypot(plan.meetingX - this.x, plan.meetingZ - this.z);
          if (plan.stage === 'together' && lp.partnerOrTargetId !== null) {
            const partner = g.peds.find((o) => o.id === lp.partnerOrTargetId && !o.dead);
            if (partner) {
              const pYaw = Math.atan2(partner.x - this.x, partner.z - this.z);
              if (lp.situation === 'walking_together') {
                // Walk side by side at synced pace
                fcSpeedMul = 1.05;
              } else {
                // Stop & converse / confront / share coffee face-to-face
                fcStop = true;
                fcFaceYaw = pYaw;
              }
            }
          } else if (dMeet > 2.6) {
            // Head purposefully toward the planned meetup venue
            this.moveDir((plan.meetingX - this.x) / dMeet, (plan.meetingZ - this.z) / dMeet, this.speed * 1.25, dt);
            this.animate(dt, Math.hypot(this.vx, this.vz), false, 0, false);
            this.finish(g);
            return;
          } else {
            // Arrived first: pause & check watch while waiting for friend
            fcStop = true;
          }
        }
      } else if (lp.situation === 'dropped_item' || lp.situation === 'window_browse') {
        fcStop = true;
      } else if (lp.situation === 'running_late') {
        fcSpeedMul = 2.15;
      } else if (lp.situation === 'phone_call') {
        fcSpeedMul = 0.85;
      }
    }

    // Optional Gemini AI NPC override: executes live server-side Gemini decisions physically in the world
    if (g.geminiNpcsEnabled && this.geminiDecision && !this.indoor && !this.hostile && this.state !== 'brawl') {
      const gd = this.geminiDecision;
      if (gd.speech) this.freeCityLastHint = gd.speech;
      const steer = computeGeminiSteering(gd, this.x, this.z, px, pz);
      if (steer.triggerFlee && dp < 36) {
        this.flee(g, px, pz, 7);
      } else if (steer.triggerConfront && dp < 18 && !this.mission && g.playerOnFoot && g.playerAlive) {
        this.canFightBack = true;
        this.state = 'brawl';
        this.brawlT = 14;
      } else {
        if (steer.facePlayer) fcFaceYaw = Math.atan2(dxp, dzp);
        if (steer.triggerPhoto) fcPhoto = true;
        if (steer.wave) this.handsUp = Math.max(this.handsUp, 0.28);
        if (steer.stop) {
          fcStop = true;
        } else if (Math.hypot(steer.moveDx, steer.moveDz) > 0.1) {
          this.moveDir(steer.moveDx, steer.moveDz, this.speed * steer.speedMul, dt);
          if (fcFaceYaw !== null) this.yaw = dampAngle(this.yaw, fcFaceYaw, 7, dt);
          this.animate(dt, Math.hypot(this.vx, this.vz), false, 0, fcPhoto);
          this.finish(g);
          return;
        } else {
          fcSpeedMul = steer.speedMul;
        }
      }
    }

    switch (this.state) {
      case 'flee': {
        this.panicT -= dt;
        let ax = this.x - this.threatX, az = this.z - this.threatZ;
        // Indoors: blend fleeing away from attacker with running toward the room's main exit
        if (this.indoor && g.interior) {
          const ex = g.interior.room.exit.x - this.x;
          const ez = g.interior.room.exit.z - this.z;
          const el = Math.hypot(ex, ez) || 1;
          const al = Math.hypot(ax, az) || 1;
          ax = (ax / al) * 0.65 + (ex / el) * 0.35;
          az = (az / al) * 0.65 + (ez / el) * 0.35;
        }
        const l = Math.hypot(ax, az) || 1;
        ax /= l; az /= l;
        this.moveDir(ax, az, this.indoor ? 4.3 : 5.6, dt);
        if (this.panicT <= 0) {
          if (this.indoor) {
            this.state = 'idle';
          } else if (this.crowdHome) this.pickCrowdTarget();
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
    let dyaw = this.yaw - this.prevYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.turnRate = dt > 0.0001 ? clamp(dyaw / dt, -8, 8) : 0;
    this.prevYaw = this.yaw;

    const sit = this.lifeProfile?.situation ?? 'none';
    const a: AnimIn = {
      mode: this.indoor && this.indoorRole === 'seated' && !panic && this.handsUp <= 0 ? 'sit' : 'stand',
      speed,
      aim,
      aimPitch: 0,
      crouch: this.gunCrouching,
      punch: this.brawlPunchProgress > 0
        ? this.brawlPunchProgress
        : this.brawlPunchT > 0
          ? clamp(this.brawlPunchT / Math.max(0.15, this.brawlPunchDur), 0, 1)
          : 0,
      punchMove: this.brawlPunchMove,
      boxingGuard: this.state === 'brawl' ? 1 : clamp(this.guardT * 0.5, 0, 1),
      blocking: this.brawlBlocking,
      dodgeDir: this.brawlDodgeDir,
      panic: panic || this.handsUp > 0,
      photo,
      phoneCall: sit === 'phone_call',
      checkWatch: sit === 'waiting_for_friend' && speed < 0.35,
      pickUp: sit === 'dropped_item',
      waveGreet: sit === 'good_news' || sit === 'celebrating',
      flinch: this.flinchT > 0 ? this.flinchT / 0.28 : 0,
      turnRate: this.turnRate,
      speaking: this.speakingT > 0 || sit === 'rival_argument' || sit === 'sharing_coffee',
      onSand: !this.indoor && sandFactorAt(this.x, this.z, this.y) > 0.15,
      isTourist: this.kind === 'tourist',
      experimentalBodyLogic: this.experimentalBodyLogic,
      neuroStress: this.lifeProfile ? this.lifeProfile.stress / 100 : undefined,
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
    const gh = g.groundAt(this.x, this.z, this.y);
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
              g.fx.bloodPuddle(ix, g.groundAt(ix, iz, iy), iz, clamp(0.48 + impSp * 0.1, 0.48, 1.45));
            }
          },
          (sx, sy, sz, vx, vz) => {
            g.fx.bloodSmear(sx, sy, sz, vx, vz);
          },
        );
        this.x = this.rag.parts[2].p.x;
        this.z = this.rag.parts[2].p.z;
        this.y = this.rag.parts[2].p.y;
      }
      if (this.rag.settled && this.deadT < 4) {
        const tw = Math.sin(this.deadT * 9) * Math.exp(-this.deadT * 1.6) * 0.05;
        this.rag.parts[3].p.x += tw; this.rag.parts[4].p.x -= tw;
        this.rag.apply();
      }
    } else {
      // Restored persisted body lying flat on its exact floor/basement/mezzanine elevation
      this.rig.root.position.set(this.x, gh + 0.18, this.z);
      this.rig.root.rotation.set(this.restX || Math.PI / 2, this.yaw, 0);
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
    disposeHumanRig(this.rig);
    g.scene.remove(this.rig.root);
  }
}
void _v;
