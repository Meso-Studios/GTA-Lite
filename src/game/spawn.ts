// World population: traffic, parked cars, pedestrians, tourist crowds and police.
import * as THREE from 'three';
import { DECK, LANE_INNER, LANE_OUTER, NB, Rng, clamp, groundHeight, roadLine } from './config';
import { beachgoerLook, civilianLook, copLook, touristLook } from './humans';
import { Ped } from './ped';
import { Vehicle, VMode } from './vehicle';
import { PAINTS, VehicleType } from './vehicles';
import type { Game } from './Game';

const rng = new Rng(777);
const TYPES: [VehicleType, number][] = [['sedan', 34], ['suv', 14], ['sports', 8], ['pickup', 12], ['taxi', 13], ['van', 9], ['police', 6]];
export function pickType(noPolice = false): VehicleType {
  let tot = 0;
  for (const [t, w] of TYPES) if (!(noPolice && t === 'police')) tot += w;
  let r = Math.random() * tot;
  for (const [t, w] of TYPES) {
    if (noPolice && t === 'police') continue;
    r -= w;
    if (r <= 0) return t;
  }
  return 'sedan';
}

export interface SpawnOpts { paint?: number; mode?: VMode; mission?: boolean; driver?: 'civ' | 'cop' | 'racer' | null; tag?: string }

export function spawnVehicle(g: Game, type: VehicleType, x: number, z: number, yaw: number, o: SpawnOpts = {}): Vehicle {
  const v = new Vehicle(type, o.paint ?? PAINTS[Math.floor(Math.random() * PAINTS.length)]);
  v.place(x, z, yaw);
  v.y = groundHeight(x, z);
  v.mode = o.mode ?? 'idle';
  v.mission = !!o.mission;
  v.tag = o.tag ?? '';
  if (o.driver) v.addDriverBust(o.driver);
  v.lightsOn = g.night > 0.45;
  g.scene.add(v.group);
  g.vehicles.push(v);
  v.updateVisual(g);
  return v;
}

export function removeVehicle(g: Game, v: Vehicle) {
  const i = g.vehicles.indexOf(v);
  if (i >= 0) g.vehicles.splice(i, 1);
  v.dispose(g);
  if (v.spot >= 0) {
    const s = g.city.parking[v.spot];
    if (s) {
      if (Math.hypot(v.x - s.x, v.z - s.z) < 4) s.used = false;
      else s.used = true;
    }
  }
}

function randDir(): [number, number] {
  return [[1, 0], [0, 1], [-1, 0], [0, -1]][Math.floor(Math.random() * 4)] as [number, number];
}

export function trySpawnTraffic(g: Game, mode: VMode, type: VehicleType, minD: number, maxD: number, opts: SpawnOpts = {}): Vehicle | null {
  for (let attempt = 0; attempt < 8; attempt++) {
    const k = clamp(g.playerK + Math.floor(Math.random() * 9) - 4, 0, NB), l = clamp(g.playerL + Math.floor(Math.random() * 9) - 4, 0, NB);
    const [dx, dz] = randDir();
    const sk = k - dx, sl = l - dz;
    if (sk < 0 || sk > NB || sl < 0 || sl > NB) continue;
    const lane = Math.random() < 0.5 ? LANE_INNER : LANE_OUTER;
    const before = 22 + Math.random() * 60;
    const x = roadLine(k) - dx * before - dz * lane, z = roadLine(l) - dz * before + dx * lane;
    const d = Math.hypot(x - g.playerX, z - g.playerZ);
    if (d < minD || d > maxD) continue;
    if (g.inView(x, z, 6) && d < 140) continue;
    let clear = true;
    for (const o of g.vehicles) if (Math.hypot(o.x - x, o.z - z) < 11) { clear = false; break; }
    if (!clear) continue;
    const v = spawnVehicle(g, type, x, z, Math.atan2(dx, dz), { mode, driver: mode === 'police' || type === 'police' ? 'cop' : 'civ', ...opts });
    v.placeOnRoad(g, k, l, dx, dz, lane, before);
    v.ai.cruise = (type === 'van' ? 11 : type === 'taxi' ? 15 : 12) + Math.random() * 5;
    if (mode === 'police') { v.ai.cruise = 26 + Math.random() * 5; v.siren = true; }
    if (type === 'police' && mode === 'ai') v.ai.cruise = 14;
    return v;
  }
  return null;
}

let trafficT = 0, parkedT = 0, pedT = 0, crowdT = 0;
export function streamTraffic(g: Game, dt: number) {
  trafficT -= dt;
  if (trafficT > 0) return;
  trafficT = 0.35;
  let count = 0;
  for (const v of g.vehicles) {
    if (v.mode === 'ai') {
      count++;
      const d = Math.hypot(v.x - g.playerX, v.z - g.playerZ);
      if ((d > 330 || (d > 190 && !g.inView(v.x, v.z, 8))) && !v.mission) { removeVehicle(g, v); count--; }
    }
  }
  if (count < g.quality.traffic) trySpawnTraffic(g, 'ai', pickType(), 70, 260);
}

export function streamParked(g: Game, dt: number) {
  parkedT -= dt;
  if (parkedT > 0) return;
  parkedT = 0.6;
  let parked = 0;
  for (const v of g.vehicles) {
    if (v.mode === 'parked') {
      parked++;
      const d = Math.hypot(v.x - g.playerX, v.z - g.playerZ);
      if ((d > 280 || (d > 200 && !g.inView(v.x, v.z, 8))) && !v.mission) { removeVehicle(g, v); parked--; }
    }
  }
  if (parked >= g.quality.parked) return;
  let spawned = 0;
  const spots = g.city.parking;
  for (let n = 0; n < 40 && spawned < 6; n++) {
    const s = spots[Math.floor(Math.random() * spots.length)];
    if (s.used) continue;
    const d = Math.hypot(s.x - g.playerX, s.z - g.playerZ);
    if (d > 170) continue;
    const vis = g.inView(s.x, s.z, 4);
    if (vis && d < 90) continue;
    if (!s.police && Math.random() > 0.65) { continue; }
    let clear = true;
    for (const o of g.vehicles) if (Math.hypot(o.x - s.x, o.z - s.z) < 5.5) { clear = false; break; }
    if (!clear) continue;
    const type = s.police ? 'police' : pickType(true);
    const v = spawnVehicle(g, type, s.x, s.z, s.yaw + (Math.random() - 0.5) * 0.05, { mode: 'parked' });
    v.spot = s.id;
    s.used = true;
    spawned++;
    parked++;
    if (parked >= g.quality.parked) break;
  }
}

export function spawnCivilian(g: Game, minD = 32, maxD = 150): Ped | null {
  for (let a = 0; a < 8; a++) {
    const k = clamp(g.playerK + Math.floor(Math.random() * 7) - 3, 0, NB), l = clamp(g.playerL + Math.floor(Math.random() * 7) - 3, 0, NB);
    const sx = Math.random() < 0.5 ? 1 : -1, sz = Math.random() < 0.5 ? 1 : -1;
    const x = roadLine(k) + sx * 12.5, z = roadLine(l) + sz * 12.5;
    const d = Math.hypot(x - g.playerX, z - g.playerZ);
    if (d < minD || d > maxD) continue;
    if (g.inView(x, z, 3) && d < 85) continue;
    const isTourist = Math.random() < 0.25;
    const p = new Ped(isTourist ? 'tourist' : 'civ', isTourist ? touristLook(rng) : civilianLook(rng));
    p.startNav(g, [k, l, sx, sz]);
    g.addPed(p);
    return p;
  }
  return null;
}

export function streamPeds(g: Game, dt: number) {
  pedT -= dt;
  if (pedT > 0) return;
  pedT = 0.22;
  let count = 0;
  for (const p of g.peds) {
    if (p.dead) {
      if (p.deadT > 50 || Math.hypot(p.x - g.playerX, p.z - g.playerZ) > 180) g.removePed(p);
      continue;
    }
    if ((p.kind === 'civ' || p.kind === 'tourist') && !p.mission && !p.crowdHome) {
      count++;
      const d = Math.hypot(p.x - g.playerX, p.z - g.playerZ);
      if (d > 220 || (d > 120 && !g.inView(p.x, p.z, 2))) { g.removePed(p); count--; }
    } else if (p.kind === 'cop' && p.despawnT > 8) g.removePed(p);
  }
  if (count < g.quality.peds) spawnCivilian(g);
}

// ------------------------------------------------------------------ tourist hotspots & crowds
interface CrowdZone {
  x: number;
  z: number;
  r: number;
  beach: boolean;
  cap: number;
}

const CROWD_ZONES: CrowdZone[] = [
  // Beachfront promenade & pier boardwalk
  { x: -150, z: 572, r: 42, beach: true, cap: 9 },
  { x: -30, z: 568, r: 44, beach: true, cap: 8 },
  { x: 120, z: 568, r: 46, beach: true, cap: 8 },
  { x: -290, z: 566, r: 40, beach: true, cap: 7 },
  // Downtown sightseeing plazas & central park
  { x: -285, z: 24, r: 26, beach: false, cap: 6 },
  { x: 0, z: 0, r: 34, beach: false, cap: 7 },
  { x: 114, z: -114, r: 30, beach: false, cap: 6 },
  { x: -114, z: 114, r: 30, beach: false, cap: 6 },
  // Nova Keys Resort Island
  { x: DECK.ISLAND.cx, z: DECK.ISLAND.cz - 40, r: 75, beach: true, cap: 10 },
  // Golden Dunes Oasis Motel
  { x: -2200, z: 1200, r: 45, beach: false, cap: 6 },
];

export function streamCrowds(g: Game, dt: number) {
  crowdT -= dt;
  if (crowdT > 0) return;
  crowdT = 0.45;

  let totalTourists = 0;
  for (const p of g.peds) {
    if (p.dead || !p.crowdHome) continue;
    const d = Math.hypot(p.x - g.playerX, p.z - g.playerZ);
    if (d > 260) {
      g.removePed(p);
      continue;
    }
    totalTourists++;
  }

  const maxCrowds = Math.round(g.quality.peds * 0.72);
  if (totalTourists >= maxCrowds) return;

  for (const z of CROWD_ZONES) {
    const d = Math.hypot(z.x - g.playerX, z.z - g.playerZ);
    if (d > 210) continue;
    let inZone = 0;
    for (const p of g.peds) {
      if (!p.dead && p.crowdHome && Math.hypot(p.crowdHome.x - z.x, p.crowdHome.z - z.z) < 5) inZone++;
    }
    if (inZone >= z.cap) continue;
    const batch = Math.min(3, z.cap - inZone, maxCrowds - totalTourists);
    for (let i = 0; i < batch; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * (z.r * 0.85);
      const sx = z.x + Math.cos(ang) * dist;
      const sz = z.z + Math.sin(ang) * dist;
      if (g.world.solidAt(sx, 0.8, sz)) continue;
      const look = z.beach && Math.random() < 0.55 ? beachgoerLook(rng) : touristLook(rng);
      const p = new Ped('tourist', look);
      p.startCrowd(sx, sz, z.x, z.z, z.r);
      p.y = groundHeight(sx, sz);
      p.rig.root.position.set(sx, p.y, sz);
      g.addPed(p);
      totalTourists++;
      if (totalTourists >= maxCrowds) return;
    }
  }
}

// ------------------------------------------------------------------ police
let policeT = 0;
export function updatePolice(g: Game, dt: number) {
  policeT -= dt;
  const want = [0, 2, 3, 5, 7, 9][g.wanted];
  let cops = 0;
  for (const v of g.vehicles) {
    if (v.mode === 'police') cops++;
    if (g.wanted > 0 && v.type === 'police' && (v.mode === 'ai' || v.mode === 'parked') && v.hasDriver && Math.hypot(v.x - g.playerX, v.z - g.playerZ) < 200) {
      v.mode = 'police'; v.siren = true; v.ai.cruise = 26 + Math.random() * 5; v.resnap(g); cops++;
    }
    if (g.wanted === 0 && v.mode === 'police') {
      v.siren = false; v.mode = 'ai'; v.ai.cruise = 14; v.resnap(g);
    }
    if (g.wanted > 0 && v.mode === 'police' && Math.hypot(v.x - g.playerX, v.z - g.playerZ) > 420 && !g.inView(v.x, v.z, 8)) {
      removeVehicle(g, v); cops--;
    }
  }
  if (g.wanted > 0 && cops < want && policeT <= 0) {
    policeT = 2.2;
    trySpawnTraffic(g, 'police', 'police', 110, 300, { driver: 'cop' });
  }
}

export function deployCops(g: Game, car: Vehicle) {
  const n = g.wanted >= 4 ? 3 : 2;
  car.removeDriverBust();
  car.mode = 'idle';
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const rx = -car.fz, rz = car.fx;
    const x = car.x + rx * side * (car.spec.W / 2 + 0.9) + car.fx * (i - 1) * 0.8, z = car.z + rz * side * (car.spec.W / 2 + 0.9) + car.fz * (i - 1) * 0.8;
    const p = new Ped('cop', copLook(rng));
    p.place(x, z);
    p.yaw = Math.atan2(g.playerX - x, g.playerZ - z);
    p.hostile = true; p.aggro = true; p.hp = p.maxHp = 55;
    p.arm(g.wanted >= 5 ? 'carbine' : g.wanted >= 4 ? 'rifle' : g.wanted >= 3 ? 'smg' : 'pistol');
    p.dmg = g.wanted >= 4 ? 6 : 5;
    p.accuracy = 0.85 + g.wanted * 0.08;
    p.speed = 5;
    g.addPed(p);
  }
}

export function makeColor(c: number) { return new THREE.Color(c); }
