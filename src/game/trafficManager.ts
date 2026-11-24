// Time-of-day dynamic Traffic Manager: simulates rush-hour peaks, late-night lulls, green-wave surges & lane headway.
import { DECK, clamp, groundHeight } from './config';
import type { Game } from './Game';
import { removeVehicle, trySpawnTraffic } from './spawn';
import {
  computeTimeOfDayFactor,
  computeTrafficDensity,
  computeTrafficWave,
  getDistrictTrafficMultiplier,
  getTrafficPeriodLabel,
  pickTrafficVehicleType,
  type TrafficDensityParams,
  type TrafficDensityResult,
  type TrafficPeriod,
} from './trafficMath';

export {
  computeTimeOfDayFactor,
  computeTrafficDensity,
  computeTrafficWave,
  getDistrictTrafficMultiplier,
  getTrafficPeriodLabel,
  pickTrafficVehicleType,
  type TrafficDensityParams,
  type TrafficDensityResult,
  type TrafficPeriod,
};

const RING_PTS: [number, number][] = [
  [-634, -634],
  [634, -634],
  [634, 614],
  [-634, 614],
];

const BELT_PTS: [number, number][] = [
  [-2994, -2994],
  [2994, -2994],
  [2994, 0],
  [-2994, 0],
];

export class TrafficManager {
  private waveSeed = 23 + Math.floor(Math.random() * 500);
  private cityTimer = 0;
  private hwTimer = 0;
  private baseCap = -1;

  activeCity = 0;
  activeHighway = 0;
  targetCity = 18;
  targetHighway = 12;
  densityRatio = 1.0;
  speedScale = 1.0;
  period: TrafficPeriod = 'Morning Rush';

  reset(waveSeed?: number) {
    this.waveSeed = waveSeed ?? 23 + Math.floor(Math.random() * 500);
    this.cityTimer = 0;
    this.hwTimer = 0;
  }

  getSummary(): string {
    return `${this.period} · ${this.activeCity + this.activeHighway} cars`;
  }

  update(g: Game, dt: number, districtFactor = 1.0): void {
    if (this.baseCap < 0) this.baseCap = g.quality.traffic;

    const density = computeTrafficDensity({
      hour: g.hour,
      baseCap: this.baseCap,
      simTime: g.time,
      waveSeed: this.waveSeed,
      districtFactor,
    });

    this.targetCity = density.targetCity;
    this.targetHighway = density.targetHighway;
    this.densityRatio = density.densityRatio;
    this.period = density.period;
    this.speedScale = density.speedScale;

    this.cityTimer -= dt;
    if (this.cityTimer <= 0) {
      this.cityTimer = 0.34;
      this.stepCityTraffic(g);
    }

    this.hwTimer -= dt;
    if (this.hwTimer <= 0) {
      this.hwTimer = 0.9;
      this.stepHighwayPool(g);
    }
  }

  private stepCityTraffic(g: Game): void {
    let count = 0;
    for (let i = g.vehicles.length - 1; i >= 0; i--) {
      const v = g.vehicles[i];
      if (v.mode !== 'ai' || v.mission || v.spec.isAircraft) continue;
      count++;
      const d = Math.hypot(v.x - g.playerX, v.z - g.playerZ);
      const farCull = d > 330 || (d > 190 && !g.inView(v.x, v.z, 8));
      const excessCull = count > this.targetCity + 2 && d > 110 && !g.inView(v.x, v.z, 6);
      if (farCull || excessCull) {
        removeVehicle(g, v);
        count--;
      } else {
        const baseCruise = v.type === 'van' ? 11.5 : v.type === 'taxi' ? 15.5 : 13.5;
        v.ai.cruise = clamp(baseCruise * this.speedScale, 8.5, 22);
      }
    }

    this.activeCity = count;
    const deficit = this.targetCity - count;
    const spawnBatch = deficit > 5 ? 2 : deficit > 0 ? 1 : 0;
    for (let s = 0; s < spawnBatch; s++) {
      const vt = pickTrafficVehicleType(g.hour);
      const v = trySpawnTraffic(g, 'ai', vt, 70, 260);
      if (v) {
        v.ai.cruise = clamp(v.ai.cruise * this.speedScale, 8.5, 22);
        this.activeCity++;
      }
    }
  }

  private stepHighwayPool(g: Game): void {
    // Clean stale entries whose vehicles were stolen/wrecked/removed
    for (let i = g.hwCars.length - 1; i >= 0; i--) {
      const hc = g.hwCars[i];
      if (hc.v.mode !== 'hw' || !g.vehicles.includes(hc.v)) {
        g.hwCars.splice(i, 1);
      }
    }

    // Retire excess highway vehicles gracefully when offscreen during low-traffic hours
    while (g.hwCars.length > this.targetHighway) {
      const candidateIdx = g.hwCars.findIndex(
        (hc) =>
          Math.hypot(hc.v.x - g.playerX, hc.v.z - g.playerZ) > 175 &&
          !g.inView(hc.v.x, hc.v.z, 6),
      );
      if (candidateIdx < 0) break;
      const [removed] = g.hwCars.splice(candidateIdx, 1);
      removeVehicle(g, removed.v);
    }

    // Spawn additional highway commuters/cruisers during peak rush hours
    let budget = 2;
    while (g.hwCars.length < this.targetHighway && budget-- > 0) {
      const elevated = g.hwCars.filter((h) => h.elevated).length <= g.hwCars.length * 0.55;
      const pts = elevated ? RING_PTS : BELT_PTS;
      const seg = Math.floor(Math.random() * pts.length);
      const a = pts[seg];
      const b = pts[(seg + 1) % pts.length];
      const t = 0.1 + Math.random() * 0.8;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      const dist = Math.hypot(x - g.playerX, z - g.playerZ);
      if (dist < 110 && g.inView(x, z, 6)) continue;
      let clear = true;
      for (const o of g.vehicles) {
        if (Math.hypot(o.x - x, o.z - z) < 18) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      const vt = pickTrafficVehicleType(g.hour, Math.random, true);
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const v = g.spawnVehicle(vt, x, z, yaw, {
        mode: 'hw',
        tag: elevated ? 'hw' : 'hw-outer',
        driver: 'civ',
      });
      v.y = elevated ? DECK.H : groundHeight(x, z);
      v.lightsOn = g.night > 0.4;
      const baseSpeed = elevated ? 20 + Math.random() * 9 : 26 + Math.random() * 11;
      g.hwCars.push({
        v,
        pts,
        i: (seg + 1) % pts.length,
        speed: baseSpeed * this.speedScale,
        elevated,
      });
    }

    this.activeHighway = g.hwCars.length;
  }
}
