// 18 handcrafted San Nova Side Quests spanning Casinos, Car Dealerships, Sharpshooter Trials,
// Vigilante Bounties, Emergency Couriers, Street Drifting, Desert Rescues & Waterfront Operations.
// Pure deterministic state machine (zero Three.js dependencies) for instant HUD/Phone integration & unit testing.
import { DECK, RURAL_GAS_STATIONS, blockCenter, roadLine } from './config';

export type SideQuestCategory =
  | 'casino'
  | 'dealership'
  | 'marksman'
  | 'vigilante'
  | 'courier'
  | 'motorsport'
  | 'rescue';

export type SideQuestObjectiveKind =
  | 'reach'
  | 'drive_speed'
  | 'eliminate'
  | 'pistol_longshot'
  | 'enter_venue';

export interface SideQuestDef {
  readonly id: string;
  readonly title: string;
  readonly giver: string;
  readonly district: string;
  readonly category: SideQuestCategory;
  readonly reward: number;
  readonly summary: string;
  readonly objectiveText: string;
  readonly objectiveKind: SideQuestObjectiveKind;
  readonly targetX: number;
  readonly targetZ: number;
  readonly targetRadius: number;
  readonly requiredCount: number;
  readonly requiredSpeedMps?: number;
  readonly venueKind?: 'casino' | 'dealership' | 'hospital' | 'bank';
  readonly spawnEnemies?: number;
  readonly spawnVehicle?: 'sedan' | 'sports' | 'suv' | 'pickup' | 'taxi' | 'police' | 'van';
}

export const SIDE_QUESTS: readonly SideQuestDef[] = [
  // --- Casino Side Quests
  {
    id: 'sq_casino_vip',
    title: 'High-Roller Entry',
    giver: 'Viktor (Royal Palms)',
    district: 'Midtown Strip',
    category: 'casino',
    reward: 2200,
    summary: 'Check in at The Royal Palms Casino floor and collect Viktor’s complimentary VIP chip voucher.',
    objectiveText: 'Enter The Royal Palms Casino',
    objectiveKind: 'enter_venue',
    targetX: blockCenter(5),
    targetZ: blockCenter(6) + 46,
    targetRadius: 24,
    requiredCount: 1,
    venueKind: 'casino',
  },
  {
    id: 'sq_casino_debt',
    title: 'Velvet Debt Collection',
    giver: 'Elena (Casino Floor)',
    district: 'Ocean Beach',
    category: 'casino',
    reward: 3400,
    summary: 'Two syndicate card-counters skipped out on a $15k marker near the boardwalk. Neutralize their armed escorts.',
    objectiveText: 'Take down the card-counter crew near Ocean Beach',
    objectiveKind: 'eliminate',
    targetX: blockCenter(2),
    targetZ: blockCenter(8) + 28,
    targetRadius: 42,
    requiredCount: 3,
    spawnEnemies: 3,
  },
  {
    id: 'sq_casino_armored',
    title: 'Midnight Chip Run',
    giver: 'Pit Boss Ray',
    district: 'Downtown',
    category: 'casino',
    reward: 2800,
    summary: 'Deliver sealed high-denomination plaques from NovaBank downtown straight to the casino valet.',
    objectiveText: 'Reach the Royal Palms Casino valet drop-off',
    objectiveKind: 'reach',
    targetX: blockCenter(5),
    targetZ: blockCenter(6) + 48,
    targetRadius: 15,
    requiredCount: 1,
  },

  // --- Car Dealership & Motorsport Side Quests
  {
    id: 'sq_dealer_showroom',
    title: 'Apex Motors VIP Preview',
    giver: 'Sloane (Apex Motors)',
    district: 'Midtown Strip',
    category: 'dealership',
    reward: 1800,
    summary: 'Step inside Apex Motors Luxury Showroom to inspect the new season exotic lineup.',
    objectiveText: 'Visit the Apex Motors Showroom interior',
    objectiveKind: 'enter_venue',
    targetX: blockCenter(6),
    targetZ: blockCenter(4) + 46,
    targetRadius: 24,
    requiredCount: 1,
    venueKind: 'dealership',
  },
  {
    id: 'sq_dealer_repossess',
    title: 'Repo: Missing Supercar',
    giver: 'Sloane (Apex Motors)',
    district: 'Wynwood Arts',
    category: 'dealership',
    reward: 4200,
    summary: 'A joyrider boosted a showroom coupe and hid it behind the Wynwood rail yards with hired muscle.',
    objectiveText: 'Eliminate the car-theft crew in Wynwood',
    objectiveKind: 'eliminate',
    targetX: blockCenter(7),
    targetZ: blockCenter(3),
    targetRadius: 46,
    requiredCount: 3,
    spawnEnemies: 3,
    spawnVehicle: 'sports',
  },
  {
    id: 'sq_dealer_speedtest',
    title: 'Apex Autobahn Calibration',
    giver: 'Chief Mechanic Lou',
    district: 'Outer Beltway',
    category: 'motorsport',
    reward: 2600,
    summary: 'Clock over 115 km/h (32 m/s) in any car to calibrate Apex Motors telemetry sensors.',
    objectiveText: 'Hit 115+ km/h in any vehicle',
    objectiveKind: 'drive_speed',
    targetX: roadLine(5),
    targetZ: roadLine(4),
    targetRadius: 5000,
    requiredCount: 1,
    requiredSpeedMps: 32,
  },
  {
    id: 'sq_beach_drift',
    title: 'Ocean Drive Top Speed',
    giver: 'Nitro',
    district: 'Ocean Beach',
    category: 'motorsport',
    reward: 3100,
    summary: 'Tear down Ocean Drive at 135+ km/h (37.5 m/s) to qualify for the underground summer bracket.',
    objectiveText: 'Hit 135+ km/h in any fast car',
    objectiveKind: 'drive_speed',
    targetX: blockCenter(4),
    targetZ: blockCenter(8),
    targetRadius: 5000,
    requiredCount: 1,
    requiredSpeedMps: 37.5,
  },

  // --- Marksman & 30-Foot Pistol Sharpshooter Side Quests
  {
    id: 'sq_marksman_30ft',
    title: '30-Foot Deadeye Trial',
    giver: 'Range Master Vance',
    district: 'Midtown Strip',
    category: 'marksman',
    reward: 3500,
    summary: 'Prove your pistol discipline: land a clean headshot with a pistol from at least 30 feet away.',
    objectiveText: 'Land 1 pistol headshot from 30+ feet away',
    objectiveKind: 'pistol_longshot',
    targetX: blockCenter(4),
    targetZ: blockCenter(7),
    targetRadius: 5000,
    requiredCount: 1,
    spawnEnemies: 2,
  },
  {
    id: 'sq_marksman_triple',
    title: 'Silver-Screen Gunslinger',
    giver: 'Range Master Vance',
    district: 'East Harbor',
    category: 'marksman',
    reward: 5200,
    summary: 'Pull off 3 long-range (30ft+) pistol headshots anywhere in San Nova for Vance’s master bounty.',
    objectiveText: 'Land 3 pistol headshots from 30+ feet away',
    objectiveKind: 'pistol_longshot',
    targetX: blockCenter(7),
    targetZ: blockCenter(7),
    targetRadius: 5000,
    requiredCount: 3,
    spawnEnemies: 3,
  },

  // --- Vigilante & Street Bounty Side Quests
  {
    id: 'sq_vigilante_harbor',
    title: 'Container Yard Smugglers',
    giver: 'Det. Morales',
    district: 'East Harbor',
    category: 'vigilante',
    reward: 3600,
    summary: 'Armed smugglers are offloading illegal crates between the harbor cranes. Clear the dock.',
    objectiveText: 'Neutralize 4 harbor smugglers',
    objectiveKind: 'eliminate',
    targetX: blockCenter(7),
    targetZ: blockCenter(8),
    targetRadius: 55,
    requiredCount: 4,
    spawnEnemies: 4,
  },
  {
    id: 'sq_vigilante_park',
    title: 'Central Park Ambush',
    giver: 'Park Ranger Cruz',
    district: 'Central Park',
    category: 'vigilante',
    reward: 2900,
    summary: 'A street crew is shaking down joggers near the park gazebo. Drive them out.',
    objectiveText: 'Clear 3 gang members in Central Park',
    objectiveKind: 'eliminate',
    targetX: blockCenter(2),
    targetZ: blockCenter(1),
    targetRadius: 55,
    requiredCount: 3,
    spawnEnemies: 3,
  },
  {
    id: 'sq_vigilante_alley',
    title: 'Little Havana Protection Racket',
    giver: 'Rosa (La Cubana)',
    district: 'Little Havana',
    category: 'vigilante',
    reward: 3200,
    summary: 'Extortionists are harassing local bakery owners on Calle Nova. Shut their operation down.',
    objectiveText: 'Defeat 3 extortionists in Little Havana',
    objectiveKind: 'eliminate',
    targetX: blockCenter(1),
    targetZ: blockCenter(4),
    targetRadius: 48,
    requiredCount: 3,
    spawnEnemies: 3,
  },

  // --- Emergency Courier & Civic Side Quests
  {
    id: 'sq_courier_hospital',
    title: 'Code Red Organ Courier',
    giver: 'Dr. Nair',
    district: 'Medical District',
    category: 'courier',
    reward: 2700,
    summary: 'A surgical cooler just landed from the airport. Rush it directly to San Nova General Hospital.',
    objectiveText: 'Enter San Nova General Hospital with the cooler',
    objectiveKind: 'enter_venue',
    targetX: blockCenter(1),
    targetZ: blockCenter(2) + 46,
    targetRadius: 24,
    requiredCount: 1,
    venueKind: 'hospital',
  },
  {
    id: 'sq_courier_bank',
    title: 'NovaBank Bond Transfer',
    giver: 'Branch Director Chen',
    district: 'Financial Core',
    category: 'courier',
    reward: 2400,
    summary: 'Escort bearer bonds safely into the NovaBank Downtown Atrium before closing bell.',
    objectiveText: 'Deliver the bonds inside NovaBank Downtown',
    objectiveKind: 'enter_venue',
    targetX: blockCenter(4),
    targetZ: blockCenter(4) + 46,
    targetRadius: 24,
    requiredCount: 1,
    venueKind: 'bank',
  },
  {
    id: 'sq_courier_pier',
    title: 'Sunset Pier Express',
    giver: 'Chef Mateo',
    district: 'Ocean Beach Pier',
    category: 'courier',
    reward: 1900,
    summary: 'Run fresh seafood platters down to the end of San Nova Pier before the yacht charter departs.',
    objectiveText: 'Reach the Pier Yacht Dock',
    objectiveKind: 'reach',
    targetX: -240,
    targetZ: 635,
    targetRadius: 18,
    requiredCount: 1,
  },
  {
    id: 'sq_courier_airport',
    title: 'Private Hangar VIP Bag',
    giver: 'Captain Brooks',
    district: 'San Nova Int’l Airport',
    category: 'courier',
    reward: 3300,
    summary: 'A VIP charter jet is holding at the Airport tarmac. Deliver the flight case to the terminal apron.',
    objectiveText: 'Reach San Nova Airport Terminal Apron',
    objectiveKind: 'reach',
    targetX: (DECK.AIRPORT.x0 + DECK.AIRPORT.x1) * 0.5 - 40,
    targetZ: DECK.AIRPORT.runwayZ,
    targetRadius: 34,
    requiredCount: 1,
  },

  // --- Rural Highway & Desert Rescue Side Quests
  {
    id: 'sq_rescue_dunes',
    title: 'Golden Dunes Beacon Check',
    giver: 'Desert Patrol HQ',
    district: 'Golden Dunes',
    category: 'rescue',
    reward: 3800,
    summary: 'A backcountry rally driver triggered a distress beacon out in the western dunes. Reach the rally camp.',
    objectiveText: 'Reach the Golden Dunes distress beacon',
    objectiveKind: 'reach',
    targetX: -1280,
    targetZ: 140,
    targetRadius: 28,
    requiredCount: 1,
  },
  {
    id: 'sq_rescue_highway',
    title: 'Route 99 Truck-Stop Supply',
    giver: 'Dispatch Clara',
    district: 'North Highway',
    category: 'rescue',
    reward: 2950,
    summary: 'Deliver emergency fuel-pump parts to the northern rural highway gas station out past the suburbs.',
    objectiveText: 'Reach the Route 99 Rural Gas Station',
    objectiveKind: 'reach',
    targetX: RURAL_GAS_STATIONS[0]?.x ?? 0,
    targetZ: RURAL_GAS_STATIONS[0]?.z ?? -1350,
    targetRadius: 26,
    requiredCount: 1,
  },
];

export interface ActiveSideQuestSnapshot {
  id: string;
  title: string;
  giver: string;
  district: string;
  category: SideQuestCategory;
  objectiveText: string;
  progress: number;
  requiredCount: number;
  reward: number;
  targetX: number;
  targetZ: number;
}

export interface SideQuestHudSummary {
  active: ActiveSideQuestSnapshot | null;
  completedIds: string[];
  totalCount: number;
}

export interface SideQuestStepResult {
  completed?: SideQuestDef;
  progressChanged?: boolean;
}

export class SideQuestManager {
  private activeQuest: SideQuestDef | null = null;
  private progress = 0;
  private completed = new Set<string>();

  public accept(id: string): SideQuestDef | null {
    const def = SIDE_QUESTS.find((q) => q.id === id);
    if (!def) return null;
    this.activeQuest = def;
    this.progress = 0;
    return def;
  }

  public cancel(): void {
    this.activeQuest = null;
    this.progress = 0;
  }

  public getActive(): SideQuestDef | null {
    return this.activeQuest;
  }

  public getSnapshot(): SideQuestHudSummary {
    const q = this.activeQuest;
    return {
      active: q
        ? {
            id: q.id,
            title: q.title,
            giver: q.giver,
            district: q.district,
            category: q.category,
            objectiveText: q.objectiveText,
            progress: this.progress,
            requiredCount: q.requiredCount,
            reward: q.reward,
            targetX: q.targetX,
            targetZ: q.targetZ,
          }
        : null,
      completedIds: Array.from(this.completed),
      totalCount: SIDE_QUESTS.length,
    };
  }

  public isCompleted(id: string): boolean {
    return this.completed.has(id);
  }

  public onPlayerTick(
    px: number,
    pz: number,
    vehicleSpeedMps: number,
    currentInteriorKind: string | null,
  ): SideQuestStepResult {
    const q = this.activeQuest;
    if (!q) return {};

    if (q.objectiveKind === 'reach') {
      if (Math.hypot(px - q.targetX, pz - q.targetZ) <= q.targetRadius) {
        return this.finishActive();
      }
    } else if (q.objectiveKind === 'drive_speed') {
      if (vehicleSpeedMps >= (q.requiredSpeedMps ?? 30)) {
        return this.finishActive();
      }
    } else if (q.objectiveKind === 'enter_venue') {
      if (currentInteriorKind && currentInteriorKind === q.venueKind) {
        return this.finishActive();
      }
    }
    return {};
  }

  public onEnemyEliminated(ex: number, ez: number): SideQuestStepResult {
    const q = this.activeQuest;
    if (!q || q.objectiveKind !== 'eliminate') return {};
    if (Math.hypot(ex - q.targetX, ez - q.targetZ) <= Math.max(95, q.targetRadius * 1.8)) {
      this.progress = Math.min(q.requiredCount, this.progress + 1);
      if (this.progress >= q.requiredCount) return this.finishActive();
      return { progressChanged: true };
    }
    return {};
  }

  public onPistolLongshotHeadshot(): SideQuestStepResult {
    const q = this.activeQuest;
    if (!q || q.objectiveKind !== 'pistol_longshot') return {};
    this.progress = Math.min(q.requiredCount, this.progress + 1);
    if (this.progress >= q.requiredCount) return this.finishActive();
    return { progressChanged: true };
  }

  private finishActive(): SideQuestStepResult {
    const done = this.activeQuest!;
    this.completed.add(done.id);
    this.activeQuest = null;
    this.progress = 0;
    return { completed: done, progressChanged: true };
  }
}
