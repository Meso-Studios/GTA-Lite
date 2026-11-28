// Pure physics-driven reactive sub-animations, smooth bare-hand fighting moves & NPC brawler retaliation rules.
// Zero Three.js dependencies so every curve, balance catch, combo move, and brawler rule is deterministic & unit-testable.

export type BareHandMove =
  | 'jab_left'
  | 'cross_right'
  | 'hook_left'
  | 'hook_right'
  | 'uppercut_right'
  | 'haymaker_left';

export interface BareHandMoveSpec {
  id: BareHandMove;
  label: string;
  duration: number;
  damage: number;
  reach: number;
  knockback: number;
  cone: number;
}

export const BARE_HAND_SEQUENCE: BareHandMove[] = [
  'jab_left',
  'cross_right',
  'hook_left',
  'hook_right',
  'uppercut_right',
  'haymaker_left',
];

export const BARE_HAND_MOVES: Record<BareHandMove, BareHandMoveSpec> = {
  jab_left: {
    id: 'jab_left',
    label: 'Left Jab',
    duration: 0.3,
    damage: 13,
    reach: 2.35,
    knockback: 2.2,
    cone: 0.42,
  },
  cross_right: {
    id: 'cross_right',
    label: 'Right Cross',
    duration: 0.36,
    damage: 18,
    reach: 2.5,
    knockback: 3.1,
    cone: 0.38,
  },
  hook_left: {
    id: 'hook_left',
    label: 'Left Hook',
    duration: 0.4,
    damage: 21,
    reach: 2.35,
    knockback: 3.6,
    cone: 0.25,
  },
  hook_right: {
    id: 'hook_right',
    label: 'Right Hook',
    duration: 0.42,
    damage: 22,
    reach: 2.35,
    knockback: 3.8,
    cone: 0.25,
  },
  uppercut_right: {
    id: 'uppercut_right',
    label: 'Uppercut',
    duration: 0.46,
    damage: 26,
    reach: 2.25,
    knockback: 4.1,
    cone: 0.35,
  },
  haymaker_left: {
    id: 'haymaker_left',
    label: 'Haymaker',
    duration: 0.5,
    damage: 29,
    reach: 2.45,
    knockback: 4.8,
    cone: 0.22,
  },
};

export type SubAnimKind =
  | 'none'
  | 'sudden_stop_catch'
  | 'quick_start_lean'
  | 'sharp_turn_pivot'
  | 'land_absorb'
  | 'stumble_recover';

export interface MotionAnimState {
  prevSpeed: number;
  peakRecentSpeed: number;
  peakDecayT: number;
  prevAirborne: boolean;
  airborneTime: number;
  activeSub: SubAnimKind;
  subT: number;
  subDur: number;
  subIntensity: number;
  leadFootSign: number; // +1 left lead, -1 right lead
  turnSmooth: number;
}

export interface MotionSubInput {
  speed: number;
  airborne: boolean;
  turnRate: number;
  flinch: number;
  crouch: boolean;
  slide: boolean;
  stridePhase: number;
}

export interface SubAnimOffset {
  activeSub: SubAnimKind;
  progress: number;
  hipsY: number;
  hipsX: number;
  lean: number;
  twist: number;
  bank: number;
  headX: number;
  headY: number;
  hipL: number;
  hipR: number;
  knL: number;
  knR: number;
  aLx: number;
  aLz: number;
  aRx: number;
  aRz: number;
  elL: number;
  elR: number;
  springBoost: number;
}

export interface BareHandPose {
  aLx: number;
  aLz: number;
  aRx: number;
  aRz: number;
  elL: number;
  elR: number;
  lean: number;
  twist: number;
  bank: number;
  headX: number;
  headY: number;
  hipsY: number;
  hipL: number;
  hipR: number;
  knL: number;
  knR: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

/** Smooth 3-phase bell curve: windup (-), snap (+1 peak), elastic settle (0). */
function strikeCurve(u: number, windupEnd: number, peakAt: number): { windup: number; strike: number; follow: number } {
  const t = clamp01(u);
  const windup = t < windupEnd
    ? Math.sin((t / windupEnd) * Math.PI)
    : 0;
  let strike = 0;
  if (t >= windupEnd * 0.65 && t <= peakAt) {
    strike = smoothstep(windupEnd * 0.65, peakAt, t);
  } else if (t > peakAt) {
    strike = 1 - smoothstep(peakAt, 1.0, t);
  }
  const follow = t > peakAt ? Math.sin(((t - peakAt) / Math.max(0.01, 1 - peakAt)) * Math.PI) : 0;
  return { windup, strike, follow };
}

export function createMotionAnimState(): MotionAnimState {
  return {
    prevSpeed: 0,
    peakRecentSpeed: 0,
    peakDecayT: 0,
    prevAirborne: false,
    airborneTime: 0,
    activeSub: 'none',
    subT: 0,
    subDur: 0.4,
    subIntensity: 0,
    leadFootSign: 1,
    turnSmooth: 0,
  };
}

/**
 * Advances physics-reactive sub-animations (sudden run/sprint stop balance-catch,
 * quick-start push-off lean, airborne landing knee absorption, sharp turn pivot,
 * and hit-stagger stumble recovery) to eliminate stiff/cubic transitions.
 */
export function stepMotionSubAnim(st: MotionAnimState, inp: MotionSubInput, dt: number): SubAnimOffset {
  const safeDt = Math.min(Math.max(dt, 0.0001), 0.1);
  const out: SubAnimOffset = {
    activeSub: 'none',
    progress: 0,
    hipsY: 0,
    hipsX: 0,
    lean: 0,
    twist: 0,
    bank: 0,
    headX: 0,
    headY: 0,
    hipL: 0,
    hipR: 0,
    knL: 0,
    knR: 0,
    aLx: 0,
    aLz: 0,
    aRx: 0,
    aRz: 0,
    elL: 0,
    elR: 0,
    springBoost: 0,
  };

  // Track recent peak running speed so a multi-frame deceleration from sprint still triggers balance-catch
  if (inp.speed >= st.peakRecentSpeed) {
    st.peakRecentSpeed = inp.speed;
    st.peakDecayT = 0.28;
  } else if (st.peakDecayT > 0) {
    st.peakDecayT = Math.max(0, st.peakDecayT - safeDt);
  } else {
    st.peakRecentSpeed = Math.max(inp.speed, st.peakRecentSpeed - safeDt * 12);
  }

  if (inp.airborne) {
    st.airborneTime += safeDt;
  }

  const decel = (st.prevSpeed - inp.speed) / safeDt;
  const accel = (inp.speed - st.prevSpeed) / safeDt;

  // Trigger priority: Land Absorb > Stumble Recover > Sudden Stop Catch > Quick Start Lean
  if (st.prevAirborne && !inp.airborne && !inp.slide && st.airborneTime > 0.08) {
    st.activeSub = 'land_absorb';
    st.subT = 0;
    st.subDur = 0.36;
    st.subIntensity = clamp01(0.45 + st.airborneTime * 0.85);
    st.leadFootSign = Math.sin(inp.stridePhase) >= 0 ? 1 : -1;
    st.airborneTime = 0;
  } else if (inp.flinch > 0.65 && st.activeSub !== 'stumble_recover') {
    st.activeSub = 'stumble_recover';
    st.subT = 0;
    st.subDur = 0.46;
    st.subIntensity = clamp01(inp.flinch);
    st.leadFootSign = Math.cos(inp.stridePhase) >= 0 ? 1 : -1;
  } else if (
    !inp.airborne &&
    !inp.slide &&
    !inp.crouch &&
    st.peakRecentSpeed >= 3.2 &&
    inp.speed <= 1.25 &&
    (decel >= 4.2 || st.prevSpeed - inp.speed >= 0.45) &&
    st.activeSub !== 'sudden_stop_catch'
  ) {
    // Character was running/sprinting and abruptly stopped -> catch forward momentum so they don't fall!
    st.activeSub = 'sudden_stop_catch';
    st.subT = 0;
    st.subDur = 0.56 + clamp01((st.peakRecentSpeed - 3.2) / 5.0) * 0.22;
    st.subIntensity = clamp01(0.55 + (st.peakRecentSpeed - 3.2) / 5.5);
    st.leadFootSign = Math.sin(inp.stridePhase) >= 0 ? 1 : -1;
    st.peakRecentSpeed = inp.speed;
  } else if (
    !inp.airborne &&
    !inp.slide &&
    !inp.crouch &&
    st.prevSpeed < 0.7 &&
    inp.speed > 1.35 &&
    accel > 5.0 &&
    st.activeSub === 'none'
  ) {
    st.activeSub = 'quick_start_lean';
    st.subT = 0;
    st.subDur = 0.32;
    st.subIntensity = clamp01(inp.speed / 5.5);
    st.leadFootSign = Math.sin(inp.stridePhase) >= 0 ? 1 : -1;
  }

  if (!inp.airborne && !st.prevAirborne) {
    st.airborneTime = 0;
  }

  // Smooth turn-rate banking / pivot reaction (continuous sub-animation layer)
  const turnK = 1 - Math.exp(-12 * safeDt);
  st.turnSmooth += (inp.turnRate - st.turnSmooth) * turnK;
  if (!inp.airborne && !inp.slide && Math.abs(st.turnSmooth) > 0.35 && inp.speed > 0.8) {
    const turnMag = clamp01((Math.abs(st.turnSmooth) - 0.35) / 4.2) * clamp01(inp.speed / 4.5);
    const dir = Math.sign(st.turnSmooth);
    out.bank += -dir * 0.19 * turnMag;
    out.twist += dir * 0.24 * turnMag;
    out.headY += dir * 0.22 * turnMag;
    out.hipsX += -dir * 0.032 * turnMag;
    out.aLz += (dir > 0 ? 0.16 : 0.05) * turnMag;
    out.aRz += (dir < 0 ? -0.16 : -0.05) * turnMag;
    if (st.activeSub === 'none' && turnMag > 0.25) {
      out.activeSub = 'sharp_turn_pivot';
      out.progress = turnMag;
    }
  }

  // Evaluate active discrete sub-animation curve
  if (st.activeSub !== 'none') {
    st.subT += safeDt;
    const u = clamp01(st.subT / st.subDur);
    const inten = st.subIntensity;
    const s = st.leadFootSign;
    out.activeSub = st.activeSub;
    out.progress = u;

    if (st.activeSub === 'sudden_stop_catch') {
      // Phase 1 (0..0.38): forward momentum pitch, deep lead-foot plant & knee brace, arms whip out & slightly back to arrest momentum
      // Phase 2 (0.38..0.72): slight counter-recoil upright catch, trailing foot steps in
      // Phase 3 (0.72..1.0): smooth elastic settle into calm standing balance
      const lunge = u < 0.38 ? smoothstep(0, 0.38, u) : 1 - smoothstep(0.38, 0.88, u);
      const recoil = u > 0.32 ? Math.sin(clamp01((u - 0.32) / 0.68) * Math.PI) * (1 - u * 0.45) : 0;
      const brace = Math.sin(clamp01(u / 0.85) * Math.PI);

      out.lean += (0.36 * lunge - 0.11 * recoil) * inten;
      out.hipsY += (-0.125 * lunge + 0.02 * recoil) * inten;
      out.hipsX += s * 0.035 * brace * inten;
      out.twist += s * 0.26 * lunge * inten;
      out.bank += -s * 0.08 * lunge * inten;
      out.headX += (-0.22 * lunge + 0.07 * recoil) * inten;
      out.headY += -s * 0.14 * lunge * inten;

      // Lead foot plants forward with bent bracing knee; trail leg stabilizes behind
      if (s > 0) {
        out.hipL += -0.52 * lunge * inten;
        out.knL += 0.68 * lunge * inten;
        out.hipR += 0.34 * lunge * inten;
        out.knR += 0.32 * brace * inten;
      } else {
        out.hipR += -0.52 * lunge * inten;
        out.knR += 0.68 * lunge * inten;
        out.hipL += 0.34 * lunge * inten;
        out.knL += 0.32 * brace * inten;
      }

      // Arms windmill/flair outward and slightly forward-then-back to catch balance
      out.aLx += (-0.42 * lunge + 0.28 * recoil) * inten;
      out.aRx += (-0.34 * lunge + 0.32 * recoil) * inten;
      out.aLz += (0.48 * brace + 0.12 * recoil) * inten;
      out.aRz += (-0.48 * brace - 0.12 * recoil) * inten;
      out.elL += -0.42 * brace * inten;
      out.elR += -0.46 * brace * inten;
      out.springBoost = 0.55;
    } else if (st.activeSub === 'quick_start_lean') {
      const env = Math.sin(u * Math.PI);
      out.lean += 0.22 * env * inten;
      out.hipsY += -0.055 * env * inten;
      out.knL += 0.22 * env * inten;
      out.knR += 0.22 * env * inten;
      out.aLx += -0.24 * s * env * inten;
      out.aRx += 0.24 * s * env * inten;
      out.headX += -0.14 * env * inten;
      out.springBoost = 0.35;
    } else if (st.activeSub === 'land_absorb') {
      // Elastic squat absorption + soft rebound
      const compress = u < 0.34 ? smoothstep(0, 0.34, u) : 1 - smoothstep(0.34, 1.0, u);
      out.hipsY += -0.19 * compress * inten;
      out.lean += 0.26 * compress * inten;
      out.hipL += -0.44 * compress * inten;
      out.hipR += -0.38 * compress * inten;
      out.knL += 0.82 * compress * inten;
      out.knR += 0.78 * compress * inten;
      out.aLx += -0.28 * compress * inten;
      out.aRx += -0.28 * compress * inten;
      out.aLz += 0.34 * compress * inten;
      out.aRz += -0.34 * compress * inten;
      out.elL += -0.35 * compress * inten;
      out.elR += -0.35 * compress * inten;
      out.headX += -0.16 * compress * inten;
      out.springBoost = 0.75;
    } else if (st.activeSub === 'stumble_recover') {
      const snapBack = u < 0.35 ? smoothstep(0, 0.35, u) : 1 - smoothstep(0.35, 0.9, u);
      const recover = u > 0.35 ? Math.sin(((u - 0.35) / 0.65) * Math.PI) : 0;
      out.lean += (-0.34 * snapBack + 0.16 * recover) * inten;
      out.twist += s * 0.34 * snapBack * inten;
      out.bank += s * 0.14 * snapBack * inten;
      out.hipsY += -0.08 * recover * inten;
      out.headX += -0.25 * snapBack * inten;
      out.aLx += -0.45 * snapBack * inten;
      out.aRx += -0.38 * snapBack * inten;
      out.aLz += 0.42 * snapBack * inten;
      out.aRz += -0.42 * snapBack * inten;
      out.knL += 0.34 * recover * inten;
      out.knR += 0.26 * recover * inten;
      out.springBoost = 0.6;
    }

    if (st.subT >= st.subDur) {
      st.activeSub = 'none';
      st.subT = 0;
      st.subIntensity = 0;
    }
  }

  st.prevSpeed = inp.speed;
  st.prevAirborne = inp.airborne;
  return out;
}

/**
 * Evaluates smooth 3-phase bare-hand boxing / brawling poses (windup -> snap extension -> elastic guard recovery)
 * with raised fighting guard blending between strikes so punches look fluid and athletic rather than robotic.
 */
export function evaluateBareHandPose(
  move: BareHandMove,
  phase01: number,
  guardWeight: number,
  clockSec: number,
): BareHandPose {
  const bob = Math.sin(clockSec * 5.2) * 0.025;
  const weave = Math.cos(clockSec * 3.1) * 0.05;

  // Base athletic boxing guard stance (hands raised protecting jaw, knees springy, lead shoulder angled)
  const pose: BareHandPose = {
    aLx: -1.16 + bob * 1.4,
    aLz: -0.22,
    aRx: -1.24 - bob * 1.4,
    aRz: 0.24,
    elL: -1.48,
    elR: -1.58,
    lean: 0.14 + bob * 0.4,
    twist: 0.26 + weave,
    bank: weave * 0.6,
    headX: 0.06,
    headY: -0.18,
    hipsY: -0.045 + bob * 0.35,
    hipL: -0.18,
    hipR: 0.14,
    knL: 0.24,
    knR: 0.22,
  };

  const g = clamp01(guardWeight);
  if (phase01 <= 0.0001 || phase01 >= 0.9999) {
    return {
      aLx: pose.aLx * g,
      aLz: pose.aLz * g,
      aRx: pose.aRx * g,
      aRz: pose.aRz * g,
      elL: pose.elL * g,
      elR: pose.elR * g,
      lean: pose.lean * g,
      twist: pose.twist * g,
      bank: pose.bank * g,
      headX: pose.headX * g,
      headY: pose.headY * g,
      hipsY: pose.hipsY * g,
      hipL: pose.hipL * g,
      hipR: pose.hipR * g,
      knL: pose.knL * g,
      knR: pose.knR * g,
    };
  }

  switch (move) {
    case 'jab_left': {
      // Crisp snap left straight jab: fast extension, slight shoulder roll, right hand stays glued to chin
      const { windup, strike, follow } = strikeCurve(phase01, 0.2, 0.44);
      pose.aLx = -1.16 + windup * 0.25 - strike * 0.48;
      pose.aLz = -0.22 + strike * 0.14;
      pose.elL = -1.48 + strike * 1.38;
      pose.aRx = -1.28 - strike * 0.08;
      pose.elR = -1.62;
      pose.twist = 0.22 - windup * 0.12 + strike * 0.44 - follow * 0.08;
      pose.lean = 0.14 + strike * 0.12;
      pose.bank = -strike * 0.08;
      pose.hipL = -0.18 - strike * 0.14;
      pose.knL = 0.24 + strike * 0.12;
      break;
    }
    case 'cross_right': {
      // Full-hip-rotation power right cross straight through the centerline
      const { windup, strike, follow } = strikeCurve(phase01, 0.24, 0.48);
      pose.aRx = -1.24 + windup * 0.42 - strike * 0.48;
      pose.aRz = 0.24 - strike * 0.18;
      pose.elR = -1.58 + strike * 1.48;
      pose.aLx = -1.1 + strike * 0.45;
      pose.elL = -1.52;
      pose.twist = 0.28 + windup * 0.24 - strike * 0.92 + follow * 0.1;
      pose.lean = 0.14 - windup * 0.05 + strike * 0.2;
      pose.bank = strike * 0.12;
      pose.hipsY = -0.05 - strike * 0.03;
      pose.hipL = -0.2 - strike * 0.16;
      pose.hipR = 0.16 + strike * 0.22;
      break;
    }
    case 'hook_left': {
      // Wide sweeping left hook: arm stays bent ~90 deg, swings horizontally across target with torso whip
      const { windup, strike, follow } = strikeCurve(phase01, 0.26, 0.52);
      const sweep = -windup * 0.52 + strike * 1.05;
      pose.aLx = -1.22 - strike * 0.26;
      pose.aLz = 0.62 * windup - 0.58 * strike + 0.18 * follow;
      pose.elL = -1.42 + strike * 0.32;
      pose.aRx = -1.32;
      pose.elR = -1.65;
      pose.twist = 0.15 - windup * 0.42 + sweep * 0.85;
      pose.bank = -0.14 * windup + 0.16 * strike;
      pose.lean = 0.15 + strike * 0.12;
      pose.hipsY = -0.06 - windup * 0.03;
      pose.headY = -pose.twist * 0.45;
      break;
    }
    case 'hook_right': {
      // Heavy sweeping right hook: loads onto rear leg then rips horizontally across
      const { windup, strike, follow } = strikeCurve(phase01, 0.26, 0.52);
      pose.aRx = -1.2 - strike * 0.28;
      pose.aRz = -0.66 * windup + 0.62 * strike - 0.16 * follow;
      pose.elR = -1.45 + strike * 0.34;
      pose.aLx = -1.28;
      pose.elL = -1.64;
      pose.twist = 0.24 + windup * 0.44 - strike * 1.04;
      pose.bank = 0.14 * windup - 0.18 * strike;
      pose.lean = 0.14 + strike * 0.14;
      pose.hipsY = -0.06 - windup * 0.035;
      pose.headY = -pose.twist * 0.45;
      break;
    }
    case 'uppercut_right': {
      // Rising right uppercut: drops hips & right shoulder low, then drives vertically upward through chin
      const { windup, strike } = strikeCurve(phase01, 0.3, 0.56);
      pose.hipsY = -0.05 - windup * 0.12 + strike * 0.08;
      pose.knL = 0.26 + windup * 0.32 - strike * 0.16;
      pose.knR = 0.26 + windup * 0.36 - strike * 0.18;
      pose.aRx = -0.45 + windup * 0.52 - strike * 1.48;
      pose.aRz = 0.12 + strike * 0.16;
      pose.elR = -1.45 + strike * 0.25;
      pose.aLx = -1.18 + strike * 0.35;
      pose.elL = -1.55;
      pose.lean = 0.16 + windup * 0.16 - strike * 0.24;
      pose.twist = 0.28 + windup * 0.28 - strike * 0.78;
      pose.bank = 0.18 * windup - 0.12 * strike;
      pose.headX = 0.06 - strike * 0.16;
      break;
    }
    case 'haymaker_left': {
      // Telegraphed loaded street-brawler left haymaker with big torso coil & follow-through
      const { windup, strike, follow } = strikeCurve(phase01, 0.32, 0.58);
      pose.aLx = -0.82 + windup * 0.62 - strike * 0.92;
      pose.aLz = 0.82 * windup - 0.72 * strike + 0.24 * follow;
      pose.elL = -1.12 + strike * 0.56;
      pose.aRx = -1.05 + strike * 0.62;
      pose.elR = -1.25;
      pose.twist = 0.1 - windup * 0.64 + strike * 1.18;
      pose.lean = 0.14 - windup * 0.1 + strike * 0.26;
      pose.bank = -0.22 * windup + 0.24 * strike;
      pose.hipsY = -0.07 - windup * 0.05;
      pose.hipL = -0.22 - strike * 0.2;
      pose.hipR = 0.18 + strike * 0.24;
      break;
    }
  }

  return pose;
}

/**
 * Deterministic brawler classifier: ~35% of civilians/tourists/Free City NPCs will stand their ground
 * and fight back bare-handed if punched/melee-hit by the player (never against firearms or explosions).
 */
export function shouldNpcFightBack(
  pedId: number,
  kind: string,
  archetype: string | null | undefined,
  attackerWeapon: 'fists' | 'melee' | 'gun' | 'explosion',
): boolean {
  if (attackerWeapon === 'gun' || attackerWeapon === 'explosion') return false;
  if (kind !== 'civ' && kind !== 'tourist') return false;
  if (archetype === 'security') return true;
  if (archetype === 'bank_teller') return false;
  // Deterministic hash: ~36% fight-back ratio across ordinary street NPCs & tourists
  const h = ((pedId * 2654435761) >>> 0) % 100;
  if (archetype === 'street_racer' || archetype === 'jogger') return h < 58;
  return h < 36;
}

export const BRAWL_TAUNTS = [
  "Oh, you picked the wrong person today!",
  "Put 'em up! You're not walking away from that!",
  "Big mistake, pal — let's go!",
  "Hey! Nobody hits me and gets away with it!",
  "Alright, you asked for it! Hands up!",
  "Watch the jaw, tough guy!",
];

export const PANIC_SHOUTS = [
  "Run! Get out of here!",
  "Somebody call 911 — they're crazy!",
  "Move! Move! Get away!",
  "No way, I'm out of here!",
  "Help! Security!",
  "Watch out! Everybody run!",
];

export type ViolenceWeaponKind = 'fists' | 'melee' | 'gun' | 'explosion' | 'vehicle';
export type ViolenceReaction = 'flee' | 'brawl' | 'attack_gun' | 'cower';

export interface ViolenceReactionInput {
  pedId: number;
  kind: string;
  archetype?: string | null;
  indoor: boolean;
  indoorRole?: string | null;
  weaponKind: ViolenceWeaponKind;
  isVictim: boolean;
  dist: number;
  hpRatio?: number;
}

/**
 * Pure, deterministic violence reaction engine for both outdoor street NPCs and indoor staff/customers:
 * - Armed cops, security guards, and gang members fight back with firearms (`attack_gun`).
 * - Tough civilians, joggers, racers, and gritty indoor staff (chefs/attendants/clerks) fight back bare-handed (`brawl`) against fists/melee.
 * - Against gunfire, explosions, or reckless vehicle attacks, unarmed civilians & indoor patrons immediately run away (`flee`) or take cover (`cower`).
 */
export function evaluateViolenceReaction(inp: ViolenceReactionInput): ViolenceReaction {
  const hp = inp.hpRatio ?? 1;
  const isSecurity = inp.kind === 'cop' || inp.kind === 'guard' || inp.indoorRole === 'guard' || inp.archetype === 'security';
  const isGang = inp.kind === 'gang';

  // Armed responders (cops, guards, gangsters) fight back against any violence
  if (isSecurity || isGang) {
    if (inp.weaponKind === 'fists' && !inp.isVictim && inp.kind === 'guard' && inp.dist < 5) {
      return 'attack_gun';
    }
    return 'attack_gun';
  }

  // Gunfire, explosions, and vehicle attacks always scatter unarmed people
  if (inp.weaponKind === 'gun' || inp.weaponKind === 'explosion' || inp.weaponKind === 'vehicle') {
    if (inp.indoor && hp < 0.45) return 'cower';
    return 'flee';
  }

  // Fists / melee violence: victims and close brave witnesses may fight back bare-handed
  const h = (Math.imul(inp.pedId | 0, 2654435761) >>> 0) % 100;
  if (inp.indoor) {
    if (inp.indoorRole === 'chef' || inp.indoorRole === 'attendant') {
      return (inp.isVictim ? h < 65 : h < 35 && inp.dist < 9) ? 'brawl' : 'flee';
    }
    if (inp.indoorRole === 'clerk' || inp.indoorRole === 'server' || inp.indoorRole === 'doctor') {
      return (inp.isVictim && h < 30) ? 'brawl' : 'flee';
    }
    // Patients, waiting customers, diners run away from violence
    return inp.isVictim && h < 22 ? 'brawl' : 'flee';
  }

  if (inp.isVictim) {
    return shouldNpcFightBack(inp.pedId, inp.kind, inp.archetype, inp.weaponKind) ? 'brawl' : 'flee';
  }

  // Close street witness to a melee fight: tough locals sometimes jump in, most flee
  if (inp.dist < 10) {
    const tough = inp.archetype === 'street_racer' || inp.archetype === 'jogger';
    if (tough && h < 38) return 'brawl';
    if (h < 22) return 'brawl';
  }
  return 'flee';
}

export interface OrganicMotionInput {
  clockSec: number;
  speed: number;
  stridePhase: number;
  turnRate: number;
  aiming: boolean;
  recoilKick: number; // 0..1 damped firing impulse
  airborne: boolean;
  seedOffset: number; // unique per character so crowds don't breathe in unison
}

export interface OrganicMotionOverlay {
  chestBreathY: number;
  pelvisShiftX: number;
  pelvisRollZ: number;
  spineCounterTwistY: number;
  headStabilizeYaw: number;
  headStabilizeRoll: number;
  heelStrikeKneeL: number;
  heelStrikeKneeR: number;
  shoulderDropL: number;
  shoulderDropR: number;
  recoilLeanBack: number;
  recoilArmKickX: number;
}

/**
 * Advanced biomechanical secondary-motion layer applied on top of locomotion & combat poses:
 * - Organic idle thoracic breathing + subtle postural micro-sway
 * - Pelvic lateral weight-shift onto stance foot + natural hip drop
 * - Spine/pelvis counter-rotation during walking/running
 * - Vestibulo-ocular head stabilization during turns (head stays level & tracks heading)
 * - Asymmetric heel-strike / toe-off knee flexion refinement
 * - Crisp damped firearm recoil kickback
 */
export function evaluateOrganicMotionOverlay(inp: OrganicMotionInput): OrganicMotionOverlay {
  const t = inp.clockSec + inp.seedOffset;
  const spd01 = clamp01(inp.speed / 6.2);
  const idle01 = 1 - clamp01(inp.speed / 1.4);
  const grounded = inp.airborne ? 0 : 1;

  // 1. Thoracic breathing (faster and deeper when sprinting/exerted, calm sinusoidal at idle)
  const breathFreq = 1.65 + spd01 * 2.1;
  const breathWave = Math.sin(t * breathFreq);
  const chestBreathY = (0.0085 * idle01 + 0.013 * spd01) * breathWave;

  // 2. Natural idle micro-weight shift + active stride pelvic shift onto stance leg
  const idleShift = Math.sin(t * 0.55) * 0.016 * idle01;
  const strideSin = Math.sin(inp.stridePhase);
  const strideCos = Math.cos(inp.stridePhase);
  const pelvisShiftX = (idleShift + strideSin * 0.038 * clamp01(inp.speed / 2.6)) * grounded;
  const pelvisRollZ = (-strideSin * 0.052 * clamp01(inp.speed / 3.4) + Math.sin(t * 0.55) * 0.014 * idle01) * grounded;

  // 3. Spine/pelvis counter-rotation (pelvis rotates forward with leading hip; thorax counter-rotates with opposite arm)
  const aimStiff = inp.aiming ? 0.35 : 1.0;
  const spineCounterTwistY = -strideCos * 0.14 * clamp01(inp.speed / 3.8) * aimStiff * grounded;

  // 4. Vestibulo-ocular head stabilization: head anticipates turns & stays upright against body bank
  const turnClamp = Math.max(-4.5, Math.min(4.5, inp.turnRate));
  const headStabilizeYaw = turnClamp * 0.075 * (0.4 + 0.6 * spd01);
  const headStabilizeRoll = -pelvisRollZ * 0.65 + turnClamp * 0.032 * spd01;

  // 5. Asymmetric heel-strike cushioning & push-off knee bend (eliminates stiff pendulum legs)
  const strikeL = Math.max(0, Math.sin(inp.stridePhase + 0.55)) * Math.max(0, Math.cos(inp.stridePhase));
  const strikeR = Math.max(0, Math.sin(inp.stridePhase + Math.PI + 0.55)) * Math.max(0, Math.cos(inp.stridePhase + Math.PI));
  const strideAmp = clamp01(inp.speed / 3.2) * grounded;
  const heelStrikeKneeL = strikeL * 0.19 * strideAmp;
  const heelStrikeKneeR = strikeR * 0.19 * strideAmp;

  // 6. Subtle shoulder relaxation / breathing elevation
  const shoulderDropL = breathWave * 0.012 + strideCos * 0.028 * strideAmp;
  const shoulderDropR = breathWave * 0.012 - strideCos * 0.028 * strideAmp;

  // 7. Damped firing recoil kickback
  const rk = clamp01(inp.recoilKick);
  const recoilLeanBack = -rk * 0.085;
  const recoilArmKickX = -rk * 0.24;

  return {
    chestBreathY,
    pelvisShiftX,
    pelvisRollZ,
    spineCounterTwistY,
    headStabilizeYaw,
    headStabilizeRoll,
    heelStrikeKneeL,
    heelStrikeKneeR,
    shoulderDropL,
    shoulderDropR,
    recoilLeanBack,
    recoilArmKickX,
  };
}


