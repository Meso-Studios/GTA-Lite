/**
 * Non-AI Deep NPC Life Simulation & Social Graph Engine
 * Pure deterministic/stochastic algorithmic reasoning — zero external AI/LLM calls.
 *
 * Gives every citizen a persistent identity, relationships (partners, best friends,
 * coworkers, rivals, siblings, neighbors), multi-agent cooperative plans (synced
 * meetups, walking together, waiting for a friend), unrelated everyday life situations
 * (dropped keys, running late, phone calls, rival arguments, street browsing), and
 * causal witness reasoning (brave vs cautious vs filming influencer).
 */

export type RelationshipKind =
  | 'partner'
  | 'best_friend'
  | 'coworker'
  | 'rival'
  | 'sibling'
  | 'neighbor';

export type PersonalityTrait =
  | 'brave'
  | 'cautious'
  | 'social'
  | 'ambitious'
  | 'clout_chaser'
  | 'hot_headed'
  | 'empathetic'
  | 'punctual';

export type LifeSituationKind =
  | 'none'
  | 'dropped_item'
  | 'running_late'
  | 'phone_call'
  | 'rival_argument'
  | 'good_news'
  | 'window_browse'
  | 'waiting_for_friend'
  | 'walking_together'
  | 'sharing_coffee'
  | 'celebrating';

export type WitnessDecision = 'flee' | 'call_911' | 'film_video' | 'confront' | 'help_victim';

export interface SocialLink {
  targetId: number;
  kind: RelationshipKind;
  affinity: number; // -1..1
}

export interface SharedPlan {
  id: number;
  kind: 'meetup_coffee' | 'walk_together' | 'lunch_errand' | 'bank_run' | 'beach_hangout' | 'rival_confront';
  memberIds: number[];
  meetingX: number;
  meetingZ: number;
  venueName: string;
  stage: 'heading' | 'waiting' | 'together' | 'done';
  timer: number;
  maxDuration: number;
}

export interface CitizenProfile {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  occupation: string;
  homeDistrict: string;
  workDistrict: string;
  traits: [PersonalityTrait, PersonalityTrait];
  energy: number; // 0..100
  hunger: number; // 0..100
  socialNeed: number; // 0..100
  stress: number; // 0..100
  mood: 'happy' | 'focused' | 'stressed' | 'annoyed' | 'excited';
  links: SocialLink[];
  activePlanId: number | null;
  situation: LifeSituationKind;
  situationTimer: number;
  situationLine: string;
  partnerOrTargetId: number | null;
  memoryFlags: string[];
  lastPlanCooldown: number;
}

const FIRST_NAMES = [
  'Mateo', 'Elena', 'Marcus', 'Sofia', 'Devon', 'Camila', 'Julian', 'Nadia',
  'Trevor', 'Maya', 'Carlos', 'Aaliyah', 'Liam', 'Valeria', 'Dante', 'Chloe',
  'Rafael', 'Zoe', 'Isaiah', 'Gabriela', 'Noah', 'Sienna', 'Victor', 'Tessa',
  'Andre', 'Lucia', 'Omar', 'Hana', 'Miles', 'Bianca', 'Gabe', 'Kira',
];

const LAST_NAMES = [
  'Vega', 'Morales', 'Brooks', 'Castillo', 'Chen', 'Reyes', 'Okafor', 'Delgado',
  'Mercer', 'Patel', 'Santana', 'Kowalski', 'Ramirez', 'Kim', 'Holloway', 'Silva',
  'Alvarez', 'Bennett', 'Cruz', 'Foster', 'Navarro', 'Park', 'Gomez', 'Vance',
];

const OCCUPATIONS = [
  'Barista', 'Paramedic', 'Architect', 'Sound Engineer', 'Pastry Chef', 'Bank Teller',
  'Tattoo Artist', 'Bike Courier', 'Structural Inspector', 'Music Producer', 'Nurse',
  'Real Estate Agent', 'Auto Mechanic', 'Marine Biologist', 'Graphic Designer',
  'Sous Chef', 'Bartender', 'Podcast Host', 'Personal Trainer', 'Civil Attorney',
];

const DISTRICTS = ['DOWNTOWN', 'OCEAN BEACH', 'WYNWOOD', 'LITTLE HAVANA', 'MIDTOWN', 'SUNSET SUBURBS'];

const ALL_TRAITS: PersonalityTrait[] = [
  'brave', 'cautious', 'social', 'ambitious', 'clout_chaser', 'hot_headed', 'empathetic', 'punctual',
];

const MEETUP_VENUES: Array<{ name: string; x: number; z: number; kind: SharedPlan['kind'] }> = [
  { name: 'Cortado Corner Cafe', x: 88, z: -64, kind: 'meetup_coffee' },
  { name: 'Vice Diner', x: -120, z: 95, kind: 'lunch_errand' },
  { name: 'Ocean Boardwalk Plaza', x: 320, z: 140, kind: 'beach_hangout' },
  { name: 'Downtown NovaBank Plaza', x: -45, z: -135, kind: 'bank_run' },
  { name: 'Wynwood Mural Courtyard', x: -240, z: -180, kind: 'walk_together' },
  { name: 'Midtown Fountain Square', x: 165, z: -190, kind: 'meetup_coffee' },
];

const PHONE_CALL_LINES = [
  "Yeah I'm literally turning the corner right now, hold the table!",
  "No way he actually quit mid-shift—wait, tell me everything.",
  "Did you check if the landlord fixed the AC? I'm not paying extra.",
  "Okay grab oat milk and empanadas, I'll Venmo you.",
  "I told you the downtown bridge was backed up today!",
  "Wait—say that again? We got approved for the apartment?!",
];

const RUNNING_LATE_LINES = [
  "Shoot, I'm ten minutes late already!",
  "My alarm did NOT go off—gotta move!",
  "If the boss sees me walk in late again I'm toast.",
  "Come on, come on, I'm gonna miss the meeting!",
];

const DROPPED_ITEM_LINES = [
  "Whoa—my keys! Glad they didn't go down the storm drain.",
  "Ugh, butterfingers—almost cracked my screen.",
  "Hold up, dropped my transit pass.",
  "My receipt blew away, one second...",
];

const GOOD_NEWS_LINES = [
  "YES! Finally got the promotion!",
  "No way, tickets confirmed for tonight!",
  "Best news all week—let's celebrate!",
];

const RIVAL_LINES = [
  "You STILL owe me two hundred bucks from last month!",
  "Don't act like you didn't see me—we need to talk.",
  "Seriously? You parked in my spot again?!",
  "Keep my name out of your group chat, alright?",
];

const WINDOW_BROWSE_LINES = [
  "Honestly that jacket is clean... way out of my budget though.",
  "Ooh, they finally put out the new pastries.",
  "Wait, that's actually a pretty solid deal.",
];

export interface NpcLifeWorld {
  profiles: Map<number, CitizenProfile>;
  plans: Map<number, SharedPlan>;
  nextPlanId: number;
  seed: number;
}

function seededRand(world: NpcLifeWorld): number {
  world.seed = (world.seed * 1664525 + 1013904223) >>> 0;
  return (world.seed & 0xffffff) / 0x1000000;
}

export function createNpcLifeWorld(seed = 202607): NpcLifeWorld {
  return {
    profiles: new Map(),
    plans: new Map(),
    nextPlanId: 1,
    seed: seed >>> 0,
  };
}

export function registerCitizen(world: NpcLifeWorld, id: number): CitizenProfile {
  const existing = world.profiles.get(id);
  if (existing) return existing;

  const r1 = seededRand(world);
  const r2 = seededRand(world);
  const firstName = FIRST_NAMES[Math.floor(r1 * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(r2 * LAST_NAMES.length)];
  const occupation = OCCUPATIONS[Math.floor(seededRand(world) * OCCUPATIONS.length)];
  const homeDistrict = DISTRICTS[Math.floor(seededRand(world) * DISTRICTS.length)];
  const workDistrict = DISTRICTS[Math.floor(seededRand(world) * DISTRICTS.length)];

  const tIdx1 = Math.floor(seededRand(world) * ALL_TRAITS.length);
  let tIdx2 = Math.floor(seededRand(world) * ALL_TRAITS.length);
  if (tIdx2 === tIdx1) tIdx2 = (tIdx1 + 1) % ALL_TRAITS.length;

  const profile: CitizenProfile = {
    id,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    occupation,
    homeDistrict,
    workDistrict,
    traits: [ALL_TRAITS[tIdx1], ALL_TRAITS[tIdx2]],
    energy: 55 + seededRand(world) * 40,
    hunger: 15 + seededRand(world) * 45,
    socialNeed: 30 + seededRand(world) * 55,
    stress: 10 + seededRand(world) * 35,
    mood: 'happy',
    links: [],
    activePlanId: null,
    situation: 'none',
    situationTimer: 0,
    situationLine: '',
    partnerOrTargetId: null,
    memoryFlags: [],
    lastPlanCooldown: 4 + seededRand(world) * 14,
  };

  // Wire persistent social links with already-registered citizens
  const allIds = Array.from(world.profiles.keys());
  if (allIds.length > 0) {
    const linkCount = Math.min(allIds.length, 1 + Math.floor(seededRand(world) * 3));
    const used = new Set<number>();
    for (let i = 0; i < linkCount; i++) {
      const otherId = allIds[Math.floor(seededRand(world) * allIds.length)];
      if (used.has(otherId)) continue;
      used.add(otherId);
      const other = world.profiles.get(otherId)!;
      const roll = seededRand(world);
      const kind: RelationshipKind =
        roll < 0.14 ? 'partner' :
        roll < 0.36 ? 'best_friend' :
        roll < 0.58 ? 'coworker' :
        roll < 0.74 ? 'neighbor' :
        roll < 0.86 ? 'sibling' : 'rival';
      const affinity = kind === 'rival' ? -0.7 : kind === 'partner' ? 0.92 : 0.65;
      profile.links.push({ targetId: otherId, kind, affinity });
      other.links.push({ targetId: id, kind, affinity });
    }
  }

  world.profiles.set(id, profile);
  return profile;
}

export function unregisterCitizen(world: NpcLifeWorld, id: number): void {
  const prof = world.profiles.get(id);
  if (!prof) return;
  if (prof.activePlanId !== null) {
    const plan = world.plans.get(prof.activePlanId);
    if (plan) {
      plan.memberIds = plan.memberIds.filter((m) => m !== id);
      if (plan.memberIds.length < 2) {
        for (const rem of plan.memberIds) {
          const rp = world.profiles.get(rem);
          if (rp && rp.activePlanId === plan.id) {
            rp.activePlanId = null;
            rp.situation = 'none';
          }
        }
        world.plans.delete(plan.id);
      }
    }
  }
  world.profiles.delete(id);
}

/**
 * Forms a cooperative multi-agent plan between two linked citizens who are both free
 * and within reasonable proximity so they actually meet up, wait for each other, or walk together.
 */
export function tryCreateSharedPlan(
  world: NpcLifeWorld,
  initiatorId: number,
  positions: Map<number, { x: number; z: number }>,
  maxRadius = 110
): SharedPlan | null {
  const a = world.profiles.get(initiatorId);
  if (!a || a.activePlanId !== null || a.lastPlanCooldown > 0) return null;
  const posA = positions.get(initiatorId);
  if (!posA) return null;

  for (const link of a.links) {
    const b = world.profiles.get(link.targetId);
    if (!b || b.activePlanId !== null) continue;
    const posB = positions.get(b.id);
    if (!posB) continue;
    const d = Math.hypot(posA.x - posB.x, posA.z - posB.z);
    if (d > maxRadius) continue;

    // Pick a meeting spot between them or a nearby venue
    let meetingX = (posA.x + posB.x) * 0.5;
    let meetingZ = (posA.z + posB.z) * 0.5;
    let venueName = 'the corner plaza';
    let kind: SharedPlan['kind'] = link.kind === 'rival' ? 'rival_confront' : 'walk_together';

    if (link.kind !== 'rival') {
      let bestDist = 90;
      for (const v of MEETUP_VENUES) {
        const dv = Math.hypot(v.x - meetingX, v.z - meetingZ);
        if (dv < bestDist) {
          bestDist = dv;
          meetingX = v.x;
          meetingZ = v.z;
          venueName = v.name;
          kind = v.kind;
        }
      }
    }

    const plan: SharedPlan = {
      id: world.nextPlanId++,
      kind,
      memberIds: [a.id, b.id],
      meetingX,
      meetingZ,
      venueName,
      stage: 'heading',
      timer: 0,
      maxDuration: kind === 'rival_confront' ? 14 : 26,
    };

    world.plans.set(plan.id, plan);
    a.activePlanId = plan.id;
    b.activePlanId = plan.id;
    a.partnerOrTargetId = b.id;
    b.partnerOrTargetId = a.id;
    a.lastPlanCooldown = 28;
    b.lastPlanCooldown = 28;

    if (kind === 'rival_confront') {
      a.situation = 'rival_argument';
      b.situation = 'rival_argument';
      a.situationLine = RIVAL_LINES[Math.floor(seededRand(world) * RIVAL_LINES.length)];
      b.situationLine = `Back off, ${a.firstName}! I don't have time for this.`;
    } else {
      a.situation = 'waiting_for_friend';
      b.situation = 'waiting_for_friend';
      a.situationLine = `Hey ${b.firstName}! Meet me over by ${venueName}?`;
      b.situationLine = `On my way, ${a.firstName}! Save me a spot!`;
    }
    return plan;
  }

  return null;
}

/**
 * Triggers an independent, unrelated life situation for a solo citizen so the world
 * feels genuinely alive even when the player isn't interacting with them.
 */
export function triggerUnrelatedLifeSituation(world: NpcLifeWorld, id: number): LifeSituationKind {
  const p = world.profiles.get(id);
  if (!p || p.activePlanId !== null || p.situation !== 'none') return 'none';

  const r = seededRand(world);
  if (r < 0.28) {
    p.situation = 'phone_call';
    p.situationTimer = 6 + seededRand(world) * 6;
    p.situationLine = PHONE_CALL_LINES[Math.floor(seededRand(world) * PHONE_CALL_LINES.length)];
  } else if (r < 0.48) {
    p.situation = 'running_late';
    p.situationTimer = 5 + seededRand(world) * 5;
    p.situationLine = RUNNING_LATE_LINES[Math.floor(seededRand(world) * RUNNING_LATE_LINES.length)];
    p.stress = Math.min(100, p.stress + 18);
  } else if (r < 0.66) {
    p.situation = 'dropped_item';
    p.situationTimer = 3.2 + seededRand(world) * 1.8;
    p.situationLine = DROPPED_ITEM_LINES[Math.floor(seededRand(world) * DROPPED_ITEM_LINES.length)];
  } else if (r < 0.84) {
    p.situation = 'window_browse';
    p.situationTimer = 4.5 + seededRand(world) * 4;
    p.situationLine = WINDOW_BROWSE_LINES[Math.floor(seededRand(world) * WINDOW_BROWSE_LINES.length)];
  } else {
    p.situation = 'good_news';
    p.situationTimer = 4 + seededRand(world) * 3;
    p.situationLine = GOOD_NEWS_LINES[Math.floor(seededRand(world) * GOOD_NEWS_LINES.length)];
    p.mood = 'excited';
  }
  return p.situation;
}

/**
 * Advances all citizen needs, cooperative plans, and life situations.
 */
export function stepNpcLifeWorld(
  world: NpcLifeWorld,
  dt: number,
  positions: Map<number, { x: number; z: number }>
): void {
  const safeDt = Math.min(0.25, Math.max(0, dt));

  // Update active cooperative plans
  for (const [planId, plan] of world.plans) {
    plan.timer += safeDt;
    if (plan.timer >= plan.maxDuration || plan.memberIds.length < 2) {
      for (const mid of plan.memberIds) {
        const mp = world.profiles.get(mid);
        if (mp) {
          mp.activePlanId = null;
          mp.situation = 'none';
          mp.situationTimer = 0;
          mp.socialNeed = Math.max(5, mp.socialNeed - 32);
        }
      }
      world.plans.delete(planId);
      continue;
    }

    const p0 = positions.get(plan.memberIds[0]);
    const p1 = positions.get(plan.memberIds[1]);
    if (!p0 || !p1) continue;

    const d0 = Math.hypot(p0.x - plan.meetingX, p0.z - plan.meetingZ);
    const d1 = Math.hypot(p1.x - plan.meetingX, p1.z - plan.meetingZ);
    const pairDist = Math.hypot(p0.x - p1.x, p0.z - p1.z);

    if (plan.stage === 'heading' && (d0 < 3.5 || d1 < 3.5) && pairDist > 4.2) {
      plan.stage = 'waiting';
    }
    if ((plan.stage === 'heading' || plan.stage === 'waiting') && pairDist <= 4.2) {
      plan.stage = 'together';
      const a = world.profiles.get(plan.memberIds[0]);
      const b = world.profiles.get(plan.memberIds[1]);
      if (a && b) {
        if (plan.kind === 'rival_confront') {
          a.situation = 'rival_argument';
          b.situation = 'rival_argument';
        } else if (plan.kind === 'walk_together' || plan.kind === 'beach_hangout') {
          a.situation = 'walking_together';
          b.situation = 'walking_together';
        } else {
          a.situation = 'sharing_coffee';
          b.situation = 'sharing_coffee';
        }
      }
    }
  }

  // Update individual profiles
  for (const p of world.profiles.values()) {
    p.hunger = Math.min(100, p.hunger + safeDt * 0.25);
    p.energy = Math.max(5, p.energy - safeDt * 0.14);
    p.socialNeed = Math.min(100, p.socialNeed + safeDt * 0.35);
    p.lastPlanCooldown = Math.max(0, p.lastPlanCooldown - safeDt);

    if (p.stress > 68) p.mood = 'stressed';
    else if (p.hunger > 78) p.mood = 'annoyed';
    else if (p.energy > 65 && p.stress < 35) p.mood = 'happy';
    else p.mood = 'focused';

    if (p.activePlanId === null && p.situation !== 'none') {
      p.situationTimer -= safeDt;
      if (p.situationTimer <= 0) {
        p.situation = 'none';
        p.situationTimer = 0;
      }
    }
  }
}

/**
 * Causal witness reasoning: decides how a specific citizen reacts to a nearby crime
 * or threat based on their personality traits, relationship to the victim, and threat severity.
 */
export function evaluateWitnessReasoning(
  profile: CitizenProfile,
  crimeSeverity: 'assault' | 'gunfire' | 'carjack' | 'robbery',
  victimId: number | null,
  playerArmed: boolean
): { decision: WitnessDecision; line: string } {
  const isLovedOne =
    victimId !== null &&
    profile.links.some((l) => l.targetId === victimId && (l.kind === 'partner' || l.kind === 'sibling' || l.kind === 'best_friend'));
  const hasTrait = (t: PersonalityTrait) => profile.traits[0] === t || profile.traits[1] === t;

  if (isLovedOne && (hasTrait('brave') || hasTrait('hot_headed') || !playerArmed)) {
    return {
      decision: 'confront',
      line: "Hey! Get your hands off them right now!",
    };
  }

  if (crimeSeverity === 'gunfire' || (crimeSeverity === 'robbery' && playerArmed)) {
    if (hasTrait('clout_chaser') && !hasTrait('cautious')) {
      return {
        decision: 'film_video',
        line: "Chat are you seeing this?! Live from downtown right now!",
      };
    }
    if (hasTrait('brave') || hasTrait('punctual')) {
      return {
        decision: 'call_911',
        line: "911? Yes, shots fired—send units immediately!",
      };
    }
    return {
      decision: 'flee',
      line: "Get down! Run!",
    };
  }

  if (crimeSeverity === 'assault') {
    if (hasTrait('brave') || hasTrait('hot_headed')) {
      return {
        decision: 'confront',
        line: "Back off—pick on somebody your own size!",
      };
    }
    if (hasTrait('empathetic')) {
      return {
        decision: 'help_victim',
        line: "Are you okay?! Somebody call an ambulance!",
      };
    }
    if (hasTrait('clout_chaser')) {
      return {
        decision: 'film_video',
        line: "Whoa! This is going straight on SnapNova!",
      };
    }
  }

  if (hasTrait('cautious')) {
    return { decision: 'flee', line: "Nope, I'm not getting involved in this!" };
  }
  return {
    decision: 'call_911',
    line: "I'm calling the police, stay right there!",
  };
}
