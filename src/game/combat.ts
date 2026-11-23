// Ray casting, shooting, melee and explosions.
import * as THREE from 'three';
import { WEAPONS, clamp, isMeleeWeapon } from './config';
import { muzzleWorld } from './humans';
import type { Game } from './Game';
import type { Ped } from './ped';
import type { Prop } from './props';
import type { Vehicle } from './vehicle';

export interface Hit {
  t: number;
  kind: 'none' | 'static' | 'ground' | 'ped' | 'veh' | 'prop';
  ped?: Ped;
  veh?: Vehicle;
  prop?: Prop;
  head?: boolean;
}
const SPH: [number, number][] = [[0.42, 0.3], [0.95, 0.3], [1.3, 0.27], [1.66, 0.15]];
const _m = new THREE.Vector3();

export function castRay(g: Game, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number, ignoreVeh: Vehicle | null = null, ignorePed: Ped | null = null): Hit {
  const best: Hit = { t: maxD, kind: 'none' };
  const ts = g.world.ray(ox, oy, oz, dx, dy, dz, maxD, 0.5);
  if (ts >= 0) { best.t = ts; best.kind = oy + dy * ts < 0.12 ? 'ground' : 'static'; }
  for (const p of g.peds) {
    if (p === ignorePed || p.dead) continue;
    const ex = p.x - ox, ez = p.z - oz;
    if (ex * ex + ez * ez > (best.t + 2) * (best.t + 2)) continue;
    const sc = p.rig.root.scale.y;
    for (let i = 0; i < SPH.length; i++) {
      const cy = p.y + SPH[i][0] * sc, r = SPH[i][1] * sc;
      const ey = cy - oy;
      const tca = ex * dx + ey * dy + ez * dz;
      if (tca < 0) continue;
      const d2 = ex * ex + ey * ey + ez * ez - tca * tca;
      if (d2 > r * r) continue;
      const t0 = tca - Math.sqrt(r * r - d2);
      if (t0 < best.t && t0 > 0) { best.t = t0; best.kind = 'ped'; best.ped = p; best.head = i === 3; }
    }
  }
  for (const v of g.vehicles) {
    if (v === ignoreVeh) continue;
    const ex = v.x - ox, ez = v.z - oz;
    if (ex * ex + ez * ez > (best.t + 6) * (best.t + 6)) continue;
    const fx = v.fx, fz = v.fz, rx = -fz, rz = fx;
    const lox = (ox - v.x) * rx + (oz - v.z) * rz, loz = (ox - v.x) * fx + (oz - v.z) * fz;
    const ldx = dx * rx + dz * rz, ldz = dx * fx + dz * fz;
    const hx = v.spec.W / 2, hz = v.spec.L / 2, y0 = v.y + 0.3, y1 = v.y + (v.type === 'van' ? 2.2 : v.type === 'suv' || v.type === 'pickup' ? 1.8 : 1.45);
    let tmin = 0, tmax = best.t;
    const slab = (o: number, d: number, lo: number, hi: number) => {
      if (Math.abs(d) < 1e-6) return o >= lo && o <= hi;
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      return tmin <= tmax;
    };
    if (slab(lox, ldx, -hx, hx) && slab(oy, dy, y0, y1) && slab(loz, ldz, -hz, hz) && tmin > 0 && tmin < best.t) {
      best.t = tmin; best.kind = 'veh'; best.veh = v;
    }
  }
  for (const pr of g.props) {
    if (!pr.mesh.visible) continue;
    const ex = pr.x - ox, ez = pr.z - oz;
    const ey = pr.y + pr.def.hh - oy;
    const tca = ex * dx + ey * dy + ez * dz;
    if (tca < 0 || tca > best.t) continue;
    const d2 = ex * ex + ey * ey + ez * ez - tca * tca;
    const r = pr.def.r + 0.1;
    if (d2 > r * r) continue;
    const t0 = tca - Math.sqrt(r * r - d2);
    if (t0 < best.t && t0 > 0) { best.t = t0; best.kind = 'prop'; best.prop = pr; }
  }
  return best;
}

export function applyHit(g: Game, h: Hit, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, dmg: number, byPlayer: boolean) {
  const x = ox + dx * h.t, y = oy + dy * h.t, z = oz + dz * h.t;
  switch (h.kind) {
    case 'ped':
      h.ped!.hit(g, dmg, dx, dz, byPlayer, h.head);
      if (h.ped!.dead) { h.ped!.rvx += dx * 2; h.ped!.rvz += dz * 2; }
      break;
    case 'veh':
      h.veh!.damage(dmg * 0.7, g, byPlayer);
      for (let i = 0; i < 3; i++) g.fx.spark(x, y, z, -dx, 0.4, -dz);
      g.audio.hit(0.5);
      if (h.veh!.mode === 'ai' || h.veh!.mode === 'racer') { h.veh!.stunned = 0.6; if (h.veh!.hasDriver && byPlayer) g.crime(1, 'attack'); }
      break;
    case 'prop':
      h.prop!.hurt(g, dmg);
      h.prop!.impulse(dx * 4, 2.5, dz * 4, 6);
      g.fx.spark(x, y, z, -dx, 0.3, -dz);
      break;
    case 'static':
      g.fx.spark(x, y, z, -dx, 0.2, -dz);
      g.fx.dust(x, y, z);
      break;
    case 'ground':
      g.fx.dust(x, y + 0.1, z);
      break;
    default: break;
  }
}

export function playerFire(g: Game) {
  const p = g.player;
  const w = WEAPONS[p.weapon];
  if (isMeleeWeapon(p.weapon)) return;
  if (p.ammo[p.weapon] <= 0) { g.audio.beep(300, 0.08); p.fireT = 0.25; return; }
  if (p.weapon === 'grenade') {
    p.ammo[p.weapon]--;
    p.fireT = 1 / w.rate;
    const cd = g.camDir;
    const ox = p.x + cd.x * 1.2 + Math.sin(p.yaw + Math.PI / 2) * 0.25;
    const oy = p.y + 1.35;
    const oz = p.z + cd.z * 1.2 + Math.cos(p.yaw + Math.PI / 2) * 0.25;
    g.throwGrenade(ox, oy, oz, cd.x * 22 + p.vx * 0.6, cd.y * 22 + 5.5, cd.z * 22 + p.vz * 0.6);
    p.rig.pose.aRx = -2.2;
    g.audio.beep(420, 0.05);
    g.playerFiring = true;
    g.firingT = 0.3;
    g.alarm(p.x, p.z, 40, false);
    return;
  }
  if (p.weapon === 'rpg') {
    p.ammo[p.weapon]--;
    p.fireT = 1 / w.rate;
    const cd = g.camDir;
    const mz = muzzleWorld(p.rig, _m);
    g.fireRocket(mz.x + cd.x * 0.4, mz.y + cd.y * 0.2, mz.z + cd.z * 0.4, cd.x, cd.y, cd.z);
    g.fx.muzzle(mz.x, mz.y, mz.z);
    g.fx.smoke(mz.x - cd.x * 1.2, mz.y, mz.z - cd.z * 1.2, 1.0, false);
    g.audio.shot('rpg', 1, 0);
    g.kick(0.08);
    g.shake(0.35);
    g.alarm(p.x, p.z, 95, true);
    g.playerFiring = true;
    g.firingT = 0.5;
    if (g.wanted === 0) {
      for (const o of g.peds) if (o.kind === 'cop' && !o.dead && Math.hypot(o.x - p.x, o.z - p.z) < 75) { g.crime(2, 'gunfire'); break; }
    }
    return;
  }
  p.ammo[p.weapon]--;
  p.fireT = 1 / w.rate;
  const cd = g.camDir;
  const cp = g.camera.position;
  const t0 = Math.max(0, (p.x - cp.x) * cd.x + (p.y + 1.5 - cp.y) * cd.y + (p.z - cp.z) * cd.z);
  const ox = cp.x + cd.x * t0, oy = cp.y + cd.y * t0, oz = cp.z + cd.z * t0;
  const mz = muzzleWorld(p.rig, _m);
  const mx = mz.x, my = mz.y, mzz = mz.z;
  const rightX = -cd.z, rightZ = cd.x;
  const crouchMul = p.move.crouching ? 0.65 : 1;
  const spreadMul = crouchMul * (g.input.aim ? 0.55 : 1) * (g.scope ? 0.08 : 1) * (1 + Math.min(1, Math.hypot(p.vx, p.vz) / 8) * 0.6);
  for (let i = 0; i < w.pellets; i++) {
    const sx = (Math.random() - 0.5) * 2 * w.spread * spreadMul, sy = (Math.random() - 0.5) * 2 * w.spread * spreadMul;
    let dx = cd.x + rightX * sx, dy = cd.y + sy, dz = cd.z + rightZ * sx;
    const l = Math.hypot(dx, dy, dz);
    dx /= l; dy /= l; dz /= l;
    const h = castRay(g, ox, oy, oz, dx, dy, dz, w.range, p.vehicle, null);
    applyHit(g, h, ox, oy, oz, dx, dy, dz, w.dmg, true);
    if (i < 3 || w.pellets === 1) g.fx.tracer(mx, my, mzz, ox + dx * h.t, oy + dy * h.t, oz + dz * h.t);
  }
  const silenced = 'silenced' in w && w.silenced;
  if (!silenced) g.fx.muzzle(mx, my, mzz);
  g.audio.shot(p.weapon, 1, 0);
  g.alarm(p.x, p.z, silenced ? 16 : p.weapon === 'pistol' ? 45 : 75, !silenced);
  g.kick(('recoil' in w ? w.recoil : 0.014) ?? 0.014);
  g.playerFiring = true;
  g.firingT = 0.4;
  if (g.wanted === 0 && !silenced) {
    for (const o of g.peds) if (o.kind === 'cop' && !o.dead && Math.hypot(o.x - p.x, o.z - p.z) < 55) { g.crime(1, 'gunfire'); break; }
  }
}

export function playerMelee(g: Game) {
  const p = g.player;
  const w = WEAPONS[p.weapon];
  p.fireT = 1 / w.rate;
  p.punchT = 0.001;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const reach = p.weapon === 'katana' ? 3.2 : p.weapon === 'bat' ? 2.9 : 2.3;
  const cone = p.weapon === 'katana' ? 0.15 : 0.35;
  let hitAny = false;
  for (const o of g.peds) {
    if (o.dead) continue;
    const dx = o.x - p.x, dz = o.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > reach || (dx * fx + dz * fz) / (d || 1) < cone) continue;
    const l = d || 1;
    o.hit(g, w.dmg + Math.random() * 6, dx / l, dz / l, true);
    o.vx += (dx / l) * (p.weapon === 'katana' ? 4.2 : 3);
    o.vz += (dz / l) * (p.weapon === 'katana' ? 4.2 : 3);
    if (o.dead) { o.rvx = (dx / l) * 5.5; o.rvz = (dz / l) * 5.5; }
    hitAny = true;
    if (p.weapon !== 'katana') break; // katana can cleave multiple targets
  }
  if (p.weapon === 'katana') g.audio.katanaSlash();
  else if (hitAny) g.audio.punch();
  else g.audio.hit(0.3);
}

export function npcShoot(g: Game, p: Ped, acc: number) {
  const m = p.muzzle(_m);
  const mx = m.x, my = m.y, mz = m.z;
  const tx = g.playerX, ty = g.playerOnFoot ? 1.2 : 1.0, tz = g.playerZ;
  const d = Math.hypot(tx - mx, tz - mz);
  let chance = clamp(0.58 * acc - d * 0.011 - g.playerSpeed * 0.022, 0.07, 0.62);
  if (!g.playerOnFoot) chance *= 0.75;
  const hit = Math.random() < chance;
  const ex = hit ? tx : tx + (Math.random() - 0.5) * 4, ey = hit ? ty : ty + (Math.random() - 0.5) * 2, ez = hit ? tz : tz + (Math.random() - 0.5) * 4;
  g.fx.tracer(mx, my, mz, ex, ey, ez);
  if (d < 70) g.fx.muzzle(mx, my, mz);
  g.audio.shot(p.kind === 'cop' ? 'pistol' : 'smg', clamp(1 - d / 110, 0.08, 1), g.panOf(p.x, p.z));
  if (hit) {
    if (g.playerOnFoot) g.hurtPlayer(p.dmg, 'bullet');
    else { g.hurtPlayer(p.dmg * 0.35, 'bullet'); g.player.vehicle?.damage(2.5, g); }
  } else if (!g.playerOnFoot) g.player.vehicle?.damage(0.8, g);
  else g.fx.spark(ex, 0.3, ez, 0, 1, 0);
}

export function explode(g: Game, x: number, y: number, z: number, radius: number, dmg: number, src: Vehicle | null, byPlayer = true) {
  g.fx.explosion(x, y, z, radius * 0.6);
  const cd = Math.hypot(x - g.camX, z - g.camZ);
  g.audio.explosion(clamp(1 - cd / 220, 0.08, 1));
  g.shake(clamp(1.2 - cd / 60, 0, 1.2));
  const R = radius * 1.35;
  for (const p of g.peds) {
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
    if (d > R) continue;
    const k = 1 - d / R;
    const l = d || 1;
    if (p.dead) { p.rvx += (dx / l) * k * 10; p.rvz += (dz / l) * k * 10; p.rvy = 4 * k; p.landed = false; continue; }
    p.hp -= dmg * k * 1.3;
    if (p.hp <= 0) p.kill(g, (dx / l) * 12 * k + 2, 6 + 6 * k, (dz / l) * 12 * k, byPlayer);
    else p.flee(g, x, z, 10);
  }
  for (const v of g.vehicles) {
    if (v === src) continue;
    const dx = v.x - x, dz = v.z - z, d = Math.hypot(dx, dz);
    if (d > R * 1.3) continue;
    const k = clamp(1 - d / (R * 1.3), 0, 1);
    const l = d || 1;
    v.vx += (dx / l) * k * 14; v.vz += (dz / l) * k * 14;
    v.omega += (Math.random() - 0.5) * 5 * k;
    v.hop = Math.max(v.hop, k * 3.5);
    v.damage(dmg * k * 1.4, g, byPlayer);
    if (v.mode === 'ai' || v.mode === 'racer') v.stunned = 3;
  }
  for (const pr of g.props) {
    const dx = pr.x - x, dz = pr.z - z, d = Math.hypot(dx, dz);
    if (d > R * 1.5 || !pr.mesh.visible) continue;
    const k = 1 - d / (R * 1.5);
    const l = d || 1;
    pr.impulse((dx / l) * k * 22, 6 + k * 9, (dz / l) * k * 22, 12);
    if (pr.kind === 'xbarrel' && !pr.exploded) pr.hp -= 70 * k + 10;
  }
  const dp = Math.hypot(g.playerX - x, g.playerZ - z);
  if (dp < R) {
    const k = 1 - dp / R;
    g.hurtPlayer(dmg * k * (g.player.vehicle && g.player.vehicle !== src ? 0.4 : 1.1), 'explosion');
    if (g.playerOnFoot) {
      g.player.vx += ((g.playerX - x) / (dp || 1)) * 10 * k;
      g.player.vz += ((g.playerZ - z) / (dp || 1)) * 10 * k;
      g.player.vy = 5 * k;
    }
  }
  g.alarm(x, z, 80, false);
}
