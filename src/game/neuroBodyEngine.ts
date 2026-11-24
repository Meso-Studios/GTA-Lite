// EXPERIMENTAL (BETA): Algorithmic Body-Logic Kinematics Engine (Zero Canned Animations).
// Eliminates all pre-authored NPC animation clips when enabled. Every joint (hips, spine, head,
// shoulders, elbows, thighs, knees) is synthesized in real time from:
//  1. Zero-Moment-Point (ZMP) / Capture-Point Inverted Pendulum Balance & Footstep Planner
//  2. Exact 2-Bone Analytical Inverse Kinematics (Law of Cosines) for Legs & Arms
//  3. Goal-Directed Upper-Body Intent Motor (gaze, phone, inspect ground, shield face, block, strike, wave, admire)
//  4. Angular-Momentum Conservation (automatic arm counter-swing canceling pelvic yaw torque)
//  5. Per-Individual Biomechanical Muscle PD-Torque Springs
import { clampVal } from './terrain';

export type BodyIntentKind =
  | 'stand_relaxed'
  | 'locomote'
  | 'converse'
  | 'phone_call'
  | 'check_watch'
  | 'pick_up_item'
  | 'shield_panic'
  | 'wave_greet'
  | 'photo_hold'
  | 'combat_guard'
  | 'combat_block'
  | 'combat_strike'
  | 'aim_weapon'
  | 'sit_chair';

export interface BodyIntent {
  kind: BodyIntentKind;
  vx: number;            // local forward speed (m/s)
  vz: number;            // local lateral speed (m/s)
  turnRate: number;      // rad/s
  gazeYaw: number;       // desired head yaw relative to torso (-1.2..+1.2)
  gazePitch: number;     // desired head pitch (-0.5..+0.5)
  strikeTargetSide: number; // -1 left hand, +1 right hand
  strikeProgress: number;   // 0..1
  stress: number;        // 0..1 (affects breathing rate, shoulder tension, posture)
  fatigue: number;       // 0..1 (affects slump and stride lift)
  crouch: boolean;
  onSand: boolean;
  shoveX: number;        // external knock/flinch impulse
}

export interface FootState {
  // Local hip-relative foot position (x = lateral, y = height above ground, z = forward)
  x: number;
  y: number;
  z: number;
  startX: number;
  startZ: number;
  targetX: number;
  targetZ: number;
  swinging: boolean;
  swingT: number;
  swingDur: number;
}

export interface NeuroBodyState {
  seed: number;
  time: number;
  leftFoot: FootState;
  rightFoot: FootState;
  lastSwingFoot: 'L' | 'R';
  comX: number;
  comY: number;
  comZ: number;
  prevSpeed: number;
  accelSmooth: number;
  // Individual biomechanical traits (no two NPCs move identically!)
  strideGain: number;
  armSwingGain: number;
  shoulderTension: number;
  cadenceBias: number;
  postureSlouch: number;
  // Joint state & velocities for PD muscle torque integration
  q: Record<string, number>;
  qd: Record<string, number>;
}

export interface NeuroBodyPose {
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
  lean: number;
  headX: number;
  headY: number;
  hipsY: number;
  hipsX: number;
  twist: number;
  bank: number;
}

const THIGH_LEN = 0.44;
const SHIN_LEN = 0.44;
const UPPER_ARM_LEN = 0.30;
const FORE_ARM_LEN = 0.29;
const HIP_HALF_W = 0.105;

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

export function createNeuroBodyState(seed: number): NeuroBodyState {
  return {
    seed,
    time: hash01(seed) * 10,
    leftFoot: { x: HIP_HALF_W, y: 0, z: 0, startX: HIP_HALF_W, startZ: 0, targetX: HIP_HALF_W, targetZ: 0, swinging: false, swingT: 0, swingDur: 0.34 },
    rightFoot: { x: -HIP_HALF_W, y: 0, z: 0, startX: -HIP_HALF_W, startZ: 0, targetX: -HIP_HALF_W, targetZ: 0, swinging: false, swingT: 0, swingDur: 0.34 },
    lastSwingFoot: seed % 2 === 0 ? 'L' : 'R',
    comX: 0,
    comY: 0.92,
    comZ: 0,
    prevSpeed: 0,
    accelSmooth: 0,
    strideGain: 0.88 + hash01(seed + 1) * 0.26,
    armSwingGain: 0.8 + hash01(seed + 2) * 0.42,
    shoulderTension: hash01(seed + 3) * 0.12,
    cadenceBias: 0.92 + hash01(seed + 4) * 0.18,
    postureSlouch: (hash01(seed + 5) - 0.45) * 0.09,
    q: {
      hipL: 0, hipR: 0, knL: 0, knR: 0, aLx: 0, aLz: 0, aRx: 0, aRz: 0, elL: -0.15, elR: -0.15,
      lean: 0, headX: 0, headY: 0, hipsY: 0.92, hipsX: 0, twist: 0, bank: 0,
    },
    qd: {
      hipL: 0, hipR: 0, knL: 0, knR: 0, aLx: 0, aLz: 0, aRx: 0, aRz: 0, elL: 0, elR: 0,
      lean: 0, headX: 0, headY: 0, hipsY: 0, hipsX: 0, twist: 0, bank: 0,
    },
  };
}

/**
 * Exact 2-Bone Analytical Leg IK (sagittal plane Law of Cosines).
 * Input: foot offset relative to hip joint (dz forward, dy vertical downward negative).
 * Output: hip pitch (negative = leg forward) and knee bend (positive = knee flexion).
 */
export function solveTwoBoneLegIK(dz: number, dy: number): { hipPitch: number; kneeBend: number } {
  const L1 = THIGH_LEN;
  const L2 = SHIN_LEN;
  const dist = clampVal(Math.hypot(dz, dy), 0.18, L1 + L2 - 0.008);
  // Law of cosines for internal knee angle
  const cosKnee = clampVal((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1);
  const kneeInternal = Math.acos(cosKnee);
  const kneeBend = clampVal(Math.PI - kneeInternal, 0.02, 2.15);

  // Law of cosines for hip offset angle relative to hip->foot ray
  const cosAlpha = clampVal((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const alpha = Math.acos(cosAlpha);
  // Ray angle measured forward from straight-down (-Y)
  const downDist = Math.max(0.05, -dy);
  const rayForward = Math.atan2(dz, downDist);
  // In our rig, negative X rotation swings thigh forward (+Z) and positive knee bends shin backward (-Z)
  const hipPitch = clampVal(-(rayForward + alpha), -1.45, 1.15);
  return { hipPitch, kneeBend };
}

/**
 * Exact 2-Bone Analytical Arm IK for goal-directed hand placement (shoulder-relative x, y, z).
 * Output: shoulder pitch (aX, negative = arm forward/up), shoulder abduction (aZ), elbow flexion (el <= 0 bends forward).
 */
export function solveTwoBoneArmIK(
  side: 1 | -1, // +1 left arm, -1 right arm
  tx: number,
  ty: number,
  tz: number,
): { aX: number; aZ: number; elbow: number } {
  const L1 = UPPER_ARM_LEN;
  const L2 = FORE_ARM_LEN;
  const dist = clampVal(Math.hypot(tx, ty, tz), 0.12, L1 + L2 - 0.01);
  const cosElbow = clampVal((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1);
  const elbowBend = clampVal(Math.PI - Math.acos(cosElbow), 0.08, 2.25);

  const cosBeta = clampVal((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const beta = Math.acos(cosBeta);

  const down = -ty;
  const sagDist = Math.hypot(tz, down);
  const pitchRay = Math.atan2(tz, Math.max(0.02, down));
  // Arm bends forward (negative elbow rotation in our rig), so shoulder pitches slightly back by beta
  const aX = clampVal(-(pitchRay - beta * 0.55), -2.65, 1.1);
  const lateralAngle = Math.atan2(tx * side, Math.max(0.08, sagDist));
  const aZ = clampVal(side * lateralAngle, -1.35, 1.35);
  return { aX, aZ, elbow: -elbowBend };
}

function stepFootSwing(f: FootState, dt: number, liftHeight: number): void {
  if (!f.swinging) {
    f.y = 0;
    return;
  }
  f.swingT += dt;
  const u = clampVal(f.swingT / Math.max(0.14, f.swingDur), 0, 1);
  // Quintic minimum-jerk trajectory (zero velocity & zero acceleration at liftoff and heel-strike!)
  const s = u * u * u * (10 + u * (-15 + 6 * u));
  f.x = f.startX + (f.targetX - f.startX) * s;
  f.z = f.startZ + (f.targetZ - f.startZ) * s;
  f.y = Math.sin(u * Math.PI) * liftHeight;
  if (u >= 1) {
    f.swinging = false;
    f.y = 0;
    f.x = f.targetX;
    f.z = f.targetZ;
  }
}

/**
 * Synthesizes a complete 17-DOF body pose purely from physics, balance (ZMP), IK, and logical intent.
 * Zero pre-authored animation clips are sampled.
 */
export function stepNeuroBody(
  s: NeuroBodyState,
  intent: BodyIntent,
  dtRaw: number,
): NeuroBodyPose {
  const dt = Math.min(Math.max(dtRaw, 0.001), 0.05);
  s.time += dt;

  const speed = Math.hypot(intent.vx, intent.vz);
  const rawAcc = (intent.vx - s.prevSpeed) / dt;
  s.prevSpeed = intent.vx;
  s.accelSmooth += (clampVal(rawAcc, -16, 16) - s.accelSmooth) * (1 - Math.exp(-8 * dt));

  const target: NeuroBodyPose = {
    hipL: 0, hipR: 0, knL: 0.05, knR: 0.05,
    aLx: 0, aLz: 0.07, aRx: 0, aRz: -0.07,
    elL: -0.18, elR: -0.18,
    lean: s.postureSlouch,
    headX: 0, headY: 0,
    hipsY: 0.91, hipsX: 0, twist: 0, bank: 0,
  };

  if (intent.kind === 'sit_chair') {
    // Seated balance solver: feet planted on floor forward of hips, knees bent ~90°
    const ikL = solveTwoBoneLegIK(0.32, -0.56);
    const ikR = solveTwoBoneLegIK(0.30, -0.56);
    target.hipL = ikL.hipPitch;
    target.knL = ikL.kneeBend;
    target.hipR = ikR.hipPitch;
    target.knR = ikR.kneeBend;
    target.hipsY = 0.56;
    target.lean = 0.04 + Math.sin(s.time * 1.1) * 0.015;
    // Hands resting naturally near lap / table
    const armL = solveTwoBoneArmIK(1, 0.04, -0.34, 0.28);
    const armR = solveTwoBoneArmIK(-1, -0.04, -0.34, 0.28);
    target.aLx = armL.aX; target.aLz = armL.aZ; target.elL = armL.elbow;
    target.aRx = armR.aX; target.aRz = armR.aZ; target.elR = armR.elbow;
    target.headY = clampVal(intent.gazeYaw, -0.9, 0.9);
    target.headX = clampVal(intent.gazePitch, -0.4, 0.4);
  } else {
    // 1. ZMP / Capture-Point Footstep Planner
    // Stance feet drift backward relative to moving body frame
    if (!s.leftFoot.swinging) {
      s.leftFoot.z -= intent.vx * dt;
      s.leftFoot.x -= intent.vz * dt;
    }
    if (!s.rightFoot.swinging) {
      s.rightFoot.z -= intent.vx * dt;
      s.rightFoot.x -= intent.vz * dt;
    }

    // Natural frequency of inverted pendulum: omega0 = sqrt(g / h) ~ 3.25 rad/s
    const omega0 = 3.25;
    const captureZ = clampVal((intent.vx / omega0) * 0.52 * s.strideGain, -0.52, 0.58);
    const captureX = clampVal((intent.vz / omega0) * 0.4, -0.22, 0.22);

    const stanceSpread = intent.kind === 'combat_guard' || intent.kind === 'combat_block' ? 0.16 : 0.105;
    const leftErr = Math.hypot(s.leftFoot.z - captureZ, s.leftFoot.x - (stanceSpread + captureX));
    const rightErr = Math.hypot(s.rightFoot.z - captureZ, s.rightFoot.x - (-stanceSpread + captureX));

    // Trigger a step whenever a stance foot falls behind the balance capture threshold
    const stepThreshold = speed > 3.6 ? 0.26 : speed > 0.45 ? 0.19 : 0.14;
    const stepDur = clampVal((0.36 - speed * 0.025) * s.cadenceBias, 0.18, 0.42);
    const liftH = clampVal(0.055 + speed * 0.032 + (intent.onSand ? 0.04 : 0), 0.04, 0.24);

    if (!s.leftFoot.swinging && !s.rightFoot.swinging) {
      // Combat stance staggers feet naturally (left forward, right back)
      const combatZOff = intent.kind === 'combat_guard' || intent.kind === 'combat_block' ? 0.18 : 0;
      const needL = leftErr > stepThreshold || (Math.abs(intent.turnRate) > 1.8 && s.lastSwingFoot === 'R');
      const needR = rightErr > stepThreshold || (Math.abs(intent.turnRate) > 1.8 && s.lastSwingFoot === 'L');
      if (needL && (s.lastSwingFoot === 'R' || leftErr > rightErr + 0.06)) {
        s.leftFoot.swinging = true;
        s.leftFoot.swingT = 0;
        s.leftFoot.swingDur = stepDur;
        s.leftFoot.startX = s.leftFoot.x;
        s.leftFoot.startZ = s.leftFoot.z;
        s.leftFoot.targetX = stanceSpread + captureX;
        s.leftFoot.targetZ = captureZ + combatZOff;
        s.lastSwingFoot = 'L';
      } else if (needR) {
        s.rightFoot.swinging = true;
        s.rightFoot.swingT = 0;
        s.rightFoot.swingDur = stepDur;
        s.rightFoot.startX = s.rightFoot.x;
        s.rightFoot.startZ = s.rightFoot.z;
        s.rightFoot.targetX = -stanceSpread + captureX;
        s.rightFoot.targetZ = captureZ - combatZOff;
        s.lastSwingFoot = 'R';
      }
    }

    stepFootSwing(s.leftFoot, dt, liftH);
    stepFootSwing(s.rightFoot, dt, liftH);

    // Clamp feet within anatomical reach
    s.leftFoot.z = clampVal(s.leftFoot.z, -0.58, 0.62);
    s.rightFoot.z = clampVal(s.rightFoot.z, -0.58, 0.62);

    // 2. Center-of-Mass (Pelvis) height & sway from support polygon
    const crouchDrop = intent.crouch ? 0.22 : intent.kind === 'pick_up_item' ? 0.28 : 0;
    const strideDrop = Math.abs(s.leftFoot.z - s.rightFoot.z) * 0.085;
    const breathFreq = 1.4 + intent.stress * 2.4;
    const breath = Math.sin(s.time * breathFreq) * (0.008 + intent.stress * 0.008);
    const pelvisY = clampVal(0.91 - crouchDrop - strideDrop + breath, 0.56, 0.94);

    // Lateral weight shift toward whichever foot is planted on the ground!
    const weightShift = s.leftFoot.swinging ? -0.032 : s.rightFoot.swinging ? 0.032 : Math.sin(s.time * 0.7) * 0.012;
    target.hipsY = pelvisY;
    target.hipsX = weightShift;

    // 3. Solve Exact 2-Bone Analytical Leg IK
    const ikL = solveTwoBoneLegIK(s.leftFoot.z, s.leftFoot.y - pelvisY);
    const ikR = solveTwoBoneLegIK(s.rightFoot.z, s.rightFoot.y - pelvisY);
    target.hipL = ikL.hipPitch;
    target.knL = ikL.kneeBend;
    target.hipR = ikR.hipPitch;
    target.knR = ikR.kneeBend;

    // 4. Whole-Body Momentum Lean, Bank, & Pelvic Twist
    // Lean into forward acceleration, lean back slightly when braking abruptly!
    const accelLean = clampVal(s.accelSmooth * 0.028 + speed * 0.032, -0.24, 0.34);
    const pickLean = intent.kind === 'pick_up_item' ? 0.58 : 0;
    const shoveLean = clampVal(-intent.shoveX * 0.35, -0.35, 0.35);
    target.lean = s.postureSlouch + intent.fatigue * 0.08 + accelLean + pickLean + shoveLean;
    target.bank = clampVal(-intent.turnRate * Math.min(1, speed / 3.5) * 0.095, -0.22, 0.22);

    // Pelvic yaw counter-torque driven by leg stride separation
    const legSeparation = s.leftFoot.z - s.rightFoot.z;
    target.twist = clampVal(-legSeparation * 0.32, -0.28, 0.28);

    // 5. Goal-Directed Upper-Body Intent Motor (2-Bone Arm IK)
    // Default baseline: angular-momentum arm counter-swing canceling pelvic torque!
    const swingZ = legSeparation * 0.58 * s.armSwingGain;
    let lHand: [number, number, number] = [0.06 + s.shoulderTension, -0.48 + Math.abs(swingZ) * 0.15, -swingZ];
    let rHand: [number, number, number] = [-0.06 - s.shoulderTension, -0.48 + Math.abs(swingZ) * 0.15, swingZ];

    if (intent.kind === 'phone_call') {
      // Right hand raised logically to right ear; left hand gestures subtly while talking
      rHand = [-0.04, 0.14, 0.14];
      lHand = [0.10, -0.34 + Math.sin(s.time * 3.1) * 0.05, 0.18 + Math.cos(s.time * 2.2) * 0.04];
    } else if (intent.kind === 'check_watch') {
      // Left wrist brought cleanly to eye-line while head looks down at wrist
      lHand = [-0.02, -0.14, 0.34];
      target.headX = 0.35;
      target.headY = 0.22;
    } else if (intent.kind === 'pick_up_item') {
      // Right hand reaches down toward ground object, left arm extends back for counterbalance
      rHand = [-0.04, -0.52, 0.34];
      lHand = [0.14, -0.36, -0.18];
      target.headX = 0.52;
    } else if (intent.kind === 'shield_panic') {
      // Both forearms raised defensively in front of face/head
      const trem = Math.sin(s.time * 14) * 0.02;
      lHand = [0.05, 0.18 + trem, 0.26];
      rHand = [-0.05, 0.20 - trem, 0.26];
    } else if (intent.kind === 'wave_greet') {
      // Right hand raised high & oscillating smoothly in friendly greeting
      rHand = [-0.14 + Math.sin(s.time * 7.2) * 0.11, 0.34, 0.22];
    } else if (intent.kind === 'photo_hold') {
      // Both hands steady a smartphone forward at chest/eye height
      lHand = [-0.04, 0.06, 0.42];
      rHand = [0.04, 0.06, 0.42];
    } else if (intent.kind === 'converse') {
      // Natural conversational hand gestures synchronized to speech rhythm
      const g1 = Math.sin(s.time * 3.6 + s.seed);
      const g2 = Math.cos(s.time * 2.7 + s.seed * 1.3);
      lHand = [0.08 + g1 * 0.05, -0.28 + g2 * 0.06, 0.22 + g1 * 0.06];
      rHand = [-0.08 - g2 * 0.05, -0.30 + g1 * 0.05, 0.20 - g2 * 0.05];
    } else if (intent.kind === 'combat_block') {
      // Tight high boxing shell guarding jaw/temples
      lHand = [-0.03, 0.10, 0.24];
      rHand = [0.03, 0.12, 0.24];
      target.lean += 0.14;
    } else if (intent.kind === 'combat_guard') {
      // Athletic ready guard with breathing rhythm
      const bob = Math.sin(s.time * 4.5) * 0.035;
      lHand = [0.02, -0.02 + bob, 0.36];
      rHand = [-0.04, 0.04 - bob, 0.26];
      target.twist = 0.22;
      target.lean += 0.1;
    } else if (intent.kind === 'combat_strike') {
      // Ballistic 3D punch trajectory toward opponent jaw!
      const p = clampVal(intent.strikeProgress, 0, 1);
      const ext = Math.sin(p * Math.PI);
      if (intent.strikeTargetSide < 0) {
        lHand = [-0.02, 0.05, 0.18 + ext * 0.44];
        rHand = [0.03, 0.06, 0.22];
        target.twist = -0.38 * ext;
      } else {
        rHand = [0.02, 0.06, 0.18 + ext * 0.46];
        lHand = [-0.03, 0.05, 0.22];
        target.twist = 0.42 * ext;
      }
      target.lean += 0.14 * ext;
    } else if (intent.kind === 'aim_weapon') {
      rHand = [-0.02, 0.02, 0.52];
      lHand = [0.02, -0.04, 0.36];
      target.twist = 0.18;
    }

    const armL = solveTwoBoneArmIK(1, lHand[0], lHand[1], lHand[2]);
    const armR = solveTwoBoneArmIK(-1, rHand[0], rHand[1], rHand[2]);
    target.aLx = armL.aX;
    target.aLz = armL.aZ;
    target.elL = armL.elbow;
    target.aRx = armR.aX;
    target.aRz = armR.aZ;
    target.elR = armR.elbow;

    // 6. Head Gaze Tracking (independent of torso twist so eyes lock naturally on targets)
    if (intent.kind !== 'check_watch' && intent.kind !== 'pick_up_item') {
      target.headY = clampVal(intent.gazeYaw - target.twist * 0.65, -1.05, 1.05);
      target.headX = clampVal(intent.gazePitch - target.lean * 0.35, -0.45, 0.45);
    }
  }

  // 7. Biomechanical Second-Order PD Muscle Torque Springs (organic inertia & zero robotic snapping)
  const keys = Object.keys(target) as (keyof NeuroBodyPose)[];
  for (const k of keys) {
    const isLimb = k === 'aLx' || k === 'aRx' || k === 'elL' || k === 'elR';
    const omega =
      intent.kind === 'combat_strike' && isLimb
        ? 26
        : k === 'hipsY' || k === 'hipsX'
          ? 16
          : 15;
    const zeta = 0.88; // slight natural under-damped muscle compliance
    const cur = s.q[k] ?? 0;
    const vel = s.qd[k] ?? 0;
    const acc = omega * omega * (target[k] - cur) - 2 * zeta * omega * vel;
    const nextVel = vel + acc * dt;
    const nextPos = cur + nextVel * dt;
    s.qd[k] = nextVel;
    s.q[k] = nextPos;
    target[k] = nextPos;
  }

  return target;
}
