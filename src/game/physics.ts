// Pure physics simulation modules: Plane Aerodynamics, Car 4-Wheel Suspension, and Gore/Blood Ballistics.
// Zero Three.js dependencies so all physics laws are deterministically unit-tested with node:test.

import { clampVal } from './terrain';

// ========================================================================= PLANE AERODYNAMICS
export interface AircraftSpec {
  readonly maxThrust: number;      // m/s^2 acceleration at full throttle
  readonly maxSpeed: number;       // terminal level airspeed (m/s)
  readonly takeoffSpeed: number;   // airspeed where lift exceeds gravity (m/s)
  readonly stallSpeed: number;     // airspeed below which lift drops sharply (m/s)
  readonly liftCoeff: number;      // lift scaling factor
  readonly dragCoeff: number;      // quadratic air drag factor
  readonly pitchRate: number;      // rad/s
  readonly rollRate: number;       // rad/s
  readonly yawRate: number;        // rad/s
  readonly ceilingY: number;       // max altitude (m)
  readonly gearHeight: number;     // fuselage center height above ground on gear
}

export interface FlightState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;      // heading rad (+Z is 0, +X is +PI/2)
  pitch: number;    // nose up is positive (+X tilt visually negated in Three.js)
  roll: number;     // banking left is positive, right is negative
  throttle: number; // 0..1
  airspeed: number; // m/s along nose
  onGround: boolean;
  stalling: boolean;
  crashed: boolean;
}

export interface FlightInput {
  throttleDelta: number; // -1..+1 (W/S or Up/Down throttle)
  pitchIn: number;       // -1 (nose down) .. +1 (nose up)
  rollIn: number;        // -1 (roll right) .. +1 (roll left)
  yawIn: number;         // -1 (yaw right) .. +1 (yaw left)
  brake: boolean;
  groundY: number;
}

export interface FlightStepResult {
  crashed: boolean;
  impactSpeed: number;
  touchedDown: boolean;
  tookOff: boolean;
}

export function createFlightState(x: number, y: number, z: number, yaw = 0): FlightState {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0,
    yaw, pitch: 0, roll: 0,
    throttle: 0, airspeed: 0,
    onGround: true, stalling: false, crashed: false,
  };
}

/** Deterministic 6-DOF simplified aerodynamic flight model for propeller planes, seaplanes, and jets. */
export function stepFlightPhysics(
  s: FlightState,
  spec: AircraftSpec,
  inp: FlightInput,
  dt: number,
): FlightStepResult {
  const G = 16.0; // slightly snappy arcade-realistic gravity for crisp game feel
  const wasOnGround = s.onGround;
  let crashed = false;
  let impactSpeed = 0;
  let touchedDown = false;
  let tookOff = false;

  // Throttle integration (stays where set like real aircraft throttle lever, drops fast on brake)
  if (inp.throttleDelta !== 0) {
    s.throttle = clampVal(s.throttle + inp.throttleDelta * 0.85 * dt, 0, 1);
  }
  if (inp.brake && s.onGround) {
    s.throttle = Math.max(0, s.throttle - 1.5 * dt);
  }

  // Forward unit vector from yaw & pitch (nose up = +pitch => +Y)
  const cp = Math.cos(s.pitch);
  const sp = Math.sin(s.pitch);
  const sy = Math.sin(s.yaw);
  const cy = Math.cos(s.yaw);
  const fx = sy * cp;
  const fy = sp;
  const fz = cy * cp;

  // Current airspeed projected along nose
  const curSpeed = Math.hypot(s.vx, s.vy, s.vz);
  const fwdSpeed = Math.max(0, s.vx * fx + s.vy * fy + s.vz * fz);
  s.airspeed = fwdSpeed;

  // Control surface authority scales with airspeed
  const auth = clampVal(fwdSpeed / (spec.takeoffSpeed * 0.72), 0.12, 1.0);

  if (s.onGround) {
    // Ground taxi steering + nose rotation on takeoff
    s.yaw += (inp.yawIn + inp.rollIn * 0.7) * spec.yawRate * 1.45 * clampVal(fwdSpeed / 8, 0.25, 1.0) * dt;
    s.roll *= Math.exp(-8 * dt);
    if (fwdSpeed >= spec.takeoffSpeed * 0.72 && inp.pitchIn > 0) {
      s.pitch = clampVal(s.pitch + inp.pitchIn * spec.pitchRate * 0.85 * dt, -0.05, 0.34);
    } else {
      s.pitch *= Math.exp(-6 * dt);
    }
  } else {
    // Airborne pitch, roll, yaw + realistic bank-to-turn yaw coupling
    s.pitch = clampVal(s.pitch + inp.pitchIn * spec.pitchRate * auth * dt, -0.95, 0.92);
    s.roll = clampVal(s.roll + inp.rollIn * spec.rollRate * auth * dt, -1.25, 1.25);
    // Gentle self-leveling roll damping when stick is neutral
    if (Math.abs(inp.rollIn) < 0.05) {
      s.roll *= Math.exp(-1.15 * dt);
    }
    // Banked turn physics: rolling left (+roll) turns yaw left (+yaw)
    const bankTurn = Math.sin(s.roll) * 1.15 * auth;
    s.yaw += (inp.yawIn * spec.yawRate * auth + bankTurn) * dt;
  }

  // Recompute nose direction after rotation
  const cp2 = Math.cos(s.pitch);
  const sp2 = Math.sin(s.pitch);
  const sy2 = Math.sin(s.yaw);
  const cy2 = Math.cos(s.yaw);
  const nfx = sy2 * cp2;
  const nfy = sp2;
  const nfz = cy2 * cp2;

  // Engine thrust
  const thrust = s.throttle * spec.maxThrust;
  let ax = nfx * thrust;
  let ay = nfy * thrust - G;
  let az = nfz * thrust;

  // Aerodynamic lift (quadratic in airspeed, reduced when banked or stalled)
  const airRatio = fwdSpeed / spec.takeoffSpeed;
  const stallNow = !s.onGround && fwdSpeed < spec.stallSpeed;
  s.stalling = stallNow;

  // Lift equals gravity at takeoffSpeed when level, scales with angle/pitch
  const bankCos = Math.max(0.2, Math.cos(s.roll));
  const pitchLift = 1 + clampVal(s.pitch * 1.4, -0.45, 0.85);
  const stallFactor = stallNow ? clampVal(fwdSpeed / spec.stallSpeed, 0.15, 0.85) : 1.0;
  // Altitude density drop near ceiling
  const altFade = clampVal(1 - Math.max(0, s.y - spec.ceilingY * 0.82) / (spec.ceilingY * 0.25), 0.1, 1);
  const liftAcc = Math.min(G * 1.75, G * airRatio * airRatio * spec.liftCoeff * pitchLift * bankCos * stallFactor * altFade);

  // Lift acts roughly upward perpendicular to wings (tilted slightly by roll for banked centripetal turn)
  const liftUp = Math.cos(s.roll) * liftAcc;
  const liftLat = Math.sin(s.roll) * liftAcc * 0.35;
  const lx = cy2; // left vector X
  const lz = -sy2; // left vector Z
  ay += liftUp;
  ax += lx * liftLat;
  az += lz * liftLat;

  // Stall nose drop
  if (stallNow) {
    s.pitch = clampVal(s.pitch - 0.55 * dt, -0.85, 0.85);
  }

  // Parasitic + induced air drag
  const drag = spec.dragCoeff * curSpeed * curSpeed + (inp.brake ? 9.0 : 0);
  if (curSpeed > 0.01) {
    const inv = 1 / curSpeed;
    ax -= s.vx * inv * drag;
    ay -= s.vy * inv * drag;
    az -= s.vz * inv * drag;
  }

  // Integrate velocity
  s.vx += ax * dt;
  s.vy += ay * dt;
  s.vz += az * dt;

  // Align velocity smoothly toward nose (weathervane stability — wings resist sideslip!)
  const newSp = Math.hypot(s.vx, s.vy, s.vz);
  if (newSp > 0.5) {
    const clampedSp = Math.min(newSp, spec.maxSpeed);
    const align = s.onGround ? 1 - Math.exp(-8 * dt) : 1 - Math.exp(-3.4 * auth * dt);
    const tvx = nfx * clampedSp;
    const tvy = nfy * clampedSp;
    const tvz = nfz * clampedSp;
    s.vx += (tvx - s.vx) * align;
    if (!s.onGround) s.vy += (tvy - s.vy) * (align * 0.52);
    s.vz += (tvz - s.vz) * align;
  }

  // Ground rolling friction & braking
  if (s.onGround) {
    const rollFric = inp.brake ? 3.2 : 0.22;
    const k = Math.exp(-rollFric * dt);
    s.vx *= k;
    s.vz *= k;
  }

  // Position integration
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;

  // Ceiling soft clamp
  if (s.y > spec.ceilingY) {
    s.y = spec.ceilingY;
    if (s.vy > 0) s.vy = 0;
  }

  // Ground & runway collision
  const minY = inp.groundY + spec.gearHeight;
  if (s.y <= minY + 0.04) {
    const sinkRate = -s.vy;
    const badAttitude = Math.abs(s.roll) > 0.62 || s.pitch < -0.42;
    if (!wasOnGround && (sinkRate > 11.5 || (badAttitude && newSp > 18))) {
      crashed = true;
      s.crashed = true;
      impactSpeed = Math.max(sinkRate, newSp * 0.65);
    } else if (!wasOnGround && sinkRate > 1.2) {
      touchedDown = true;
    }
    s.y = minY;
    if (s.vy < 0) s.vy = 0;
    // Liftoff check: if lift exceeds gravity and nose is level/pitched up, lift off!
    if (liftUp > G * 1.03 && s.pitch >= -0.02 && fwdSpeed >= spec.takeoffSpeed) {
      s.onGround = false;
      s.vy = Math.max(s.vy, 1.8 + s.pitch * 9);
      if (wasOnGround) tookOff = true;
    } else {
      s.onGround = true;
    }
  } else {
    s.onGround = false;
    if (wasOnGround) tookOff = true;
  }

  s.airspeed = Math.hypot(s.vx, s.vy, s.vz);
  return { crashed, impactSpeed, touchedDown, tookOff };
}

// ========================================================================= CAR 4-WHEEL SUSPENSION & WEIGHT TRANSFER
export interface SuspensionState {
  heave: number;      // vertical chassis offset from neutral (m)
  heaveVel: number;   // vertical bounce velocity (m/s)
  pitch: number;      // chassis pitch rad (nose up > 0 on accel, nose dive < 0 on brake)
  pitchVel: number;
  roll: number;       // chassis body roll rad in corners
  rollVel: number;
  airborne: boolean;
  airVy: number;      // vertical world velocity when jumping/airborne
  worldY: number;     // current world Y
}

export interface SuspensionInput {
  groundY: number;
  longAccel: number;  // forward acceleration m/s^2
  latAccel: number;   // lateral centripetal acceleration m/s^2
  speed: number;
  roughness: number;  // 0 (smooth asphalt) .. 1 (offroad/dunes/curbs)
  stiffness?: number;
  damping?: number;
}

export interface SuspensionStepResult {
  landed: boolean;
  landingSpeed: number;
  bodyYOffset: number;
  pitch: number;
  roll: number;
}

export function createSuspensionState(groundY = 0): SuspensionState {
  return {
    heave: 0, heaveVel: 0, pitch: 0, pitchVel: 0, roll: 0, rollVel: 0,
    airborne: false, airVy: 0, worldY: groundY,
  };
}

/** 4-corner spring-damper suspension with airborne jumps, landing compression, and weight transfer. */
export function stepSuspensionPhysics(
  s: SuspensionState,
  inp: SuspensionInput,
  dt: number,
): SuspensionStepResult {
  const kSpring = inp.stiffness ?? 68;
  const cDamp = inp.damping ?? 11.5;
  const G = 18.5;
  let landed = false;
  let landingSpeed = 0;

  // Detect launch off crests / ramps or airborne flight
  if (s.worldY > inp.groundY + 0.28 || s.airborne) {
    s.airborne = true;
    s.airVy -= G * dt;
    s.worldY += s.airVy * dt;
    if (s.worldY <= inp.groundY) {
      landingSpeed = Math.max(0, -s.airVy);
      s.worldY = inp.groundY;
      s.airborne = false;
      landed = landingSpeed > 1.8;
      // Transfer downward impact into suspension compression impulse
      s.heaveVel -= Math.min(6.5, landingSpeed * 0.65);
      s.airVy = 0;
    }
  } else {
    // Smoothly follow rising terrain; launch if cresting fast downhill
    const deltaG = inp.groundY - s.worldY;
    if (deltaG < -0.35 && inp.speed > 14) {
      s.airborne = true;
      s.airVy = Math.max(-1.0, deltaG / Math.max(dt, 0.016) * 0.35);
    } else {
      const oldY = s.worldY;
      s.worldY = inp.groundY;
      if (Math.abs(s.worldY - oldY) > 0.04) {
        s.heaveVel -= clampVal((s.worldY - oldY) * 8, -2.5, 2.5);
      }
    }
  }

  // Road micro-bump excitation when moving over sand/offroad
  if (!s.airborne && inp.roughness > 0.02 && inp.speed > 1.5) {
    const bump = Math.sin(inp.speed * 2.1 + s.worldY * 5) * inp.roughness * Math.min(1, inp.speed / 15) * 4.5;
    s.heaveVel += bump * dt;
  }

  // Spring-damper heave integration
  const heaveAcc = -kSpring * s.heave - cDamp * s.heaveVel;
  s.heaveVel += heaveAcc * dt;
  s.heave = clampVal(s.heave + s.heaveVel * dt, -0.22, 0.24);

  // Longitudinal weight transfer (squat on accel, nose-dive on braking)
  const targetPitch = s.airborne
    ? clampVal(s.airVy * 0.03, -0.22, 0.22)
    : clampVal(-inp.longAccel * 0.0085, -0.14, 0.12);
  const pitchAcc = -52 * (s.pitch - targetPitch) - 10 * s.pitchVel;
  s.pitchVel += pitchAcc * dt;
  s.pitch = clampVal(s.pitch + s.pitchVel * dt, -0.24, 0.24);

  // Lateral body roll in corners
  const targetRoll = s.airborne ? 0 : clampVal(inp.latAccel * 0.012, -0.18, 0.18);
  const rollAcc = -48 * (s.roll - targetRoll) - 9.5 * s.rollVel;
  s.rollVel += rollAcc * dt;
  s.roll = clampVal(s.roll + s.rollVel * dt, -0.22, 0.22);

  return {
    landed,
    landingSpeed,
    bodyYOffset: s.heave,
    pitch: s.pitch,
    roll: s.roll,
  };
}

// ========================================================================= GORE, BLOOD & RAGDOLL BALLISTICS
export interface BloodBurstSpec {
  dropletCount: number;
  spraySpeed: number;
  spreadAngle: number;
  puddleTargetRadius: number;
  gibCount: number;
}

/** Computes realistic ballistic blood spray, pooling radius, and gib count from impact energy & hit type. */
export function computeBloodBurst(
  damage: number,
  headshot: boolean,
  explosive: boolean,
  shotgun: boolean,
): BloodBurstSpec {
  const power = clampVal(damage / 25, 0.4, 5.0);
  const dropletCount = Math.round(
    clampVal(10 + power * 10 + (headshot ? 16 : 0) + (shotgun ? 12 : 0) + (explosive ? 22 : 0), 10, 64),
  );
  const spraySpeed = clampVal(3.2 + power * 1.6 + (headshot ? 2.4 : 0) + (explosive ? 4.5 : 0), 3.0, 14.0);
  const spreadAngle = explosive ? Math.PI : shotgun ? 0.85 : headshot ? 0.65 : 0.42;
  const puddleTargetRadius = clampVal(0.45 + power * 0.24 + (headshot ? 0.35 : 0) + (explosive ? 0.55 : 0), 0.45, 1.85);
  const gibCount = explosive ? 9 : shotgun && damage >= 30 ? 4 : headshot && damage >= 60 ? 3 : 0;
  return { dropletCount, spraySpeed, spreadAngle, puddleTargetRadius, gibCount };
}

/** Smoothly expands a ground blood puddle over time (saturates cleanly at maxRadius). */
export function computePuddleRadius(ageSec: number, maxRadius: number): number {
  if (ageSec <= 0) return 0.08;
  const t = 1 - Math.exp(-ageSec * 1.85);
  return 0.08 + (maxRadius - 0.08) * t;
}

export interface RagdollImpulse {
  vx: number;
  vy: number;
  vz: number;
  headWhip: number;
}

/** Computes directional ragdoll launch velocity & headshot whip from weapon/explosion/car hits. */
export function computeRagdollImpulse(
  dirX: number,
  dirZ: number,
  damage: number,
  headshot: boolean,
  explosive: boolean,
): RagdollImpulse {
  const len = Math.hypot(dirX, dirZ) || 1;
  const nx = dirX / len;
  const nz = dirZ / len;
  const base = explosive ? 14.5 : clampVal(2.8 + damage * 0.085, 2.8, 12.5);
  return {
    vx: nx * base,
    vy: explosive ? 8.5 : headshot ? 3.4 : clampVal(1.6 + damage * 0.035, 1.6, 5.2),
    vz: nz * base,
    headWhip: headshot ? 4.8 : explosive ? 3.5 : 1.0,
  };
}
