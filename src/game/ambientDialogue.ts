// Ambient NPC dialogue subtitle system: proximity-triggered, context-aware, non-repeating overheard lines.
// Zero Three.js dependencies so behavior is deterministically unit-tested with node:test.

export type AmbientPedKind = 'civ' | 'tourist' | 'cop' | 'gang' | 'guard' | 'target' | 'ally';

export interface AmbientCandidate {
  id: number;
  kind: AmbientPedKind;
  x: number;
  y: number;
  z: number;
  dead: boolean;
  panicking: boolean;
}

export interface AmbientStepInput {
  playerX: number;
  playerY: number;
  playerZ: number;
  playerMoving: boolean;
  inVehicle: boolean;
  playerAlive: boolean;
  playerArmed: boolean;
  missionSubActive: boolean;
  district: string;
  isNight: boolean;
  candidates: readonly AmbientCandidate[];
}

export interface AmbientSubtitle {
  pedId: number;
  who: string;
  text: string;
  kind: AmbientPedKind;
  remaining: number;
  x: number;
  z: number;
}

const SPEAKER_LABELS: Record<AmbientPedKind, readonly string[]> = {
  civ: ['Local', 'Shopper', 'Commuter', 'Resident', 'Bystander', 'Street Vendor'],
  tourist: ['Tourist', 'Beachgoer', 'Vacationer', 'Sightseer', 'Spring Breaker'],
  cop: ['SNPD Officer', 'Patrol Officer', 'Beat Cop'],
  gang: ['Calle Nova Crew', 'Street Enforcer', 'Vice Hustler'],
  guard: ['Security Guard', 'Private Security'],
  target: ['Suspect', 'Lookout'],
  ally: ['Crew Member', 'Wingman'],
};

const GENERAL_LINES: Record<AmbientPedKind, readonly string[]> = {
  civ: [
    'This Leonida humidity is frying my phone battery.',
    'Rent just went up again—I need a side hustle.',
    'Did you see that sports car jump the median earlier?',
    'Traffic on the Beltway is an absolute demolition derby today.',
    'Grabbing a cafecito before my shift—need the caffeine.',
    'Half these storefronts weren’t even here last summer.',
    'Everybody in San Nova drives like they stole it.',
    'I swear the ocean breeze is the only thing keeping me sane.',
    'My cousin opened a detailing shop over near Wynwood.',
    'Keep your head on a swivel around here, pal.',
    'Another gorgeous day in paradise, if you dodge the sirens.',
    'Saw a guy slide straight across the sidewalk like an action movie.',
    'They say the strip plaza has the cheapest kicks in town.',
    'Gas prices are wild—might just buy a moped.',
  ],
  tourist: [
    'Oh my god, take a picture of me with the palm trees!',
    'Is that the Vice Pier Ferris wheel over there? So cool!',
    'First time in San Nova—the Art Deco hotels look unreal!',
    'I totally forgot sunscreen on the Golden Dunes, I am cooked.',
    'Wait, is it normal for jets to fly that low over the beach?',
    'This boardwalk beats home by a million miles.',
    'Where’s the best Cuban sandwich around here?',
    'Let’s grab smoothies and walk down to the marina!',
    'Look at the paint job on that convertible!',
    'We’re definitely coming back to Nova Keys next year.',
  ],
  cop: [
    'Dispatch, Sector Four looks quiet for now. Over.',
    'Keep moving, citizen. Nothing to see here.',
    'Third reckless driver I’ve clocked since noon.',
    'Stay out of trouble today and we’ll get along fine.',
    'Central, requesting backup watch near the Strip Plaza.',
    'Coffee’s cold again—never a quiet shift in San Nova.',
    'Eyes open. We got reports of street racers on the causeway.',
  ],
  gang: [
    'Watch where you’re stepping, homie—this is our block.',
    'Heard the cops are sweeping Calle Nova tonight.',
    'Yo, check out the rims on that ride down the avenue.',
    'We run the south strip, don’t forget it.',
    'Need to hit the custom shop before tonight’s meet.',
    'Keep walking unless you’re looking for business.',
  ],
  guard: [
    'Stay clear of the restricted doors.',
    'Eight hours on my feet and nobody tips security.',
    'Keep your hands visible, friend.',
    'Perimeter clear. Same routine every single day.',
  ],
  target: [
    'Just act normal… nobody’s tailing us.',
    'We move as soon as the heat dies down.',
    'Keep your eyes on the street corners.',
  ],
  ally: [
    'I got your six—lead the way, boss.',
    'Ready whenever you want to stir things up.',
    'San Nova’s ours for the taking today.',
    'Say the word and we roll out.',
  ],
};

const PANIC_LINES: readonly string[] = [
  'Somebody call 911! Get out of here!',
  'Whoa, get down! This guy’s lost it!',
  'Not today! I’m running!',
  'Watch it, maniac! Stay back!',
  'Oh no, no, no—I am NOT sticking around for this!',
  'Move! Move! Out of the way!',
];

const ARMED_REACT_LINES: readonly string[] = [
  'Whoa—easy with that piece, man!',
  'Hey! Put that weapon away before the cops swarm us!',
  'I didn’t see a thing, alright? Just let me pass!',
  'You’re crazy walking down the strip strapped like that!',
  'Relax, pal, I’m just trying to get home!',
];

const NIGHT_LINES: readonly string[] = [
  'Ocean Beach hits completely different once the neon comes on.',
  'Look how the neon reflects off the wet asphalt tonight.',
  'Club lines are already wrapped around the block.',
  'Careful walking solo after dark near the docks.',
  'San Nova never really sleeps, huh?',
];

const DISTRICT_LINES: { match: string; lines: readonly string[] }[] = [
  {
    match: 'OCEAN BEACH',
    lines: [
      'Nothing beats the sunset over Ocean Beach Art Deco.',
      'Surf’s picking up past the pier—tons of tourists out today.',
      'Those pastel hotels glow crazy at golden hour.',
    ],
  },
  {
    match: 'LITTLE HAVANA',
    lines: [
      'Best cafecito and dominoes on Calle Nova, guaranteed.',
      'You can smell the pastelitos two blocks away!',
      'Little Havana’s got the best music in the whole city.',
    ],
  },
  {
    match: 'WYNWOOD',
    lines: [
      'Every single wall in Wynwood is a fresh mural this week.',
      'Gallery opening tonight—free drinks if you look artsy.',
      'Love the street art down here, beats corporate downtown.',
    ],
  },
  {
    match: 'AIRPORT',
    lines: [
      'Hear those jet engines? Someone’s pushing full throttle on the runway.',
      'My flight out of San Nova Intl got delayed again.',
      'Private jets rolling in from the Keys all afternoon.',
    ],
  },
  {
    match: 'DOWNTOWN',
    lines: [
      'Glass towers everywhere and still nowhere to park downtown.',
      'Big money moving through the financial core today.',
      'Lunch rush downtown is always absolute chaos.',
    ],
  },
  {
    match: 'NOVA KEYS',
    lines: [
      'Worth the bridge drive just for the breeze out here on Nova Keys.',
      'Seaplanes landing right by the resort cove—living the dream.',
    ],
  },
];

export function speakerLabelFor(pedId: number, kind: AmbientPedKind): string {
  const pool = SPEAKER_LABELS[kind] ?? SPEAKER_LABELS.civ;
  return pool[Math.abs(pedId) % pool.length];
}

export class AmbientDialogueController {
  active: AmbientSubtitle | null = null;
  private cooldown = 2.0;
  private pedLastSpoke = new Map<number, number>();
  private recentLines: string[] = [];
  private elapsed = 0;

  readonly triggerRadius: number;
  readonly dismissRadius: number;
  readonly perPedCooldown: number;

  constructor(opts?: { triggerRadius?: number; dismissRadius?: number; perPedCooldown?: number }) {
    this.triggerRadius = opts?.triggerRadius ?? 13.0;
    this.dismissRadius = opts?.dismissRadius ?? 22.0;
    this.perPedCooldown = opts?.perPedCooldown ?? 24.0;
  }

  reset() {
    this.active = null;
    this.cooldown = 1.5;
    this.pedLastSpoke.clear();
    this.recentLines = [];
  }

  /** Advance ambient dialogue state; returns currently visible ambient subtitle (or null). */
  step(inp: AmbientStepInput, dt: number, rand: () => number = Math.random): AmbientSubtitle | null {
    this.elapsed += dt;

    // Suppress ambient chatter when dead, driving/flying, or while a story/mission subtitle is displaying
    if (!inp.playerAlive || inp.inVehicle || inp.missionSubActive) {
      this.active = null;
      return null;
    }

    // Tick active subtitle and dismiss if expired or player walked far away from speaker
    if (this.active) {
      this.active.remaining -= dt;
      const speaker = inp.candidates.find((c) => c.id === this.active!.pedId);
      const dist = speaker
        ? Math.hypot(speaker.x - inp.playerX, speaker.z - inp.playerZ)
        : Math.hypot(this.active.x - inp.playerX, this.active.z - inp.playerZ);
      if (this.active.remaining <= 0 || dist > this.dismissRadius || (speaker && speaker.dead)) {
        this.active = null;
      } else if (speaker) {
        this.active.x = speaker.x;
        this.active.z = speaker.z;
      }
      return this.active;
    }

    // Wait for global cooldown between ambient lines (faster when walking past NPCs)
    this.cooldown -= dt * (inp.playerMoving ? 1.15 : 0.75);
    if (this.cooldown > 0) return null;

    // Prune stale per-ped cooldown entries occasionally
    if (this.pedLastSpoke.size > 120) {
      for (const [id, t] of this.pedLastSpoke) {
        if (this.elapsed - t > this.perPedCooldown * 2) this.pedLastSpoke.delete(id);
      }
    }

    // Find closest eligible living NPC within triggerRadius (and similar floor elevation)
    let best: AmbientCandidate | null = null;
    let bestD = this.triggerRadius;
    for (const c of inp.candidates) {
      if (c.dead) continue;
      if (Math.abs(c.y - inp.playerY) > 3.5) continue;
      const last = this.pedLastSpoke.get(c.id);
      if (last !== undefined && this.elapsed - last < this.perPedCooldown) continue;
      const d = Math.hypot(c.x - inp.playerX, c.z - inp.playerZ);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }

    if (!best) {
      this.cooldown = 0.6;
      return null;
    }

    const line = this.pickLine(best, inp, rand);
    const dur = Math.max(3.2, Math.min(5.0, 2.2 + line.length * 0.042));
    this.pedLastSpoke.set(best.id, this.elapsed);
    this.recentLines.push(line);
    if (this.recentLines.length > 14) this.recentLines.shift();

    this.active = {
      pedId: best.id,
      who: speakerLabelFor(best.id, best.kind),
      text: line,
      kind: best.kind,
      remaining: dur,
      x: best.x,
      z: best.z,
    };

    // Next ambient line cooldown (shorter in tense/panic situations)
    this.cooldown = best.panicking ? 2.0 + rand() * 1.5 : 4.0 + rand() * 3.8;
    return this.active;
  }

  private pickLine(c: AmbientCandidate, inp: AmbientStepInput, rand: () => number): string {
    const pools: (readonly string[])[] = [];

    if (c.panicking) {
      pools.push(PANIC_LINES);
    } else {
      if (inp.playerArmed && (c.kind === 'civ' || c.kind === 'tourist') && rand() < 0.65) {
        pools.push(ARMED_REACT_LINES);
      }
      const upperDistrict = inp.district.toUpperCase();
      for (const dl of DISTRICT_LINES) {
        if (upperDistrict.includes(dl.match) && rand() < 0.38) {
          pools.push(dl.lines);
          break;
        }
      }
      if (inp.isNight && (c.kind === 'civ' || c.kind === 'tourist') && rand() < 0.32) {
        pools.push(NIGHT_LINES);
      }
      pools.push(GENERAL_LINES[c.kind] ?? GENERAL_LINES.civ);
    }

    // Try selecting a line not in the recent ring buffer
    for (const pool of pools) {
      const fresh = pool.filter((l) => !this.recentLines.includes(l));
      const src = fresh.length > 0 ? fresh : pool;
      if (src.length > 0) {
        return src[Math.floor(rand() * src.length) % src.length];
      }
    }
    return GENERAL_LINES.civ[0];
  }
}
