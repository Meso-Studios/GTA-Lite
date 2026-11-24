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
  splatterCount: number;
  arterialPulses: number;
}

export type VehicleImpactSeverity = 'none' | 'tap' | 'moderate' | 'severe' | 'catastrophic';

export interface VehiclePedImpactResult {
  severity: VehicleImpactSeverity;
  damage: number;
  knockdown: boolean;
  lethal: boolean;
  pushSpeed: number;
  launchUp: number;
  bloodDamage: number; // 0 for minor taps — no absurd blood explosion!
  allowGibs: boolean;
}

/**
 * Physically grounded car-vs-pedestrian kinetic impact model:
 * - Slight tap (< 5.5 m/s, ~12 mph): stumble/shove, minor bruise (3-8 dmg), ZERO blood explosion!
 * - Moderate bump (5.5 - 13.5 m/s, 12-30 mph): knockdown/ragdoll, modest localized bleed, zero gibs.
 * - Severe hit (13.5 - 25 m/s, 30-56 mph): heavy ragdoll launch, directional blood spray & puddle.
 * - Catastrophic impact (>= 25 m/s, 56+ mph): high-energy lethal trauma with full gore ballistics.
 */
export function computeVehiclePedImpact(speedMs: number, vehicleMassKg = 1450): VehiclePedImpactResult {
  const sp = Math.max(0, speedMs);
  const massFactor = clampVal(Math.sqrt(vehicleMassKg / 1450), 0.78, 1.38);
  const effSp = sp * massFactor;

  if (effSp < 1.8) {
    return { severity: 'none', damage: 0, knockdown: false, lethal: false, pushSpeed: 0, launchUp: 0, bloodDamage: 0, allowGibs: false };
  }
  if (effSp < 5.5) {
    // Low-speed tap: shove pedestrian safely off bumper with ZERO blood explosion
    return {
      severity: 'tap',
      damage: Math.round(clampVal((effSp - 1.5) * 1.8, 2, 8)),
      knockdown: false,
      lethal: false,
      pushSpeed: clampVal(effSp * 0.9 + 1.4, 2.0, 5.2),
      launchUp: 0,
      bloodDamage: 0,
      allowGibs: false,
    };
  }
  if (effSp < 13.5) {
    // Moderate urban collision: painful knockdown, small localized blood only
    const dmg = Math.round(clampVal((effSp - 4.0) * 3.1, 12, 34));
    return {
      severity: 'moderate',
      damage: dmg,
      knockdown: true,
      lethal: false,
      pushSpeed: clampVal(effSp * 0.95, 5.5, 12.5),
      launchUp: clampVal(1.4 + (effSp - 5.5) * 0.22, 1.4, 3.2),
      bloodDamage: Math.round(dmg * 0.42),
      allowGibs: false,
    };
  }
  if (effSp < 25.0) {
    // High-speed hit: severe trauma, full ragdoll, realistic arterial bleeding & splatters (no exploding gibs yet)
    const dmg = Math.round(clampVal(36 + (effSp - 13.5) * 3.8, 36, 85));
    return {
      severity: 'severe',
      damage: dmg,
      knockdown: true,
      lethal: true,
      pushSpeed: clampVal(effSp * 1.05, 13.5, 25.0),
      launchUp: clampVal(3.4 + (effSp - 13.5) * 0.25, 3.4, 6.2),
      bloodDamage: Math.round(dmg * 0.85),
      allowGibs: false,
    };
  }
  // Catastrophic highway-speed strike (>= 56 mph)
  const dmg = Math.round(clampVal(88 + (effSp - 25) * 3.2, 88, 160));
  return {
    severity: 'catastrophic',
    damage: dmg,
    knockdown: true,
    lethal: true,
    pushSpeed: clampVal(effSp * 1.12, 26.0, 38.0),
    launchUp: clampVal(6.2 + (effSp - 25) * 0.16, 6.2, 9.0),
    bloodDamage: dmg,
    allowGibs: true,
  };
}

/** Computes realistic ballistic blood spray, splatter count, arterial pulses, pooling radius, and gib count from impact energy. */
export function computeBloodBurst(
  damage: number,
  headshot: boolean,
  explosive: boolean,
  shotgun: boolean,
  blunt = false,
): BloodBurstSpec {
  if (damage <= 0) {
    return { dropletCount: 0, spraySpeed: 0, spreadAngle: 0, puddleTargetRadius: 0, gibCount: 0, splatterCount: 0, arterialPulses: 0 };
  }
  if (blunt && !explosive) {
    // Punches, bats, and low-energy blunt impacts produce subtle nose/lip bleed — never a crimson geyser
    const lightPower = clampVal(damage / 24, 0.2, 1.4);
    return {
      dropletCount: Math.round(clampVal(3 + lightPower * 5, 3, 10)),
      spraySpeed: clampVal(1.6 + lightPower * 1.2, 1.5, 3.4),
      spreadAngle: 0.34,
      puddleTargetRadius: damage >= 24 ? 0.36 : 0.0,
      gibCount: 0,
      splatterCount: damage >= 18 ? 2 : 0,
      arterialPulses: 0,
    };
  }
  const power = clampVal(damage / 26, 0.35, 5.0);
  const dropletCount = Math.round(
    clampVal(10 + power * 12 + (headshot ? 20 : 0) + (shotgun ? 16 : 0) + (explosive ? 30 : 0), 8, 88),
  );
  const spraySpeed = clampVal(3.1 + power * 1.7 + (headshot ? 2.5 : 0) + (explosive ? 5.0 : 0), 2.8, 15.8);
  const spreadAngle = explosive ? Math.PI : shotgun ? 0.88 : headshot ? 0.68 : 0.42;
  const puddleTargetRadius = clampVal(0.42 + power * 0.26 + (headshot ? 0.42 : 0) + (explosive ? 0.65 : 0), 0.38, 2.15);
  // Gibs only on truly extreme kinetic/explosive/point-blank trauma (never on regular taps or pistol hits)
  const gibCount = explosive
    ? 12
    : shotgun && damage >= 36
      ? 6
      : headshot && damage >= 58
        ? 4
        : damage >= 95
          ? 3
          : 0;
  const splatterCount = Math.round(clampVal(3 + power * 3.6 + (headshot ? 5 : 0) + (shotgun ? 5 : 0) + (explosive ? 10 : 0), 2, 26));
  const arterialPulses = explosive
    ? 5
    : headshot
      ? 6
      : shotgun
        ? 4
        : damage >= 34
          ? 3
          : damage >= 22
            ? 1
            : 0;
  return { dropletCount, spraySpeed, spreadAngle, puddleTargetRadius, gibCount, splatterCount, arterialPulses };
}

export interface ArterialJetSpec {
  pulses: number;
  pulseInterval: number;
  dropletsPerPulse: number;
  jetSpeed: number;
  arcUp: number;
}

/** Computes pressurized heart-beat pulsing arterial jet parameters for heavy/fatal penetrating trauma. */
export function computeArterialJet(damage: number, headshot: boolean, katana: boolean): ArterialJetSpec {
  const severity = clampVal(damage / 38, 0.4, 3.0);
  const pulses = headshot ? 6 : katana ? 5 : Math.round(clampVal(1 + severity * 1.8, 1, 6));
  const pulseInterval = headshot ? 0.25 : 0.29;
  const dropletsPerPulse = Math.round(clampVal(4 + severity * 3 + (headshot ? 4 : 0) + (katana ? 3 : 0), 4, 15));
  const jetSpeed = clampVal(4.1 + severity * 1.5 + (headshot ? 2.0 : 0), 3.8, 10.8);
  const arcUp = headshot ? 3.1 : katana ? 2.6 : 1.9;
  return { pulses, pulseInterval, dropletsPerPulse, jetSpeed, arcUp };
}

export interface BloodSplatterStreak {
  length: number;
  width: number;
  yaw: number;
}

/** Computes elongated directional blood splatter dimensions & orientation from droplet impact velocity. */
export function computeBloodSplatterStreak(vx: number, vy: number, vz: number): BloodSplatterStreak {
  const horiz = Math.hypot(vx, vz);
  const vert = Math.max(0.5, Math.abs(vy));
  const impactRatio = clampVal(horiz / vert, 0.15, 4.5);
  const width = clampVal(0.1 + Math.min(0.18, horiz * 0.012), 0.08, 0.3);
  const length = clampVal(width * (1 + impactRatio * 1.35), width, 1.35);
  const yaw = horiz > 0.05 ? Math.atan2(vx, vz) : 0;
  return { length, width, yaw };
}

/** Shifts arterial blood color monotonically from bright oxygenated crimson to dark coagulated maroon over time. */
export function computeCoagulationColor(ageSec: number): { r: number; g: number; b: number } {
  const t = clampVal(1 - Math.exp(-Math.max(0, ageSec) / 14), 0, 1);
  // Fresh arterial red (#a6080e -> 0.65, 0.031, 0.055) -> dark coagulated maroon (#240204 -> 0.14, 0.008, 0.016)
  return {
    r: 0.65 + (0.14 - 0.65) * t,
    g: 0.031 + (0.008 - 0.031) * t,
    b: 0.055 + (0.016 - 0.055) * t,
  };
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
