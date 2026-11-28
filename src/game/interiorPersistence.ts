// Persistent per-building interior state store:
// Preserves exact NPC positions, wounded/dead bodies, hostile/fleeing states,
// bullet holes, explosion scorch marks, blood splatters, and interior door angles
// across exit and re-entry so buildings never reset or respawn killed occupants.

import type { IndoorNpcRole } from './interiors';
import type { Look } from './humans';
import type { PedKind } from './ped';

export interface BuildingDoorIdInput {
  x: number;
  z: number;
  kind: string;
}

export type IndoorImpactKind = 'bullet' | 'scorch' | 'blood';

export interface SavedIndoorImpact {
  kind: IndoorImpactKind;
  x: number;
  y: number;
  z: number;
  /** Surface normal (for wall bullet decals vs floor splatters) */
  nx: number;
  ny: number;
  nz: number;
  radius: number;
}

export interface SavedIndoorPed {
  kind: PedKind;
  role: IndoorNpcRole | null;
  look: Look;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  rotX: number;
  restX: number;
  hostile: boolean;
  aggro: boolean;
  weapon: string | null;
  dmg: number;
  accuracy: number;
  state: string;
  panicT: number;
  brawlT: number;
  handsUp: number;
  indoorHomeX: number;
  indoorHomeZ: number;
  indoorBaseYaw: number;
  lastHint: string;
}

export interface SavedBuildingInterior {
  key: string;
  peds: SavedIndoorPed[];
  impacts: SavedIndoorImpact[];
  doorAngles: Record<string, number>;
  visitedAt: number;
}

export const MAX_IMPACTS_PER_BUILDING = 160;

/**
 * Generates a unique, stable persistence key for a specific outdoor building entrance door.
 */
export function makeBuildingKey(door: BuildingDoorIdInput): string {
  return `${Math.round(door.x)}_${Math.round(door.z)}_${door.kind}`;
}

/**
 * In-memory persistence store keyed by specific building entrance (`doorKey`).
 */
export class InteriorPersistenceStore {
  private map = new Map<string, SavedBuildingInterior>();

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): SavedBuildingInterior | undefined {
    return this.map.get(key);
  }

  saveBuilding(
    key: string,
    peds: SavedIndoorPed[],
    doorAngles: Record<string, number>,
    visitedAt: number,
  ): SavedBuildingInterior {
    const existing = this.map.get(key);
    const saved: SavedBuildingInterior = {
      key,
      peds: peds.map((p) => ({ ...p, look: { ...p.look } })),
      impacts: existing ? existing.impacts : [],
      doorAngles: { ...doorAngles },
      visitedAt,
    };
    this.map.set(key, saved);
    return saved;
  }

  addImpact(key: string, impact: SavedIndoorImpact): void {
    let entry = this.map.get(key);
    if (!entry) {
      entry = { key, peds: [], impacts: [], doorAngles: {}, visitedAt: 0 };
      this.map.set(key, entry);
    }
    if (entry.impacts.length >= MAX_IMPACTS_PER_BUILDING) {
      entry.impacts.shift();
    }
    entry.impacts.push({ ...impact });
  }

  getImpacts(key: string): SavedIndoorImpact[] {
    return this.map.get(key)?.impacts ?? [];
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
