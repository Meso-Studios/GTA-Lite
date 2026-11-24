// Pure acoustic mixing math: natural conversational voice attenuation & smooth environmental ambience targets.

export interface AmbienceContext {
  indoor: boolean;
  indoorKind: string | null;
  distToOcean: number; // meters from coastline/bay (0 = right on beach/water)
  inDunes: boolean;
  speedMps: number;
  altitudeM: number;
  night01: number; // 0 = day, 1 = deep night
  voiceActive: boolean;
  inVehicle: boolean;
}

export interface AmbienceGains {
  cityHum: number;
  wind: number;
  ocean: number;
  night: number;
  roomTone: number;
  crowdMurmur: number;
  ducking: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Computes natural conversational voice volume with realistic inverse-distance rolloff.
 * Capped well below clipping so voices sit comfortably inside the ambient soundscape
 * rather than blasting over footsteps, engines, and room tone.
 */
export function computeNaturalVoiceVolume(
  distanceMeters: number,
  masterVolume = 0.7,
  isIndoor = false,
  priority = false,
): number {
  const mv = clamp01(masterVolume);
  const maxDist = isIndoor ? 18 : 24;
  if (mv <= 0.001 || distanceMeters >= maxDist) return 0;

  const d = Math.max(0, distanceMeters);
  // Smooth physical rolloff with cosine taper to exact 0 at maxDist (no abrupt cutoff floor)
  const refDist = isIndoor ? 4.2 : 5.5;
  const invLaw = 1 / (1 + Math.pow(d / refDist, 1.55));
  const edgeFade = Math.cos((d / maxDist) * (Math.PI * 0.5));
  const raw = invLaw * Math.max(0, edgeFade);

  // Natural conversational ceiling: ~0.46 at 1m for ambient NPCs, ~0.54 for story priority
  const ceiling = priority ? 0.54 : isIndoor ? 0.42 : 0.46;
  return clamp01(raw * ceiling * mv);
}

/**
 * Computes smooth target gains for every environmental ambience layer.
 * Audio engine applies exponential smoothing (0.7-1.4s) toward these targets so
 * walking indoors, approaching the beach, or hearing an NPC speak fades seamlessly.
 */
export function computeAmbienceTargets(ctx: AmbienceContext): AmbienceGains {
  const night = clamp01(ctx.night01);
  const day = 1 - night;
  const ducking = ctx.voiceActive ? 0.72 : 1.0;
  const cabinMuffle = ctx.inVehicle ? 0.48 : 1.0;

  if (ctx.indoor) {
    const kind = ctx.indoorKind ?? 'shop';
    const busy =
      kind === 'diner'
        ? 1.0
        : kind === 'shop' || kind === 'bank'
          ? 0.72
          : kind === 'hospital' || kind === 'office' || kind === 'police'
            ? 0.5
            : kind === 'gun' || kind === 'garage'
              ? 0.34
              : 0.16; // apartment: quiet cozy room
    return {
      cityHum: 0.012 * ducking, // faint muffled street rumble through glass
      wind: 0,
      ocean: 0,
      night: 0,
      roomTone: (0.048 + (kind === 'hospital' || kind === 'office' ? 0.014 : 0)) * ducking,
      crowdMurmur: 0.072 * busy * ducking,
      ducking,
    };
  }

  // Outdoor soundscape: urban hum, coastal surf, breeze/wind, and subtropical night air
  const oceanProx = clamp01(1 - Math.max(0, ctx.distToOcean) / 420);
  const speedWind = clamp01((ctx.speedMps - 8) / 38);
  const altWind = clamp01(Math.max(0, ctx.altitudeM - 12) / 90);
  const duneWind = ctx.inDunes ? 0.35 : 0;

  const cityHum = (0.044 * (0.45 + 0.55 * day) * (1 - oceanProx * 0.4) * (ctx.inDunes ? 0.25 : 1)) * cabinMuffle * ducking;
  const wind = (0.022 + 0.068 * Math.max(speedWind, altWind, duneWind)) * cabinMuffle * ducking;
  const ocean = 0.078 * Math.pow(oceanProx, 1.35) * cabinMuffle * ducking;
  const nightAmb = 0.036 * Math.pow(night, 1.2) * (1 - speedWind * 0.6) * cabinMuffle * ducking;

  return {
    cityHum,
    wind,
    ocean,
    night: nightAmb,
    roomTone: 0,
    crowdMurmur: 0,
    ducking,
  };
}
