// Realistic GTA-style progressive steering & Pacejka-lite lateral grip physics.
// Eliminates twitchy/hyper-sensitive keyboard steering while keeping city cornering crisp and highway driving planted.
import { clampVal } from './terrain';

export interface SteeringInput {
  rawSteer: number;     // -1..+1 player or AI steering command
  speedFwd: number;     // forward velocity m/s
  speedLat: number;     // lateral velocity m/s
  maxSteerRad: number;  // maximum wheel lock angle at low speed (rad)
  wheelBase: number;    // m
  baseGrip: number;     // vehicle lateral tire grip
  handbrake: boolean;
  sandFactor: number;   // 0..1 loose sand
  isPlayer: boolean;
  /** Player steering sensitivity multiplier (0.25..2.0, default 1.0) */
  sensitivity?: number;
}

export interface SteeringState {
  smoothInput: number;  // smoothed -1..+1 wheel input
  steerAngle: number;   // current front wheel angle (rad)
  omega: number;        // current yaw angular velocity (rad/s)
}

export interface SteeringResult {
  steerAngle: number;
  omega: number;
  newLatSpeed: number;
  slipRatio: number;    // 0..1 lateral tire slip indicator for smoke/squeal
}

export function createSteeringState(): SteeringState {
  return { smoothInput: 0, steerAngle: 0, omega: 0 };
}

/**
 * Computes progressive speed-sensitive steering lock, smooth turn-in/self-centering,
 * and planted lateral grip with gentle counter-steer stability.
 */
export function stepRealisticSteering(
  state: SteeringState,
  inp: SteeringInput,
  dt: number,
): SteeringResult {
  const absV = Math.abs(inp.speedFwd);
  const raw = clampVal(inp.rawSteer, -1, 1);
  const sens = inp.isPlayer ? clampVal(inp.sensitivity ?? 1.0, 0.25, 2.0) : 1.0;

  // 1. Progressive keyboard turn-in vs crisp caster self-centering when released.
  // At highway speed (>18 m/s), turn-in is calmer so tapping A/D never jerks the car off-road.
  const speedCalm = clampVal(1 - absV / 55, 0.42, 1.0);
  const centering = Math.abs(raw) < 0.05;
  const counterSteering = raw * state.smoothInput < -0.05;

  let inputRate: number;
  if (!inp.isPlayer) {
    inputRate = 9.5;
  } else if (centering) {
    // Self-aligning caster torque returns wheel smoothly to center
    inputRate = (6.2 + Math.min(4.5, absV * 0.14)) * (0.72 + sens * 0.28);
  } else if (counterSteering) {
    // Quick response when catching a slide
    inputRate = 7.8 * (0.6 + sens * 0.48);
  } else {
    // Calm, weighty turn-in scaled by speed and player car physics sensitivity
    inputRate = (4.6 * speedCalm + 1.2) * (0.45 + sens * 0.65);
  }
  state.smoothInput += (raw - state.smoothInput) * (1 - Math.exp(-inputRate * dt));

  // Non-linear steering curve gives fine precision near center and full lock when held
  const curveExp = inp.isPlayer ? clampVal(1.52 - sens * 0.26, 1.0, 1.55) : 1.0;
  const curved = Math.sign(state.smoothInput) * Math.pow(Math.abs(state.smoothInput), curveExp);

  // 2. Strong speed-sensitive lock attenuation (full lock in parking lots, calm precision at 120 km/h)
  const sensLockMul = inp.isPlayer ? clampVal(0.68 + sens * 0.34, 0.72, 1.28) : 1.0;
  const lowSpeedLock = inp.maxSteerRad * (inp.isPlayer ? 0.86 * sensLockMul : 1.0);
  const speedTaper = 1 / (1 + Math.pow(absV / 11.5, 1.68));
  const handbrakeBonus = inp.handbrake && absV > 5 ? 1.22 : 1.0;
  const effectiveLock = clampVal(lowSpeedLock * speedTaper * handbrakeBonus, 0.05, inp.maxSteerRad * 1.18);

  const targetAngle = curved * effectiveLock;
  const rackSpeed = inp.isPlayer ? 8.0 * (0.55 + sens * 0.48) : 10.5;
  state.steerAngle += (targetAngle - state.steerAngle) * (1 - Math.exp(-rackSpeed * dt));

  // 3. Ackermann kinematic yaw rate with realistic tire saturation & speed-capped yaw ceiling
  const rawOmega = (inp.speedFwd * Math.tan(state.steerAngle)) / Math.max(1.8, inp.wheelBase);
  // Subtle understeer saturation at high speed so car doesn't pivot like a tank
  const highSpeedYawCap = clampVal((2.15 * (0.82 + sens * 0.2)) / (1 + absV * 0.032), 0.72, 2.35);
  let targetOmega = clampVal(rawOmega, -highSpeedYawCap, highSpeedYawCap);

  if (inp.handbrake && absV > 6.5) {
    targetOmega *= 1.48;
  }
  if (inp.sandFactor > 0.25 && absV > 5) {
    targetOmega *= 1.08;
  }

  // Gentle electronic stability assist: damps unintended fishtail spin when driver releases steering
  if (inp.isPlayer && centering && !inp.handbrake && absV > 8) {
    const stabDamp = clampVal(-inp.speedLat * 0.065, -0.35, 0.35);
    targetOmega += stabDamp;
  }

  const yawResponse = inp.handbrake ? 4.4 : inp.isPlayer ? 7.2 * (0.65 + sens * 0.38) : 9.2;
  state.omega += (targetOmega - state.omega) * (1 - Math.exp(-yawResponse * dt));

  // 4. Progressive Pacejka-lite lateral grip
  const sandGripMul = 1 - inp.sandFactor * 0.42;
  const slipSpeed = Math.abs(inp.speedLat);
  const slipRatio = clampVal(slipSpeed / 9.5, 0, 1);

  let grip = inp.baseGrip * sandGripMul;
  if (inp.handbrake) {
    grip *= absV < 3 ? 1.05 : 0.16;
  } else if (slipSpeed > 5.0) {
    // Progressive slide recovery instead of sudden ice-skating snap
    grip *= 0.62;
  } else {
    // High cornering stability on clean pavement
    grip *= 1.12;
  }
  const newLatSpeed = inp.speedLat * Math.exp(-grip * dt);

  return {
    steerAngle: state.steerAngle,
    omega: state.omega,
    newLatSpeed,
    slipRatio,
  };
}
