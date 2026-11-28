// Procedural articulated humans (vertex-coloured, shared geometry per look) + 14 weapon 3D models.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, clamp } from './config';
import { box, capsule, cyl, finish, sph } from './geo';
import { makeContactShadow } from './textures';
import {
  cloneHumanGlbPart,
  cloneSiteCharacterGlb,
  disposeSiteCharacterGlb,
  isGlbWorldMode,
  updateSiteCharacterGlb,
  type SiteCharacterInstance,
} from './glbAssets';
import { microtextures } from './microtextures';
import { evaluateAnimationPose, selectContextAnimation } from './animations';
import {
  type BareHandMove,
  type MotionAnimState,
  createMotionAnimState,
  evaluateBareHandPose,
  evaluateOrganicMotionOverlay,
  stepMotionSubAnim,
} from './subAnimations';
import {
  type BodyIntentKind,
  type NeuroBodyState,
  createNeuroBodyState,
  stepNeuroBody,
} from './neuroBodyEngine';

export interface Look {
  gender: 'm' | 'f';
  skin: number;
  hair: number;
  hairStyle: 'short' | 'long' | 'bald' | 'afro' | 'pony' | 'bun' | 'crew';
  top: number;
  topStyle: 'tee' | 'long' | 'jacket' | 'suit' | 'tank' | 'uniform' | 'hawaiian';
  bottom: number;
  bottomStyle: 'jeans' | 'shorts' | 'skirt' | 'suit';
  shoe: number;
  build: number;
  eyeColor?: number;
  beard?: boolean;
  glasses?: boolean;
  hat?: 'cap' | 'police' | 'fedora' | 'beanie' | 'hardhat' | 'sunhat' | 'visor';
  hatColor?: number;
  tie?: number;
  bag?: number;
  camera?: boolean;
  height: number;
}

const SKINS = [0xf4cfb0, 0xe5b28b, 0xca8b4c, 0x945b2c, 0x623f25, 0xffdfba, 0xdba36b];
const HAIRS = [0x15110e, 0x2b1d14, 0x4a3020, 0x7a5230, 0xb08a4a, 0xd9c28a, 0x7a2e1c, 0x888888, 0x0a0a0a];
const EYES = [0x4a3b2a, 0x2c5e7a, 0x3a6b48, 0x2a1f16, 0x5c4328];
const TOPS = [0xc0392b, 0x2980b9, 0x27ae60, 0xf1c40f, 0xecf0f1, 0x8e44ad, 0xe67e22, 0x34495e, 0x16a085, 0xd35400, 0x95a5a6, 0xff6b9d, 0x1f2937, 0xfafafa];
const TROPICAL_TOPS = [0xff5e78, 0x00b4d8, 0xffb703, 0x2ec4b6, 0xfb8500, 0xff70a6, 0x52b788, 0x4cc9f0];
const BOTTOMS = [0x2c3e50, 0x34495e, 0x1c2833, 0x5d6d7e, 0x7f8c8d, 0x3b2f2f, 0x6e5a3c, 0x111111, 0x435a7a];
const SHOES = [0x111111, 0xf5f5f5, 0x3b2a1a, 0x8b1a1a, 0x1d3557];

export function civilianLook(r: Rng): Look {
  const gender = r.chance(0.48) ? 'f' : 'm';
  const topStyle = r.pick(['tee', 'tee', 'long', 'jacket', 'tank', 'suit'] as const);
  return {
    gender,
    skin: r.pick(SKINS),
    hair: r.pick(HAIRS),
    eyeColor: r.pick(EYES),
    hairStyle: gender === 'f' ? r.pick(['long', 'long', 'pony', 'bun', 'short'] as const) : r.pick(['short', 'short', 'crew', 'bald', 'afro'] as const),
    top: topStyle === 'suit' ? r.pick([0x1b1f2a, 0x2b2b2b, 0x39424e, 0x4a3b32]) : r.pick(TOPS),
    topStyle,
    bottom: r.pick(BOTTOMS),
    bottomStyle: topStyle === 'suit' ? 'suit' : gender === 'f' && r.chance(0.35) ? 'skirt' : r.chance(0.22) ? 'shorts' : 'jeans',
    shoe: r.pick(SHOES),
    build: r.range(0.9, 1.14),
    beard: gender === 'm' && r.chance(0.22),
    glasses: r.chance(0.2),
    hat: r.chance(0.17) ? r.pick(['cap', 'beanie', 'fedora'] as const) : undefined,
    hatColor: r.pick(TOPS),
    tie: topStyle === 'suit' && gender === 'm' ? r.pick([0xa11, 0x1133aa, 0x222222]) : undefined,
    bag: r.chance(0.16) ? r.pick([0x2d3436, 0x5d4037, 0x1e3799, 0x3c6382]) : undefined,
    height: gender === 'f' ? r.range(0.9, 1.0) : r.range(0.97, 1.08),
  };
}

export function touristLook(r: Rng): Look {
  const gender = r.chance(0.52) ? 'f' : 'm';
  const topStyle = r.pick(['hawaiian', 'hawaiian', 'tank', 'tee'] as const);
  return {
    gender,
    skin: r.pick(SKINS),
    hair: r.pick(HAIRS),
    eyeColor: r.pick(EYES),
    hairStyle: gender === 'f' ? r.pick(['long', 'pony', 'bun', 'short'] as const) : r.pick(['short', 'crew', 'bald'] as const),
    top: r.pick(TROPICAL_TOPS),
    topStyle,
    bottom: r.pick([0xc8b288, 0xd8c8a2, 0x355c7d, 0xf5f5f5, 0x4a6b82, 0x2b4162]),
    bottomStyle: gender === 'f' && r.chance(0.45) ? 'skirt' : 'shorts',
    shoe: r.pick([0xf5f5f5, 0xc29b61, 0x2a9d8f, 0xe76f51]),
    build: r.range(0.92, 1.15),
    beard: gender === 'm' && r.chance(0.15),
    glasses: r.chance(0.68),
    hat: r.chance(0.58) ? r.pick(['sunhat', 'sunhat', 'visor', 'cap'] as const) : undefined,
    hatColor: r.pick([0xe3c88e, 0xd9b878, 0xf5f5f0, 0x00b4d8, 0xff6b6b]),
    bag: r.chance(0.42) ? r.pick([0xe76f51, 0x2a9d8f, 0x264653, 0xe9c46a]) : undefined,
    camera: r.chance(0.52),
    height: gender === 'f' ? r.range(0.91, 1.01) : r.range(0.97, 1.07),
  };
}

export function beachgoerLook(r: Rng): Look {
  const gender = r.chance(0.55) ? 'f' : 'm';
  return {
    gender,
    skin: r.pick(SKINS),
    hair: r.pick(HAIRS),
    eyeColor: r.pick(EYES),
    hairStyle: gender === 'f' ? r.pick(['long', 'pony', 'bun'] as const) : r.pick(['short', 'crew', 'afro'] as const),
    top: r.pick([0xff5e78, 0x48cae4, 0xffd166, 0x06d6a0, 0xf77f00, 0xffffff]),
    topStyle: 'tank',
    bottom: r.pick([0x00b4d8, 0xff595e, 0xffca3a, 0x1982c4, 0x2ec4b6, 0x222222]),
    bottomStyle: 'shorts',
    shoe: r.pick([0xc29b61, 0x00b4d8, 0xff6b6b]),
    build: r.range(0.9, 1.08),
    glasses: r.chance(0.75),
    hat: r.chance(0.45) ? r.pick(['sunhat', 'visor', 'cap'] as const) : undefined,
    hatColor: r.pick([0xe6cc94, 0xf7e3b2, 0xffffff, 0xff6b6b]),
    camera: r.chance(0.22),
    height: gender === 'f' ? r.range(0.91, 1.0) : r.range(0.98, 1.07),
  };
}

export function copLook(r: Rng): Look {
  return {
    gender: r.chance(0.2) ? 'f' : 'm', skin: r.pick(SKINS), hair: r.pick(HAIRS), eyeColor: r.pick(EYES), hairStyle: 'crew',
    top: 0x1e3a6e, topStyle: 'uniform', bottom: 0x15233f, bottomStyle: 'jeans', shoe: 0x0b0b0b,
    build: r.range(1.0, 1.15), hat: 'police', hatColor: 0x14213d, glasses: r.chance(0.4), height: r.range(1.0, 1.08),
  };
}
export function gangLook(r: Rng, color: number): Look {
  return {
    gender: 'm', skin: r.pick(SKINS), hair: r.pick(HAIRS), eyeColor: r.pick(EYES), hairStyle: r.pick(['crew', 'bald', 'short'] as const),
    top: color, topStyle: r.pick(['jacket', 'long', 'tee'] as const), bottom: r.pick([0x111111, 0x2c3e50, 0x333333]),
    bottomStyle: 'jeans', shoe: 0xf5f5f5, build: r.range(1.05, 1.2), beard: r.chance(0.4), glasses: r.chance(0.5),
    hat: r.chance(0.4) ? 'beanie' : undefined, hatColor: 0x111111, height: r.range(1.0, 1.1),
  };
}
export function guardLook(r: Rng): Look {
  return {
    gender: 'm', skin: r.pick(SKINS), hair: r.pick(HAIRS), eyeColor: r.pick(EYES), hairStyle: 'crew', top: 0x3a3f46, topStyle: 'uniform',
    bottom: 0x23262b, bottomStyle: 'jeans', shoe: 0x0b0b0b, build: 1.15, glasses: true, hat: 'cap', hatColor: 0x23262b, height: 1.06,
  };
}
export const PLAYER_LOOK: Look = {
  gender: 'm', skin: 0xd9a066, hair: 0x15110e, eyeColor: 0x2c4a3e, hairStyle: 'short', top: 0x2f5d50, topStyle: 'jacket',
  bottom: 0x2c3e50, bottomStyle: 'jeans', shoe: 0xf5f5f5, build: 1.06, beard: true, height: 1.04,
};
export const TARGET_LOOK: Look = {
  gender: 'm', skin: 0xe0ac86, hair: 0x888888, eyeColor: 0x3a4a5a, hairStyle: 'short', top: 0xf5f5f0, topStyle: 'suit',
  bottom: 0xf5f5f0, bottomStyle: 'suit', shoe: 0x3b2a1a, build: 1.15, glasses: true, hat: 'fedora', hatColor: 0xf5f5f0, tie: 0xaa1111, height: 1.04,
};

export function blueShirtGuyLook(r: Rng): Look {
  return {
    gender: 'm', skin: 0xf0c49b, hair: r.pick([0x2b1d14, 0x3a2618]), eyeColor: 0x355c7d, hairStyle: 'short',
    top: 0x3da9fc, topStyle: 'suit', bottom: 0x9c896c, bottomStyle: 'jeans', shoe: 0x3b2a1a,
    build: 1.02, tie: 0x1e3a5f, glasses: false, height: 1.02,
  };
}
export function baristaLook(r: Rng): Look {
  return {
    gender: r.chance(0.55) ? 'f' : 'm', skin: r.pick(SKINS), hair: r.pick(HAIRS), eyeColor: r.pick(EYES),
    hairStyle: r.chance(0.5) ? 'bun' : 'short', top: r.pick([0x3a5a40, 0x2d4a36]), topStyle: 'tee',
    bottom: 0x1c2228, bottomStyle: 'jeans', shoe: 0x151515, build: 0.96, hat: 'cap', hatColor: 0x2b4030, height: 0.98,
  };
}
export function doctorLook(r: Rng): Look {
  const gender = r.chance(0.45) ? 'f' : 'm';
  return {
    gender, skin: r.pick(SKINS), hair: r.pick(HAIRS), eyeColor: r.pick(EYES),
    hairStyle: gender === 'f' ? r.pick(['bun', 'pony', 'short'] as const) : r.pick(['short', 'crew'] as const),
    top: 0xf4f7fa, topStyle: 'jacket', bottom: 0x2a7b78, bottomStyle: 'suit', shoe: 0xeaeef2,
    build: r.range(0.95, 1.08), glasses: r.chance(0.55), tie: 0x246a73, height: gender === 'f' ? 0.96 : 1.03,
  };
}
export function nurseLook(r: Rng): Look {
  const gender = r.chance(0.68) ? 'f' : 'm';
  return {
    gender, skin: r.pick(SKINS), hair: r.pick(HAIRS), eyeColor: r.pick(EYES),
    hairStyle: gender === 'f' ? r.pick(['pony', 'bun', 'short'] as const) : 'crew',
    top: r.pick([0x38a3a5, 0x4ea8de]), topStyle: 'uniform', bottom: 0x2b7a78, bottomStyle: 'jeans', shoe: 0xf2f4f7,
    build: r.range(0.92, 1.04), glasses: r.chance(0.25), height: gender === 'f' ? 0.95 : 1.02,
  };
}
export function chefLook(r: Rng): Look {
  const gender = r.chance(0.35) ? 'f' : 'm';
  return {
    gender, skin: r.pick(SKINS), hair: r.pick(HAIRS), eyeColor: r.pick(EYES),
    hairStyle: gender === 'f' ? 'bun' : 'crew',
    top: 0xfafafa, topStyle: 'uniform', bottom: 0x1c2026, bottomStyle: 'jeans', shoe: 0x14161a,
    build: r.range(0.98, 1.14), hat: 'cap', hatColor: 0xffffff, height: gender === 'f' ? 0.96 : 1.04,
  };
}
export function serverLook(r: Rng): Look {
  const gender = r.chance(0.55) ? 'f' : 'm';
  return {
    gender, skin: r.pick(SKINS), hair: r.pick(HAIRS), eyeColor: r.pick(EYES),
    hairStyle: gender === 'f' ? r.pick(['pony', 'long', 'bun'] as const) : 'short',
    top: 0xf2f4f8, topStyle: 'tee', bottom: 0x1c2129, bottomStyle: 'suit', shoe: 0x14161a,
    build: r.range(0.92, 1.05), tie: 0x9b2626, height: gender === 'f' ? 0.95 : 1.02,
  };
}
export function attendantLook(r: Rng): Look {
  const gender = r.chance(0.3) ? 'f' : 'm';
  return {
    gender, skin: r.pick(SKINS), hair: r.pick(HAIRS), eyeColor: r.pick(EYES),
    hairStyle: 'crew',
    top: 0xe6b81e, topStyle: 'uniform', bottom: 0x1d2c42, bottomStyle: 'jeans', shoe: 0x121418,
    build: r.range(0.98, 1.1), hat: 'cap', hatColor: 0x1d2c42, glasses: r.chance(0.35), height: 1.02,
  };
}
export function bankTellerLook(r: Rng): Look {
  return {
    gender: r.chance(0.4) ? 'f' : 'm', skin: r.pick(SKINS), hair: r.pick(HAIRS), eyeColor: r.pick(EYES),
    hairStyle: 'crew', top: 0x8fb8de, topStyle: 'suit', bottom: 0x242c38, bottomStyle: 'suit',
    shoe: 0x111111, build: 1.0, tie: 0x20355a, glasses: r.chance(0.45), height: 1.0,
  };
}
export function influencerLook(r: Rng): Look {
  return {
    gender: r.chance(0.65) ? 'f' : 'm', skin: r.pick(SKINS), hair: r.pick(HAIRS), eyeColor: r.pick(EYES),
    hairStyle: r.chance(0.6) ? 'long' : 'pony', top: r.pick(TROPICAL_TOPS), topStyle: 'jacket',
    bottom: r.pick([0xf2f4f7, 0x2b2d42]), bottomStyle: 'shorts', shoe: 0xf5f5f5,
    build: 0.94, glasses: true, camera: true, height: 0.99,
  };
}

interface Parts {
  torso: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  upperArm: THREE.BufferGeometry;
  foreArm: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  sw: number;
  hw: number;
}
const cache = new Map<string, Parts>();
const M = (list: THREE.BufferGeometry[]) => mergeGeometries(list, false)!;

function tintOf(hex: number, k: number) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k);
  return c.getHex();
}

interface FaceParts { head: THREE.BufferGeometry[]; hair: THREE.BufferGeometry[] }

function buildFace(L: Look): FaceParts {
  const f = L.gender === 'f';
  const skin = L.skin, lipCol = f ? tintOf(skin, 0.72) : tintOf(skin, 0.8);
  const hc = L.hair;
  const iris = L.eyeColor ?? (f ? 0x4a3b2a : 0x35291c);
  const h: THREE.BufferGeometry[] = [];
  const hair: THREE.BufferGeometry[] = [];
  const hy = 0.115;
  // cranium + mid-face + jaw
  h.push(sph(1, 0, hy + 0.01, 0, skin, 0.094, 0.12, 0.106, 18));
  h.push(sph(1, 0, hy - 0.035, 0.012, skin, 0.088, 0.098, 0.1, 16));
  h.push(sph(1, 0, hy - 0.075, 0.018, tintOf(skin, 0.97), 0.071, 0.06, 0.084, 14));
  h.push(sph(1, 0, hy - 0.1, 0.03, skin, 0.05, 0.03, 0.055, 12)); // chin
  for (const s of [-1, 1]) {
    h.push(sph(1, s * 0.06, hy + 0.005, 0.045, tintOf(skin, 1.015), 0.035, 0.04, 0.048, 10)); // cheekbone
    h.push(sph(1, s * 0.086, hy + 0.005, -0.005, tintOf(skin, 0.94), 0.014, 0.033, 0.023, 10)); // ear
    h.push(sph(1, s * 0.088, hy + 0.004, 0.006, tintOf(skin, 0.8), 0.007, 0.019, 0.011, 8)); // ear inner
    h.push(box(0.03, 0.045, 0.03, s * 0.028, hy - 0.075, 0.065, tintOf(skin, 0.96), s * 0.35)); // jawline
  }
  // brow ridge + brows
  h.push(sph(1, 0, hy + 0.048, 0.085, tintOf(skin, 1.0), 0.077, 0.014, 0.03, 12));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      h.push(box(0.017, 0.006, 0.009, s * (0.024 + i * 0.014), hy + 0.052 + i * 0.002, 0.098 - i * 0.006, hc, s * 0.16));
    }
  }
  // eyes
  for (const s of [-1, 1]) {
    const ex = s * 0.036;
    h.push(sph(1, ex, hy + 0.027, 0.088, 0xf4efe8, 0.0195, 0.0145, 0.011, 14));
    h.push(sph(1, ex, hy + 0.027, 0.0985, iris, 0.0095, 0.0095, 0.004, 12));
    h.push(sph(1, ex, hy + 0.027, 0.1012, 0x080808, 0.0046, 0.0046, 0.0022, 10));
    h.push(sph(1, ex - 0.003, hy + 0.031, 0.1028, 0xffffff, 0.0018, 0.0018, 0.001, 6));
    // lids
    h.push(sph(1, ex, hy + 0.037, 0.089, skin, 0.021, 0.0105, 0.013, 12));
    h.push(sph(1, ex, hy + 0.0155, 0.0885, tintOf(skin, 0.95), 0.0205, 0.006, 0.011, 10));
    if (f) h.push(box(0.028, 0.004, 0.008, ex, hy + 0.0405, 0.096, 0x1a1410, 0, 0, s * 0.1));
  }
  // nose
  h.push(box(0.02, 0.045, 0.022, 0, hy + 0.004, 0.088, skin, 0, 0.12));
  h.push(sph(1, 0, hy - 0.012, 0.104, tintOf(skin, 1.03), 0.022, 0.019, 0.022, 12));
  for (const s of [-1, 1]) {
    h.push(sph(1, s * 0.019, hy - 0.018, 0.099, tintOf(skin, 0.98), 0.012, 0.011, 0.013, 10));
    h.push(sph(1, s * 0.0115, hy - 0.026, 0.104, 0x3a2418, 0.0045, 0.0035, 0.003, 6));
  }
  // lips + philtrum
  h.push(box(0.012, 0.024, 0.012, 0, hy - 0.034, 0.097, skin));
  h.push(sph(1, 0, hy - 0.056, 0.098, lipCol, 0.026, 0.0085, 0.011, 12));
  h.push(sph(1, 0, hy - 0.068, 0.096, tintOf(lipCol, 1.08), 0.023, 0.0095, 0.011, 12));
  h.push(box(0.043, 0.0035, 0.008, 0, hy - 0.062, 0.103, tintOf(lipCol, 0.55)));
  if (f) h.push(box(0.045, 0.004, 0.008, 0, hy - 0.054, 0.103, tintOf(lipCol, 1.1)));
  // stubble / beard
  if (L.beard) {
    h.push(sph(1, 0, hy - 0.078, 0.03, tintOf(hc, 0.9), 0.074, 0.055, 0.082, 14));
    h.push(box(0.026, 0.032, 0.012, 0, hy - 0.06, 0.086, tintOf(hc, 0.9)));
    for (const s of [-1, 1]) h.push(box(0.012, 0.03, 0.06, s * 0.075, hy - 0.045, 0.03, tintOf(hc, 0.95)));
  } else {
    for (let i = 0; i < 6; i++) h.push(sph(1, (i - 2.5) * 0.011, hy - 0.088, 0.07, tintOf(skin, 0.93), 0.008, 0.004, 0.006, 6));
  }
  if (f && L.topStyle !== 'tank') {
    for (const s of [-1, 1]) h.push(cyl(0.005, 0.005, 0.012, s * 0.09, hy - 0.02, 0.0, 0xd9b84a, 6));
  }
  // neck + collarbones
  h.push(cyl(0.05, 0.06, 0.11, 0, hy - 0.22, 0.002, skin, 12));
  h.push(sph(1, 0, hy - 0.2, 0.048, tintOf(skin, 1.02), 0.055, 0.025, 0.03, 10));
  // ---------- hair
  const cap = (r: number, sy: number, rz: number, yOff = 0.045, z = -0.014) => sph(1, 0, hy + yOff, z, hc, 0.1 * r, 0.1 * sy, 0.114 * rz, 14);
  const lock = (x: number, y: number, z: number, w: number, hh: number, d: number, _rx = 0, rz = 0) => box(w, hh, d, x, y, z, tintOf(hc, 0.94), 0, _rx, rz);
  if (L.hairStyle === 'bald') {
    hair.push(sph(1, 0, hy - 0.02, -0.005, tintOf(skin, 0.9), 0.092, 0.06, 0.1, 12));
  } else {
    // Smooth contoured cranial hair cap + layered rounded tufts (zero jagged protruding boxes)
    const isCrew = L.hairStyle === 'crew';
    hair.push(cap(1.03, isCrew ? 0.78 : 0.95, 1.03, 0.044, -0.012));
    hair.push(sph(1, 0, hy + (isCrew ? 0.072 : 0.092), -0.008, tintOf(hc, 1.04), 0.094, isCrew ? 0.042 : 0.058, 0.108, 14));
    // Smooth tapered back & side fade hugging the skull cleanly
    hair.push(sph(1, 0, hy + 0.008, -0.048, tintOf(hc, 0.92), 0.094, 0.088, 0.082, 14));
    for (const s of [-1, 1]) {
      hair.push(sph(1, s * 0.072, hy + 0.028, -0.006, tintOf(hc, 0.95), 0.038, 0.068, 0.084, 12));
    }
    // Soft sculpted hairline fringe
    hair.push(sph(1, 0, hy + 0.062, 0.066, tintOf(hc, 0.98), 0.078, 0.036, 0.048, 12));
    if (!isCrew) {
      hair.push(sph(1, -0.032, hy + 0.088, 0.038, tintOf(hc, 1.05), 0.056, 0.034, 0.068, 12));
      hair.push(sph(1, 0.034, hy + 0.084, 0.028, tintOf(hc, 0.96), 0.054, 0.032, 0.064, 12));
    }
  }
  if (L.hairStyle === 'long') {
    hair.push(sph(1, 0, hy - 0.09, -0.075, hc, 0.095, 0.2, 0.062, 14));
    for (const s of [-1, 1]) {
      hair.push(lock(s * 0.088, hy - 0.09, 0.015, 0.034, 0.24, 0.06, 0, s * 0.12));
      hair.push(lock(s * 0.078, hy + 0.01, 0.075, 0.04, 0.16, 0.04, 0.06, s * 0.16));
    }
    for (let i = 0; i < 6; i++) hair.push(lock(((i - 2.5) / 5) * 0.14, hy - 0.2, -0.06, 0.045, 0.16, 0.04, 0.1, (i - 2.5) * 0.05));
  } else if (L.hairStyle === 'pony') {
    hair.push(sph(1, 0, hy + 0.07, -0.03, hc, 0.075, 0.055, 0.08, 12));
    for (const i of [0, 1, 2, 3]) hair.push(sph(1 - i * 0.13, 0, hy + 0.02 - i * 0.06, -0.13 - i * 0.012, hc, 0.055 - i * 0.008, 0.05, 0.045, 10));
    hair.push(cyl(0.012, 0.012, 0.02, 0, hy + 0.035, -0.115, 0x222222, 6));
  } else if (L.hairStyle === 'bun') {
    hair.push(sph(1, 0, hy + 0.14, -0.05, hc, 0.058, 0.05, 0.058, 14));
    hair.push(cyl(0.05, 0.05, 0.018, 0, hy + 0.19, -0.05, tintOf(hc, 0.8), 12));
  } else if (L.hairStyle === 'afro') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      hair.push(sph(1, Math.cos(a) * 0.075, hy + 0.11 + Math.sin(a) * 0.05, -0.015 + Math.sin(a) * 0.06, hc, 0.062, 0.055, 0.06, 12));
    }
    hair.push(sph(1, 0, hy + 0.15, -0.02, hc, 0.085, 0.06, 0.09, 14));
  }
  if (L.glasses) {
    for (const s of [-1, 1]) {
      hair.push(box(0.052, 0.034, 0.006, s * 0.036, hy + 0.02, 0.107, 0x101010));
      hair.push(box(0.036, 0.026, 0.003, s * 0.036, hy + 0.02, 0.109, 0x2a3a44));
      hair.push(box(0.006, 0.006, 0.07, s * 0.083, hy + 0.024, 0.06, 0x101010));
    }
    hair.push(box(0.03, 0.006, 0.006, 0, hy + 0.03, 0.107, 0x101010));
  }
  const hatC = L.hatColor ?? 0x222222;
  if (L.hat === 'cap') {
    hair.push(sph(1, 0, hy + 0.072, 0, hatC, 0.106, 0.075, 0.114, 16));
    hair.push(box(0.155, 0.013, 0.1, 0, hy + 0.06, 0.115, hatC, 0, -0.06));
    hair.push(box(0.155, 0.008, 0.1, 0, hy + 0.055, 0.117, tintOf(hatC, 0.7)));
  } else if (L.hat === 'police') {
    hair.push(cyl(0.11, 0.1, 0.062, 0, hy + 0.1, 0, hatC, 16));
    hair.push(box(0.162, 0.013, 0.095, 0, hy + 0.1, 0.1, 0x0a0a0a));
    hair.push(box(0.03, 0.03, 0.01, 0, hy + 0.12, 0.108, 0xd9b84a));
    hair.push(cyl(0.108, 0.108, 0.012, 0, hy + 0.125, 0, tintOf(hatC, 1.3), 16));
  } else if (L.hat === 'fedora') {
    hair.push(cyl(0.168, 0.168, 0.012, 0, hy + 0.082, 0, hatC, 18));
    hair.push(cyl(0.09, 0.103, 0.1, 0, hy + 0.085, 0, hatC, 16));
    hair.push(cyl(0.104, 0.106, 0.022, 0, hy + 0.092, 0, 0x222222, 16));
    hair.push(cyl(0.092, 0.092, 0.01, 0, hy + 0.18, 0, hatC, 14));
  } else if (L.hat === 'beanie') {
    hair.push(sph(1, 0, hy + 0.062, -0.005, hatC, 0.109, 0.09, 0.117, 16));
    hair.push(cyl(0.105, 0.1, 0.03, 0, hy + 0.045, -0.005, tintOf(hatC, 0.9), 16));
  } else if (L.hat === 'hardhat') {
    hair.push(sph(1, 0, hy + 0.06, 0, 0xf1c40f, 0.112, 0.082, 0.123, 16));
    hair.push(box(0.2, 0.014, 0.12, 0, hy + 0.05, 0.085, 0xe8b60a));
  } else if (L.hat === 'sunhat') {
    // Wide-brimmed straw tourist sunhat with colourful ribbon band
    hair.push(cyl(0.225, 0.24, 0.012, 0, hy + 0.075, 0, hatC, 20));
    hair.push(cyl(0.092, 0.108, 0.085, 0, hy + 0.082, 0, tintOf(hatC, 0.96), 16));
    hair.push(cyl(0.11, 0.112, 0.024, 0, hy + 0.088, 0, 0xe76f51, 16));
  } else if (L.hat === 'visor') {
    hair.push(cyl(0.106, 0.106, 0.032, 0, hy + 0.062, 0, hatC, 16));
    hair.push(box(0.165, 0.012, 0.11, 0, hy + 0.056, 0.12, hatC, 0, -0.08));
  }
  return { head: h, hair };
}

function ab0(b: number) { return Math.min(b, 1.12); }

function buildParts(L: Look): Parts {
  const b = L.build, f = L.gender === 'f';
  const skin = L.skin, top = L.top, bot = L.bottom;
  const sw = (f ? 0.165 : 0.2) * b;
  const jacket = L.topStyle === 'jacket' || L.topStyle === 'suit' || L.topStyle === 'uniform';
  const k = jacket ? 1.07 : 1;
  const t: THREE.BufferGeometry[] = [];
  const narrow = f ? 0.9 : 1;
  const prof: [number, number][] = [
    [0.0, -0.075], [0.152, -0.075], [0.168, 0.0], [0.152 * narrow, 0.12], [0.156, 0.22],
    [0.188 * (f ? 0.98 : 1), 0.31], [0.198 * (f ? 0.96 : 1), 0.38], [0.192, 0.44],
    [0.168, 0.485], [0.108, 0.515], [0.062, 0.532], [0.052, 0.55],
  ];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * b * k, y)), 22);
  t.push(finish(lathe, top));
  t.push(cyl(0.156 * b, 0.162 * b, 0.028, 0, -0.05, 0, tintOf(top, 0.88), 22));
  t.push(cyl(0.152 * b, 0.155 * b, 0.045, 0, -0.015, 0, 0x1d1d1f, 22));
  t.push(box(0.06, 0.032, 0.02, 0, 0.004, 0.148 * b, 0xc8b060));
  for (const s of [-1, 1]) {
    t.push(sph(1, s * 0.06, 0.375, 0.062, tintOf(top, 1.05), 0.062, 0.055, 0.028, 12));
    if (jacket) {
      t.push(box(0.014, 0.3, 0.014, s * 0.055, 0.18, 0.15 * b, tintOf(top, 0.8), 0, 0, s * 0.06));
      t.push(box(0.07, 0.05, 0.02, s * 0.1, 0.26, 0.152 * b, tintOf(top, 0.86)));
      t.push(box(0.058, 0.055, 0.14, s * 0.11, 0.37, 0.04, tintOf(top, 1.1), 0, 0, s * 0.22));
    } else {
      t.push(box(0.01, 0.2, 0.01, s * 0.06, 0.22, 0.155 * b, tintOf(top, 0.92)));
    }
  }
  t.push(cyl(0.052, 0.058, 0.09, 0, 0.52, 0, skin, 14));
  const shoulderCol = L.topStyle === 'tank' ? skin : top;
  t.push(sph(1, sw * 0.8, 0.455, 0, shoulderCol, 0.062 * b, 0.06, 0.058, 14));
  t.push(sph(1, -sw * 0.8, 0.455, 0, shoulderCol, 0.062 * b, 0.06, 0.058, 14));
  for (let i = 0; i < 3; i++) t.push(box(0.014, 0.014, 0.01, 0, 0.41 - i * 0.06, 0.162 * b, tintOf(top, 1.35)));
  if (L.topStyle === 'tank') t.push(sph(1, 0, 0.49, 0.04, skin, 0.095 * b, 0.045, 0.065, 12));
  if (L.topStyle === 'hawaiian') {
    // Vibrant tropical shirt floral blocks & open camp collar
    t.push(box(0.065, 0.07, 0.02, 0, 0.45, 0.15 * b, skin));
    const accents = [0xffe066, 0xffffff, 0x2ec4b6, 0xff595e];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      t.push(box(0.048, 0.042, 0.016, Math.cos(a) * 0.145 * b, 0.1 + (i % 3) * 0.12, Math.sin(a) * 0.148 * b, accents[i % accents.length]));
    }
    t.push(capsule(0.06 * ab0(b), 0.04, 0.172 * b, 0.47, 0, tintOf(top, 0.92)));
    t.push(capsule(0.06 * ab0(b), 0.04, -0.172 * b, 0.47, 0, tintOf(top, 0.92)));
  }
  if (L.topStyle === 'tee' || L.topStyle === 'long') {
    t.push(capsule(0.06 * ab0(b), 0.04, 0.172 * b, 0.47, 0, tintOf(top, 0.9)));
    t.push(capsule(0.06 * ab0(b), 0.04, -0.172 * b, 0.47, 0, tintOf(top, 0.9)));
  }
  if (L.topStyle === 'jacket') {
    t.push(sph(1, 0, 0.4, -0.1, tintOf(top, 0.86), 0.115, 0.085, 0.06, 12));
    t.push(box(0.05, 0.012, 0.03, 0.12, 0.43, 0.02, tintOf(top, 0.65)));
    t.push(box(0.05, 0.012, 0.03, -0.12, 0.43, 0.02, tintOf(top, 0.65)));
  }
  if (L.topStyle === 'suit' || L.topStyle === 'uniform') {
    t.push(box(0.085, 0.28, 0.018, 0, 0.28, 0.163 * b, L.topStyle === 'suit' ? 0xf4f4f4 : 0x2c4c8c));
    if (L.tie) {
      t.push(box(0.032, 0.24, 0.016, 0, 0.26, 0.175 * b, L.tie));
      t.push(box(0.05, 0.032, 0.02, 0, 0.44, 0.175 * b, L.tie));
    }
    t.push(box(0.07, 0.012, 0.02, 0.1, 0.44, 0.155 * b, tintOf(top, 0.7)));
    t.push(box(0.07, 0.012, 0.02, -0.1, 0.44, 0.155 * b, tintOf(top, 0.7)));
  }
  if (L.topStyle === 'uniform') {
    t.push(box(0.05, 0.1, 0.07, -0.17 * b, -0.09, 0.02, 0x111111));
    t.push(box(0.028, 0.028, 0.012, 0.07, 0.41, 0.175 * b, 0xd9b84a));
    t.push(cyl(0.012, 0.012, 0.018, 0.145, 0.465, 0.04, 0xd9b84a, 8));
    t.push(box(0.055, 0.09, 0.02, 0.055, 0.3, 0.168 * b, 0x1a1a1a));
  }
  if (L.bag) {
    t.push(box(0.21, 0.26, 0.085, 0, 0.17, -0.16 * b, L.bag));
    t.push(box(0.022, 0.44, 0.014, 0.075, 0.34, 0.02, L.bag, 0, 0, 0.24));
    t.push(box(0.022, 0.44, 0.014, -0.075, 0.34, 0.02, L.bag, 0, 0, -0.24));
  }
  if (L.camera) {
    // Tourist neck strap + DSLR camera hanging on chest
    t.push(box(0.016, 0.32, 0.01, 0.055, 0.35, 0.162 * b, 0x181a1e, 0, 0, -0.22));
    t.push(box(0.016, 0.32, 0.01, -0.055, 0.35, 0.162 * b, 0x181a1e, 0, 0, 0.22));
    t.push(box(0.095, 0.062, 0.045, 0, 0.18, 0.185 * b, 0x18191d));
    t.push(cyl(0.022, 0.024, 0.042, 0, 0, 0, 0x101114, 10).rotateX(Math.PI / 2).translate(0, 0.18, 0.215 * b));
    t.push(cyl(0.015, 0.015, 0.008, 0, 0, 0, 0x3b6e8c, 8).rotateX(Math.PI / 2).translate(0, 0.18, 0.236 * b));
  }
  if (L.bottomStyle === 'skirt') {
    const g = new THREE.CylinderGeometry(0.17 * b, 0.27 * b, 0.36, 16);
    g.translate(0, -0.1, 0);
    t.push(finish(g, bot));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      t.push(box(0.012, 0.34, 0.012, Math.cos(a) * 0.23 * b, -0.28, Math.sin(a) * 0.2 * b, tintOf(bot, 0.9), -a));
    }
  }
  // ---- face
  const fp = buildFace(L);
  const h = fp.head, hair = fp.hair;
  // ---- arms
  const sleeve = L.topStyle === 'tee' || L.topStyle === 'hawaiian' ? 0.42 : L.topStyle === 'tank' ? 0 : 1;
  const ab = ab0(b);
  const ua: THREE.BufferGeometry[] = [];
  const skinArm = skin, clothArm = tintOf(top, 0.98);
  if (sleeve >= 0.99) ua.push(capsule(0.051 * ab, 0.2, 0, 0.02, 0, clothArm));
  else if (sleeve > 0) {
    ua.push(capsule(0.054 * ab, 0.05, 0, 0.02, 0, clothArm));
    ua.push(cyl(0.052 * ab, 0.052 * ab, 0.015, 0, -0.097, 0, tintOf(top, 0.82), 14));
    ua.push(capsule(0.048 * ab, 0.15, 0, -0.09, 0, skinArm));
  } else ua.push(capsule(0.049 * ab, 0.2, 0, 0.02, 0, skinArm));
  ua.push(sph(0.048 * ab, 0, -0.285, 0, sleeve >= 0.99 ? clothArm : skinArm, 1, 1, 1, 12));
  const fa: THREE.BufferGeometry[] = [];
  const armCol = sleeve >= 0.99 ? clothArm : skinArm;
  fa.push(capsule(0.042 * ab, 0.16, 0, 0.01, 0, armCol));
  fa.push(cyl(0.038 * ab, 0.038 * ab, 0.012, 0, -0.16, 0, L.topStyle === 'uniform' ? 0x111111 : 0x2a2a2a, 12));
  if (L.topStyle !== 'uniform') fa.push(box(0.017, 0.017, 0.012, 0, -0.16, 0.038, 0xb9bdc4));
  fa.push(sph(1, 0, -0.265, 0.006, skin, 0.031, 0.04, 0.028, 12));
  fa.push(sph(1, 0, -0.29, 0.012, tintOf(skin, 0.97), 0.029, 0.02, 0.024, 10));
  for (let i = 0; i < 4; i++) {
    const fx = (i - 1.5) * 0.0145;
    const L2 = 0.032 - Math.abs(i - 1.5) * 0.005;
    fa.push(capsule(0.0068, L2, fx, -0.305, 0.014, skin));
  }
  fa.push(capsule(0.0072, 0.026, -0.027, -0.285, 0.024, skin));
  // ---- legs
  const full = L.bottomStyle === 'jeans' || L.bottomStyle === 'suit';
  const th: THREE.BufferGeometry[] = [];
  const legCol = full ? bot : skin;
  if (full) {
    th.push(capsule(0.086 * b, 0.28, 0, 0.03, 0, legCol));
    th.push(box(0.012, 0.26, 0.012, 0, -0.18, 0.088, tintOf(bot, 0.82)));
    th.push(box(0.06, 0.022, 0.08, 0, -0.18, 0.072, tintOf(bot, 0.78)));
  } else if (L.bottomStyle === 'shorts') {
    th.push(capsule(0.09 * b, 0.12, 0, 0.03, 0, bot));
    th.push(cyl(0.086 * b, 0.086 * b, 0.02, 0, -0.12, 0, tintOf(bot, 0.8), 16));
    th.push(capsule(0.074 * b, 0.18, 0, -0.11, 0, skin));
  } else {
    th.push(capsule(0.082 * b, 0.28, 0, 0.03, 0, skin));
  }
  th.push(sph(1, 0, -0.285, 0.004, legCol, 0.062 * b, 0.066, 0.062 * b, 14));
  th.push(sph(1, 0, -0.415, 0.004, legCol, 0.066 * b, 0.072, 0.066 * b, 12));
  const sh: THREE.BufferGeometry[] = [];
  sh.push(capsule(0.059 * b, 0.3, 0, 0.015, 0, legCol));
  sh.push(sph(1, 0, -0.17, -0.012, full ? tintOf(bot, 1.03) : skin, 0.048 * b, 0.075, 0.045 * b, 12));
  sh.push(cyl(0.043 * b, 0.04 * b, 0.05, 0, -0.27, 0, 0xe8e6e0, 12));
  const shC = L.shoe;
  sh.push(sph(1, 0, -0.363, 0.025, shC, 0.049, 0.031, 0.095, 16));
  sh.push(sph(1, 0, -0.372, 0.092, tintOf(shC, 1.1), 0.044, 0.026, 0.05, 14));
  sh.push(box(0.092, 0.014, 0.2, 0, -0.387, 0.03, tintOf(shC, shC === 0xf5f5f5 ? 0.7 : 1.6)));
  for (let i = 0; i < 3; i++) sh.push(box(0.05, 0.007, 0.01, 0, -0.35 + i * 0.001, 0.045 + i * 0.024, tintOf(shC, 0.55)));
  sh.push(box(0.03, 0.045, 0.026, 0, -0.37, -0.05, tintOf(shC, 0.8)));
  return { torso: M(t), head: M([...h, ...hair]), upperArm: M(ua), foreArm: M(fa), thigh: M(th), shin: M(sh), sw, hw: 0.097 * b };
}

export const humanMat = new THREE.MeshPhysicalMaterial({
  vertexColors: true, roughness: 0.82, metalness: 0.01, clearcoat: 0.0,
  sheen: 0.35, sheenRoughness: 0.85, sheenColor: new THREE.Color(0x9a9a9a), envMapIntensity: 0.5,
});
microtextures.registerHumanMat(humanMat);

const weaponMat = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.42, metalness: 0.45, envMapIntensity: 0.85,
});

const cylZ = (r1: number, r2: number, h: number, x: number, y: number, z: number, col: number, seg = 10) =>
  cyl(r1, r2, h, 0, 0, 0, col, seg).rotateX(Math.PI / 2).translate(x, y, z);

const contactShadowGeo = new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2);
let contactShadowMat: THREE.MeshBasicMaterial | null = null;
function getContactShadowMat() {
  if (!contactShadowMat) {
    contactShadowMat = new THREE.MeshBasicMaterial({
      map: makeContactShadow(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
  }
  return contactShadowMat;
}

// ---- weapons (all 14 non-fist weapons with distinct 3D geometry) -----------
const gunCache = new Map<string, THREE.Group>();
export type GunKind =
  | 'bat' | 'katana' | 'pistol' | 'silenced' | 'revolver' | 'smg'
  | 'shotgun' | 'autoshotgun' | 'rifle' | 'carbine' | 'lmg' | 'sniper' | 'rpg' | 'grenade';

export function gunMesh(kind: GunKind): THREE.Group {
  let g = gunCache.get(kind);
  if (!g) {
    const parts: THREE.BufferGeometry[] = [];
    const dk = 0x1c1d21, md = 0x363940, steel = 0x9aa4b0, wood = 0x6b4426, olive = 0x3b4d30;
    let muzzle = 0.24;
    if (kind === 'pistol') {
      parts.push(box(0.034, 0.05, 0.21, 0, -0.02, -0.01, md));
      parts.push(box(0.03, 0.095, 0.05, 0, -0.11, -0.02, dk, 0, 0.2));
      parts.push(box(0.015, 0.02, 0.03, 0, 0.03, 0.08, dk));
      parts.push(box(0.032, 0.008, 0.17, 0, 0.03, -0.02, 0x5d646d));
      muzzle = 0.22;
    } else if (kind === 'silenced') {
      parts.push(box(0.034, 0.048, 0.21, 0, -0.02, -0.01, dk));
      parts.push(box(0.03, 0.095, 0.05, 0, -0.11, -0.02, 0x141518, 0, 0.2));
      parts.push(cylZ(0.017, 0.017, 0.24, 0, 0.0, 0.22, 0x16181c, 10));
      parts.push(cylZ(0.018, 0.018, 0.02, 0, 0.0, 0.11, 0x454a52, 10));
      muzzle = 0.36;
    } else if (kind === 'revolver') {
      parts.push(box(0.036, 0.055, 0.16, 0, -0.02, -0.01, steel));
      parts.push(cylZ(0.026, 0.026, 0.065, 0, -0.005, 0.02, 0x7c8692, 10));
      parts.push(box(0.024, 0.032, 0.22, 0, 0.01, 0.16, steel));
      parts.push(box(0.03, 0.1, 0.055, 0, -0.1, -0.06, wood, 0, 0.3));
      muzzle = 0.3;
    } else if (kind === 'smg') {
      parts.push(box(0.045, 0.07, 0.3, 0, -0.03, 0.04, md));
      parts.push(box(0.026, 0.15, 0.045, 0, -0.14, 0.06, dk));
      parts.push(box(0.03, 0.09, 0.05, 0, -0.1, -0.06, dk, 0, 0.15));
      parts.push(box(0.022, 0.022, 0.11, 0, -0.01, 0.24, dk));
      parts.push(box(0.03, 0.04, 0.14, 0, -0.03, -0.17, dk));
      parts.push(box(0.012, 0.03, 0.06, 0, 0.06, -0.02, 0x222222));
      muzzle = 0.32;
    } else if (kind === 'shotgun') {
      parts.push(cylZ(0.017, 0.017, 0.64, 0, 0.01, 0.16, dk, 8));
      parts.push(box(0.05, 0.05, 0.22, 0, -0.04, 0.25, wood));
      parts.push(box(0.05, 0.08, 0.22, 0, -0.03, -0.02, md));
      parts.push(box(0.045, 0.1, 0.3, 0, -0.06, -0.25, wood, 0, 0.12));
      parts.push(cylZ(0.02, 0.02, 0.5, 0, -0.03, 0.26, md, 8));
      muzzle = 0.72;
    } else if (kind === 'autoshotgun') {
      parts.push(box(0.062, 0.09, 0.44, 0, -0.02, 0.06, 0x22252b));
      parts.push(cylZ(0.022, 0.022, 0.42, 0, 0.01, 0.44, dk, 8));
      parts.push(cylZ(0.068, 0.068, 0.08, 0, -0.12, 0.14, 0x16181c, 12)); // drum mag
      parts.push(box(0.048, 0.1, 0.26, 0, -0.04, -0.26, 0x2a2e36));
      parts.push(box(0.034, 0.1, 0.05, 0, -0.11, -0.06, dk, 0, 0.18));
      parts.push(box(0.024, 0.036, 0.12, 0, 0.06, 0.02, 0x3b4049));
      muzzle = 0.68;
    } else if (kind === 'rifle') {
      parts.push(box(0.048, 0.082, 0.42, 0, -0.02, 0.04, 0x282b31));
      parts.push(box(0.044, 0.062, 0.26, 0, -0.015, 0.34, wood)); // handguard
      parts.push(cylZ(0.014, 0.014, 0.52, 0, 0.008, 0.46, dk, 8));
      parts.push(box(0.028, 0.18, 0.062, 0, -0.14, 0.12, 0x1b1d22, 0, -0.24)); // curved mag
      parts.push(box(0.032, 0.1, 0.05, 0, -0.11, -0.07, wood, 0, 0.2));
      parts.push(box(0.044, 0.095, 0.28, 0, -0.04, -0.28, wood, 0, 0.08));
      parts.push(box(0.018, 0.035, 0.08, 0, 0.05, 0.04, dk));
      muzzle = 0.74;
    } else if (kind === 'carbine') {
      parts.push(box(0.05, 0.082, 0.44, 0, -0.02, 0.06, 0x2b3038));
      parts.push(box(0.048, 0.066, 0.26, 0, -0.01, 0.36, 0x1e2228)); // tactical rail
      parts.push(cylZ(0.014, 0.014, 0.46, 0, 0.01, 0.46, dk, 8));
      parts.push(box(0.03, 0.17, 0.06, 0, -0.13, 0.12, 0x181a1f, 0, -0.14));
      parts.push(box(0.032, 0.1, 0.05, 0, -0.11, -0.07, dk, 0, 0.2));
      parts.push(box(0.042, 0.09, 0.24, 0, -0.03, -0.25, 0x22262c));
      // red-dot optic
      parts.push(box(0.036, 0.044, 0.09, 0, 0.06, 0.02, 0x14161a));
      parts.push(box(0.022, 0.022, 0.01, 0, 0.06, 0.068, 0x38bdf8));
      muzzle = 0.72;
    } else if (kind === 'lmg') {
      parts.push(box(0.074, 0.1, 0.5, 0, -0.01, 0.08, 0x24282e));
      parts.push(box(0.064, 0.075, 0.3, 0, -0.005, 0.44, 0x1a1d22)); // perforated barrel shroud
      parts.push(cylZ(0.018, 0.018, 0.62, 0, 0.01, 0.56, dk, 8));
      parts.push(box(0.11, 0.12, 0.14, 0, -0.12, 0.14, olive)); // ammo box mag
      parts.push(box(0.05, 0.095, 0.28, 0, -0.04, -0.28, 0x2b2f36));
      parts.push(box(0.034, 0.1, 0.052, 0, -0.11, -0.07, dk, 0, 0.2));
      for (const s of [-1, 1]) parts.push(box(0.014, 0.17, 0.014, s * 0.04, -0.13, 0.46, 0x1c1e20, 0, 0, s * 0.32));
      muzzle = 0.9;
    } else if (kind === 'sniper') {
      parts.push(box(0.045, 0.075, 0.48, 0, -0.03, 0.06, 0x24272b));
      parts.push(cylZ(0.013, 0.013, 0.86, 0, 0.005, 0.62, 0x16181b, 8));
      parts.push(box(0.03, 0.1, 0.05, 0, -0.15, 0.12, 0x24272b, 0, 0.25));
      parts.push(box(0.045, 0.09, 0.3, 0, -0.05, -0.32, 0x3b3f44));
      parts.push(box(0.055, 0.12, 0.26, 0, -0.07, -0.1, 0x20222b));
      parts.push(cylZ(0.028, 0.028, 0.34, 0, 0.075, 0.06, 0x0e1012, 10));
      parts.push(cylZ(0.04, 0.032, 0.07, 0, 0.075, 0.23, 0x0e1012, 10));
      parts.push(cylZ(0.033, 0.04, 0.07, 0, 0.075, -0.11, 0x0e1012, 10));
      parts.push(box(0.02, 0.05, 0.05, 0, 0.04, 0.1, 0x33363b));
      for (const s of [-1, 1]) parts.push(box(0.012, 0.16, 0.012, s * 0.03, -0.14, 0.4, 0x1c1e20, 0, 0, s * 0.35));
      muzzle = 1.05;
    } else if (kind === 'rpg') {
      // Shoulder-fired rocket launcher tube + exhaust cone + olive warhead
      parts.push(cylZ(0.044, 0.044, 1.08, 0, 0.04, 0.08, olive, 12));
      parts.push(cylZ(0.06, 0.042, 0.16, 0, 0.04, -0.52, dk, 12)); // rear exhaust vent
      parts.push(cylZ(0.054, 0.054, 0.28, 0, 0.04, 0.12, wood, 12)); // heat shield
      // protruding warhead
      parts.push(cylZ(0.028, 0.058, 0.18, 0, 0.04, 0.7, 0x334729, 10));
      parts.push(cylZ(0.058, 0.012, 0.18, 0, 0.04, 0.86, 0x2b3b22, 10));
      parts.push(box(0.032, 0.12, 0.05, 0, -0.07, 0.16, dk, 0, 0.18));
      parts.push(box(0.032, 0.11, 0.045, 0, -0.07, 0.4, dk));
      muzzle = 0.98;
    } else if (kind === 'bat') {
      const b1 = new THREE.CylinderGeometry(0.05, 0.028, 0.86, 12);
      b1.rotateX(Math.PI / 2).translate(0, 0, 0.2);
      parts.push(finish(b1, 0xb98a4e));
      const grip = new THREE.CylinderGeometry(0.024, 0.024, 0.22, 10);
      grip.rotateX(Math.PI / 2).translate(0, 0, -0.22);
      parts.push(finish(grip, 0x2a2a2a));
      parts.push(box(0.05, 0.05, 0.04, 0, -0.02, -0.33, 0x1a1a1a));
      muzzle = 0.6;
    } else if (kind === 'katana') {
      // Wrapped hilt, brass tsuba guard, gleaming long steel blade
      parts.push(box(0.026, 0.034, 0.26, 0, 0, -0.14, 0x1c1d22));
      parts.push(box(0.075, 0.075, 0.014, 0, 0, 0.0, 0xd4a843));
      parts.push(box(0.01, 0.034, 0.84, 0, 0.005, 0.43, 0xd8e0e8));
      parts.push(box(0.008, 0.016, 0.82, 0, 0.02, 0.42, 0x7e8791));
      muzzle = 0.85;
    } else {
      // grenade
      parts.push(sph(0.052, 0, 0, 0, 0x3f5a32, 1, 1.12, 1, 12));
      parts.push(cyl(0.026, 0.026, 0.03, 0, 0.05, 0, 0x2a2a2a, 8));
      parts.push(box(0.012, 0.075, 0.018, 0.03, 0.02, 0, 0x8a8a8a, 0, 0, -0.2));
      parts.push(box(0.01, 0.01, 0.04, 0.02, 0.085, 0.01, 0x8a8a8a));
      muzzle = 0.2;
    }
    g = new THREE.Group();
    const mesh = new THREE.Mesh(M(parts), weaponMat);
    mesh.castShadow = true;
    g.add(mesh);
    g.userData.muzzle = new THREE.Vector3(0, 0, muzzle);
    gunCache.set(kind, g);
  }
  const c = g.clone();
  c.userData.muzzle = g.userData.muzzle;
  return c;
}

// ---- rig ---------------------------------------------------------------------
export interface HumanRig {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group; armR: THREE.Group;
  elL: THREE.Group; elR: THREE.Group;
  legL: THREE.Group; legR: THREE.Group;
  knL: THREE.Group; knR: THREE.Group;
  handR: THREE.Group;
  shadow: THREE.Mesh;
  weapon: THREE.Group | null;
  weaponKind: GunKind | null;
  phase: number;
  pose: Record<string, number>;
  poseVel: Record<string, number>;
  motionState: MotionAnimState;
  neuroState: NeuroBodyState;
  subAnimName: string;
  meshes: THREE.Mesh[];
  look: Look;
  entitySeed: number;
  animClipName: string;
  idleEpoch: number;
  idleTimer: number;
  glbAttached: boolean;
  siteChar?: SiteCharacterInstance | null;
  kindHint?: string;
}

let humanSeedSeq = 1;

export function createHuman(L: Look): HumanRig {
  const key = JSON.stringify(L);
  let p = cache.get(key);
  if (!p) {
    p = buildParts(L);
    cache.set(key, p);
  }
  const meshes: THREE.Mesh[] = [];
  const mk = (g: THREE.BufferGeometry, parent: THREE.Object3D) => {
    const m = new THREE.Mesh(g, humanMat);
    m.castShadow = true;
    parent.add(m);
    meshes.push(m);
    return m;
  };
  const grp = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const root = new THREE.Group();
  const shadow = new THREE.Mesh(contactShadowGeo, getContactShadowMat());
  shadow.position.y = 0.025;
  shadow.renderOrder = 1;
  root.add(shadow);
  const hips = grp(root, 0, 0.92, 0);
  const spine = grp(hips);
  mk(p.torso, spine);
  const head = grp(spine, 0, 0.6, 0);
  mk(p.head, head);
  const armL = grp(spine, p.sw, 0.5, 0), armR = grp(spine, -p.sw, 0.5, 0);
  mk(p.upperArm, armL); mk(p.upperArm, armR);
  const elL = grp(armL, 0, -0.3, 0), elR = grp(armR, 0, -0.3, 0);
  mk(p.foreArm, elL); mk(p.foreArm, elR);
  const handR = grp(elR, 0, -0.31, 0.01);
  const legL = grp(hips, p.hw, 0, 0), legR = grp(hips, -p.hw, 0, 0);
  mk(p.thigh, legL); mk(p.thigh, legR);
  const knL = grp(legL, 0, -0.44, 0), knR = grp(legR, 0, -0.44, 0);
  mk(p.shin, knL); mk(p.shin, knR);
  root.scale.setScalar(L.height * 1.0);
  const rig: HumanRig = {
    root, hips, spine, head, armL, armR, elL, elR, legL, legR, knL, knR, handR, shadow,
    weapon: null, weaponKind: null, phase: Math.random() * 6, meshes, look: L,
    entitySeed: humanSeedSeq++,
    animClipName: 'urban_idle_stand_breathe_casual_morning',
    idleEpoch: Math.floor(Math.random() * 24),
    idleTimer: 3 + Math.random() * 5,
    glbAttached: false,
    siteChar: null,
    kindHint: 'civ',
    pose: {
      hipL: 0, hipR: 0, knL: 0, knR: 0, aLx: 0, aLz: 0, aRx: 0, aRz: 0, elL: 0, elR: 0,
      lean: 0, headX: 0, headY: 0, hipsY: 0.92, hipsX: 0, twist: 0, bank: 0,
    },
    poseVel: {
      hipL: 0, hipR: 0, knL: 0, knR: 0, aLx: 0, aLz: 0, aRx: 0, aRz: 0, elL: 0, elR: 0,
      lean: 0, headX: 0, headY: 0, hipsY: 0, hipsX: 0, twist: 0, bank: 0,
    },
    motionState: createMotionAnimState(),
    neuroState: createNeuroBodyState(humanSeedSeq * 31 + 17),
    subAnimName: 'none',
  };
  upgradeHumanToGlb(rig);
  return rig;
}

export function disposeHumanRig(r: HumanRig) {
  if (r.siteChar) {
    r.root.remove(r.siteChar.root);
    disposeSiteCharacterGlb(r.siteChar);
    r.siteChar = null;
  }
}

const glbHumanMatCache = new Map<string, THREE.MeshStandardMaterial>();
function getHumanPartMat(hex: number, rough: number, metal = 0.04): THREE.MeshStandardMaterial {
  const k = `${hex}_${rough}_${metal}`;
  let m = glbHumanMatCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, envMapIntensity: 0.72 });
    microtextures.registerHumanMat(m);
    glbHumanMatCache.set(k, m);
  }
  return m;
}

/** Upgrades a character rig with sculpted anatomical .glb parts & skeletal Model-Site .glb models (Soldier/CesiumMan) cleanly. */
export function upgradeHumanToGlb(
  r: HumanRig,
  hdGlbMode = isGlbWorldMode(),
  kindHint = r.kindHint ?? 'civ',
): boolean {
  r.kindHint = kindHint;
  const L = r.look;

  if (!r.glbAttached) {
    const topRough = L.topStyle === 'suit' ? 0.62 : 0.78;
    const topMat = getHumanPartMat(L.top, topRough);
    const botMat = getHumanPartMat(L.bottom, 0.84);

    const torsoGlb = cloneHumanGlbPart('torso', L.top, topRough);
    if (torsoGlb) {
      for (let i = 0; i < r.meshes.length; i++) {
        if (i !== 1) r.meshes[i].visible = false;
      }

      const b = L.build;
      // Anatomical ribcage depth & natural shoulder taper eliminate barrel-chest / floating-arm gaps
      torsoGlb.position.set(0, 0.03, 0);
      torsoGlb.scale.set(b * 1.02, 1.0, b * 0.66);
      r.spine.add(torsoGlb);

      // Tuck arm roots slightly closer into the torso so shoulders blend naturally without sticking out
      r.armL.position.x = Math.abs(r.armL.position.x) * 0.86;
      r.armR.position.x = -Math.abs(r.armR.position.x) * 0.86;

      // Solid collar & upper-chest seal so there is zero gap around the neck
      const collarGeo = new THREE.CylinderGeometry(0.058 * b, 0.092 * b, 0.078, 14);
      const collarMesh = new THREE.Mesh(collarGeo, topMat);
      collarMesh.position.set(0, 0.495, 0);
      collarMesh.scale.set(1.0, 1.0, 0.72);
      collarMesh.castShadow = true;
      collarMesh.receiveShadow = true;
      r.spine.add(collarMesh);
      r.head.position.y = 0.58;

      // Grounded pelvis hip bridge matching trousers/skirt with natural anatomical depth
      const pelvisGeo = new THREE.CylinderGeometry(0.146 * b, 0.136 * b, 0.17, 14);
      const pelvisMesh = new THREE.Mesh(pelvisGeo, botMat);
      pelvisMesh.position.set(0, 0.012, 0);
      pelvisMesh.scale.set(0.96, 1.0, 0.68);
      pelvisMesh.castShadow = true;
      pelvisMesh.receiveShadow = true;
      r.hips.add(pelvisMesh);

      if (L.bottomStyle === 'skirt') {
        const skirtGeo = new THREE.CylinderGeometry(0.142 * b, 0.21 * b, 0.34, 14);
        const skirtMesh = new THREE.Mesh(skirtGeo, botMat);
        skirtMesh.position.set(0, -0.17, 0);
        skirtMesh.scale.set(0.96, 1.0, 0.74);
        skirtMesh.castShadow = true;
        skirtMesh.receiveShadow = true;
        r.hips.add(skirtMesh);
      }

      const sleeveHex = L.topStyle === 'tank' ? L.skin : L.top;
      const sleeveRough = L.topStyle === 'tank' ? 0.58 : topRough;
      const sleeveMat = getHumanPartMat(sleeveHex, sleeveRough);
      const foreHex = L.topStyle === 'long' || L.topStyle === 'jacket' || L.topStyle === 'suit' || L.topStyle === 'uniform' ? L.top : L.skin;
      const foreRough = foreHex === L.skin ? 0.58 : topRough;
      // Sleek tapered deltoid transition tucked slightly inward toward the clavicle
      const deltGeo = new THREE.SphereGeometry(0.048 * b, 12, 10);
      for (const arm of [r.armL, r.armR]) {
        const inward = arm === r.armL ? -0.022 * b : 0.022 * b;
        const delt = new THREE.Mesh(deltGeo, sleeveMat);
        delt.position.set(inward, -0.016, 0);
        delt.scale.set(0.84, 0.9, 0.72);
        delt.castShadow = true;
        arm.add(delt);
        const ua = cloneHumanGlbPart('arm_u', sleeveHex, sleeveRough);
        if (ua) {
          ua.position.set(0, -0.015, 0);
          ua.scale.set(b * 0.88, 1.02, b * 0.84);
          arm.add(ua);
        }
      }
      for (const el of [r.elL, r.elR]) {
        const fa = cloneHumanGlbPart('arm_l', foreHex, foreRough);
        if (fa) { fa.scale.set(b * 0.94, 1.05, b * 0.94); el.add(fa); }
        const hd = cloneHumanGlbPart('hand', L.skin, 0.58);
        if (hd) { hd.position.set(0, -0.25, 0); el.add(hd); }
      }
      const thighHex = L.bottomStyle === 'skirt' ? L.skin : L.bottom;
      const thighRough = L.bottomStyle === 'skirt' ? 0.58 : 0.84;
      const shinHex = L.bottomStyle === 'shorts' || L.bottomStyle === 'skirt' ? L.skin : L.bottom;
      const shinRough = shinHex === L.skin ? 0.58 : 0.84;
      const kneeMat = getHumanPartMat(shinHex, shinRough);
      const kneeGeo = new THREE.SphereGeometry(0.047 * b, 10, 8);
      for (const leg of [r.legL, r.legR]) {
        const th = cloneHumanGlbPart('leg_u', thighHex, thighRough);
        if (th) { th.scale.set(b * 0.96, 1.09, b * 0.92); leg.add(th); }
      }
      for (const kn of [r.knL, r.knR]) {
        // Seamless knee bridge eliminates dark crease seam on trousers/jeans
        const kneeCap = new THREE.Mesh(kneeGeo, kneeMat);
        kneeCap.position.set(0, 0.008, 0.004);
        kneeCap.scale.set(0.95, 0.88, 0.9);
        kneeCap.castShadow = true;
        kn.add(kneeCap);
        const sh = cloneHumanGlbPart('leg_l', shinHex, shinRough);
        if (sh) { sh.position.set(0, 0.02, 0); sh.scale.set(b * 0.96, 1.08, b * 0.92); kn.add(sh); }
        const shoe = cloneHumanGlbPart('shoe', L.shoe, 0.48);
        if (shoe) { shoe.position.set(0, -0.41, 0.01); kn.add(shoe); }
      }

      r.glbAttached = true;
    }
  }

  // Optional Model-Site skeletal characters: Soldier.glb for tactical/police roles, CesiumMan.glb sparingly for walkers
  const allowSiteChar =
    hdGlbMode &&
    kindHint !== 'player' &&
    kindHint !== 'guy' &&
    (kindHint === 'cop' || kindHint === 'gang' || (kindHint === 'civ' && r.entitySeed % 7 === 0));
  if (allowSiteChar) {
    if (!r.siteChar) {
      const siteKey: 'soldier' | 'cesium' = kindHint === 'cop' || kindHint === 'gang' ? 'soldier' : 'cesium';
      const sc = cloneSiteCharacterGlb(siteKey);
      if (sc) {
        r.siteChar = sc;
        r.root.add(sc.root);
      }
    }
    if (r.siteChar) {
      r.siteChar.root.visible = true;
      r.hips.visible = false;
    }
  } else {
    if (r.siteChar) r.siteChar.root.visible = false;
    r.hips.visible = true;
  }

  return r.glbAttached || Boolean(r.siteChar);
}

export function setWeapon(r: HumanRig, kind: GunKind | null) {
  if (r.weaponKind === kind) return;
  if (r.weapon) r.handR.remove(r.weapon);
  r.weapon = null;
  r.weaponKind = kind;
  if (kind) {
    const g = gunMesh(kind);
    g.rotation.x = Math.PI / 2;
    r.handR.add(g);
    r.weapon = g;
  }
}

export interface AnimIn {
  mode: 'stand' | 'sit' | 'drive' | 'dead' | 'sprawl';
  speed: number;
  aim: number; // 0..1 weapon raised
  aimPitch: number;
  punch: number; // 0..1 progress, 0 = none
  punchMove?: BareHandMove;
  boxingGuard?: number; // 0..1 raised boxing guard blend
  blocking?: boolean;   // active tight-shell boxing block
  dodgeDir?: number;    // -1 left, +1 right slip/bob weave
  isPlayer?: boolean;
  panic?: boolean;
  steer?: number;
  crouch?: boolean;
  slide?: boolean;
  airborne?: boolean;
  photo?: boolean;
  phoneCall?: boolean;
  checkWatch?: boolean;
  pickUp?: boolean;
  waveGreet?: boolean;
  flinch?: number;     // 0..1 hit stagger reaction
  recoil?: number;     // 0..1 firearm recoil kick
  turnRate?: number;   // rad/s yaw rate for natural turn banking
  speaking?: boolean;  // true while NPC is actively talking via TTS voice API
  onSand?: boolean;    // soft beach/dune sand trudge gait
  isTourist?: boolean; // tourist boardwalk/beach animation catalog preference
  inAircraft?: boolean;
  // Experimental BETA: Algorithmic Body-Logic Kinematics (eliminates all canned NPC animation clips)
  experimentalBodyLogic?: boolean;
  neuroIntent?: BodyIntentKind;
  neuroGazeYaw?: number;
  neuroStress?: number;
}

const TWO_HANDED_GUNS = new Set<GunKind>(['shotgun', 'autoshotgun', 'rifle', 'carbine', 'lmg', 'sniper']);

export function animateHuman(r: HumanRig, dt: number, a: AnimIn) {
  const T: Record<string, number> = {
    hipL: 0, hipR: 0, knL: 0.04, knR: 0.04, aLx: 0, aLz: 0.06, aRx: 0, aRz: -0.06, elL: -0.16, elR: -0.16,
    lean: 0, headX: 0, headY: 0, hipsY: 0.92, hipsX: 0, twist: 0, bank: 0,
  };
  const holding = !!r.weapon;
  const wk = r.weaponKind;
  const guardW = clamp(a.boxingGuard ?? 0, 0, 1);
  r.shadow.visible = a.mode === 'stand' && !a.airborne;

  // EXPERIMENTAL BETA: Pure Algorithmic Body-Logic Kinematics (zero canned animation clips for NPCs!)
  if (a.experimentalBodyLogic && !a.isPlayer && (a.mode === 'stand' || a.mode === 'sit')) {
    if (r.siteChar) r.siteChar.root.visible = false;
    r.hips.visible = true;
    const intentKind: BodyIntentKind =
      a.mode === 'sit'
        ? 'sit_chair'
        : a.neuroIntent ??
          (a.panic
            ? 'shield_panic'
            : a.blocking
              ? 'combat_block'
              : a.punch > 0
                ? 'combat_strike'
                : guardW > 0.35
                  ? 'combat_guard'
                  : holding && a.aim > 0.35
                    ? 'aim_weapon'
                    : a.phoneCall
                      ? 'phone_call'
                      : a.checkWatch
                        ? 'check_watch'
                        : a.pickUp
                          ? 'pick_up_item'
                          : a.waveGreet
                            ? 'wave_greet'
                            : a.photo
                              ? 'photo_hold'
                              : a.speaking
                                ? 'converse'
                                : a.speed > 0.18
                                  ? 'locomote'
                                  : 'stand_relaxed');
    const strikeSide = a.punchMove === 'jab_left' || a.punchMove === 'hook_left' || a.punchMove === 'haymaker_left' ? -1 : 1;
    const pose = stepNeuroBody(
      r.neuroState,
      {
        kind: intentKind,
        vx: a.speed,
        vz: (a.dodgeDir ?? 0) * 1.4,
        turnRate: a.turnRate ?? 0,
        gazeYaw: a.neuroGazeYaw ?? 0,
        gazePitch: a.aimPitch ?? 0,
        strikeTargetSide: strikeSide,
        strikeProgress: a.punch,
        stress: a.neuroStress ?? (a.panic ? 0.95 : guardW > 0.2 ? 0.72 : 0.15),
        fatigue: 0.15,
        crouch: !!a.crouch,
        onSand: !!a.onSand,
        shoveX: (a.flinch ?? 0) * 1.1,
      },
      dt,
    );
    r.animClipName = `neuro_beta_${intentKind}`;
    r.subAnimName = 'neuro_ik';
    r.hips.position.set(pose.hipsX, pose.hipsY, 0);
    r.legL.rotation.set(pose.hipL, 0, 0);
    r.legR.rotation.set(pose.hipR, 0, 0);
    r.knL.rotation.x = pose.knL;
    r.knR.rotation.x = pose.knR;
    r.armL.rotation.set(pose.aLx, 0, pose.aLz);
    r.armR.rotation.set(pose.aRx, 0, pose.aRz);
    r.elL.rotation.x = pose.elL;
    r.elR.rotation.x = pose.elR;
    r.spine.rotation.set(pose.lean, pose.twist, pose.bank);
    r.head.rotation.set(pose.headX, pose.headY, -pose.bank * 0.4);
    return;
  }

  // Model-Site rigged .glb character playback (disabled automatically when using handcrafted modular rigs)
  if (r.siteChar) {
    const useSiteChar =
      isGlbWorldMode() &&
      a.mode === 'stand' &&
      !holding &&
      !a.photo &&
      !a.phoneCall &&
      !a.checkWatch &&
      !a.pickUp &&
      !a.panic &&
      !a.crouch &&
      !a.slide &&
      !a.airborne &&
      !a.blocking &&
      a.punch <= 0 &&
      guardW < 0.05 &&
      (a.flinch ?? 0) < 0.05;
    r.siteChar.root.visible = useSiteChar;
    r.hips.visible = !useSiteChar;
    if (useSiteChar) {
      updateSiteCharacterGlb(r.siteChar, dt, a.speed, !!a.crouch);
      r.animClipName = `site_${r.siteChar.kind}_${r.siteChar.activeClip}`;
      return;
    }
  } else {
    r.hips.visible = true;
  }

  let rate = 16;

  if (a.mode === 'sit') {
    const t = performance.now() * 0.001 + r.entitySeed * 1.1;
    const talk = a.speaking ? Math.sin(t * 6.5) * 0.14 : 0;
    T.hipL = -1.36; T.hipR = -1.36; T.knL = 1.38; T.knR = 1.38;
    T.hipsY = 0.56;
    T.aLx = -0.52 + talk * 0.6; T.aRx = -0.58 - talk * 0.5;
    T.elL = -0.82; T.elR = -0.86;
    T.aLz = 0.14; T.aRz = -0.14;
    T.lean = 0.06 + Math.sin(t * 1.3) * 0.015;
    T.headY = Math.sin(t * 0.65) * 0.14;
    T.headX = -0.04 + Math.sin(t * 1.1) * 0.03;
    r.animClipName = 'social_cafe_seated_relax';
    rate = 10;
  } else if (a.mode === 'drive') {
    const st = a.steer ?? 0;
    T.hipL = -1.32; T.hipR = -1.32; T.knL = 1.32; T.knR = 1.32;
    T.aLx = -0.96 + st * 0.22; T.aRx = -0.96 - st * 0.22; T.elL = -0.68; T.elR = -0.68;
    T.aLz = 0.16; T.aRz = -0.16;
    T.lean = -0.08; T.bank = -st * 0.1; T.hipsY = 0; T.headY = -st * 0.22;
  } else if (a.mode === 'dead' || a.mode === 'sprawl') {
    T.hipL = -0.25; T.hipR = 0.15; T.knL = 0.4; T.knR = 0.1;
    T.aLx = -0.4; T.aRx = 0.5; T.aLz = 0.9; T.aRz = -0.8; T.elL = -0.5; T.elR = -0.3; T.hipsY = 0.92;
    T.headX = 0.2;
    rate = 8;
  } else if (a.slide) {
    // Low tactical slide pose with trailing knee tucked
    T.hipsY = 0.42;
    T.lean = -0.5;
    T.hipL = -1.28; T.knL = 0.22;
    T.hipR = -0.32; T.knR = 1.48;
    T.aLx = -0.6; T.aLz = 0.48; T.elL = -0.5;
    T.aRx = -0.9; T.aRz = -0.32; T.elR = -0.4;
    T.headX = 0.36;
    rate = 24;
  } else {
    const sp = a.speed;
    // Keep player idle rock-steady; NPCs shift calm standing posture only after a long natural dwell (18-28s)
    if (!a.isPlayer && sp <= 0.15 && !a.speaking) {
      r.idleTimer -= dt;
      if (r.idleTimer <= 0) {
        r.idleTimer = 18.0 + (r.entitySeed % 6) * 2.2;
        r.idleEpoch = (r.idleEpoch + 1) % 64;
      }
    }
    const clip = selectContextAnimation({
      entitySeed: r.entitySeed,
      speed: sp,
      isPlayer: a.isPlayer,
      crouch: a.crouch,
      slide: a.slide,
      airborne: a.airborne,
      aim: a.aim,
      punch: a.punch,
      recoil: a.recoil,
      flinch: a.flinch,
      panic: a.panic,
      photo: a.photo,
      speaking: a.speaking,
      onSand: a.onSand,
      isTourist: a.isTourist,
      weaponKind: wk,
      idleEpoch: a.isPlayer ? 0 : r.idleEpoch,
    });
    r.animClipName = clip.name;
    const animClock = performance.now() * 0.001 + r.entitySeed * 0.73;

    if (a.airborne) {
      const ep = evaluateAnimationPose(clip, animClock, 1.0, 0);
      T.hipL = -0.56 + ep.legLx * 0.25; T.knL = 0.78 + ep.shinLx * 0.15;
      T.hipR = 0.28 + ep.legRx * 0.25; T.knR = 0.48 + ep.shinRx * 0.15;
      T.aLx = -0.55 + ep.armLx * 0.2; T.aLz = 0.38; T.aRx = -0.45 + ep.armRx * 0.2; T.aRz = -0.38;
      T.elL = -0.52; T.elR = -0.52;
      T.lean = 0.12;
      rate = 14;
    } else if (sp > 0.15) {
      // Realistic stride cycle enriched with personality & style harmonics from the 3,240+ clip library
      const sprintBlend = clamp((sp - 4.2) / 3.5, 0, 1);
      r.phase += dt * (4.2 + sp * 1.08) * clamp(clip.cycleHz / 2.0, 0.78, 1.24);
      const ph = r.phase;
      const sPh = Math.sin(ph);
      const cPh = Math.cos(ph);
      const ep = evaluateAnimationPose(clip, animClock, clamp(sp / 3.5, 0.65, 1.45), a.speaking ? 0.5 : 0);
      const A = clamp(0.18 + sp * 0.125, 0, 1.08);
      const K = 0.38 + Math.min(sp, 8) * 0.135;
      T.hipL = -sPh * A + (sPh > 0 ? 0.06 * sprintBlend : 0);
      T.hipR = sPh * A + (sPh < 0 ? 0.06 * sprintBlend : 0);
      T.knL = K * Math.max(0, cPh + 0.15) + 0.04 + sprintBlend * 0.18 * Math.max(0, sPh);
      T.knR = K * Math.max(0, -cPh + 0.15) + 0.04 + sprintBlend * 0.18 * Math.max(0, -sPh);
      const aa = A * (0.8 + sprintBlend * 0.22);
      T.aLx = sPh * aa + ep.armLx * 0.12;
      T.aRx = -sPh * aa + ep.armRx * 0.12;
      T.elL = -0.26 - sp * 0.075 - Math.max(0, -sPh) * (0.28 + sprintBlend * 0.35);
      T.elR = -0.26 - sp * 0.075 - Math.max(0, sPh) * (0.28 + sprintBlend * 0.35);
      T.aLz = 0.07 + sprintBlend * 0.08 + clip.armOutL * 0.25;
      T.aRz = -0.07 - sprintBlend * 0.08 + clip.armOutR * 0.25;
      T.lean = Math.min(sp, 9) * 0.032 + sprintBlend * 0.06 + clip.spineLean * 0.2;
      const bounce = Math.abs(Math.sin(ph)) * (0.022 + sprintBlend * 0.024);
      T.hipsY = 0.92 - Math.min(sp, 7) * 0.008 + bounce - 0.014;
      T.hipsX = cPh * 0.024 * clamp(sp / 2.2, 0, 1) + ep.hipRoll * 0.22;
      T.twist = sPh * (0.13 + sprintBlend * 0.08) * Math.min(1, sp / 2.6) + ep.spineY * 0.2;
      T.bank = clamp(-(a.turnRate ?? 0) * 0.075 * Math.min(1, sp / 3.5), -0.22, 0.22) - cPh * 0.025;
      T.headX = -T.lean * 0.45 + ep.headX * 0.35;
      T.headY = ep.headY * 0.45;
    } else if (a.isPlayer) {
      // Natural, grounded GTA-style player idle: subtle chest breathing, gentle weight shift & relaxed arms
      const breath = Math.sin(animClock * 1.65);
      const sway = Math.sin(animClock * 0.42);
      T.hipsY = 0.92 + breath * 0.008;
      T.hipsX = sway * 0.012;
      T.lean = 0.025 + breath * 0.012;
      T.twist = sway * 0.04;
      T.bank = sway * 0.018;
      T.headX = -0.01 + breath * 0.014;
      T.headY = Math.sin(animClock * 0.34) * 0.14;
      T.aLx = 0.04 + breath * 0.025;
      T.aLz = 0.08 + breath * 0.015;
      T.aRx = 0.04 - breath * 0.02;
      T.aRz = -0.08 - breath * 0.015;
      T.elL = -0.22;
      T.elR = -0.22;
      T.hipL = -0.03;
      T.hipR = 0.03;
      T.knL = 0.05;
      T.knR = 0.04;
      rate = 6.5;
    } else {
      // Grounded NPC idle or lively speaking gesture from the 3,240+ catalog with smooth, non-snapping blend
      const ep = evaluateAnimationPose(clip, animClock, 1.0, a.speaking ? 1.0 : 0);
      const calm = a.speaking ? 1.0 : 0.72;
      T.hipsY = 0.92 + ep.hipY * calm;
      T.hipsX = ep.hipRoll * 0.22 * calm;
      T.lean = ep.spineX * calm;
      T.twist = ep.spineY * calm;
      T.bank = ep.hipRoll * 0.32 * calm;
      T.headX = ep.headX * calm;
      T.headY = ep.headY * calm;
      T.aLx = ep.armLx * calm;
      T.aLz = ep.armLz;
      T.aRx = ep.armRx * calm;
      T.aRz = ep.armRz;
      T.elL = ep.foreLx;
      T.elR = ep.foreRx;
      T.hipL = ep.legLx * 0.5;
      T.hipR = ep.legRx * 0.5;
      T.knL = 0.04 + Math.max(0, ep.shinLx * 0.5);
      T.knR = 0.04 + Math.max(0, ep.shinRx * 0.5);
      rate = a.speaking ? 11 : 5.5;
    }

    if (a.crouch && !a.airborne) {
      T.hipsY = 0.7;
      T.lean += 0.22;
      T.hipL = T.hipL * 0.58 - 0.5;
      T.hipR = T.hipR * 0.58 - 0.5;
      T.knL = Math.max(0.72, T.knL + 0.66);
      T.knR = Math.max(0.72, T.knR + 0.66);
    }
    if (a.photo && !a.panic) {
      T.aLx = -1.25; T.elL = -0.95; T.aLz = -0.25;
      T.aRx = -1.25; T.elR = -0.95; T.aRz = 0.25;
      T.headX = -0.14;
      rate = 10;
    }
    if (a.panic) {
      T.aLx = -2.72 + Math.sin(r.phase * 2.2) * 0.32;
      T.aRx = -2.72 - Math.sin(r.phase * 2.2) * 0.32;
      T.aLz = 0.36; T.aRz = -0.36; T.elL = -0.48; T.elR = -0.48;
    }
    if (holding && !a.panic) {
      const rec = a.recoil ?? 0;
      if (wk === 'rpg' && a.aim > 0.3) {
        // Shoulder-mounted rocket launcher stance
        const up = a.aimPitch;
        T.aRx = -(1.72 + up * 0.85) - rec * 0.35; T.elR = -0.45; T.aRz = -0.08;
        T.aLx = -(1.55 + up * 0.85) - rec * 0.25; T.elL = -0.82; T.aLz = -0.34;
        T.lean = -0.06 - rec * 0.12;
        T.twist = -0.34;
        T.headX = -up * 0.35;
        rate = 24;
      } else if (wk && TWO_HANDED_GUNS.has(wk) && a.aim > 0.4) {
        // Firm two-handed rifle/shotgun/LMG combat stance with recoil kick
        const up = a.aimPitch;
        T.aRx = -(1.42 + up * 0.9) - rec * 0.28; T.elR = -0.22 - rec * 0.15; T.aRz = -0.04;
        T.aLx = -(1.28 + up * 0.9) - rec * 0.24; T.elL = -0.78; T.aLz = -0.48;
        T.lean = T.lean * 0.45 + 0.06 - rec * 0.08;
        T.twist = -0.34;
        T.headX = -up * 0.42;
        rate = 24;
      } else if (a.aim > 0.5) {
        // Pistol / SMG aiming stance
        const up = a.aimPitch;
        T.aRx = -(1.52 + up * 0.9) - rec * 0.32; T.elR = -0.14; T.aRz = -0.02;
        T.aLx = -(1.38 + up * 0.9) - rec * 0.2; T.elL = -0.58; T.aLz = -0.4;
        T.lean = T.lean * 0.5 - 0.02 - rec * 0.06;
        T.twist = -0.24;
        T.headX = -up * 0.4;
        rate = 24;
      } else if (wk === 'katana' || wk === 'bat') {
        // Ready melee carry pose
        T.aRx = -0.48; T.elR = -0.75; T.aRz = -0.18;
      } else {
        // Low-ready firearm carry
        T.aRx = -0.38; T.elR = -1.08; T.aRz = -0.1;
      }
    }
    // Smooth physics-reactive sub-animations (sudden run-stop balance catch, landing knee absorption,
    // quick-start lean, sharp turn pivot & hit-stumble recovery) eliminate mechanical/cubic transitions
    const sub = stepMotionSubAnim(
      r.motionState,
      {
        speed: sp,
        airborne: !!a.airborne,
        turnRate: a.turnRate ?? 0,
        flinch: a.flinch ?? 0,
        crouch: !!a.crouch,
        slide: !!a.slide,
        stridePhase: r.phase,
      },
      dt,
    );
    r.subAnimName = sub.activeSub;
    T.hipsY += sub.hipsY;
    T.hipsX += sub.hipsX;
    T.lean += sub.lean;
    T.twist += sub.twist;
    T.bank += sub.bank;
    T.headX += sub.headX;
    T.headY += sub.headY;
    T.hipL += sub.hipL;
    T.hipR += sub.hipR;
    T.knL = Math.max(0.02, T.knL + sub.knL);
    T.knR = Math.max(0.02, T.knR + sub.knR);
    if (!holding && a.punch <= 0 && guardW < 0.05) {
      T.aLx += sub.aLx;
      T.aLz += sub.aLz;
      T.aRx += sub.aRx;
      T.aRz += sub.aRz;
      T.elL += sub.elL;
      T.elR += sub.elR;
    }
    if (sub.springBoost > 0) rate = Math.max(rate, 16 + sub.springBoost * 10);

    // Biomechanical secondary-motion overlay: organic breathing, pelvic lateral weight-shift,
    // spine/pelvis counter-rotation, vestibulo-ocular head stabilization, heel-strike knee bend & recoil kick
    const organic = evaluateOrganicMotionOverlay({
      clockSec: animClock,
      speed: sp,
      stridePhase: r.phase,
      turnRate: a.turnRate ?? 0,
      aiming: a.aim > 0.35,
      recoilKick: a.recoil ?? 0,
      airborne: !!a.airborne,
      seedOffset: r.entitySeed * 0.73,
    });
    T.hipsY += organic.chestBreathY;
    T.hipsX += organic.pelvisShiftX;
    T.bank += organic.pelvisRollZ;
    T.twist += organic.spineCounterTwistY;
    T.headY += organic.headStabilizeYaw;
    T.knL = Math.max(0.02, T.knL + organic.heelStrikeKneeL);
    T.knR = Math.max(0.02, T.knR + organic.heelStrikeKneeR);
    if (holding && a.aim > 0.35) {
      T.lean += organic.recoilLeanBack;
      T.aRx += organic.recoilArmKickX;
      T.aLx += organic.recoilArmKickX * 0.72;
    } else if (!holding && a.punch <= 0 && guardW < 0.05) {
      T.aLx += organic.shoulderDropL;
      T.aRx += organic.shoulderDropR;
    }

    // Smooth bare-hand boxing guard & varied strikes (left jab, right cross, left/right hooks, uppercut, haymaker)
    if (!holding && (a.punch > 0 || guardW > 0.02) && !a.panic) {
      const move = a.punchMove ?? 'jab_left';
      const bp = evaluateBareHandPose(move, a.punch, Math.max(guardW, a.punch > 0 ? 1 : 0), animClock);
      const blend = a.punch > 0 ? 1 : guardW;
      const legBlend = blend * clamp(1 - sp / 3.5, 0.15, 1);
      T.aLx = T.aLx * (1 - blend) + bp.aLx * blend;
      T.aLz = T.aLz * (1 - blend) + bp.aLz * blend;
      T.aRx = T.aRx * (1 - blend) + bp.aRx * blend;
      T.aRz = T.aRz * (1 - blend) + bp.aRz * blend;
      T.elL = T.elL * (1 - blend) + bp.elL * blend;
      T.elR = T.elR * (1 - blend) + bp.elR * blend;
      T.lean = T.lean * (1 - blend * 0.75) + bp.lean * blend * 0.75;
      T.twist = T.twist * (1 - blend * 0.85) + bp.twist * blend * 0.85;
      T.bank = T.bank * (1 - blend * 0.7) + bp.bank * blend * 0.7;
      T.headX = T.headX * (1 - blend * 0.6) + bp.headX * blend * 0.6;
      T.headY = T.headY * (1 - blend * 0.6) + bp.headY * blend * 0.6;
      T.hipsY += bp.hipsY * legBlend;
      T.hipL += bp.hipL * legBlend;
      T.hipR += bp.hipR * legBlend;
      T.knL = Math.max(0.02, T.knL + bp.knL * legBlend);
      T.knR = Math.max(0.02, T.knR + bp.knR * legBlend);
      rate = Math.max(rate, a.punch > 0 ? 28 : 16);
      if (a.punch > 0) r.animClipName = `combat_barehand_${move}`;
    } else if (a.punch > 0) {
      const s = Math.sin(a.punch * Math.PI);
      if (wk === 'katana') {
        const sweep = (a.punch - 0.5) * 2.2;
        T.aRx = -1.65 * s; T.aRz = -0.65 + sweep * 0.95; T.elR = -0.18 * s;
        T.aLx = -1.25 * s; T.aLz = -0.35 + sweep * 0.5; T.elL = -0.45;
        T.twist = -0.82 * s + sweep * 0.35; T.lean = 0.22 * s;
        rate = 34;
      } else {
        // Bat melee swing
        const sweep = (a.punch - 0.45) * 2.0;
        T.aRx = -1.55 * s; T.aRz = -0.52 + sweep * 0.82; T.elR = -0.25 * s;
        T.twist = -0.72 * s + sweep * 0.28; T.lean = 0.16 * s;
        T.aLx = 0.42 * s;
        rate = 30;
      }
    }
    // Active tactical combat defense overlays (tight boxing shell block & slip/bob weave)
    if (a.blocking && !a.panic) {
      T.aLx = -1.68; T.elL = -1.78; T.aLz = -0.22;
      T.aRx = -1.72; T.elR = -1.82; T.aRz = 0.22;
      T.lean += 0.16;
      T.headX = 0.12;
      T.hipsY -= 0.05;
      rate = Math.max(rate, 24);
    }
    if (a.dodgeDir && Math.abs(a.dodgeDir) > 0.1 && !a.panic) {
      const dd = Math.sign(a.dodgeDir);
      T.bank += dd * 0.34;
      T.hipsX += dd * 0.14;
      T.hipsY -= 0.12;
      T.lean += 0.18;
      T.knL += 0.32;
      T.knR += 0.32;
      rate = Math.max(rate, 28);
    }
    // Everyday life situation pose overlays (phone call, check watch, pick up dropped keys, friendly wave)
    if (!holding && !a.panic && a.punch <= 0 && guardW < 0.1) {
      if (a.phoneCall) {
        T.aRx = -1.88; T.elR = -1.75; T.aRz = 0.22;
        T.headY = -0.14;
        rate = Math.max(rate, 12);
      } else if (a.checkWatch) {
        T.aLx = -1.05; T.elL = -1.35; T.aLz = -0.28;
        T.headX = 0.36; T.headY = 0.24;
        rate = Math.max(rate, 12);
      } else if (a.pickUp) {
        T.hipsY = 0.62;
        T.lean = 0.56;
        T.knL = 0.85; T.knR = 0.72;
        T.hipL = -0.62; T.hipR = -0.45;
        T.aRx = -1.25; T.elR = -0.28;
        T.headX = 0.45;
        rate = Math.max(rate, 14);
      } else if (a.waveGreet) {
        const wv = Math.sin(performance.now() * 0.0085 + r.entitySeed) * 0.24;
        T.aRx = -2.65; T.elR = -0.42 + wv; T.aRz = -0.35 + wv;
        rate = Math.max(rate, 16);
      }
    }
    // Hit flinch stagger overlay
    if (a.flinch && a.flinch > 0.01) {
      const fl = clamp(a.flinch, 0, 1);
      T.lean -= 0.3 * fl;
      T.headX -= 0.26 * fl;
      T.twist += 0.26 * fl;
      T.aLx -= 0.28 * fl;
      T.aRx -= 0.28 * fl;
      rate = Math.max(rate, 26);
    }
  }

  // Second-order critically-damped spring integration for buttery-smooth, velocity-continuous joint motion
  const P = r.pose;
  const V = r.poseVel;
  const safeDt = Math.min(Math.max(dt, 0.0005), 0.05);
  const omega = clamp(rate * 1.05, 5.5, 36);
  const expTerm = Math.exp(-omega * safeDt);
  for (const key in T) {
    const cur = P[key] ?? 0;
    const vel = V[key] ?? 0;
    const diff = cur - T[key];
    const tmp = (vel + omega * diff) * safeDt;
    V[key] = (vel - omega * tmp) * expTerm;
    P[key] = T[key] + (diff + tmp) * expTerm;
  }
  r.hips.position.set(P.hipsX, P.hipsY, 0);
  r.legL.rotation.x = P.hipL; r.legR.rotation.x = P.hipR;
  r.knL.rotation.x = P.knL; r.knR.rotation.x = P.knR;
  r.armL.rotation.set(P.aLx, 0, P.aLz); r.armR.rotation.set(P.aRx, 0, P.aRz);
  r.elL.rotation.x = P.elL; r.elR.rotation.x = P.elR;
  r.spine.rotation.set(P.lean, P.twist, P.bank);
  r.head.rotation.set(P.headX, P.headY - P.twist * 0.55, -P.bank * 0.45);
  if (a.mode === 'dead' || a.mode === 'sprawl') {
    r.legL.rotation.z = 0.25; r.legR.rotation.z = -0.15;
  } else {
    r.legL.rotation.z = 0; r.legR.rotation.z = 0;
  }
}

export function muzzleWorld(r: HumanRig, out: THREE.Vector3): THREE.Vector3 {
  if (!r.weapon) return out.set(0, 1.4, 0);
  out.copy(r.weapon.userData.muzzle as THREE.Vector3);
  return r.weapon.localToWorld(out);
}

// a lightweight driver bust for AI cars
const bustCache = new Map<number, THREE.BufferGeometry>();
export function driverBust(seed: number): THREE.Mesh {
  const r = new Rng(seed);
  let g = bustCache.get(seed % 12);
  if (!g) {
    const skin = r.pick(SKINS), top = r.pick(TOPS), hair = r.pick(HAIRS);
    g = M([
      sph(1, 0, 0.3, 0, top, 0.2, 0.26, 0.12, 8),
      cyl(0.05, 0.055, 0.1, 0, 0.5, 0, skin, 6),
      sph(1, 0, 0.66, 0, skin, 0.093, 0.118, 0.104, 8),
      sph(1, 0, 0.7, -0.01, hair, 0.098, 0.09, 0.11, 8),
    ]);
    bustCache.set(seed % 12, g);
  }
  const m = new THREE.Mesh(g, humanMat);
  return m;
}

// ----------------------------------------------------------------------------- ragdoll
interface RP { p: THREE.Vector3; v: THREE.Vector3; r: number }
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _down = new THREE.Vector3(0, -1, 0);

export interface RagdollWorld {
  resolve(x: number, z: number, r: number, y: number, out: { x: number; z: number; nx: number; nz: number; hit: boolean; depth: number }): void;
}
const _rpo = { x: 0, z: 0, nx: 0, nz: 0, hit: false, depth: 0 };

/** Multi-particle verlet ragdoll: head, chest, pelvis, hands, knees, feet with joint constraints, wall bounce & blood impact events. */
export class Ragdoll {
  parts: RP[] = [];
  cons: [number, number, number, number][] = [];
  active = true;
  settled = false;
  t = 0;
  rig: HumanRig;
  gy: number;
  private bloodImpactCount = 0;

  constructor(rig: HumanRig, wish: number, vx: number, vy: number, vz: number, headWhip = 1.0) {
    this.rig = rig;
    if (rig.siteChar) rig.siteChar.root.visible = false;
    rig.hips.visible = true;
    rig.shadow.visible = false;
    this.gy = rig.root.position.y;
    const root = rig.root;
    root.updateMatrixWorld(true);
    const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
    const pelvis = wp(rig.hips), chest = wp(rig.spine);
    chest.y += 0.38;
    const head = wp(rig.head); head.y += 0.12;
    const hL = wp(rig.elL); hL.y -= 0.28;
    const hR = wp(rig.elR); hR.y -= 0.28;
    const kL = wp(rig.knL), kR = wp(rig.knR);
    const fL = wp(rig.knL); fL.y -= 0.42;
    const fR = wp(rig.knR); fR.y -= 0.42;
    const P: [THREE.Vector3, number][] = [[head, 0.13], [chest, 0.16], [pelvis, 0.15], [hL, 0.06], [hR, 0.06], [kL, 0.07], [kR, 0.07], [fL, 0.06], [fR, 0.06]];
    const rnd = () => (Math.random() - 0.5);
    P.forEach(([p, r], i) => {
      const whip = i === 0 ? headWhip : i === 1 ? 0.5 + headWhip * 0.25 : 1;
      const fall = (i === 0 ? 0.65 : i === 1 ? 1.0 : 0.5) * wish;
      this.parts.push({
        p: p.clone(),
        v: new THREE.Vector3(
          vx * (0.72 + i * 0.04) * whip + rnd() * fall + rnd() * 0.9,
          vy * 0.65 + fall * 1.15 + (i === 0 ? (headWhip - 1) * 1.1 : 0) + Math.random() * 0.6,
          vz * (0.72 + i * 0.04) * whip + rnd() * fall + rnd() * 0.9,
        ),
        r,
      });
    });
    const C: [number, number, number, number][] = [
      [0, 1, 0.34, 1], [1, 2, 0.5, 1], [1, 3, 0.56, 0.85], [1, 4, 0.56, 0.85], [2, 5, 0.46, 1], [2, 6, 0.46, 1],
      [5, 7, 0.44, 1], [6, 8, 0.44, 1], [0, 2, 0.8, 0.5], [3, 4, 0.9, 0.3], [7, 8, 0.5, 0.6],
      [3, 2, 0.74, 0.25], [4, 2, 0.74, 0.25], [0, 3, 0.62, 0.25], [0, 4, 0.62, 0.25], [1, 7, 0.85, 0.2], [1, 8, 0.85, 0.2],
    ];
    this.cons = C;
    this.update(0.001);
  }

  private smearT = 0;

  update(
    dt: number,
    world?: RagdollWorld,
    onImpact?: (x: number, y: number, z: number, speed: number, nx?: number, nz?: number) => void,
    onSmear?: (x: number, y: number, z: number, vx: number, vz: number) => void,
  ) {
    if (!this.active) return;
    this.t += dt;
    this.smearT -= dt;
    const n = this.parts.length;
    const g = -17.5;
    for (let i = 0; i < n; i++) {
      const a = this.parts[i];
      a.v.y += g * dt;
      a.v.multiplyScalar(Math.exp(-0.48 * dt));
      a.p.addScaledVector(a.v, dt);
    }
    for (let it = 0; it < 6; it++) {
      for (const [i, j, rest, stiff] of this.cons) {
        const a = this.parts[i], b = this.parts[j];
        _v1.subVectors(b.p, a.p);
        const d = _v1.length() || 0.0001;
        const diff = ((d - rest) / d) * 0.5 * stiff;
        _v1.multiplyScalar(diff);
        a.p.add(_v1); b.p.sub(_v1);
        if (it === 0) {
          a.v.addScaledVector(_v1, 0.5); b.v.addScaledVector(_v1, -0.5);
        }
      }
      for (let i = 0; i < n; i++) {
        const a = this.parts[i];
        // Building / wall collision for core body parts on first solver pass
        if (it === 0 && world && i <= 2) {
          world.resolve(a.p.x, a.p.z, a.r + 0.08, a.p.y, _rpo);
          if (_rpo.hit) {
            a.p.x = _rpo.x;
            a.p.z = _rpo.z;
            const vn = a.v.x * _rpo.nx + a.v.z * _rpo.nz;
            if (vn < 0) {
              const imp = -vn;
              a.v.x -= 1.38 * vn * _rpo.nx;
              a.v.z -= 1.38 * vn * _rpo.nz;
              if (onImpact && imp > 2.6 && this.bloodImpactCount < 5) {
                this.bloodImpactCount++;
                onImpact(a.p.x, a.p.y, a.p.z, imp, _rpo.nx, _rpo.nz);
              }
            }
          }
        }
        const floor = this.gy + a.r;
        if (a.p.y < floor) {
          a.p.y = floor;
          if (a.v.y < -2.2 && i <= 2 && onImpact && this.bloodImpactCount < 5) {
            this.bloodImpactCount++;
            onImpact(a.p.x, this.gy, a.p.z, -a.v.y);
          }
          // Continuous blood smear trail while chest/head skids across the ground
          if (it === 0 && i === 1 && onSmear && this.smearT <= 0) {
            const hSp = Math.hypot(a.v.x, a.v.z);
            if (hSp > 1.35) {
              this.smearT = 0.09;
              onSmear(a.p.x, this.gy, a.p.z, a.v.x, a.v.z);
            }
          }
          if (a.v.y < 0) a.v.y *= -0.25;
          a.v.x *= 0.64; a.v.z *= 0.64;
        }
      }
    }
    let motion = 0;
    for (const a of this.parts) motion += a.v.lengthSq();
    if (motion < 0.05) { this.settled = true; this.active = false; }
    if (this.t > 22) { this.active = false; this.settled = true; }
    this.apply();
  }

  apply() {
    const rig = this.rig;
    const [head, chest, pelvis, hL, hR, kL, kR, fL, fR] = this.parts;
    const root = rig.root;
    root.position.copy(pelvis.p);
    root.position.y -= 0.02;
    _v1.subVectors(chest.p, pelvis.p);
    const horiz = Math.hypot(_v1.x, _v1.z);
    const yaw = Math.atan2(_v1.x, _v1.z);
    const pitch = Math.atan2(horiz, Math.max(0.02, _v1.y));
    const roll = clamp((hL.p.y - hR.p.y) * 0.7, -0.5, 0.5);
    root.rotation.set(pitch, yaw, roll, 'YXZ');
    root.updateMatrixWorld(true);
    _q1.copy(root.quaternion).invert();
    const local = (a: THREE.Vector3, b: THREE.Vector3) => _v2.subVectors(b, a).applyQuaternion(_q1).normalize();
    rig.spine.position.y = 0;
    rig.hips.position.y = 0;
    rig.spine.rotation.set(0, 0, 0);
    rig.head.quaternion.setFromUnitVectors(_up, local(chest.p, head.p));
    rig.legL.quaternion.setFromUnitVectors(_down, local(pelvis.p, kL.p));
    rig.legR.quaternion.setFromUnitVectors(_down, local(pelvis.p, kR.p));
    rig.knL.quaternion.setFromUnitVectors(_down, local(kL.p, fL.p));
    rig.knR.quaternion.setFromUnitVectors(_down, local(kR.p, fR.p));
    const shoulderL = _v1.copy(chest.p).add(_v2.set(0.2, 0, 0).applyQuaternion(root.quaternion));
    const shoulderR = new THREE.Vector3(chest.p.x, chest.p.y, chest.p.z).add(new THREE.Vector3(-0.2, 0, 0).applyQuaternion(root.quaternion));
    rig.armL.quaternion.setFromUnitVectors(_down, local(shoulderL, hL.p));
    rig.armR.quaternion.setFromUnitVectors(_down, local(shoulderR, hR.p));
    rig.elL.quaternion.setFromUnitVectors(_down, local(shoulderL, hL.p));
    rig.elR.quaternion.setFromUnitVectors(_down, local(shoulderR, hR.p));
    rig.handR.quaternion.identity();
    _q2.identity();
  }
}
