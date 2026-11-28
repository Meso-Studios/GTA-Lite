// Pure interior geometry & spatial helpers:
// walkable staircases, moving escalators, multi-floor mezzanines, subterranean basements,
// stairwell floor cutouts, hinged opening interior doors, and wait-line queue slots.

export interface InteriorStairSpec {
  /** World-space bounds of the stair flight */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Floor elevation at bottom (t=0) and top (t=1) of stairs */
  y0: number;
  y1: number;
  /** Axis along which t increases ('x' or 'z') and direction (+1 or -1) */
  axis: 'x' | 'z';
  dir: 1 | -1;
}

export interface InteriorEscalatorSpec extends InteriorStairSpec {
  /** Belt speed in m/s */
  speed: number;
  /** +1 ascends (from y0 to y1), -1 descends (from y1 to y0) */
  travelDir: 1 | -1;
}

export interface InteriorMezzanineSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
}

export interface InteriorBasementSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
}

export interface InteriorCutoutSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface InteriorSwingDoorSpec {
  id: string;
  /** World-space hinge pivot position */
  hingeX: number;
  hingeZ: number;
  y: number;
  /** Door leaf dimensions */
  width: number;
  height: number;
  /** Closed rotation angle around Y (door extends along +X in local space before rotation) */
  closedYaw: number;
  /** Swing direction (+1 or -1) when opening */
  openDir: 1 | -1;
  /** Visual material style */
  style: 'wood' | 'glass' | 'steel';
}

export interface InteriorExitSpec {
  x: number;
  z: number;
  y: number;
  yaw: number;
  label: string;
}

export interface InteriorElevationLayout {
  baseY: number;
  stairs: InteriorStairSpec[];
  escalators: InteriorEscalatorSpec[];
  mezzanines: InteriorMezzanineSpec[];
  basements: InteriorBasementSpec[];
  cutouts: InteriorCutoutSpec[];
}

export interface EscalatorSample {
  onEscalator: boolean;
  vx: number;
  vz: number;
}

export interface QueueSlot {
  x: number;
  z: number;
  yaw: number;
  index: number;
}

function sampleFlightHeight(s: InteriorStairSpec, x: number, z: number): number {
  const span = s.axis === 'x' ? Math.max(0.01, s.x1 - s.x0) : Math.max(0.01, s.z1 - s.z0);
  const rawT = s.axis === 'x' ? (x - s.x0) / span : (z - s.z0) / span;
  const t = Math.max(0, Math.min(1, s.dir === 1 ? rawT : 1 - rawT));
  return s.y0 + (s.y1 - s.y0) * t;
}

/**
 * Computes exact walkable floor height inside a multi-floor interior room,
 * supporting subterranean basements, ground-floor stairwell cutouts, stairs,
 * moving escalators, and upper mezzanines without snapping through ceilings or floors.
 */
export function interiorFloorHeight(
  layout: InteriorElevationLayout,
  x: number,
  z: number,
  curY?: number,
): number {
  // Check if actor is currently in a subterranean basement level
  let inBasementBounds = false;
  let basementY = layout.baseY;
  for (const b of layout.basements) {
    if (x >= b.x0 - 0.15 && x <= b.x1 + 0.15 && z >= b.z0 - 0.15 && z <= b.z1 + 0.15) {
      inBasementBounds = true;
      basementY = b.y;
      break;
    }
  }

  let inCutout = false;
  for (const cut of layout.cutouts) {
    if (x >= cut.x0 && x <= cut.x1 && z >= cut.z0 && z <= cut.z1) {
      inCutout = true;
      break;
    }
  }

  const belowGround = curY !== undefined && curY < layout.baseY - 0.55;
  let best = inBasementBounds && (belowGround || inCutout) ? basementY : layout.baseY;

  const allFlights: InteriorStairSpec[] = [...layout.stairs, ...layout.escalators];
  for (const s of allFlights) {
    if (x >= s.x0 - 0.16 && x <= s.x1 + 0.16 && z >= s.z0 - 0.16 && z <= s.z1 + 0.16) {
      const sy = sampleFlightHeight(s, x, z);
      const isBasementFlight = Math.min(s.y0, s.y1) < layout.baseY - 0.2;
      if (isBasementFlight) {
        if (curY === undefined || Math.abs(curY - sy) < 1.55 || inCutout || belowGround) {
          if (inCutout || belowGround) {
            best = Math.max(best, sy);
          } else if (sy <= layout.baseY + 0.15 && Math.abs((curY ?? layout.baseY) - sy) < 0.85) {
            best = sy;
          }
        }
      } else {
        // Upper flight (ground -> mezzanine): only snap if near or above flight level
        if (!belowGround && (curY === undefined || Math.abs(curY - sy) < 1.35 || curY >= sy - 0.85)) {
          if (sy > best) best = sy;
        }
      }
    }
  }

  if (!belowGround) {
    for (const m of layout.mezzanines) {
      if (x >= m.x0 - 0.1 && x <= m.x1 + 0.1 && z >= m.z0 - 0.1 && z <= m.z1 + 0.1) {
        if (curY === undefined || curY >= m.y - 1.15) {
          if (m.y > best) best = m.y;
        }
      }
    }
  }

  return best;
}

/**
 * Samples horizontal conveyance velocity when standing on an active indoor escalator.
 */
export function sampleEscalatorConveyance(
  layout: InteriorElevationLayout,
  x: number,
  z: number,
  curY: number,
): EscalatorSample {
  for (const esc of layout.escalators) {
    if (x >= esc.x0 - 0.08 && x <= esc.x1 + 0.08 && z >= esc.z0 - 0.08 && z <= esc.z1 + 0.08) {
      const sy = sampleFlightHeight(esc, x, z);
      if (Math.abs(curY - sy) < 0.95) {
        const moveSign = esc.dir * esc.travelDir;
        return {
          onEscalator: true,
          vx: esc.axis === 'x' ? moveSign * esc.speed : 0,
          vz: esc.axis === 'z' ? moveSign * esc.speed : 0,
        };
      }
    }
  }
  return { onEscalator: false, vx: 0, vz: 0 };
}

/**
 * Generates deterministic, human-looking wait-line queue positions extending backward from a counter/host anchor.
 */
export function computeWaitLineSlots(
  anchorX: number,
  anchorZ: number,
  stepDirX: number,
  stepDirZ: number,
  count: number,
  spacing = 1.08,
): QueueSlot[] {
  const len = Math.hypot(stepDirX, stepDirZ) || 1;
  const dx = stepDirX / len;
  const dz = stepDirZ / len;
  const px = -dz;
  const pz = dx;
  const faceYaw = Math.atan2(-dx, -dz);

  const slots: QueueSlot[] = [];
  for (let i = 0; i < count; i++) {
    const jitterLat = Math.sin(i * 2.17 + 0.6) * 0.14;
    const jitterYaw = Math.cos(i * 1.83) * 0.16;
    slots.push({
      x: anchorX + dx * (i * spacing) + px * jitterLat,
      z: anchorZ + dz * (i * spacing) + pz * jitterLat,
      yaw: faceYaw + jitterYaw,
      index: i,
    });
  }
  return slots;
}
