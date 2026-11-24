// Vehicle entity: arcade car physics, collisions, damage and traffic / police / racer AI.
import * as THREE from 'three';
import {
  LANE_INNER, LANE_OUTER, NB, STOP_DIST, angDiff, applySandVehiclePhysics, clamp, deckHeight, lerp, roadLine, sandFactorAt, signalState, terrainSlopeAt,
} from './config';
import {
  SPECS, VehicleModel, VehicleSpec, VehicleType, buildVehicle, dentModel, disposeVehicleModel, tailBright, tailDim, wreckMat, sirenRed, sirenBlue,
} from './vehicles';
import {
  FlightState, SuspensionState, createFlightState, createSuspensionState, stepFlightPhysics, stepSuspensionPhysics,
} from './physics';
import {
  SteeringState, createSteeringState, stepRealisticSteering,
} from './steeringPhysics';
import { driverBust } from './humans';
import type { Game } from './Game';
import type { HumanRig } from './humans';
import type { PushOut } from './world';

export type VMode = 'parked' | 'ai' | 'police' | 'racer' | 'player' | 'idle' | 'wreck' | 'hw';

interface Turn { dx: number; dz: number; kind: 0 | 1 | 2; S: number[]; C: number[]; E: number[]; len: number }
interface AI {
  nk: number; nl: number; dx: number; dz: number; lane: number;
  next: Turn | null;
  turning: { u: number } | null;
  cruise: number;
  route: [number, number][] | null;
  routeIdx: number;
  finished: boolean;
  direct: boolean;
  reverseT: number;
  reverseSteer: number;
  copsOut: boolean;
  honkT: number;
  finishAfter: boolean;
}
const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const redOff = new THREE.MeshStandardMaterial({ color: 0x330000 });
const blueOff = new THREE.MeshStandardMaterial({ color: 0x000033 });
const _po: PushOut = { x: 0, z: 0, nx: 0, nz: 0, hit: false, depth: 0 };

export class Vehicle {
  static nid = 1;
  id = Vehicle.nid++;
  type: VehicleType;
  spec: VehicleSpec;
  model: VehicleModel;
  group: THREE.Group;
  x = 0; z = 0; y = 0; yaw = 0; vx = 0; vz = 0; omega = 0;
  steerIn = 0; steerAng = 0;
  throttle = 0; brake = 0; hand = false;
  hp: number; maxHp: number;
  mode: VMode = 'idle';
  hasDriver = false;
  driverKind: 'civ' | 'cop' | 'racer' | null = null;
  bust: THREE.Mesh | null = null;
  rig: HumanRig | null = null;
  burning = false; burnT = 0; exploded = false; wreckT = 0;
  pitch = 0; roll = 0; vy = 0; hop = 0;
  siren = false; lightsOn = false; braking = false;
  stunned = 0; ghost = 0; stuckT = 0;
  mission = false;
  tag = '';
  spot = -1;
  lastHit = 0;
  wheelRot = 0;
  fwd = 0;
  age = 0;
  ai: AI;
  accelSmooth = 0;
  lastSpeed = 0;
  copsDeployed = false;
  hornT = 0;
  sandSink = 0;
  onSand = false;
  sandSprayT = 0;
  slopePitch = 0;
  slopeRoll = 0;
  // Enhanced car suspension, realistic progressive steering & drift FX
  susp: SuspensionState = createSuspensionState(0);
  steerState: SteeringState = createSteeringState();
  bodyYOffset = 0;
  driftSmokeT = 0;
  // Aircraft flight physics state & controls
  flight: FlightState | null = null;
  pitchIn = 0;
  rollIn = 0;
  yawIn = 0;
  throttleDelta = 0;
  contrailT = 0;
  propSpin = 0;

  constructor(type: VehicleType, paint: number, allowHeroSite = false) {
    this.type = type;
    this.spec = SPECS[type];
    this.model = buildVehicle(type, paint, allowHeroSite);
    this.group = this.model.group;
    this.hp = this.maxHp = this.spec.hp;
    this.ai = { nk: 0, nl: 0, dx: 1, dz: 0, lane: LANE_OUTER, next: null, turning: null, cruise: 14, route: null, routeIdx: 0, finished: false, direct: false, reverseT: 0, reverseSteer: 0, copsOut: false, honkT: 0, finishAfter: false };
    if (this.spec.isAircraft) {
      this.flight = createFlightState(0, 0, 0, 0);
    }
    for (const m of this.group.children) m.traverse((o) => { o.matrixAutoUpdate = true; });
  }

  get speed() { return this.spec.isAircraft ? Math.hypot(this.vx, this.vy, this.vz) : Math.hypot(this.vx, this.vz); }
  get fx() { return Math.sin(this.yaw); }
  get fz() { return Math.cos(this.yaw); }
  get radius() { return this.spec.W / 2; }

  addDriverBust(kind: 'civ' | 'cop' | 'racer') {
    this.hasDriver = true;
    this.driverKind = kind;
    const b = driverBust(this.id * 7 + 3);
    b.scale.setScalar(0.78);
    b.position.set(this.spec.seat[0], this.spec.seat[1], this.spec.seat[2]);
    this.model.tiltGroup.add(b);
    this.bust = b;
  }
  removeDriverBust() {
    if (this.bust) {
      this.model.tiltGroup.remove(this.bust);
      this.bust = null;
    }
    this.hasDriver = false;
    this.driverKind = null;
  }

  place(x: number, z: number, yaw: number, y = 0) {
    this.x = x; this.z = z; this.y = y; this.yaw = yaw;
    this.susp.worldY = y;
    if (this.flight) {
      this.flight.x = x; this.flight.y = y; this.flight.z = z; this.flight.yaw = yaw;
      this.flight.vx = 0; this.flight.vy = 0; this.flight.vz = 0;
      this.flight.pitch = 0; this.flight.roll = 0; this.flight.throttle = 0; this.flight.onGround = true;
    }
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, yaw, 0);
  }

  /** put on a road lane before node (nk,nl) heading (dx,dz) */
  placeOnRoad(g: Game, nk: number, nl: number, dx: number, dz: number, lane: number, distBefore: number) {
    const cx = roadLine(nk), cz = roadLine(nl);
    const rx = -dz, rz = dx;
    this.place(cx - dx * distBefore + rx * lane, cz - dz * distBefore + rz * lane, Math.atan2(dx, dz));
    const a = this.ai;
    a.nk = nk; a.nl = nl; a.dx = dx; a.dz = dz; a.lane = lane;
    a.turning = null;
    this.planNext(g);
  }

  // ------------------------------------------------------------------ AI
  planNext(g: Game) {
    const a = this.ai;
    const cands = DIRS.filter(([x, z]) => !(x === -a.dx && z === -a.dz) && a.nk + x >= 0 && a.nk + x <= NB && a.nl + z >= 0 && a.nl + z <= NB);
    let pick: [number, number] = cands[0] ?? [-a.dx, -a.dz];
    if (this.mode === 'police' && !a.route) {
      let best = 1e9;
      const [tk, tl] = [g.playerK, g.playerL];
      for (const c of cands) {
        let score = Math.abs(a.nk + c[0] - tk) + Math.abs(a.nl + c[1] - tl) + Math.random() * 0.4;
        if (c[0] === a.dx && c[1] === a.dz) score -= 0.5;
        if (score < best) { best = score; pick = c; }
      }
    } else if (a.route) {
      const nxt = a.route[a.routeIdx + 1];
      if (nxt) {
        const dk = Math.sign(nxt[0] - a.nk), dl = Math.sign(nxt[1] - a.nl);
        const c = cands.find((q) => q[0] === dk && q[1] === dl);
        if (c) pick = c;
        a.finishAfter = false;
      } else a.finishAfter = true;
    } else {
      const r = Math.random();
      const st = cands.find((q) => q[0] === a.dx && q[1] === a.dz);
      const rt = cands.find((q) => q[0] === -a.dz && q[1] === a.dx);
      const lf = cands.find((q) => q[0] === a.dz && q[1] === -a.dx);
      if (st && r < 0.58) pick = st;
      else if (rt && (r < 0.8 || !lf)) pick = rt;
      else pick = lf ?? st ?? pick;
    }
    const dx2 = pick[0], dz2 = pick[1];
    const rx = -a.dz, rz = a.dx;
    const dotR = dx2 * rx + dz2 * rz;
    const kind = dx2 === a.dx && dz2 === a.dz ? 0 : dotR > 0.5 ? 1 : dotR < -0.5 ? 2 : 0;
    const cx = roadLine(a.nk), cz = roadLine(a.nl);
    const lane = a.lane;
    const off = kind === 1 ? -lane : lane;
    const Cx = cx + rx * lane + a.dx * off, Cz = cz + rz * lane + a.dz * off;
    const R = kind === 1 ? 4.5 : 7.5;
    const S = [Cx - a.dx * R, Cz - a.dz * R], E = [Cx + dx2 * R, Cz + dz2 * R];
    const len = (Math.hypot(Cx - S[0], Cz - S[1]) + Math.hypot(E[0] - Cx, E[1] - Cz)) * 0.9;
    a.next = { dx: dx2, dz: dz2, kind: kind as 0 | 1 | 2, S, C: [Cx, Cz], E, len };
  }

  /** after being displaced: re-find a lane */
  resnap(g: Game) {
    const a = this.ai;
    if (a.route && a.routeIdx < a.route.length) {
      // keep following the assigned route after a collision
      const tgt = a.route[a.routeIdx];
      const prv = a.route[Math.max(0, a.routeIdx - 1)];
      let dx = Math.sign(tgt[0] - prv[0]), dz = Math.sign(tgt[1] - prv[1]);
      if (dx === 0 && dz === 0) { dx = a.dx; dz = a.dz; }
      a.nk = tgt[0]; a.nl = tgt[1]; a.dx = dx; a.dz = dz; a.turning = null; a.direct = false;
      this.planNext(g);
      return;
    }
    let dx = Math.abs(Math.sin(this.yaw)) > Math.abs(Math.cos(this.yaw)) ? Math.sign(Math.sin(this.yaw)) : 0;
    let dz = dx === 0 ? Math.sign(Math.cos(this.yaw)) || 1 : 0;
    const P_ = 114;
    const lat = (d: [number, number]) => {
      // lateral offset to the right of the nearest road line
      if (d[0] !== 0) {
        const l = Math.round(this.z / P_ + NB / 2);
        return { off: (this.z - roadLine(clamp(l, 0, NB))) * d[0], idx: clamp(l, 0, NB) };
      }
      const k = Math.round(this.x / P_ + NB / 2);
      return { off: -(this.x - roadLine(clamp(k, 0, NB))) * d[1], idx: clamp(k, 0, NB) };
    };
    let L = lat([dx, dz]);
    if (L.off < 0) { dx = -dx; dz = -dz; L = lat([dx, dz]); }
    a.lane = Math.abs(L.off) > 4.1 ? LANE_OUTER : LANE_INNER;
    if (dx !== 0) {
      a.nl = L.idx;
      const u = this.x / P_ + NB / 2;
      a.nk = clamp(dx > 0 ? Math.ceil(u + 0.15) : Math.floor(u - 0.15), 0, NB);
    } else {
      a.nk = L.idx;
      const u = this.z / P_ + NB / 2;
      a.nl = clamp(dz > 0 ? Math.ceil(u + 0.15) : Math.floor(u - 0.15), 0, NB);
    }
    a.dx = dx; a.dz = dz; a.turning = null; a.direct = false;
    this.planNext(g);
  }

  aiControl(dt: number, g: Game) {
    const a = this.ai;
    const sp = this.fwd;
    if (this.stunned > 0) {
      this.stunned -= dt;
      this.throttle = 0; this.brake = 0.25; this.steerIn = 0;
      if (this.stunned <= 0 && this.mode !== 'police') this.resnap(g);
      return;
    }
    const isCop = this.mode === 'police';
    const racer = this.mode === 'racer';
    let vT = a.cruise;
    let steer = 0;
    let tx = 0, tz = 0;

    // police: direct pursuit
    if (isCop) {
      const pdx = g.playerX - this.x, pdz = g.playerZ - this.z;
      const pd = Math.hypot(pdx, pdz);
      const los = pd < 70 && g.world.los(this.x, 1, this.z, g.playerX, 1, g.playerZ);
      if (los && g.wanted > 0) {
        a.direct = true;
        // lead the target
        const lead = clamp(pd / 30, 0, 1.2);
        tx = g.playerX + g.playerVX * lead; tz = g.playerZ + g.playerVZ * lead;
        vT = clamp(pd * 0.9, 8, this.spec.maxSpeed * 0.72);
        if (pd < 28) vT = Math.min(vT, 6.5 + g.playerSpeed * 0.9);
        if (g.playerOnFoot && pd < 16) {
          vT = 0; this.brake = 1; this.throttle = 0;
          if (!a.copsOut && sp < 3) { a.copsOut = true; g.deployCops(this); }
        }
        // avoid walls ahead
        const fx = this.fx, fz = this.fz;
        const probe = (d: number, s: number) => g.world.solidAt(this.x + fx * d - fz * s, 0.8, this.z + fz * d + fx * s) !== null;
        if (a.reverseT > 0) {
          a.reverseT -= dt;
          this.throttle = -0.9; this.brake = 0; this.steerIn = a.reverseSteer;
          return;
        }
        let avoid = 0;
        if (probe(7, 0) || probe(12, 0)) avoid = probe(7, 2.4) ? -1 : 1;
        if (probe(7, 2.4)) avoid = -1;
        if (probe(7, -2.4)) avoid = 1;
        if (avoid) { vT = Math.min(vT, 8); }
        const ang = Math.atan2((tx - this.x) * fz - (tz - this.z) * fx, (tz - this.z) * fz + (tx - this.x) * fx);
        steer = clamp(ang * 1.8, -1, 1);
        if (avoid) steer = avoid * 0.9;
        if (sp < 1.2 && pd > 14) this.stuckT += dt; else this.stuckT = 0;
        if (this.stuckT > 1.6) { a.reverseT = 1.4; a.reverseSteer = -steer || 1; this.stuckT = 0; }
        this.steerIn = steer;
        this.followAdjust(g, vT, dt, true);
        return;
      } else if (a.direct) {
        a.direct = false;
        this.resnap(g);
      }
    }

    // lane following
    const cx = roadLine(a.nk), cz = roadLine(a.nl);
    const rx = -a.dz, rz = a.dx;
    const Lx = cx + rx * a.lane, Lz = cz + rz * a.lane;
    const t = (this.x - Lx) * a.dx + (this.z - Lz) * a.dz;
    const look = clamp(3.5 + Math.abs(sp) * 0.4, 5, 15);
    const nxt = a.next;
    if (!nxt) { this.planNext(g); return; }
    if (a.turning) {
      const u = a.turning.u + (Math.max(sp, 3) * dt) / nxt.len;
      a.turning.u = u;
      const uu = Math.min(1, u + look / nxt.len);
      const m = 1 - uu;
      tx = m * m * nxt.S[0] + 2 * m * uu * nxt.C[0] + uu * uu * nxt.E[0];
      tz = m * m * nxt.S[1] + 2 * m * uu * nxt.C[1] + uu * uu * nxt.E[1];
      vT = Math.min(vT, nxt.kind === 1 ? 6.5 : 8.5);
      if (u >= 1) {
        a.nk += nxt.dx; a.nl += nxt.dz; a.dx = nxt.dx; a.dz = nxt.dz; a.turning = null;
        if (a.route) a.routeIdx++;
        if (a.finishAfter) a.finished = true;
        this.planNext(g);
      }
    } else {
      const R = nxt.kind === 1 ? 4.5 : 7.5;
      const off = nxt.kind === 1 ? -a.lane : a.lane;
      const tEntry = nxt.kind === 0 ? 0 : off - R;
      tx = Lx + a.dx * (t + look); tz = Lz + a.dz * (t + look);
      const distToEntry = tEntry - t;
      if (t >= tEntry) {
        if (nxt.kind === 0) {
          a.nk += a.dx; a.nl += a.dz;
          if (a.route) a.routeIdx++;
          if (a.finishAfter) a.finished = true;
          this.planNext(g);
        } else a.turning = { u: 0 };
      } else if (nxt.kind !== 0 && distToEntry < 28) vT = Math.min(vT, 7 + distToEntry * 0.18);
      // traffic signals
      if (!racer && !isCop) {
        const distToStop = -t - STOP_DIST;
        if (distToStop > -2.5 && distToStop < 70) {
          const sig = signalState(a.nk, a.nl, a.dx !== 0 ? 0 : 1, g.time);
          if (sig === 2 || (sig === 1 && distToStop > (sp * sp) / 10 + 2)) {
            vT = Math.min(vT, Math.sqrt(2 * 5.5 * Math.max(0, distToStop - 0.3)));
          }
        }
      }
      if (a.finished) vT = 0;
    }
    const ang = Math.atan2((tx - this.x) * this.fz - (tz - this.z) * this.fx, (tz - this.z) * this.fz + (tx - this.x) * this.fx);
    steer = clamp(ang * 1.7, -1, 1);
    this.steerIn = steer;
    this.followAdjust(g, vT, dt, racer || isCop);
  }

  /** slow down for obstacles ahead then apply throttle/brake for the target speed */
  followAdjust(g: Game, vTarget: number, dt: number, aggressive: boolean) {
    const fx = this.fx, fz = this.fz, rx = -fz, rz = fx;
    let vT = vTarget;
    const sp = this.fwd;
    const look = 8 + Math.max(0, sp) * 1.1;
    if (this.ghost <= 0) {
      for (const o of g.vehicles) {
        if (o === this || o.mode === 'wreck') continue;
        const ox = o.x - this.x, oz = o.z - this.z;
        const ahead = ox * fx + oz * fz;
        if (ahead < 0 || ahead > look + 6) continue;
        const lat = Math.abs(ox * rx + oz * rz);
        if (lat > 2.4 + (aggressive ? -0.6 : 0)) continue;
        const gap = ahead - (this.spec.L + o.spec.L) / 2;
        const ov = o.vx * fx + o.vz * fz;
        const vv = Math.max(0, (gap - 2.5) * 1.3 + Math.max(0, ov) * 0.9);
        if (aggressive && o.mode === 'player') continue;
        vT = Math.min(vT, vv);
      }
    }
    // pedestrians
    for (const p of g.peds) {
      if (p.dead) continue;
      const ox = p.x - this.x, oz = p.z - this.z;
      const ahead = ox * fx + oz * fz;
      if (ahead < 0 || ahead > look) continue;
      const lat = Math.abs(ox * rx + oz * rz);
      if (lat > 1.9) continue;
      const gap = ahead - this.spec.L / 2 - 0.4;
      vT = Math.min(vT, Math.max(0, (gap - 1.5) * 1.1));
      if (gap < 6 && this.ai.honkT <= 0) { this.ai.honkT = 2.5; g.audio.horn(true); }
    }
    if (!g.playerOnFoot) { /* player vehicle is in g.vehicles */ } else {
      const ox = g.playerX - this.x, oz = g.playerZ - this.z;
      const ahead = ox * fx + oz * fz;
      if (ahead > 0 && ahead < look && Math.abs(ox * rx + oz * rz) < 1.9 && !aggressive) vT = Math.min(vT, Math.max(0, (ahead - this.spec.L / 2 - 2) * 1.1));
    }
    this.ai.honkT -= dt;
    const err = vT - sp;
    if (err > 0.3) { this.throttle = clamp(err * 0.45, 0, 1); this.brake = 0; }
    else { this.throttle = 0; this.brake = clamp(-err * 0.35, 0, 1); if (vT < 0.3 && sp < 0.6) this.brake = 1; }
    // stuck detection (traffic jam / blocked)
    if (vT > 3 && sp < 0.4) this.stuckT += dt; else if (!this.ai.reverseT) this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 7 && !aggressive) { this.ghost = 5; this.stuckT = 0; }
    if (this.ghost > 0) this.ghost -= dt;
  }

  // ------------------------------------------------------------------ physics
  physics(dt: number, g?: Game) {
    const s = this.spec;
    const fx = this.fx, fz = this.fz, rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    const maxV = s.maxSpeed;
    // engine / brake
    const th = this.throttle;
    if (th > 0) {
      if (vf < -0.5) vf += 16 * dt;
      else vf += s.accel * th * clamp(1 - Math.pow(Math.max(0, vf) / maxV, 2), 0, 1) * dt * (vf < 8 ? 1.25 : 1);
    } else if (th < 0) {
      if (vf > 0.5) vf -= 16 * dt;
      else vf += s.accel * 0.55 * th * clamp(1 - Math.pow(Math.max(0, -vf) / (maxV * 0.28), 2), 0, 1) * dt;
    }
    if (this.brake > 0) {
      const d = 15 * this.brake * dt;
      vf = Math.abs(vf) < d ? 0 : vf - Math.sign(vf) * d;
    }
    vf -= vf * Math.abs(vf) * 0.00042 * dt * (1400 / s.mass + 0.3);
    vf *= Math.exp(-(this.throttle === 0 ? 0.28 : 0.05) * dt);
    if (this.hand) vf *= Math.exp(-0.7 * dt);

    // soft-sand physics (beachfront, Golden Dunes, Nova Keys shoreline)
    const sandF = sandFactorAt(this.x, this.z, this.y);
    this.onSand = sandF > 0.1;
    const sandRes = applySandVehiclePhysics(vf, vl, th, this.hand, sandF, s.mass, dt);
    vf = sandRes.vf;
    this.sandSink += (sandRes.sinkY - this.sandSink) * (1 - Math.exp(-8 * dt));

    // Realistic progressive steering & Pacejka-lite lateral grip
    const steerRes = stepRealisticSteering(
      this.steerState,
      {
        rawSteer: this.steerIn,
        speedFwd: vf,
        speedLat: vl,
        maxSteerRad: s.steer,
        wheelBase: s.wheelBase,
        baseGrip: s.grip,
        handbrake: this.hand,
        sandFactor: sandF,
        isPlayer: this.mode === 'player',
      },
      dt,
    );
    vl = steerRes.newLatSpeed;
    this.steerAng = steerRes.steerAngle;
    this.omega = steerRes.omega;

    // rooster-tail sand spray from rear tires
    if (g && sandRes.sprayIntensity > 0.1 && this.speed > 1.5) {
      this.sandSprayT -= dt;
      if (this.sandSprayT <= 0) {
        this.sandSprayT = 0.045;
        const rearDist = s.L * 0.36;
        const trackHalf = s.W * 0.44;
        for (const side of [-1, 1]) {
          const wx = this.x - fx * rearDist + rx * side * trackHalf;
          const wz = this.z - fz * rearDist + rz * side * trackHalf;
          g.fx.sandSpray(wx, this.y + 0.05, wz, -fx * Math.abs(vf) * 0.22 - rx * vl * 0.25, -fz * Math.abs(vf) * 0.22 - rz * vl * 0.25, sandRes.sprayIntensity);
        }
      }
    }

    this.yaw += this.omega * dt;
    const nfx = Math.sin(this.yaw), nfz = Math.cos(this.yaw);
    const nrx = -nfz, nrz = nfx;
    this.vx = nfx * vf + nrx * vl;
    this.vz = nfz * vf + nrz * vl;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.fwd = vf;

    // Drift & burnout tire smoke on paved surfaces
    if (g && !this.onSand && (this.hand || Math.abs(vl) > 3.6) && this.speed > 4.5 && !this.susp.airborne) {
      this.driftSmokeT -= dt;
      if (this.driftSmokeT <= 0) {
        this.driftSmokeT = 0.04;
        const rearDist = s.L * 0.36;
        const trackHalf = s.W * 0.44;
        for (const side of [-1, 1]) {
          const wx = this.x - fx * rearDist + rx * side * trackHalf;
          const wz = this.z - fz * rearDist + rz * side * trackHalf;
          g.fx.tireSmoke(wx, this.y + 0.06, wz, -fx * 1.4 - rx * vl * 0.18, -fz * 1.4 - rz * vl * 0.18);
        }
      }
    }

    // terrain slope pitch & roll alignment on dunes and hills
    const onDeck = deckHeight(this.x, this.z, this.y) > 0;
    let tgtSlopePitch = 0, tgtSlopeRoll = 0;
    if (!onDeck) {
      const n = terrainSlopeAt(this.x, this.z);
      tgtSlopePitch = clamp(n.nx * nfx + n.nz * nfz, -0.35, 0.35);
      tgtSlopeRoll = clamp(-(n.nx * nrx + n.nz * nrz), -0.35, 0.35);
    }
    const sk = 1 - Math.exp(-8 * dt);
    this.slopePitch += (tgtSlopePitch - this.slopePitch) * sk;
    this.slopeRoll += (tgtSlopeRoll - this.slopeRoll) * sk;

    // 4-wheel spring-damper suspension & weight transfer
    const acc = (vf - this.lastSpeed) / Math.max(dt, 0.001);
    this.lastSpeed = vf;
    this.accelSmooth += (acc - this.accelSmooth) * (1 - Math.exp(-7 * dt));
    const latAccel = -this.omega * vf - vl * 1.1;
    const groundY = g ? g.groundAt(this.x, this.z, this.y) : 0;
    const suspRes = stepSuspensionPhysics(this.susp, {
      groundY,
      longAccel: this.accelSmooth,
      latAccel,
      speed: Math.abs(vf),
      roughness: this.onSand ? 0.65 : 0.04,
      stiffness: this.type === 'sports' ? 88 : this.type === 'suv' || this.type === 'pickup' ? 54 : 68,
      damping: this.type === 'sports' ? 13 : 10.5,
    }, dt);
    this.y = this.susp.worldY;
    this.bodyYOffset = suspRes.bodyYOffset;
    this.pitch = suspRes.pitch;
    this.roll = suspRes.roll;
    if (g && suspRes.landed && suspRes.landingSpeed > 4.2) {
      for (let i = 0; i < 6; i++) {
        g.fx.spark(this.x + (Math.random() - 0.5) * s.W, this.y + 0.25, this.z + (Math.random() - 0.5) * s.L * 0.6, (Math.random() - 0.5) * 2, 0.6, (Math.random() - 0.5) * 2);
      }
      if (this.mode === 'player') g.shake(Math.min(0.45, suspRes.landingSpeed * 0.035));
    }
    this.wheelRot += (vf * dt) / s.wheelR;
  }

  circles(): number[] {
    const s = this.spec;
    const r = s.W / 2 - 0.02;
    const half = s.L / 2 - r;
    const fx = this.fx, fz = this.fz;
    const n = s.L > 5 ? 4 : 3;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const o = lerp(half, -half, i / (n - 1));
      out.push(this.x + fx * o, this.z + fz * o, r);
    }
    return out;
  }

  collideStatic(g: Game) {
    const c = this.circles();
    let maxImpact = 0, hx = 0, hz = 0, nxs = 0, nzs = 0;
    for (let i = 0; i < c.length; i += 3) {
      g.world.resolve(c[i], c[i + 1], c[i + 2], this.y + 0.3, _po);
      if (_po.hit) {
        const px = _po.x - c[i], pz = _po.z - c[i + 1];
        this.x += px; this.z += pz;
        for (let j = i + 3; j < c.length; j += 3) { c[j] += px; c[j + 1] += pz; }
        const vn = this.vx * _po.nx + this.vz * _po.nz;
        if (vn < 0) {
          const imp = -vn;
          this.vx -= (1.25) * vn * _po.nx;
          this.vz -= (1.25) * vn * _po.nz;
          this.vx *= 0.985; this.vz *= 0.985;
          // torque: hit at offset from centre
          const ox = c[i] - this.x, oz = c[i + 1] - this.z;
          this.omega += (ox * _po.nz - oz * _po.nx) * imp * 0.045;
          if (imp > maxImpact) { maxImpact = imp; hx = c[i]; hz = c[i + 1]; nxs = _po.nx; nzs = _po.nz; }
        }
      }
    }
    if (maxImpact > 0.5) this.impact(g, maxImpact, hx, hz, nxs, nzs, 1);
  }

  impact(g: Game, imp: number, px: number, pz: number, nx: number, nz: number, dmgScale: number) {
    if (imp < 2.2) return;
    const dmg = (imp - 2) * 2.4 * dmgScale * Math.pow(1500 / this.spec.mass, 0.35);
    if (this.mode !== 'wreck') this.damage(dmg, g);
    const dx = px - this.x, dz = pz - this.z;
    const lf = dx * this.fx + dz * this.fz;
    const lr = dx * -this.fz + dz * this.fx;
    if (imp > 4) dentModel(this.model, -lr * 1.1, lf * 1.1, Math.min(0.45, imp * 0.03));
    if (g.time - this.lastHit > 0.25) {
      this.lastHit = g.time;
      const dist = Math.hypot(this.x - g.camX, this.z - g.camZ);
      g.audio.crash(Math.min(1.2, imp / 12) * clamp(1 - dist / 120, 0, 1));
      for (let i = 0; i < Math.min(14, imp); i++) g.fx.spark(px, 0.7, pz, nx, 0.3, nz);
      if (this.mode === 'player') g.shake(Math.min(0.6, imp * 0.04));
    }
    if (this.mode === 'player' && imp > 13) g.hurtPlayer((imp - 12) * 1.2, 'crash');
    if (this.mode === 'ai' || this.mode === 'racer') { if (imp > 3) this.stunned = 1.5 + Math.min(3, imp * 0.15); }
  }

  damage(amount: number, g: Game, byPlayer = false) {
    if (this.mode === 'wreck' || this.exploded) return;
    this.hp -= amount;
    if (byPlayer && (this.mode === 'police')) g.crime(2, 'attack');
    if (this.hp <= 0 && !this.burning) {
      this.hp = 0;
      this.burning = true;
      this.burnT = 2.2 + Math.random() * 2.2;
    }
  }

  explode(g: Game) {
    if (this.exploded) return;
    this.exploded = true;
    this.burning = false;
    g.explode(this.x, 0.8, this.z, 9, 70, this);
    g.spawnDebris(this);
    if (this.mode === 'player') g.ejectPlayer(true);
    this.removeDriverBust();
    this.mode = 'wreck';
    this.hop = 7;
    this.omega += (Math.random() - 0.5) * 3;
    this.vx *= 0.5; this.vz *= 0.5;
    this.model.body.material = wreckMat;
    this.model.parts.forEach((m) => { if (m !== this.model.glass && m !== this.model.body) m.material = wreckMat; });
    this.siren = false;
    this.throttle = 0; this.brake = 1;
  }

  // ------------------------------------------------------------------ main step
  step(dt: number, g: Game) {
    this.age += dt;
    if (this.mode === 'hw') { this.updateVisual(g); return; }

    // Flyable Aircraft 6-DOF aerodynamics path
    if (this.spec.isAircraft && this.flight && this.spec.flight) {
      if (this.mode === 'wreck') {
        this.vx *= Math.exp(-1.5 * dt);
        this.vz *= Math.exp(-1.5 * dt);
        this.vy -= 16 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.z += this.vz * dt;
        const fl = Math.max(this.type === 'seaplane' ? -0.35 : 0, g.groundAt(this.x, this.z, this.y));
        if (this.y < fl) { this.y = fl; this.vy = 0; }
        this.wreckT += dt;
        if (Math.random() < dt * 16) g.fx.smoke(this.x + (Math.random() - 0.5) * 2, this.y + 1.4, this.z + (Math.random() - 0.5) * 2, 1.4, true);
        if (this.wreckT < 45 && Math.random() < dt * 6) g.fx.fire(this.x + (Math.random() - 0.5) * 2, this.y + 1.1, this.z + (Math.random() - 0.5) * 2);
        this.updateVisual(g);
        return;
      }
      const f = this.flight;
      f.x = this.x; f.y = this.y; f.z = this.z;
      const gY = g.groundAt(this.x, this.z, this.y);
      // Seaplane floats smoothly on ocean water (y = -0.35), other planes collide with water
      const floorY = this.type === 'seaplane' ? Math.max(-0.35, gY) : gY;
      const active = this.mode === 'player';
      const res = stepFlightPhysics(f, this.spec.flight, {
        throttleDelta: active ? this.throttleDelta : -0.8,
        pitchIn: active ? this.pitchIn : 0,
        rollIn: active ? this.rollIn : 0,
        yawIn: active ? this.yawIn : 0,
        brake: active ? (this.brake > 0.2 || this.hand) : true,
        groundY: floorY,
      }, dt);
      this.x = f.x; this.y = f.y; this.z = f.z;
      this.vx = f.vx; this.vy = f.vy; this.vz = f.vz;
      this.yaw = f.yaw; this.pitch = f.pitch; this.roll = f.roll;
      this.fwd = f.airspeed;
      this.throttle = f.throttle;
      this.propSpin += (4 + f.throttle * 34 + f.airspeed * 0.4) * dt;
      this.wheelRot += (f.airspeed * dt) / Math.max(0.25, this.spec.wheelR);

      // Wingtip contrails when flying fast
      if (!f.onGround && f.airspeed > 26) {
        this.contrailT -= dt;
        if (this.contrailT <= 0) {
          this.contrailT = 0.03;
          const halfW = this.spec.W * 0.46;
          const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
          const tiltY = Math.sin(this.roll) * halfW;
          g.fx.contrail(this.x + rx * halfW, this.y + 1.5 + tiltY, this.z + rz * halfW);
          g.fx.contrail(this.x - rx * halfW, this.y + 1.5 - tiltY, this.z - rz * halfW);
        }
      }
      // Building / static obstacle collision while flying low
      if (this.y < 140) {
        g.world.resolve(this.x, this.z, this.spec.radius, this.y + 1.2, _po);
        if (_po.hit) {
          if (f.airspeed > 20) {
            this.explode(g);
            return;
          }
          this.x = _po.x; this.z = _po.z;
          f.x = this.x; f.z = this.z;
          f.vx *= -0.25; f.vz *= -0.25;
        }
      }
      if (res.crashed) {
        this.explode(g);
        return;
      }
      if (res.touchedDown && this.mode === 'player') {
        g.shake(0.22);
        g.fx.tireSmoke(this.x, this.y + 0.15, this.z, -this.vx * 0.1, -this.vz * 0.1);
      }
      if (this.burning) {
        this.burnT -= dt;
        if (Math.random() < dt * 28) g.fx.fire(this.x, this.y + 1.4, this.z);
        if (Math.random() < dt * 22) g.fx.smoke(this.x, this.y + 1.6, this.z, 1.3, true);
        if (this.burnT <= 0) this.explode(g);
      }
      this.updateVisual(g);
      return;
    }

    let deckY = g.groundAt(this.x, this.z, this.y);
    if (deckY === 0 && this.y > 4) deckY = g.groundAt(this.x, this.z, 9.4);
    if (!this.susp.airborne && Math.abs(deckY - this.y) < 5) {
      this.y += (deckY - this.y) * Math.min(1, dt * (Math.abs(deckY - this.y) > 1.2 ? 34 : 14));
      this.susp.worldY = this.y;
    }
    if (this.mode === 'ai' || this.mode === 'police' || this.mode === 'racer') this.aiControl(dt, g);
    else if (this.mode === 'parked' || this.mode === 'idle' || this.mode === 'wreck') {
      this.throttle = 0; this.brake = 0.8; this.steerIn = 0;
    }
    if (this.mode === 'wreck') {
      this.vx *= Math.exp(-1.4 * dt); this.vz *= Math.exp(-1.4 * dt);
      this.omega *= Math.exp(-1.5 * dt);
      this.x += this.vx * dt; this.z += this.vz * dt; this.yaw += this.omega * dt;
      this.fwd = 0;
      this.wreckT += dt;
      if (Math.random() < dt * 14) g.fx.smoke(this.x + (Math.random() - 0.5), 1.1, this.z + (Math.random() - 0.5), 0.8, true);
      if (this.wreckT < 40 && Math.random() < dt * 5) g.fx.fire(this.x + (Math.random() - 0.5) * 1.4, 0.9, this.z + (Math.random() - 0.5) * 1.4);
    } else {
      this.physics(dt, g);
    }
    this.collideStatic(g);
    // hop (after explosion)
    if (this.hop !== 0 || this.vy !== 0) {
      this.vy += (this.hop ? this.hop : 0) - 14 * dt;
      this.hop = 0;
      this.y += this.vy * dt;
      const floorY = g.groundAt(this.x, this.z, this.y);
      if (this.y <= floorY) { this.y = floorY; this.vy = 0; }
      this.susp.worldY = this.y;
    }
    // burning / smoke
    if (this.burning) {
      this.burnT -= dt;
      if (Math.random() < dt * 30) g.fx.fire(this.x + (Math.random() - 0.5), this.y + 1.1, this.z + (Math.random() - 0.5));
      if (Math.random() < dt * 22) g.fx.smoke(this.x, this.y + 1.3, this.z, 1, true);
      if (this.burnT <= 0) this.explode(g);
    } else if (this.hp < this.maxHp * 0.4 && this.mode !== 'wreck') {
      if (Math.random() < dt * (this.hp < this.maxHp * 0.2 ? 14 : 6)) g.fx.smoke(this.x + this.fx * 1.6, this.y + 1.0, this.z + this.fz * 1.6, 0.6, this.hp < this.maxHp * 0.2);
    }
    this.updateVisual(g);
  }

  updateVisual(g: Game) {
    const dCam = Math.hypot(this.x - g.camX, this.z - g.camZ);
    const maxDist = g.isSoftwareGl ? 115 : 240;
    const vis =
      !g.interior &&
      (this === g.playerVehicle ||
        this.mission ||
        this.spec.isAircraft ||
        dCam < 22 ||
        (dCam < maxDist && g.inView(this.x, this.z, 5)));
    this.group.visible = vis;
    if (!vis) return;
    const m = this.model;
    if (this.spec.isAircraft) {
      this.group.position.set(this.x, this.y, this.z);
      this.group.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
      m.tiltGroup.rotation.set(0, 0, 0);
      m.tiltGroup.position.y = 0;
      if (m.propeller) {
        m.propeller.rotation.z = this.propSpin;
      }
      if (m.afterburner) {
        const th = this.mode === 'wreck' ? 0 : this.throttle;
        const mat = m.afterburner.material as THREE.MeshBasicMaterial;
        mat.opacity = th > 0.15 ? clamp(th * 0.88, 0, 0.9) : 0;
        m.afterburner.visible = th > 0.15;
        m.afterburner.scale.set(0.75 + th * 0.45, 0.75 + th * 0.45, 0.5 + th * 1.35);
      }
      for (const w of m.wheels) {
        w.spin.rotation.x = this.wheelRot;
      }
      m.beam.visible = this.lightsOn && this.mode !== 'wreck' && (this.flight?.onGround ?? true);
      return;
    }
    this.group.position.set(this.x, this.y - this.sandSink, this.z);
    this.group.rotation.set(0, this.yaw, 0);
    m.tiltGroup.rotation.set(this.pitch + this.slopePitch + (this.mode === 'wreck' ? 0.04 : 0), 0, this.roll + this.slopeRoll + (this.mode === 'wreck' ? 0.05 : 0));
    m.tiltGroup.position.y = this.bodyYOffset;
    for (const w of m.wheels) {
      w.spin.rotation.x = this.wheelRot;
      if (w.front) w.pivot.rotation.y = this.steerAng;
      w.pivot.position.y = this.spec.wheelR;
    }
    const braking = (this.brake > 0.2 && Math.abs(this.fwd) > 0.3) || (this.throttle < 0 && this.fwd > 0.5);
    if (braking !== this.braking) {
      this.braking = braking;
      m.tail.material = braking || (this.mode === 'player' && this.brake > 0.1) ? tailBright : tailDim;
    }
    if (m.bar) {
      const on = this.siren;
      m.bar[0].material = on ? sirenRed : redOff;
      m.bar[1].material = on ? sirenBlue : blueOff;
    }
    m.beam.visible = this.lightsOn && this.mode !== 'wreck' && (this.hasDriver || this.mode === 'player');
  }

  dispose(g: Game) {
    g.scene.remove(this.group);
    disposeVehicleModel(this.model);
  }

  get dead() { return this.mode === 'wreck'; }
}

export function yawDiff(a: number, b: number) { return angDiff(a, b); }
