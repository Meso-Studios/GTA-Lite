// Pure time-of-day traffic density, signal-wave, district-multiplier, and vehicle-mix functions.
import { clampVal } from './terrain';

export type TrafficPeriod =
  | 'Late Night Lull'
  | 'Morning Rush'
  | 'Midday Flow'
  | 'Evening Rush'
  | 'Nightlife Cruise';

export type AmbientTrafficVehicleType =
  | 'sedan'
  | 'suv'
  | 'sports'
  | 'pickup'
  | 'taxi'
  | 'van'
  | 'police';

export interface TrafficDensityParams {
  hour: number;
  baseCap: number;
  simTime: number;
  waveSeed?: number;
  districtFactor?: number;
}

export interface TrafficDensityResult {
  targetCity: number;
  targetHighway: number;
  densityRatio: number;
  period: TrafficPeriod;
  speedScale: number;
}

function wrapHour(hour: number): number {
  const h = hour % 24;
  return h < 0 ? h + 24 : h;
}

function gaussianPeak(h: number, center: number, width: number): number {
  let d = Math.abs(h - center);
  if (d > 12) d = 24 - d;
  return Math.exp(-(d * d) / (2 * width * width));
}

/**
 * Computes realistic diurnal traffic intensity:
 * - Deep lull around 02:30–04:30 (~0.28)
 * - Morning commuter rush around 08:15 (~1.28)
 * - Steady midday commercial flow (~0.92)
 * - Heavy evening rush around 17:45 (~1.42)
 * - Vibrant nightlife strip cruise around 22:00 (~0.88)
 */
export function computeTimeOfDayFactor(hour: number): number {
  const h = wrapHour(hour);
  const base = 0.24;
  const morningRush = 1.04 * gaussianPeak(h, 8.25, 1.75);
  const midday = 0.68 * gaussianPeak(h, 12.8, 2.7);
  const eveningRush = 1.18 * gaussianPeak(h, 17.75, 1.9);
  const nightlife = 0.64 * gaussianPeak(h, 22.1, 1.9);
  return clampVal(base + morningRush + midday * 0.42 + eveningRush + nightlife, 0.24, 1.52);
}

/** Multi-harmonic stochastic wave modeling signal platoons & random traffic surges. */
export function computeTrafficWave(simTime: number, seed = 17): number {
  const s = seed * 0.6180339;
  const w1 = Math.sin(simTime * 0.11 + s);
  const w2 = Math.sin(simTime * 0.29 + s * 2.3) * 0.55;
  const w3 = Math.cos(simTime * 0.053 - s * 1.4) * 0.45;
  const combined = (w1 + w2 + w3) / 2.0;
  return clampVal(1.0 + combined * 0.22, 0.76, 1.26);
}

export function getTrafficPeriodLabel(hour: number): TrafficPeriod {
  const h = wrapHour(hour);
  if (h >= 1.5 && h < 6.0) return 'Late Night Lull';
  if (h >= 6.0 && h < 10.5) return 'Morning Rush';
  if (h >= 10.5 && h < 15.75) return 'Midday Flow';
  if (h >= 15.75 && h < 20.5) return 'Evening Rush';
  return 'Nightlife Cruise';
}

export function getDistrictTrafficMultiplier(district: string): number {
  const d = district.toUpperCase();
  if (d.includes('DOWNTOWN') || d.includes('FINANCIAL')) return 1.2;
  if (d.includes('OCEAN BEACH') || d.includes('HAVANA') || d.includes('WYNWOOD')) return 1.12;
  if (d.includes('AIRPORT')) return 0.92;
  if (d.includes('INDUSTRIAL') || d.includes('PORT')) return 0.96;
  if (d.includes('DUNES') || d.includes('OBSERVATORY')) return 0.54;
  return 1.0;
}

export function computeTrafficDensity(opts: TrafficDensityParams): TrafficDensityResult {
  const h = wrapHour(opts.hour);
  const tod = computeTimeOfDayFactor(h);
  const wave = computeTrafficWave(opts.simTime, opts.waveSeed ?? 19);
  const df = clampVal(opts.districtFactor ?? 1.0, 0.4, 1.35);
  const densityRatio = clampVal(tod * wave * df, 0.22, 1.72);
  const targetCity = clampVal(Math.round(opts.baseCap * densityRatio), 4, Math.max(8, Math.round(opts.baseCap * 1.7)));
  const targetHighway = clampVal(Math.round(12 * densityRatio), 4, 24);
  const period = getTrafficPeriodLabel(h);
  const speedScale = clampVal(1.16 - densityRatio * 0.22, 0.78, 1.24);
  return { targetCity, targetHighway, densityRatio, period, speedScale };
}

/** Picks an ambient vehicle class biased by time of day (delivery vans at noon, exotics at night, patrol cars at 3 AM). */
export function pickTrafficVehicleType(
  hour: number,
  rand: () => number = Math.random,
  noPolice = false,
): AmbientTrafficVehicleType {
  const h = wrapHour(hour);
  const isNight = h >= 20.5 || h < 5.5;
  const isRush = (h >= 6.5 && h < 10) || (h >= 16 && h < 19.5);
  const isMidday = h >= 10 && h < 16;

  const weights: [AmbientTrafficVehicleType, number][] = [
    ['sedan', isRush ? 38 : 30],
    ['suv', isRush ? 18 : 14],
    ['sports', isNight ? 18 : isMidday ? 7 : 10],
    ['pickup', isMidday ? 16 : isNight ? 7 : 11],
    ['taxi', isNight ? 19 : isRush ? 15 : 12],
    ['van', isMidday ? 16 : isNight ? 4 : 8],
    ['police', noPolice ? 0 : h >= 1 && h < 5.5 ? 14 : isNight ? 9 : 6],
  ];

  let total = 0;
  for (const [, w] of weights) total += w;
  let r = rand() * total;
  for (const [t, w] of weights) {
    if (w <= 0) continue;
    r -= w;
    if (r <= 0) return t;
  }
  return 'sedan';
}
