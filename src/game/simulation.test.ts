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
  assert.equal(districtNameAt(0, 0), 'DOWNTOWN SAN NOVA');

  // Main Beachfront dry & wet sand
  assert.equal(surfaceAt(-100, 560), 'sand');
  assert.ok(sandFactorAt(-100, 560) > 0.6);
  assert.equal(surfaceAt(-100, 602), 'wet_sand');
  assert.equal(sandFactorAt(-100, 602), 0.4);
  assert.equal(districtNameAt(-100, 560), 'SAN NOVA BEACHFRONT');

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
