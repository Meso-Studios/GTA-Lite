import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD_BOUNDS,
  WORLD_HALF,
  DECK,
  OUTER_HIGHWAYS,
  deckHeight,
  isOceanAt,
  isOnOuterHighway,
  terrainHeightAt,
  terrainSlopeAt,
  surfaceAt,
  sandFactorAt,
  districtNameAt,
  groundHeightAt,
  applySandVehiclePhysics,
  applySandFootPhysics,
  createMovementState,
  stepMovementState,
  WEAPONS,
  WEAPON_ORDER,
  WEAPON_SHOP_ORDER,
  isMeleeWeapon,
} from './terrain';
import { STORES, STORE_COUNT, getStoreByIndex, getStoreIndexByName } from './stores';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createFlightState,
  stepFlightPhysics,
  createSuspensionState,
  stepSuspensionPhysics,
  computeBloodBurst,
  computeArterialJet,
  computeBloodSplatterStreak,
  computeCoagulationColor,
  computePuddleRadius,
  computeRagdollImpulse,
  type AircraftSpec,
} from './physics';
import { AmbientDialogueController, speakerLabelFor } from './ambientDialogue';
import {
  ANIMATION_CATEGORIES,
  ANIMATION_CLIPS,
  ANIMATION_COUNT,
  evaluateAnimationPose,
  getAnimationById,
  getAnimationByName,
  selectContextAnimation,
} from './animations';
import { buildTtsApiUrl, computeVoiceVolume, selectVoiceProfile } from './npcVoices';
import { computeAmbienceTargets, computeNaturalVoiceVolume } from './soundMix';
import { computeWaitLineSlots, interiorFloorHeight } from './interiorMath';

test('10km x 10km world bounds span -5000..+5000 on both axes', () => {
  assert.equal(WORLD_HALF, 5000);
  assert.equal(WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX, 10000);
  assert.equal(WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ, 10000);
});

test('terrainHeightAt keeps core city flat while sculpting dunes, north hills, ocean, and Nova Keys Island', () => {
  // Core city downtown & beachfront stay flat at 0
  assert.equal(terrainHeightAt(0, 0), 0);
  assert.equal(terrainHeightAt(350, -350), 0);
  assert.equal(terrainHeightAt(-100, 560), 0);

  // Western Golden Dunes have rolling positive elevation off highways
  const duneH = terrainHeightAt(-2500, 1200);
  assert.ok(duneH > 0.5, `Expected positive dune elevation, got ${duneH}`);

  // Northern hills rise significantly off highways
  const northHillH = terrainHeightAt(600, -3500);
  assert.ok(northHillH > 10, `Expected high northern hill elevation, got ${northHillH}`);

  // Open ocean bay is submerged
  assert.equal(isOceanAt(0, 1200), true);
  assert.equal(terrainHeightAt(0, 1200), -1.2);

  // Nova Keys Resort Island rises above sea level
  assert.equal(isOceanAt(DECK.ISLAND.cx, DECK.ISLAND.cz), false);
  const islandH = terrainHeightAt(DECK.ISLAND.cx, DECK.ISLAND.cz);
  assert.ok(islandH > 1.0, `Expected Nova Keys Island elevation > 1.0, got ${islandH}`);

  // Terrain flattens cleanly along outer expressways
  const hwH = terrainHeightAt(-2000, 0);
  assert.ok(hwH < 0.05, `Expected flattened terrain under West Expressway, got ${hwH}`);

  // Terrain slope normal is normalized and tilts on dunes
  const normal = terrainSlopeAt(-2500, 1200);
  const len = Math.hypot(normal.nx, normal.ny, normal.nz);
  assert.ok(Math.abs(len - 1) < 1e-6);
  assert.ok(normal.ny > 0.7);
});

test('surfaceAt, sandFactorAt, and districtNameAt classify city, beachfront, dunes, and highways', () => {
  assert.equal(surfaceAt(0, 0), 'sidewalk');
  assert.equal(sandFactorAt(0, 0), 0);
  assert.equal(districtNameAt(0, 0), 'DOWNTOWN FINANCIAL CORE');

  // Main Beachfront dry & wet sand
  assert.equal(surfaceAt(-100, 560), 'sand');
  assert.ok(sandFactorAt(-100, 560) > 0.6);
  assert.equal(surfaceAt(-100, 602), 'wet_sand');
  assert.equal(sandFactorAt(-100, 602), 0.4);
  assert.equal(districtNameAt(-100, 560), 'OCEAN BEACH BOARDWALK');

  // Deep Golden Dunes sand
  assert.equal(surfaceAt(-2000, 1000), 'sand');
  assert.ok(sandFactorAt(-2000, 1000) >= 0.8);

  // Outer expressways override surrounding dunes with firm highway surface
  assert.equal(isOnOuterHighway(-2000, 0), true);
  assert.equal(surfaceAt(-2000, 0), 'highway');
  assert.equal(sandFactorAt(-2000, 0), 0);
  assert.equal(OUTER_HIGHWAYS.length >= 8, true);

  // Elevated inner ring at deck altitude
  assert.equal(surfaceAt(-640, 0, DECK.H), 'highway');
  assert.equal(sandFactorAt(-640, 0, DECK.H), 0);
});

test('deckHeight provides smooth ramps, inner ring deck, and Ocean Causeway bridge descent onto Nova Keys Island', () => {
  // Inner ring height when near deck altitude
  assert.equal(deckHeight(-640, 0, DECK.H), DECK.H);
  // Does not snap vehicles driving at ground level underneath
  assert.equal(deckHeight(-640, 200, 0), 0);

  // North city ramp ascends smoothly from z1 (-500) to z0 (-628)
  const midRampZ = (DECK.RAMP_N.z0 + DECK.RAMP_N.z1) / 2;
  const midRampH = deckHeight(DECK.RAMP_N.x, midRampZ, DECK.H * 0.5);
  assert.ok(Math.abs(midRampH - DECK.H * 0.5) < 0.15, `Expected ~${DECK.H * 0.5}, got ${midRampH}`);

  // Ocean Causeway bridge spans across the bay at H and descends smoothly onto Nova Keys Island
  assert.equal(deckHeight(DECK.BRIDGE.x, 1200, DECK.H), DECK.H);
  const descentMid = deckHeight(DECK.BRIDGE.x, DECK.BRIDGE.z1 - 75, 5.5);
  assert.ok(descentMid > 3 && descentMid < DECK.H - 1, `Expected smooth island descent, got ${descentMid}`);

  // groundHeightAt respects outer highway crown
  assert.ok(groundHeightAt(-2000, 0, 0) >= 0.12);
});

test('applySandVehiclePhysics adds rolling drag, reduces lateral grip, sinks tires, and kicks up spray vs pavement', () => {
  const onPavement = applySandVehiclePhysics(20, 4, 1, false, 0, 1500, 0.1);
  assert.equal(onPavement.vf, 20);
  assert.equal(onPavement.gripMul, 1);
  assert.equal(onPavement.sinkY, 0);
  assert.equal(onPavement.sprayIntensity, 0);

  const onDeepSand = applySandVehiclePhysics(20, 4, 1, false, 0.9, 1500, 0.1);
  assert.ok(onDeepSand.vf < 20, `Expected sand drag to reduce vf, got ${onDeepSand.vf}`);
  assert.ok(onDeepSand.gripMul < 0.75, `Expected reduced grip on sand, got ${onDeepSand.gripMul}`);
  assert.ok(onDeepSand.sinkY > 0.05, `Expected positive tire sink on sand, got ${onDeepSand.sinkY}`);
  assert.ok(onDeepSand.sprayIntensity > 0.5, `Expected sand spray intensity, got ${onDeepSand.sprayIntensity}`);

  // Coasting off throttle in sand slows faster than under throttle
  const coastSand = applySandVehiclePhysics(20, 0, 0, false, 0.9, 1500, 0.2);
  const throttleSand = applySandVehiclePhysics(20, 0, 1, false, 0.9, 1500, 0.2);
  assert.ok(coastSand.vf < throttleSand.vf);
});

test('applySandFootPhysics slows walking speed and produces sand puffs on sand', () => {
  const pave = applySandFootPhysics(6, 0);
  assert.equal(pave.speedMul, 1);
  assert.equal(pave.puffRate, 0);
  assert.equal(pave.sinkY, 0);

  const sand = applySandFootPhysics(6, 0.85);
  assert.ok(sand.speedMul < 0.9 && sand.speedMul >= 0.72);
  assert.ok(sand.puffRate > 4);
  assert.ok(sand.sinkY > 0);
});

test('stepMovementState supports coyote time, jump buffering, variable jump height, stamina, and tactical slide', () => {
  // 1. Coyote time jump succeeds within 0.08s after stepping off ledge
  const s1 = createMovementState(2.0);
  s1.onGround = false;
  s1.coyoteT = 0.08;
  const r1 = stepMovementState(
    s1,
    { wishX: 0, wishZ: 0, sprint: false, crouch: false, crouchPressed: false, jumpPressed: true, jumpHeld: true, aiming: false, scoping: false, groundY: 0, sandFactor: 0 },
    0.016,
  );
  assert.equal(r1.jumped, true);
  assert.ok(s1.vy > 5.0);

  // 2. Jump buffer triggers immediately upon landing if pressed shortly before touchdown
  const s2 = createMovementState(0.25);
  s2.onGround = false;
  s2.coyoteT = 0;
  s2.vy = -5.0;
  // Press jump in mid-air
  stepMovementState(
    s2,
    { wishX: 0, wishZ: 0, sprint: false, crouch: false, crouchPressed: false, jumpPressed: true, jumpHeld: true, aiming: false, scoping: false, groundY: 0, sandFactor: 0 },
    0.016,
  );
  // Step until landing + next tick executes buffered jump
  let bufferedJumped = false;
  for (let i = 0; i < 6; i++) {
    const res = stepMovementState(
      s2,
      { wishX: 0, wishZ: 0, sprint: false, crouch: false, crouchPressed: false, jumpPressed: false, jumpHeld: true, aiming: false, scoping: false, groundY: 0, sandFactor: 0 },
      0.016,
    );
    if (res.jumped) bufferedJumped = true;
  }
  assert.equal(bufferedJumped, true, 'Expected buffered jump to trigger on touchdown');

  // 3. Variable jump height cut when jumpHeld is released early
  const sHold = createMovementState(0);
  const sTap = createMovementState(0);
  stepMovementState(sHold, { wishX: 0, wishZ: 0, sprint: false, crouch: false, crouchPressed: false, jumpPressed: true, jumpHeld: true, aiming: false, scoping: false, groundY: 0, sandFactor: 0 }, 0.016);
  stepMovementState(sTap, { wishX: 0, wishZ: 0, sprint: false, crouch: false, crouchPressed: false, jumpPressed: true, jumpHeld: true, aiming: false, scoping: false, groundY: 0, sandFactor: 0 }, 0.016);
  for (let i = 0; i < 6; i++) {
    stepMovementState(sHold, { wishX: 0, wishZ: 0, sprint: false, crouch: false, crouchPressed: false, jumpPressed: false, jumpHeld: true, aiming: false, scoping: false, groundY: 0, sandFactor: 0 }, 0.016);
    stepMovementState(sTap, { wishX: 0, wishZ: 0, sprint: false, crouch: false, crouchPressed: false, jumpPressed: false, jumpHeld: false, aiming: false, scoping: false, groundY: 0, sandFactor: 0 }, 0.016);
  }
  assert.ok(sHold.vy > sTap.vy + 0.5, `Expected held jump vy (${sHold.vy}) > tap jump vy (${sTap.vy})`);

  // 4. Sprint drains stamina, stopping regenerates stamina, crouch while sprinting triggers tactical slide
  const sRun = createMovementState(0);
  for (let i = 0; i < 30; i++) {
    stepMovementState(sRun, { wishX: 0, wishZ: 1, sprint: true, crouch: false, crouchPressed: false, jumpPressed: false, jumpHeld: false, aiming: false, scoping: false, groundY: 0, sandFactor: 0 }, 0.02);
  }
  const afterSprintStamina = sRun.stamina;
  assert.ok(afterSprintStamina < 95, `Expected sprint to drain stamina, got ${afterSprintStamina}`);
  assert.ok(Math.hypot(sRun.vx, sRun.vz) > 6.5, 'Expected sprint speed > 6.5');

  const slideRes = stepMovementState(sRun, { wishX: 0, wishZ: 1, sprint: true, crouch: true, crouchPressed: true, jumpPressed: false, jumpHeld: false, aiming: false, scoping: false, groundY: 0, sandFactor: 0 }, 0.02);
  assert.equal(slideRes.sliding, true);
  assert.ok(sRun.slideT > 0.35);
  assert.ok(Math.hypot(sRun.vx, sRun.vz) > 8.5, 'Expected tactical slide burst speed > 8.5');
  assert.ok(sRun.stamina < afterSprintStamina - 10, 'Expected slide to consume stamina');

  // Standing still after slide expires regenerates stamina
  sRun.slideT = 0;
  const beforeRegen = sRun.stamina;
  for (let i = 0; i < 20; i++) {
    stepMovementState(sRun, { wishX: 0, wishZ: 0, sprint: false, crouch: false, crouchPressed: false, jumpPressed: false, jumpHeld: false, aiming: false, scoping: false, groundY: 0, sandFactor: 0 }, 0.05);
  }
  assert.ok(sRun.stamina > beforeRegen + 15);
});

test('expanded 15-weapon catalog has valid definitions, shop items, and melee classification', () => {
  assert.equal(WEAPON_ORDER.length, 15);
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    assert.ok(w, `Missing weapon definition for ${id}`);
    assert.ok(w.dmg > 0, `Invalid dmg for ${id}`);
    assert.ok(w.rate > 0, `Invalid rate for ${id}`);
    assert.ok(w.range > 0, `Invalid range for ${id}`);
    assert.ok(w.pellets >= 1, `Invalid pellets for ${id}`);
  }
  for (const id of WEAPON_SHOP_ORDER) {
    assert.ok(WEAPONS[id], `Missing shop weapon ${id}`);
    assert.ok((WEAPONS[id] as { price?: number }).price! > 0, `Shop weapon ${id} must have a price`);
  }
  assert.equal(isMeleeWeapon('fists'), true);
  assert.equal(isMeleeWeapon('bat'), true);
  assert.equal(isMeleeWeapon('katana'), true);
  assert.equal(isMeleeWeapon('pistol'), false);
  assert.equal(isMeleeWeapon('rpg'), false);
});

test('GTA-6 / Leonida store catalog has >300 unique storefronts across all 8 districts', () => {
  assert.ok(STORE_COUNT >= 320, `Expected >= 320 stores, got ${STORE_COUNT}`);
  assert.equal(STORES.length, STORE_COUNT);
  const names = new Set(STORES.map((s) => s.name));
  assert.equal(names.size, STORE_COUNT, 'Every store name must be unique');
  const districts = new Set(STORES.map((s) => s.district));
  assert.ok(districts.size >= 8, `Expected >= 8 districts, got ${districts.size}`);
  // Spot check lookup helpers
  const idx = getStoreIndexByName(STORES[0].name);
  assert.equal(idx, 0);
  assert.equal(getStoreByIndex(idx).name, STORES[0].name);
});

test('San Nova International Airport terrain is flat, paved, and classified as airport district', () => {
  assert.equal(terrainHeightAt(1500, -260), 0);
  assert.equal(surfaceAt(1500, -260), 'road');
  assert.equal(districtNameAt(1500, -260), 'SAN NOVA INTL AIRPORT');
  assert.equal(sandFactorAt(1500, -260), 0);
});

test('stepFlightPhysics supports runway takeoff, banked turns, stall detection, and safe vs crash landings', () => {
  const jetSpec: AircraftSpec = {
    maxThrust: 44, maxSpeed: 98, takeoffSpeed: 30, stallSpeed: 19,
    liftCoeff: 1.05, dragCoeff: 0.0042, pitchRate: 1.35, rollRate: 2.1, yawRate: 0.9,
    ceilingY: 520, gearHeight: 1.3,
  };
  const s = createFlightState(1300, jetSpec.gearHeight, -260, Math.PI / 2);
  let tookOff = false;
  // Full throttle runway roll + nose rotation
  for (let i = 0; i < 240; i++) {
    const res = stepFlightPhysics(
      s,
      jetSpec,
      { throttleDelta: 1, pitchIn: s.airspeed > 24 ? 0.55 : 0, rollIn: 0, yawIn: 0, brake: false, groundY: 0 },
      0.02,
    );
    if (res.tookOff) tookOff = true;
  }
  assert.equal(tookOff, true, 'Expected jet to take off from runway');
  assert.equal(s.onGround, false);
  assert.ok(s.y > 15, `Expected jet climb altitude > 15m, got ${s.y}`);

  // Banked roll produces smooth yaw turn
  const yawBefore = s.yaw;
  for (let i = 0; i < 60; i++) {
    stepFlightPhysics(s, jetSpec, { throttleDelta: 0, pitchIn: 0.08, rollIn: 0.85, yawIn: 0, brake: false, groundY: 0 }, 0.02);
  }
  assert.ok(Math.abs(s.yaw - yawBefore) > 0.25, 'Expected banked roll to turn aircraft heading');

  // Low airspeed airborne triggers stall warning
  const stallState = createFlightState(0, 80, 0, 0);
  stallState.onGround = false;
  stallState.vx = 0;
  stallState.vy = 0;
  stallState.vz = 8; // below stallSpeed (19)
  stepFlightPhysics(stallState, jetSpec, { throttleDelta: 0, pitchIn: 0, rollIn: 0, yawIn: 0, brake: false, groundY: 0 }, 0.02);
  assert.equal(stallState.stalling, true);

  // High sink-rate nose-down impact triggers crash
  const crashState = createFlightState(0, jetSpec.gearHeight + 0.1, 0, 0);
  crashState.onGround = false;
  crashState.vy = -22;
  crashState.vz = 35;
  crashState.pitch = -0.5;
  const crashRes = stepFlightPhysics(crashState, jetSpec, { throttleDelta: 0, pitchIn: 0, rollIn: 0, yawIn: 0, brake: false, groundY: 0 }, 0.02);
  assert.equal(crashRes.crashed, true);
  assert.ok(crashRes.impactSpeed > 15);
});

test('stepSuspensionPhysics handles acceleration squat, brake dive, and airborne landing compression', () => {
  const s = createSuspensionState(0);
  // Hard acceleration produces negative pitch (squat)
  let accelPitch = 0;
  for (let i = 0; i < 20; i++) {
    accelPitch = stepSuspensionPhysics(s, { groundY: 0, longAccel: 14, latAccel: 0, speed: 15, roughness: 0 }, 0.02).pitch;
  }
  assert.ok(accelPitch < -0.04, `Expected accel squat pitch < -0.04, got ${accelPitch}`);

  // Hard braking produces positive pitch (nose dive)
  let brakePitch = 0;
  for (let i = 0; i < 30; i++) {
    brakePitch = stepSuspensionPhysics(s, { groundY: 0, longAccel: -18, latAccel: 0, speed: 10, roughness: 0 }, 0.02).pitch;
  }
  assert.ok(brakePitch > 0.04, `Expected brake dive pitch > 0.04, got ${brakePitch}`);

  // Airborne drop onto ground compresses suspension and flags landing
  const air = createSuspensionState(4.0);
  air.airborne = true;
  air.airVy = -6.0;
  let landed = false;
  let landingSpeed = 0;
  for (let i = 0; i < 60; i++) {
    const r = stepSuspensionPhysics(air, { groundY: 0, longAccel: 0, latAccel: 0, speed: 20, roughness: 0 }, 0.02);
    if (r.landed) {
      landed = true;
      landingSpeed = r.landingSpeed;
      break;
    }
  }
  assert.equal(landed, true);
  assert.ok(landingSpeed > 6.0);
  assert.ok(air.heaveVel < -1.5, 'Expected downward compression impulse on landing');
});

test('gore/blood ballistics and ragdoll impulse scale with weapon damage, headshots, shotguns, and explosions', () => {
  const pistol = computeBloodBurst(18, false, false, false);
  const headshot = computeBloodBurst(70, true, false, false);
  const shotgun = computeBloodBurst(45, false, false, true);
  const boom = computeBloodBurst(150, false, true, false);

  assert.ok(headshot.dropletCount > pistol.dropletCount);
  assert.ok(shotgun.gibCount >= 3);
  assert.ok(boom.gibCount > shotgun.gibCount);
  assert.ok(boom.puddleTargetRadius > pistol.puddleTargetRadius);

  // Blood puddle expands monotonically and saturates below maxRadius
  const r0 = computePuddleRadius(0, 1.4);
  const r1 = computePuddleRadius(0.4, 1.4);
  const r2 = computePuddleRadius(2.5, 1.4);
  assert.ok(r0 < r1 && r1 < r2 && r2 <= 1.4);

  // Ragdoll impulses scale up for headshots & explosions
  const impBody = computeRagdollImpulse(1, 0, 25, false, false);
  const impHead = computeRagdollImpulse(1, 0, 75, true, false);
  const impBoom = computeRagdollImpulse(1, 0, 150, false, true);
  assert.ok(impHead.headWhip > impBody.headWhip * 3);
  assert.ok(impBoom.vy > impBody.vy * 2);
});

test('AmbientDialogueController triggers randomized overheard subtitles near walking player, respects cooldowns, and yields to vehicles/missions', () => {
  const ctrl = new AmbientDialogueController({ triggerRadius: 12, dismissRadius: 20, perPedCooldown: 20 });
  let seed = 42;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // Far away NPC (> 12m) does not trigger
  let sub = null;
  for (let i = 0; i < 40; i++) {
    sub = ctrl.step({
      playerX: 0, playerY: 0, playerZ: 0, playerMoving: true,
      inVehicle: false, playerAlive: true, playerArmed: false,
      missionSubActive: false, district: 'OCEAN BEACH ART DECO', isNight: false,
      candidates: [{ id: 10, kind: 'tourist', x: 30, y: 0, z: 0, dead: false, panicking: false }],
    }, 0.1, rng);
  }
  assert.equal(sub, null, 'NPC beyond triggerRadius should not trigger subtitle');

  // Walking within 5m of a tourist triggers an ambient subtitle
  for (let i = 0; i < 30 && !sub; i++) {
    sub = ctrl.step({
      playerX: 0, playerY: 0, playerZ: 0, playerMoving: true,
      inVehicle: false, playerAlive: true, playerArmed: false,
      missionSubActive: false, district: 'OCEAN BEACH ART DECO', isNight: false,
      candidates: [{ id: 10, kind: 'tourist', x: 4, y: 0, z: 2, dead: false, panicking: false }],
    }, 0.1, rng);
  }
  assert.ok(sub !== null, 'Nearby NPC should trigger ambient subtitle');
  assert.equal(sub!.pedId, 10);
  assert.equal(sub!.who, speakerLabelFor(10, 'tourist'));
  assert.ok(sub!.text.length > 8);

  // Entering a vehicle immediately suppresses ambient subtitle
  const inCarSub = ctrl.step({
    playerX: 0, playerY: 0, playerZ: 0, playerMoving: true,
    inVehicle: true, playerAlive: true, playerArmed: false,
    missionSubActive: false, district: 'OCEAN BEACH ART DECO', isNight: false,
    candidates: [{ id: 10, kind: 'tourist', x: 4, y: 0, z: 2, dead: false, panicking: false }],
  }, 0.1, rng);
  assert.equal(inCarSub, null);

  // Same ped (10) is on per-ped cooldown, while a different panicking ped (22) can speak once global cooldown elapses
  let secondSub = null;
  for (let i = 0; i < 90 && !secondSub; i++) {
    secondSub = ctrl.step({
      playerX: 0, playerY: 0, playerZ: 0, playerMoving: true,
      inVehicle: false, playerAlive: true, playerArmed: false,
      missionSubActive: false, district: 'LITTLE HAVANA', isNight: true,
      candidates: [
        { id: 10, kind: 'tourist', x: 3, y: 0, z: 0, dead: false, panicking: false },
        { id: 22, kind: 'civ', x: 6, y: 0, z: 1, dead: false, panicking: true },
      ],
    }, 0.1, rng);
  }
  assert.ok(secondSub !== null);
  assert.equal(secondSub!.pedId, 22, 'Should pick eligible ped #22 while ped #10 is on cooldown');
  assert.notEqual(secondSub!.text, sub!.text);

  // Active mission subtitle suppresses ambient chatter immediately
  const duringMission = ctrl.step({
    playerX: 0, playerY: 0, playerZ: 0, playerMoving: true,
    inVehicle: false, playerAlive: true, playerArmed: false,
    missionSubActive: true, district: 'LITTLE HAVANA', isNight: true,
    candidates: [{ id: 22, kind: 'civ', x: 6, y: 0, z: 1, dead: false, panicking: true }],
  }, 0.1, rng);
  assert.equal(duringMission, null);
});

test('animation catalog provides >3,000 unique clips across 12 categories with finite pose evaluation', () => {
  assert.ok(ANIMATION_COUNT >= 3000, `Expected >= 3000 animations, got ${ANIMATION_COUNT}`);
  assert.equal(ANIMATION_CLIPS.length, ANIMATION_COUNT);
  assert.equal(ANIMATION_CATEGORIES.length, 12);

  const uniqueNames = new Set(ANIMATION_CLIPS.map((c) => c.name));
  assert.equal(uniqueNames.size, ANIMATION_COUNT, 'Every animation clip must have a unique name');

  const sample = getAnimationById(1420);
  assert.equal(getAnimationByName(sample.name)?.id, sample.id);

  // Context selection picks appropriate domain categories
  const speakClip = selectContextAnimation({ entitySeed: 7, speed: 0, speaking: true });
  assert.equal(speakClip.category, 'speaking');
  const combatClip = selectContextAnimation({ entitySeed: 3, speed: 0, aim: 1, weaponKind: 'rifle' });
  assert.equal(combatClip.category, 'combat_stance');
  const slideClip = selectContextAnimation({ entitySeed: 1, speed: 7, slide: true });
  assert.equal(slideClip.category, 'parkour_stunts');
  const flightClip = selectContextAnimation({ entitySeed: 2, speed: 40, inAircraft: true });
  assert.equal(flightClip.category, 'vehicle_flight');

  // Player standing idle always stays calm on stand_breathe regardless of idleEpoch
  for (let epoch = 0; epoch < 15; epoch++) {
    const playerIdle = selectContextAnimation({ entitySeed: 7, speed: 0, idleEpoch: epoch, isPlayer: true });
    assert.equal(playerIdle.category, 'urban_idle');
    assert.ok(playerIdle.name.includes('stand_breathe'), `Expected calm stand_breathe idle, got ${playerIdle.name}`);
  }

  // Standing NPC idle never randomly jumps into street_emotes or overhead arm stretching
  for (let epoch = 0; epoch < 25; epoch++) {
    const npcIdle = selectContextAnimation({ entitySeed: 14, speed: 0, idleEpoch: epoch, isPlayer: false });
    assert.equal(npcIdle.category, 'urban_idle');
    assert.ok(!npcIdle.name.includes('stretch_arms'), `NPC idle should not randomly stretch arms: ${npcIdle.name}`);
  }

  const pose = evaluateAnimationPose(speakClip, 1.25, 1.0, 1.0);
  for (const [k, v] of Object.entries(pose)) {
    assert.ok(Number.isFinite(v), `Pose joint ${k} must be finite, got ${v}`);
  }
});

test('NPC site-API voice engine assigns distinct voices, valid URLs, and spatial attenuation', () => {
  const copVoice = selectVoiceProfile(101, 'cop');
  const touristVoice = selectVoiceProfile(202, 'tourist');
  assert.ok(copVoice.voice.length > 0);
  assert.ok(touristVoice.voice.length > 0);

  const url = buildTtsApiUrl(copVoice.voice, 'Hold it right there, San Nova PD!');
  assert.ok(url.startsWith('https://ottsy.weilbyte.dev/api/generation?'));
  assert.ok(url.includes(`voice=${encodeURIComponent(copVoice.voice)}`));
  assert.ok(url.includes('San%20Nova%20PD'));

  const nearVol = computeVoiceVolume(2, 0.8);
  const midVol = computeVoiceVolume(12, 0.8);
  const farVol = computeVoiceVolume(30, 0.8);
  assert.ok(nearVol > midVol && midVol > 0);
  assert.equal(farVol, 0);
});

test('10x gore physics models arterial jet pulses, directional splatter streaks, and time coagulation', () => {
  const headJet = computeArterialJet(80, true, false);
  const lightJet = computeArterialJet(18, false, false);
  assert.ok(headJet.pulses > lightJet.pulses);
  assert.ok(headJet.jetSpeed > lightJet.jetSpeed);

  const fastStreak = computeBloodSplatterStreak(9, -1.5, 4);
  const dropStreak = computeBloodSplatterStreak(0.2, -5, 0.1);
  assert.ok(fastStreak.length > fastStreak.width * 1.5, 'Oblique impact should produce elongated splatter streak');
  assert.ok(fastStreak.length > dropStreak.length);

  const fresh = computeCoagulationColor(0);
  const aging = computeCoagulationColor(8);
  const dried = computeCoagulationColor(30);
  assert.ok(fresh.r > aging.r && aging.r > dried.r, 'Arterial crimson must darken monotonically into coagulated maroon');
});

test('all 9 real binary .glb 3D model files exist in public/models/ with valid glTF 2.0 headers', () => {
  const expected = [
    'car_sports.glb',
    'car_sedan.glb',
    'car_suv.glb',
    'car_police.glb',
    'building_artdeco.glb',
    'building_tower.glb',
    'building_havana.glb',
    'building_wynwood.glb',
    'human_base.glb',
  ];
  const modelsDir = path.resolve(process.cwd(), 'public/models');
  for (const file of expected) {
    const full = path.join(modelsDir, file);
    assert.ok(fs.existsSync(full), `Missing .glb file: ${file}`);
    const buf = fs.readFileSync(full);
    assert.ok(buf.length > 1024, `${file} is unexpectedly small (${buf.length} bytes)`);
    assert.equal(buf.subarray(0, 4).toString('ascii'), 'glTF', `${file} missing glTF magic header`);
    assert.equal(buf.readUInt32LE(4), 2, `${file} must be glTF version 2`);
    assert.equal(buf.readUInt32LE(8), buf.length, `${file} header byteLength must match file size`);
  }
});

test('natural voice mixing & ambience crossfade targets stay balanced and duck cleanly during speech', () => {
  const closeOut = computeNaturalVoiceVolume(1.5, 0.8, false, false);
  const midOut = computeNaturalVoiceVolume(10, 0.8, false, false);
  const farOut = computeNaturalVoiceVolume(24, 0.8, false, false);
  const closeIn = computeNaturalVoiceVolume(1.5, 0.8, true, false);
  assert.ok(closeOut <= 0.46, `Voice must sit at natural conversational level (<=0.46), got ${closeOut}`);
  assert.ok(closeOut > midOut && midOut > 0);
  assert.equal(farOut, 0, 'Voice must taper cleanly to 0 at max range');
  assert.ok(closeIn < closeOut, 'Indoor conversational voice should be slightly softer than outdoor projection');

  // Diner interior ambience: warm room tone + restaurant crowd murmur, zero wind/ocean, ducks during speech
  const dinerQuiet = computeAmbienceTargets({
    indoor: true, indoorKind: 'diner', distToOcean: 500, inDunes: false,
    speedMps: 0, altitudeM: 0, night01: 0, voiceActive: false, inVehicle: false,
  });
  const dinerSpeaking = computeAmbienceTargets({
    indoor: true, indoorKind: 'diner', distToOcean: 500, inDunes: false,
    speedMps: 0, altitudeM: 0, night01: 0, voiceActive: true, inVehicle: false,
  });
  assert.ok(dinerQuiet.crowdMurmur > 0.05 && dinerQuiet.roomTone > 0.03);
  assert.equal(dinerQuiet.ocean, 0);
  assert.equal(dinerQuiet.wind, 0);
  assert.ok(dinerSpeaking.crowdMurmur < dinerQuiet.crowdMurmur, 'Ambience must duck smoothly when an NPC speaks');

  // Beachfront night outdoor ambience: surf + night air, zero indoor room tone
  const beachNight = computeAmbienceTargets({
    indoor: false, indoorKind: null, distToOcean: 15, inDunes: false,
    speedMps: 0, altitudeM: 0, night01: 1, voiceActive: false, inVehicle: false,
  });
  assert.ok(beachNight.ocean > 0.06, 'Ocean surf should fade in near the beach');
  assert.ok(beachNight.night > 0.02, 'Subtropical night air should fade in after dark');
  assert.equal(beachNight.roomTone, 0);
});

test('interiorFloorHeight supports walkable stairs & mezzanine balconies while keeping under-mezzanine on ground floor', () => {
  const layout = {
    baseY: 0.26,
    stairs: [{ x0: 8.4, x1: 11.4, z0: -4.2, z1: 0.6, y0: 0.26, y1: 2.72, axis: 'z' as const, dir: -1 as const }],
    mezzanines: [{ x0: -11.8, x1: 11.8, z0: -8.8, z1: -4.2, y: 2.72 }],
  };

  // Ground floor main hall
  assert.equal(interiorFloorHeight(layout, 0, 3.0, 0.26), 0.26);

  // Mid-staircase climbs smoothly halfway between 0.26 and 2.72
  const midStair = interiorFloorHeight(layout, 9.9, -1.8, 1.4);
  assert.ok(Math.abs(midStair - 1.49) < 0.05, `Expected mid-stair height ~1.49, got ${midStair}`);

  // Top of stairs onto mezzanine deck
  assert.equal(interiorFloorHeight(layout, 2.0, -6.5, 2.6), 2.72);

  // Walking underneath the mezzanine on the ground floor stays at 0.26 (does NOT snap upward!)
  assert.equal(interiorFloorHeight(layout, -4.0, -6.5, 0.26), 0.26);
});

test('computeWaitLineSlots generates properly spaced queued restaurant customers facing the counter', () => {
  const slots = computeWaitLineSlots(-4.6, 2.1, 0.36, 0.93, 5, 1.08);
  assert.equal(slots.length, 5);
  for (let i = 1; i < slots.length; i++) {
    const dist = Math.hypot(slots[i].x - slots[i - 1].x, slots[i].z - slots[i - 1].z);
    assert.ok(dist > 0.85 && dist < 1.35, `Expected realistic queue spacing (~1.08m), got ${dist}`);
  }
  // Every queued customer generally faces back toward the counter (-z / -x)
  for (const s of slots) {
    assert.ok(Math.cos(s.yaw) < -0.5, `Expected customer ${s.index} to face counter, got yaw=${s.yaw}`);
  }
});

