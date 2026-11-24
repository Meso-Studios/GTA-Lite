// Pure interior geometry & spatial helpers: walkable stairs, mezzanine floor elevation, and wait-line queue slots.

export interface InteriorStairSpec {
  /** World-space bounds of the stair flight */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Floor elevation at bottom and top of stairs */
  y0: number;
  y1: number;
  /** Axis along which the stairs ascend ('x' or 'z') and direction (+1 or -1) */
  axis: 'x' | 'z';
  dir: 1 | -1;
}

export interface InteriorMezzanineSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
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
  mezzanines: InteriorMezzanineSpec[];
}

export interface QueueSlot {
  x: number;
  z: number;
  yaw: number;
  index: number;
}

/**
 * Computes exact walkable floor height inside an interior room, supporting smooth ascent/descent
 * along staircases and walking on elevated mezzanine balconies without snapping through the ceiling.
 */
export function interiorFloorHeight(
  layout: InteriorElevationLayout,
  x: number,
  z: number,
  curY?: number,
): number {
  let best = layout.baseY;

  for (const s of layout.stairs) {
    if (x >= s.x0 - 0.15 && x <= s.x1 + 0.15 && z >= s.z0 - 0.15 && z <= s.z1 + 0.15) {
      const span = s.axis === 'x' ? Math.max(0.01, s.x1 - s.x0) : Math.max(0.01, s.z1 - s.z0);
      const rawT = s.axis === 'x' ? (x - s.x0) / span : (z - s.z0) / span;
      const t = Math.max(0, Math.min(1, s.dir === 1 ? rawT : 1 - rawT));
      const sy = s.y0 + (s.y1 - s.y0) * t;
      // Avoid snapping someone walking far underneath an upper flight if curY is provided
      if (curY === undefined || Math.abs(curY - sy) < 1.35 || curY >= sy - 0.85) {
        if (sy > best) best = sy;
      }
    }
  }

  for (const m of layout.mezzanines) {
    if (x >= m.x0 - 0.1 && x <= m.x1 + 0.1 && z >= m.z0 - 0.1 && z <= m.z1 + 0.1) {
      // Only snap to mezzanine deck if actor is already near/above upper stair level (so walking underneath stays on ground floor!)
      if (curY === undefined || curY >= m.y - 1.15) {
        if (m.y > best) best = m.y;
      }
    }
  }

  return best;
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
  // Perpendicular vector for subtle natural human stance jitter
  const px = -dz;
  const pz = dx;
  // Face opposite of queue extension (toward the counter/host)
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
