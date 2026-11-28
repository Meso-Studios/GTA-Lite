// Realistic & intuitive aiming system: magnetic soft aim-assist, first-shot precision,
// smooth recoil auto-recovery, smart reticle feedback, and 30-foot+ pistol headshot slomo grayscale killcam.
// Pure math (zero Three.js dependencies) so every rule is deterministic and unit-testable.

export const FEET_PER_METER = 3.28084;
export const PISTOL_HEADSHOT_MIN_FEET = 30;
export const PISTOL_HEADSHOT_MIN_METERS = PISTOL_HEADSHOT_MIN_FEET / FEET_PER_METER; // 9.144 m

export interface AimTargetCandidate {
  id: number;
  x: number;
  y: number; // feet world Y
  z: number;
  heightScale: number;
  hostile: boolean;
}

export interface AimAssistResult {
  dx: number;
  dy: number;
  dz: number;
  locked: boolean;
  headLocked: boolean;
  targetId: number | null;
  targetDist: number;
  pullYaw: number;
  pullPitch: number;
}

/**
 * Computes realistic, effortless soft aim-assist:
 * - Prefers headshots when reticle is near head height (makes clean precision shots intuitive)
 * - Gently bends shot direction within a subtle angular cone (stronger when ADS)
 * - Outputs subtle camera yaw/pitch magnetism so tracking moving targets feels smooth and natural
 */
export function computeAimAssist(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  candidates: readonly AimTargetCandidate[],
  aiming: boolean,
  scoped: boolean,
  maxRange = 140,
): AimAssistResult {
  const baseConeRad = scoped ? 0.036 : aiming ? 0.118 : 0.078; // ~2.1° scoped, ~6.8° ADS, ~4.5° hipfire
  const baseCos = Math.cos(baseConeRad);

  let bestScore = -1;
  let bestTarget: AimTargetCandidate | null = null;
  let bestDirX = dx;
  let bestDirY = dy;
  let bestDirZ = dz;
  let bestDist = maxRange;
  let bestIsHead = false;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const ex = c.x - ox;
    const ez = c.z - oz;
    const horizSq = ex * ex + ez * ez;
    if (horizSq < 0.36 || horizSq > maxRange * maxRange) continue;

    // Evaluate both head point (1.66m * scale) and upper chest point (1.28m * scale)
    const headY = c.y + 1.66 * c.heightScale;
    const chestY = c.y + 1.28 * c.heightScale;

    for (let pt = 0; pt < 2; pt++) {
      const isHead = pt === 0;
      const ty = isHead ? headY : chestY;
      const ey = ty - oy;
      const dist = Math.sqrt(horizSq + ey * ey);
      if (dist < 0.8 || dist > maxRange) continue;

      const tx = ex / dist;
      const tyy = ey / dist;
      const tz = ez / dist;
      const dot = tx * dx + tyy * dy + tz * dz;

      // Head lock requires tighter alignment than body lock so headshots feel earned & crisp
      const reqCos = isHead ? Math.cos(baseConeRad * (aiming ? 0.62 : 0.45)) : baseCos;
      if (dot < reqCos) continue;

      const alignScore = (dot - reqCos) / (1 - reqCos + 1e-6);
      const distWeight = 1 - Math.min(0.65, dist / (maxRange * 1.15));
      const hostileBonus = c.hostile ? 1.18 : 1.0;
      const headBonus = isHead ? 1.22 : 1.0;
      const score = alignScore * distWeight * hostileBonus * headBonus;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = c;
        bestDirX = tx;
        bestDirY = tyy;
        bestDirZ = tz;
        bestDist = dist;
        bestIsHead = isHead;
      }
    }
  }

  if (!bestTarget) {
    return {
      dx,
      dy,
      dz,
      locked: false,
      headLocked: false,
      targetId: null,
      targetDist: maxRange,
      pullYaw: 0,
      pullPitch: 0,
    };
  }

  // Softly blend shot ray toward target (stronger when actively ADS so shots reliably land where you aim)
  const magnet = scoped ? 0.58 : aiming ? 0.86 : 0.58;
  let rx = dx + (bestDirX - dx) * magnet;
  let ry = dy + (bestDirY - dy) * magnet;
  let rz = dz + (bestDirZ - dz) * magnet;
  const rLen = Math.hypot(rx, ry, rz) || 1;
  rx /= rLen;
  ry /= rLen;
  rz /= rLen;

  // Compute gentle camera yaw/pitch delta for silky ADS tracking
  const curYaw = Math.atan2(dx, dz);
  const tgtYaw = Math.atan2(bestDirX, bestDirZ);
  let dYaw = tgtYaw - curYaw;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;

  const curPitch = -Math.asin(Math.max(-1, Math.min(1, dy)));
  const tgtPitch = -Math.asin(Math.max(-1, Math.min(1, bestDirY)));
  const dPitch = tgtPitch - curPitch;

  return {
    dx: rx,
    dy: ry,
    dz: rz,
    locked: true,
    headLocked: bestIsHead,
    targetId: bestTarget.id,
    targetDist: bestDist,
    pullYaw: dYaw,
    pullPitch: dPitch,
  };
}

export interface RecoilState {
  accumPitch: number;   // accumulated upward camera kick (rad)
  bloom: number;        // 0..1 dynamic crosshair bloom
  consecutiveShots: number;
  timeSinceShot: number;
}

export function createRecoilState(): RecoilState {
  return { accumPitch: 0, bloom: 0, consecutiveShots: 0, timeSinceShot: 10 };
}

/** Records a player shot and returns the damped camera kick + effective spread multiplier. */
export function registerPlayerShot(
  st: RecoilState,
  baseRecoil: number,
  aiming: boolean,
  crouching: boolean,
): { pitchKick: number; spreadMul: number } {
  const firstShot = st.timeSinceShot > 0.34;
  st.consecutiveShots = firstShot ? 1 : Math.min(12, st.consecutiveShots + 1);
  st.timeSinceShot = 0;

  // Realistic first-shot accuracy (laser crisp tap-fire, controlled sustained fire)
  const tapBonus = firstShot ? 0.22 : Math.min(1.0, 0.38 + st.consecutiveShots * 0.14);
  const stanceMul = (aiming ? 0.42 : 0.78) * (crouching ? 0.72 : 1.0);
  const spreadMul = tapBonus * stanceMul;

  // Manageable, crisp recoil kick that auto-recovers smoothly
  const kick = baseRecoil * (aiming ? 0.52 : 0.72) * (crouching ? 0.75 : 1.0);
  st.accumPitch = Math.min(0.18, st.accumPitch + kick);
  st.bloom = Math.min(1.0, st.bloom + (firstShot ? 0.22 : 0.18));

  return { pitchKick: kick, spreadMul };
}

/** Smoothly auto-recovers weapon recoil back toward original aim pitch between bursts. */
export function stepRecoilRecovery(st: RecoilState, dt: number): number {
  const safeDt = Math.max(0.0001, Math.min(dt, 0.1));
  st.timeSinceShot += safeDt;
  st.bloom *= Math.exp(-7.5 * safeDt);
  if (st.bloom < 0.002) st.bloom = 0;

  if (st.accumPitch > 0.0002 && st.timeSinceShot > 0.08) {
    const prev = st.accumPitch;
    st.accumPitch *= Math.exp(-8.5 * safeDt);
    if (st.accumPitch < 0.0002) st.accumPitch = 0;
    return prev - st.accumPitch; // pitch delta to restore downward
  }
  return 0;
}

/** Returns true when a weapon is a pistol eligible for the 30ft+ headshot slomo grayscale killcam. */
export function isPistolWeapon(weapon: string): boolean {
  return weapon === 'pistol' || weapon === 'silenced';
}

/** Checks whether a shot qualifies for the 30-foot (9.144m)+ pistol headshot slomo grayscale effect. */
export function shouldTriggerPistolHeadshotSlomo(
  weapon: string,
  isHeadshot: boolean,
  distanceMeters: number,
): boolean {
  return isPistolWeapon(weapon) && isHeadshot && distanceMeters >= PISTOL_HEADSHOT_MIN_METERS;
}

export interface SlomoKillcamState {
  active: boolean;
  elapsed: number;
  duration: number;
  timeScale: number;     // 0.22 .. 1.0
  grayscale: number;     // 0.0 .. 0.96
  vignette: number;      // 0.0 .. 1.0
  distanceFeet: number;
  label: string;
}

export function createSlomoKillcamState(): SlomoKillcamState {
  return {
    active: false,
    elapsed: 0,
    duration: 1.75,
    timeScale: 1.0,
    grayscale: 0.0,
    vignette: 0.0,
    distanceFeet: 0,
    label: '',
  };
}

export function triggerPistolHeadshotSlomo(st: SlomoKillcamState, distanceMeters: number): void {
  st.active = true;
  st.elapsed = 0;
  st.duration = 1.75;
  st.distanceFeet = Math.round(distanceMeters * FEET_PER_METER);
  st.label = `LONGSHOT HEADSHOT · ${st.distanceFeet} FT`;
  st.timeScale = 0.22;
  st.grayscale = 0.96;
  st.vignette = 0.85;
}

/** Advances the slomo grayscale effect in real (unscaled) seconds. */
export function stepSlomoKillcam(st: SlomoKillcamState, realDt: number): void {
  if (!st.active) {
    st.timeScale = 1.0;
    st.grayscale = 0.0;
    st.vignette = 0.0;
    return;
  }
  st.elapsed += Math.max(0, Math.min(realDt, 0.1));
  if (st.elapsed >= st.duration) {
    st.active = false;
    st.timeScale = 1.0;
    st.grayscale = 0.0;
    st.vignette = 0.0;
    st.label = '';
    return;
  }
  const u = st.elapsed / st.duration;
  // Instant cinematic snap-in (0..0.08), sustained crisp slomo grayscale plateau (0.08..0.68), smooth ramp-out (0.68..1.0)
  let env: number;
  if (u < 0.08) {
    env = u / 0.08;
  } else if (u < 0.68) {
    env = 1.0;
  } else {
    const t = (u - 0.68) / 0.32;
    env = 1.0 - t * t * (3 - 2 * t);
  }
  st.timeScale = 1.0 - 0.78 * env; // down to 0.22x slow motion
  st.grayscale = 0.96 * env;
  st.vignette = 0.85 * env;
}
