// Tactical Enemy Melee & Gunfight Combat AI (pure logic, unit-tested).
// Adds fighting styles, active guard/blocking, bob-and-weave dodges, telegraphed heavy strikes,
// multi-hit combos, crowd attack-token fairness, and cover/peek/reload gunfight tactics.
import { clampVal } from './terrain';
import { BARE_HAND_MOVES, type BareHandMove } from './subAnimations';

export type MeleeArchetype = 'boxer' | 'slugger' | 'martial';
export type MeleePhase =
  | 'approach'
  | 'circle'
  | 'guard_block'
  | 'dodge_slip'
  | 'windup'
  | 'strike'
  | 'recover';

export interface MeleeCombatState {
  archetype: MeleeArchetype;
  phase: MeleePhase;
  phaseT: number;
  phaseDur: number;
  comboStep: number;
  comboChain: BareHandMove[];
  activeMove: BareHandMove;
  hitApplied: boolean;
  blocking: boolean;
  dodgeDir: number;       // -1 left, +1 right
  strafeDir: number;      // -1 or +1
  strafeT: number;
  counterWindow: number;  // >0 right after blocking an attack -> snappy counter-punch
  stamina: number;        // 0..100
  lastAggroDist: number;
}

export interface MeleeStepInput {
  distToTarget: number;
  playerAttacking: boolean;
  playerPunchProgress: number; // 0..1
  hasAttackToken: boolean;
  dt: number;
  rand?: () => number;
}

export interface MeleeStepOutput {
  moveForward: number;     // -1..+1
  moveStrafe: number;      // -1..+1
  moveSpeed: number;       // m/s
  blocking: boolean;
  dodging: boolean;
  dodgeDir: number;
  windupGlow: number;      // 0..1 telegraph intensity for heavy swings
  punchProgress: number;   // 0..1 for animation
  punchMove: BareHandMove;
  deliverHit: boolean;
  hitDamage: number;
  hitKnockback: number;
}

const ARCHETYPE_COMBOS: Record<MeleeArchetype, BareHandMove[][]> = {
  boxer: [
    ['jab_left', 'cross_right', 'hook_left'],
    ['jab_left', 'jab_left', 'hook_right'],
    ['hook_left', 'uppercut_right'],
  ],
  slugger: [
    ['hook_left', 'haymaker_left'],
    ['cross_right', 'uppercut_right'],
    ['haymaker_left'],
  ],
  martial: [
    ['jab_left', 'hook_right', 'uppercut_right'],
    ['cross_right', 'hook_left', 'cross_right'],
    ['jab_left', 'uppercut_right'],
  ],
};

export function createMeleeCombatState(seed: number): MeleeCombatState {
  const archetypes: MeleeArchetype[] = ['boxer', 'slugger', 'martial'];
  const archetype = archetypes[Math.abs(seed) % archetypes.length];
  return {
    archetype,
    phase: 'approach',
    phaseT: 0,
    phaseDur: 0.4,
    comboStep: 0,
    comboChain: ARCHETYPE_COMBOS[archetype][0],
    activeMove: 'jab_left',
    hitApplied: false,
    blocking: false,
    dodgeDir: 1,
    strafeDir: seed % 2 === 0 ? 1 : -1,
    strafeT: 0.9,
    counterWindow: 0,
    stamina: 100,
    lastAggroDist: 10,
  };
}

/** Evaluates incoming damage against an active melee blocker; returns reduced damage & triggers counter window. */
export function resolveIncomingMeleeHit(
  s: MeleeCombatState,
  rawDamage: number,
): { appliedDamage: number; blocked: boolean } {
  if (s.blocking && s.phase === 'guard_block') {
    s.counterWindow = 0.75;
    s.stamina = Math.max(0, s.stamina - 14);
    return { appliedDamage: Math.max(2, Math.round(rawDamage * 0.35)), blocked: true };
  }
  if (s.phase === 'dodge_slip' && s.phaseT < s.phaseDur * 0.72) {
    // Clean bob-and-weave slip evades the punch!
    s.counterWindow = 0.85;
    return { appliedDamage: 0, blocked: true };
  }
  return { appliedDamage: rawDamage, blocked: false };
}

/** Steps realistic melee fighter footwork, blocking, dodging, telegraphed windups & combos. */
export function stepMeleeCombat(
  s: MeleeCombatState,
  inp: MeleeStepInput,
): MeleeStepOutput {
  const rand = inp.rand ?? Math.random;
  const dt = Math.min(inp.dt, 0.05);
  s.phaseT += dt;
  s.counterWindow = Math.max(0, s.counterWindow - dt);
  s.stamina = clampVal(s.stamina + (s.phase === 'circle' || s.phase === 'recover' ? 16 : 6) * dt, 0, 100);
  s.strafeT -= dt;
  if (s.strafeT <= 0) {
    s.strafeDir = rand() < 0.5 ? -1 : 1;
    s.strafeT = 0.75 + rand() * 0.85;
  }

  let moveForward = 0;
  let moveStrafe = 0;
  let moveSpeed = 0;
  let windupGlow = 0;
  let punchProgress = 0;
  let deliverHit = false;
  let hitDamage = 0;
  let hitKnockback = 0;

  // Reactive defense: if player swings at close range while we aren't mid-strike, block or slip!
  const incomingThreat =
    inp.playerAttacking &&
    inp.playerPunchProgress > 0.08 &&
    inp.playerPunchProgress < 0.5 &&
    inp.distToTarget < 2.65 &&
    (s.phase === 'circle' || s.phase === 'approach' || s.phase === 'recover');

  if (incomingThreat && s.stamina >= 15) {
    const reactRoll = rand();
    const dodgeChance = s.archetype === 'martial' ? 0.45 : s.archetype === 'boxer' ? 0.35 : 0.18;
    const blockChance = s.archetype === 'boxer' ? 0.5 : s.archetype === 'slugger' ? 0.42 : 0.35;
    if (reactRoll < dodgeChance) {
      s.phase = 'dodge_slip';
      s.phaseT = 0;
      s.phaseDur = 0.36;
      s.dodgeDir = rand() < 0.5 ? -1 : 1;
      s.blocking = false;
      s.stamina -= 12;
    } else if (reactRoll < dodgeChance + blockChance) {
      s.phase = 'guard_block';
      s.phaseT = 0;
      s.phaseDur = 0.48;
      s.blocking = true;
    }
  }

  switch (s.phase) {
    case 'guard_block': {
      s.blocking = true;
      moveForward = inp.distToTarget < 1.1 ? -0.5 : 0;
      moveSpeed = 1.1;
      if (s.phaseT >= s.phaseDur) {
        s.blocking = false;
        if (s.counterWindow > 0 && inp.distToTarget < 2.35 && inp.hasAttackToken) {
          // Crisp counter-punch straight out of guard
          const counterMove: BareHandMove = s.archetype === 'slugger' ? 'uppercut_right' : 'cross_right';
          s.comboChain = [counterMove];
          s.comboStep = 0;
          s.activeMove = counterMove;
          s.phase = 'windup';
          s.phaseT = 0;
          s.phaseDur = 0.14;
          s.hitApplied = false;
        } else {
          s.phase = 'circle';
          s.phaseT = 0;
          s.phaseDur = 0.45;
        }
      }
      break;
    }
    case 'dodge_slip': {
      s.blocking = false;
      moveStrafe = s.dodgeDir;
      moveForward = -0.25;
      moveSpeed = 3.8;
      if (s.phaseT >= s.phaseDur) {
        if (inp.distToTarget < 2.4 && inp.hasAttackToken) {
          const move: BareHandMove = s.archetype === 'martial' ? 'hook_right' : 'hook_left';
          s.comboChain = [move, 'cross_right'];
          s.comboStep = 0;
          s.activeMove = move;
          s.phase = 'windup';
          s.phaseT = 0;
          s.phaseDur = 0.16;
          s.hitApplied = false;
        } else {
          s.phase = 'circle';
          s.phaseT = 0;
          s.phaseDur = 0.4;
        }
      }
      break;
    }
    case 'windup': {
      s.blocking = false;
      const isHeavy = s.activeMove === 'haymaker_left' || s.activeMove === 'uppercut_right';
      windupGlow = isHeavy ? clampVal(s.phaseT / Math.max(0.1, s.phaseDur), 0, 1) : 0.35;
      // Step forward into the strike
      moveForward = inp.distToTarget > 1.35 ? 0.55 : 0.1;
      moveSpeed = 1.8;
      // Show subtle coiled windup in animation (0..0.24)
      punchProgress = clampVal((s.phaseT / Math.max(0.1, s.phaseDur)) * 0.24, 0.02, 0.24);
      if (s.phaseT >= s.phaseDur) {
        s.phase = 'strike';
        s.phaseT = 0;
        s.phaseDur = BARE_HAND_MOVES[s.activeMove].duration * 0.92;
        s.hitApplied = false;
      }
      break;
    }
    case 'strike': {
      s.blocking = false;
      const spec = BARE_HAND_MOVES[s.activeMove];
      const frac = clampVal(s.phaseT / Math.max(0.12, s.phaseDur), 0, 1);
      punchProgress = 0.24 + frac * 0.76;
      moveForward = frac < 0.35 && inp.distToTarget > 1.2 ? 0.45 : 0;
      moveSpeed = 1.5;

      if (!s.hitApplied && frac >= 0.26 && frac <= 0.56) {
        s.hitApplied = true;
        if (inp.distToTarget <= spec.reach + 0.22) {
          deliverHit = true;
          hitDamage = Math.round(spec.damage * (s.archetype === 'slugger' ? 0.52 : 0.42));
          hitKnockback = spec.knockback * 0.82;
        }
      }

      if (s.phaseT >= s.phaseDur) {
        s.comboStep++;
        if (s.comboStep < s.comboChain.length && inp.distToTarget < 2.55 && s.stamina >= 18) {
          s.activeMove = s.comboChain[s.comboStep];
          s.stamina -= 12;
          s.phase = 'windup';
          s.phaseT = 0;
          s.phaseDur = s.activeMove === 'haymaker_left' || s.activeMove === 'uppercut_right' ? 0.32 : 0.15;
          s.hitApplied = false;
        } else {
          s.phase = 'recover';
          s.phaseT = 0;
          s.phaseDur = 0.42 + rand() * 0.38;
        }
      }
      break;
    }
    case 'recover': {
      s.blocking = false;
      // Step back slightly to reset spacing like a real fighter
      moveForward = inp.distToTarget < 1.8 ? -0.65 : 0;
      moveStrafe = s.strafeDir * 0.55;
      moveSpeed = 1.75;
      if (s.phaseT >= s.phaseDur) {
        s.phase = inp.distToTarget > 2.3 ? 'approach' : 'circle';
        s.phaseT = 0;
        s.phaseDur = 0.55 + rand() * 0.5;
      }
      break;
    }
    case 'approach': {
      s.blocking = false;
      if (inp.distToTarget <= 2.15) {
        s.phase = 'circle';
        s.phaseT = 0;
        s.phaseDur = 0.3 + rand() * 0.35;
      } else {
        moveForward = 1;
        moveStrafe = s.strafeDir * 0.22;
        moveSpeed = inp.distToTarget > 4.8 ? 4.4 : 3.0;
      }
      break;
    }
    case 'circle':
    default: {
      s.blocking = false;
      if (inp.distToTarget > 2.6) {
        s.phase = 'approach';
        s.phaseT = 0;
        break;
      }
      moveStrafe = s.strafeDir;
      moveForward = inp.distToTarget < 1.35 ? -0.55 : inp.distToTarget > 2.15 ? 0.45 : 0;
      moveSpeed = 1.85;

      // Launch a combo when we have an attack token and enough stamina
      if (s.phaseT >= s.phaseDur && inp.hasAttackToken && s.stamina >= 20) {
        const list = ARCHETYPE_COMBOS[s.archetype];
        s.comboChain = list[Math.floor(rand() * list.length) % list.length];
        s.comboStep = 0;
        s.activeMove = s.comboChain[0];
        const isHeavy = s.activeMove === 'haymaker_left' || s.activeMove === 'uppercut_right';
        s.phase = 'windup';
        s.phaseT = 0;
        s.phaseDur = isHeavy ? 0.34 : 0.16;
        s.hitApplied = false;
        s.stamina -= 14;
      }
      break;
    }
  }

  return {
    moveForward,
    moveStrafe,
    moveSpeed,
    blocking: s.blocking,
    dodging: s.phase === 'dodge_slip',
    dodgeDir: s.dodgeDir,
    windupGlow,
    punchProgress,
    punchMove: s.activeMove,
    deliverHit,
    hitDamage,
    hitKnockback,
  };
}

// ========================================================================= TACTICAL GUNFIGHT AI
export type GunfightPhase = 'advance' | 'peek_aim' | 'burst_fire' | 'cover_crouch' | 'flank' | 'reload';

export interface GunfightState {
  phase: GunfightPhase;
  phaseT: number;
  phaseDur: number;
  ammoInMag: number;
  magSize: number;
  burstLeft: number;
  shotIntervalT: number;
  flankDir: number;
  hasCoverNearby: boolean;
}

export interface GunfightStepInput {
  distToTarget: number;
  hasLos: boolean;
  coverAvailable: boolean;
  underFire: boolean;
  dt: number;
  rand?: () => number;
}

export interface GunfightStepOutput {
  crouching: boolean;
  aiming: boolean;
  reloading: boolean;
  shootNow: boolean;
  moveForward: number;
  moveStrafe: number;
  moveSpeed: number;
  telegraphAim: number; // 0..1 visible aim telegraph before burst
}

export function createGunfightState(magSize = 12, seed = 1): GunfightState {
  return {
    phase: 'advance',
    phaseT: 0,
    phaseDur: 0.6,
    ammoInMag: magSize,
    magSize,
    burstLeft: 0,
    shotIntervalT: 0,
    flankDir: seed % 2 === 0 ? 1 : -1,
    hasCoverNearby: false,
  };
}

export function stepGunfightAI(
  s: GunfightState,
  inp: GunfightStepInput,
): GunfightStepOutput {
  const rand = inp.rand ?? Math.random;
  const dt = Math.min(inp.dt, 0.05);
  s.phaseT += dt;
  s.shotIntervalT = Math.max(0, s.shotIntervalT - dt);
  s.hasCoverNearby = inp.coverAvailable;

  let crouching = false;
  let aiming = true;
  let reloading = false;
  let shootNow = false;
  let moveForward = 0;
  let moveStrafe = 0;
  let moveSpeed = 0;
  let telegraphAim = 0;

  if (s.ammoInMag <= 0 && s.phase !== 'reload') {
    s.phase = 'reload';
    s.phaseT = 0;
    s.phaseDur = 1.65;
  }

  switch (s.phase) {
    case 'reload': {
      crouching = true;
      aiming = false;
      reloading = true;
      moveStrafe = s.flankDir * 0.5;
      moveForward = -0.35;
      moveSpeed = 1.6;
      if (s.phaseT >= s.phaseDur) {
        s.ammoInMag = s.magSize;
        s.phase = inp.hasLos ? 'peek_aim' : 'advance';
        s.phaseT = 0;
        s.phaseDur = 0.42;
      }
      break;
    }
    case 'cover_crouch': {
      crouching = true;
      aiming = false;
      moveForward = 0;
      moveStrafe = 0;
      moveSpeed = 0;
      if (s.phaseT >= s.phaseDur) {
        s.phase = inp.hasLos ? 'peek_aim' : 'flank';
        s.phaseT = 0;
        s.phaseDur = inp.hasLos ? 0.38 : 1.1;
      }
      break;
    }
    case 'peek_aim': {
      crouching = false;
      aiming = true;
      telegraphAim = clampVal(s.phaseT / Math.max(0.15, s.phaseDur), 0, 1);
      moveStrafe = s.flankDir * 0.35;
      moveSpeed = 1.1;
      if (!inp.hasLos) {
        s.phase = 'advance';
        s.phaseT = 0;
      } else if (s.phaseT >= s.phaseDur) {
        s.phase = 'burst_fire';
        s.phaseT = 0;
        s.phaseDur = 1.1;
        s.burstLeft = Math.min(s.ammoInMag, 2 + Math.floor(rand() * 3));
        s.shotIntervalT = 0;
      }
      break;
    }
    case 'burst_fire': {
      crouching = inp.distToTarget > 18;
      aiming = true;
      telegraphAim = 1;
      moveStrafe = s.flankDir * 0.45;
      moveSpeed = 1.3;
      if (inp.hasLos && s.burstLeft > 0 && s.shotIntervalT <= 0 && s.ammoInMag > 0) {
        shootNow = true;
        s.burstLeft--;
        s.ammoInMag--;
        s.shotIntervalT = 0.24 + rand() * 0.14;
      }
      if (s.burstLeft <= 0 || !inp.hasLos || s.phaseT >= s.phaseDur) {
        if (s.ammoInMag <= 0) {
          s.phase = 'reload';
          s.phaseT = 0;
          s.phaseDur = 1.65;
        } else if (inp.coverAvailable || inp.underFire) {
          s.phase = 'cover_crouch';
          s.phaseT = 0;
          s.phaseDur = 0.8 + rand() * 0.7;
        } else {
          s.phase = 'flank';
          s.phaseT = 0;
          s.phaseDur = 1.0 + rand() * 0.9;
          s.flankDir = rand() < 0.5 ? -1 : 1;
        }
      }
      break;
    }
    case 'flank': {
      aiming = true;
      moveStrafe = s.flankDir;
      moveForward = inp.distToTarget > 20 ? 0.55 : inp.distToTarget < 8 ? -0.55 : 0.15;
      moveSpeed = 3.2;
      if (s.phaseT >= s.phaseDur) {
        s.phase = inp.hasLos ? 'peek_aim' : 'advance';
        s.phaseT = 0;
        s.phaseDur = 0.36;
      }
      break;
    }
    case 'advance':
    default: {
      aiming = inp.distToTarget < 24;
      moveForward = 1;
      moveStrafe = s.flankDir * 0.25;
      moveSpeed = inp.distToTarget > 22 ? 5.1 : 3.6;
      if (inp.hasLos && inp.distToTarget < 24) {
        s.phase = 'peek_aim';
        s.phaseT = 0;
        s.phaseDur = 0.36;
      }
      break;
    }
  }

  return {
    crouching,
    aiming,
    reloading,
    shootNow,
    moveForward,
    moveStrafe,
    moveSpeed,
    telegraphAim,
  };
}
