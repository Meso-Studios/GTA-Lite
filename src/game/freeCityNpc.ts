// FREE CITY NPC Behavioral Engine ("Free Guy" illusion-of-life algorithm — 100% deterministic/stochastic utility brain, ZERO AI/LLM).

export type FreeCityArchetype =
  | 'guy'
  | 'buddy'
  | 'barista'
  | 'teller'
  | 'influencer'
  | 'shopper'
  | 'exec';

export type FreeCityActivity =
  | 'commute'
  | 'coffee_stop'
  | 'window_shop'
  | 'pair_chat'
  | 'admire_ride'
  | 'selfie_snap'
  | 'wave_greet'
  | 'jog_loop'
  | 'bank_routine'
  | 'tuesday_surrender';

export type SchedulePhase =
  | 'morning_coffee'
  | 'workday_hustle'
  | 'sunset_stroll'
  | 'nightlife_loop';

export interface FreeCityBrain {
  archetype: FreeCityArchetype;
  seed: number;
  routineOffset: number;
  activity: FreeCityActivity;
  activityT: number;
  dwellDuration: number;
  partnerId: number | null;
  targetX: number;
  targetZ: number;
  targetYaw: number | null;
  coffeeCount: number;
  mood: number;
  memoryCooldown: number;
  lastTopic: string;
  greetDone: boolean;
}

export interface FreeCityContext {
  hour: number;
  selfId: number;
  selfX: number;
  selfZ: number;
  selfYaw: number;
  playerX: number;
  playerZ: number;
  playerArmed: boolean;
  playerAimingNear: boolean;
  nearbyPartner: { id: number; x: number; z: number; distance: number } | null;
  nearbyExotic: { x: number; z: number; distance: number; isAircraft: boolean } | null;
  nearbyStoreDoor: { x: number; z: number; name: string; distance: number } | null;
  nearbyDanger: boolean;
}

export interface FreeCityStepResult {
  activity: FreeCityActivity;
  desiredSpeedMul: number;
  shouldStop: boolean;
  faceYaw: number | null;
  photoPose: boolean;
  raiseHands: boolean;
  partnerId: number | null;
  ambientLineHint: string | null;
}

const ARCHETYPES: readonly FreeCityArchetype[] = [
  'guy',
  'buddy',
  'barista',
  'teller',
  'influencer',
  'shopper',
  'exec',
];

export const FREE_CITY_LABELS: Record<FreeCityArchetype, string> = {
  guy: 'Blue-Shirt Guy',
  buddy: 'Free City Pal',
  barista: 'Barista',
  teller: 'Bank Teller',
  influencer: 'Creator',
  shopper: 'Shopper',
  exec: 'Downtown Exec',
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function createFreeCityBrain(
  seed: number,
  pedKind: 'civ' | 'tourist' | 'guard' | string,
  forcedArchetype?: FreeCityArchetype,
): FreeCityBrain {
  let archetype: FreeCityArchetype;
  if (forcedArchetype) {
    archetype = forcedArchetype;
  } else if (pedKind === 'guard') {
    archetype = 'teller';
  } else if (pedKind === 'tourist') {
    archetype = hash01(seed + 11) < 0.55 ? 'influencer' : 'shopper';
  } else {
    const r = hash01(seed * 3 + 5);
    if (r < 0.16) archetype = 'guy';
    else if (r < 0.34) archetype = 'buddy';
    else if (r < 0.48) archetype = 'barista';
    else if (r < 0.6) archetype = 'teller';
    else if (r < 0.74) archetype = 'influencer';
    else if (r < 0.88) archetype = 'shopper';
    else archetype = 'exec';
  }

  return {
    archetype,
    seed,
    routineOffset: (hash01(seed + 91) - 0.5) * 1.6,
    activity: 'commute',
    activityT: 2.5 + hash01(seed + 3) * 4.5,
    dwellDuration: 0,
    partnerId: null,
    targetX: 0,
    targetZ: 0,
    targetYaw: null,
    coffeeCount: Math.floor(hash01(seed + 19) * 2),
    mood: 0.68 + hash01(seed + 29) * 0.32,
    memoryCooldown: 0,
    lastTopic: '',
    greetDone: false,
  };
}

export function getFreeCitySchedule(hour: number, archetype: FreeCityArchetype): SchedulePhase {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5.5 && h < 10.5) return 'morning_coffee';
  if (h >= 10.5 && h < 16.5) return archetype === 'influencer' ? 'sunset_stroll' : 'workday_hustle';
  if (h >= 16.5 && h < 21.0) return 'sunset_stroll';
  return 'nightlife_loop';
}

export function computeUtilityScores(
  brain: FreeCityBrain,
  ctx: FreeCityContext,
): Record<FreeCityActivity, number> {
  const phase = getFreeCitySchedule(ctx.hour + brain.routineOffset, brain.archetype);
  const arch = brain.archetype;

  const scores: Record<FreeCityActivity, number> = {
    commute: 0.46,
    coffee_stop: phase === 'morning_coffee' ? 0.52 : 0.18,
    window_shop: 0.12,
    pair_chat: 0.06,
    admire_ride: 0.04,
    selfie_snap: arch === 'influencer' ? 0.42 : 0.14,
    wave_greet: 0.05,
    jog_loop: phase === 'morning_coffee' || phase === 'sunset_stroll' ? 0.32 : 0.14,
    bank_routine: arch === 'teller' || arch === 'exec' ? 0.44 : 0.1,
    tuesday_surrender: 0.0,
  };

  // Archetype flavor biases (pure algorithmic routine weights)
  if (arch === 'guy') {
    scores.coffee_stop += 0.3;
    scores.wave_greet += 0.22;
    scores.bank_routine += 0.15;
  } else if (arch === 'buddy') {
    scores.pair_chat += 0.28;
    scores.wave_greet += 0.16;
  } else if (arch === 'barista') {
    scores.coffee_stop += 0.36;
  } else if (arch === 'shopper') {
    scores.window_shop += 0.28;
  } else if (arch === 'exec') {
    scores.commute += 0.24;
    scores.bank_routine += 0.25;
  } else if (arch === 'influencer') {
    scores.selfie_snap += 0.34;
    scores.admire_ride += 0.2;
  }

  // Environmental percepts
  if (ctx.nearbyStoreDoor && ctx.nearbyStoreDoor.distance < 11) {
    const prox = clamp01(1 - ctx.nearbyStoreDoor.distance / 11);
    const doorUpper = ctx.nearbyStoreDoor.name.toUpperCase();
    const isCoffee =
      doorUpper.includes('CAFE') ||
      doorUpper.includes('COFFEE') ||
      doorUpper.includes('DINER') ||
      doorUpper.includes('DONUT') ||
      doorUpper.includes('BISTRO');
    if (isCoffee) scores.coffee_stop += 0.55 * prox + (brain.coffeeCount < 2 ? 0.15 : 0);
    else scores.window_shop += 0.58 * prox;
  }

  if (ctx.nearbyPartner && ctx.nearbyPartner.distance < 4.8) {
    const prox = clamp01(1 - ctx.nearbyPartner.distance / 4.8);
    scores.pair_chat += 0.65 * prox * brain.mood;
  }

  if (ctx.nearbyExotic && ctx.nearbyExotic.distance < 16) {
    const prox = clamp01(1 - ctx.nearbyExotic.distance / 16);
    scores.admire_ride += 0.72 * prox + (ctx.nearbyExotic.isAircraft ? 0.15 : 0);
  }

  const dp = Math.hypot(ctx.playerX - ctx.selfX, ctx.playerZ - ctx.selfZ);
  if (dp < 7.5 && !ctx.playerArmed && !ctx.nearbyDanger && !brain.greetDone) {
    scores.wave_greet += (1 - dp / 7.5) * 0.62;
  }

  // Free Guy signature "Just another Tuesday" reaction to armed threats or chaos
  if (ctx.playerAimingNear || (ctx.playerArmed && dp < 9.5) || ctx.nearbyDanger) {
    scores.tuesday_surrender = ctx.playerAimingNear || ctx.nearbyDanger ? 1.85 : 1.15;
  }

  return scores;
}

const GUY_LINES: readonly string[] = [
  'Medium coffee, cream and two sugars — literally the highlight of my morning!',
  'Don’t have a good day… have a GREAT day!',
  'I love my blue shirt, my goldfishes, and the smell of San Nova asphalt.',
  'Wait—did I already pass this exact corner three times, or is it déjà vu?',
  'Cappuccino first, work at the teller window second. Every single day.',
];

const TUESDAY_LINES: readonly string[] = [
  'Whoa—hey, it’s just a regular Tuesday! Take the cash drawer, zero heroics here!',
  'Alright, hands up! Same time next Tuesday, pal?',
  'Please don’t scuff the blue shirt—I’m lying face-down already!',
  'Look, I’m just trying to buy coffee before the third bank heist this week!',
];

const ADMIRE_RIDE_LINES: readonly string[] = [
  'Look at the paint flake on that ride—straight out of an art gallery!',
  'Okay, THAT is what a real protagonist drives in San Nova.',
  'Wait until Buddy sees the aerodynamics on that thing!',
  'If I save up for four hundred years, maybe I can afford one headlight on that car.',
];

const PAIR_CHAT_LINES: readonly string[] = [
  'I’m telling you, the espresso down on Calle Nova tastes completely coded for perfection.',
  'Did you notice everybody wearing sunglasses acts like they own the sidewalk?',
  'Same sidewalk loop, same traffic signal, yet somehow I’m always five minutes late.',
  'I got a feeling today might actually break our routine.',
];

const WAVE_LINES: readonly string[] = [
  'Hey there, sunshine! Have a great day in San Nova!',
  'Good morning! Loving the energy on the avenue today!',
  'Catching a coffee? Best weather in Leonida right now.',
];

const ARCHETYPE_LINES: Record<FreeCityArchetype, readonly string[]> = {
  guy: GUY_LINES,
  buddy: [
    'We’re in a loop? Nah man, look at those palm reflections—this is the life!',
    'Don’t overthink it, pal. Grab your coffee and hit the window.',
    'Hey! You’re blocking my good light, buddy!',
  ],
  barista: [
    'Single-origin iced Cuban espresso, fresh off the brass pull!',
    'Ten regulars before eight AM—everybody here lives on caffeine.',
    'Careful, the oat milk foam is practically a work of art today.',
  ],
  teller: [
    'Vault doors are locked, deposit slips are stacked, waiting for the usual Tuesday rush.',
    'Remember: smile politely, hand over the dye pack, don’t touch the alarm.',
    'Everything reconciles to the penny in downtown San Nova.',
  ],
  influencer: [
    'Hold still, the golden-hour light off that Art Deco facade is INSANE!',
    'Tagging this mural drop in Wynwood before everybody copies the angle.',
    'Wait—did a sports car just drift past my shot?! Instant viral clip!',
  ],
  shopper: [
    'This storefront popped up overnight and the window display is undefeated.',
    'Comparing sneakers across three blocks—classic San Nova afternoon.',
    'No budget today, strictly window shopping… okay maybe one bag.',
  ],
  exec: [
    'Checking quarterly margins while dodging scooters on Ocean Drive.',
    'Let’s circle back after my double espresso at the corner bistro.',
    'Downtown traffic’s heavy—should’ve taken the chopper off the roof.',
  ],
};

export function pickFreeCityLine(
  brain: FreeCityBrain,
  ctx: FreeCityContext,
  rand: () => number = Math.random,
): string {
  let pool: readonly string[];
  if (brain.activity === 'tuesday_surrender') {
    pool = TUESDAY_LINES;
  } else if (brain.activity === 'admire_ride') {
    pool = ADMIRE_RIDE_LINES;
  } else if (brain.activity === 'pair_chat') {
    pool = PAIR_CHAT_LINES;
  } else if (brain.activity === 'wave_greet') {
    pool = WAVE_LINES;
  } else if (brain.activity === 'coffee_stop' && brain.archetype === 'guy') {
    pool = GUY_LINES;
  } else {
    pool = ARCHETYPE_LINES[brain.archetype] ?? GUY_LINES;
  }

  const filtered = pool.filter((l) => l !== brain.lastTopic);
  const src = filtered.length > 0 ? filtered : pool;
  const chosen = src[Math.floor(rand() * src.length) % src.length];
  brain.lastTopic = chosen;
  void ctx;
  return chosen;
}

export function stepFreeCityNpc(
  brain: FreeCityBrain,
  ctx: FreeCityContext,
  dt: number,
  rand: () => number = Math.random,
): FreeCityStepResult {
  brain.activityT -= dt;
  brain.memoryCooldown = Math.max(0, brain.memoryCooldown - dt);

  const urgentThreat = ctx.playerAimingNear || ctx.nearbyDanger;
  const expired = brain.activityT <= 0;

  // Immediate interruption for "Tuesday surrender" or ending surrender cleanly
  if (urgentThreat && brain.activity !== 'tuesday_surrender') {
    brain.activity = 'tuesday_surrender';
    brain.activityT = 2.6 + rand() * 1.4;
    brain.partnerId = null;
  } else if (expired) {
    const scores = computeUtilityScores(brain, ctx);
    let bestAct: FreeCityActivity = 'commute';
    let bestScore = -1;
    const keys = Object.keys(scores) as FreeCityActivity[];
    for (const act of keys) {
      // Slight stochastic tie-break keeps crowd behavior organic without feeling erratic
      const s = scores[act] + rand() * 0.09;
      if (s > bestScore) {
        bestScore = s;
        bestAct = act;
      }
    }
    brain.activity = bestAct;
    brain.partnerId = bestAct === 'pair_chat' && ctx.nearbyPartner ? ctx.nearbyPartner.id : null;
    if (bestAct === 'coffee_stop') brain.coffeeCount = Math.min(5, brain.coffeeCount + 1);
    if (bestAct === 'wave_greet') brain.greetDone = true;

    brain.activityT =
      bestAct === 'commute'
        ? 5.0 + rand() * 6.0
        : bestAct === 'jog_loop'
          ? 6.0 + rand() * 5.0
          : bestAct === 'wave_greet'
            ? 1.9 + rand() * 0.8
            : bestAct === 'tuesday_surrender'
              ? 3.0
              : 3.0 + rand() * 3.8;
  }

  let desiredSpeedMul = 1.0;
  let shouldStop = false;
  let faceYaw: number | null = null;
  let photoPose = false;
  let raiseHands = false;
  let ambientLineHint: string | null = null;

  switch (brain.activity) {
    case 'tuesday_surrender': {
      shouldStop = true;
      desiredSpeedMul = 0;
      raiseHands = true;
      faceYaw = Math.atan2(ctx.playerX - ctx.selfX, ctx.playerZ - ctx.selfZ);
      break;
    }
    case 'pair_chat': {
      shouldStop = true;
      desiredSpeedMul = 0;
      if (ctx.nearbyPartner) {
        faceYaw = Math.atan2(ctx.nearbyPartner.x - ctx.selfX, ctx.nearbyPartner.z - ctx.selfZ);
        brain.partnerId = ctx.nearbyPartner.id;
      }
      break;
    }
    case 'admire_ride': {
      shouldStop = true;
      desiredSpeedMul = 0;
      if (ctx.nearbyExotic) {
        faceYaw = Math.atan2(ctx.nearbyExotic.x - ctx.selfX, ctx.nearbyExotic.z - ctx.selfZ);
      }
      if (brain.archetype === 'influencer') photoPose = true;
      break;
    }
    case 'window_shop':
    case 'coffee_stop': {
      shouldStop = true;
      desiredSpeedMul = 0;
      if (ctx.nearbyStoreDoor) {
        faceYaw = Math.atan2(ctx.nearbyStoreDoor.x - ctx.selfX, ctx.nearbyStoreDoor.z - ctx.selfZ);
      }
      break;
    }
    case 'selfie_snap': {
      shouldStop = true;
      desiredSpeedMul = 0;
      photoPose = true;
      break;
    }
    case 'wave_greet': {
      shouldStop = true;
      desiredSpeedMul = 0;
      faceYaw = Math.atan2(ctx.playerX - ctx.selfX, ctx.playerZ - ctx.selfZ);
      break;
    }
    case 'jog_loop': {
      desiredSpeedMul = 1.65;
      break;
    }
    case 'bank_routine': {
      desiredSpeedMul = brain.archetype === 'exec' ? 1.2 : 0.92;
      break;
    }
    default: {
      desiredSpeedMul = 1.0;
      break;
    }
  }

  if (brain.memoryCooldown <= 0 && brain.activity !== 'commute') {
    ambientLineHint = pickFreeCityLine(brain, ctx, rand);
    brain.memoryCooldown = 14 + rand() * 8;
  }

  return {
    activity: brain.activity,
    desiredSpeedMul,
    shouldStop,
    faceYaw,
    photoPose,
    raiseHands,
    partnerId: brain.partnerId,
    ambientLineHint,
  };
}

export { ARCHETYPES as FREE_CITY_ARCHETYPES };
