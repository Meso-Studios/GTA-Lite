// Procedural PBR canvas textures with paired bump/roughness maps (100% runtime, zero external assets).
import * as THREE from 'three';
import { Rng } from './config';
import { STORES, getStoreIndexByName } from './stores';

type Ctx = CanvasRenderingContext2D;

function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}
function toTex(c: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: boolean; aniso?: number } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.aniso ?? 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function addNoise(ctx: Ctx, w: number, h: number, amt: number, rng: Rng) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(id, 0, 0);
}
function hsl(h: number, s: number, l: number) {
  return `hsl(${h},${s}%,${l}%)`;
}

/** Derives a linear grayscale bump map from an albedo canvas for crisp tactile PBR relief. */
export function bumpFromCanvas(src: HTMLCanvasElement, contrast = 1.4, aniso = 4): THREE.CanvasTexture {
  const w = Math.min(512, src.width), h = Math.min(512, src.height);
  const [c, ctx] = mk(w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, 128 + (lum - 128) * contrast));
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return toTex(c, { srgb: false, aniso });
}

// ---------------------------------------------------------------- facades
export type FacadeStyle = 'brick' | 'office' | 'glass' | 'stone' | 'apartment' | 'industrial';
export const BAY = 3.5;
export const FLOOR_H = 3.6;
export const TILE_N = 8;
export const TILE_W = BAY * TILE_N;
export const TILE_H = FLOOR_H * TILE_N;

const WIN: Record<FacadeStyle, (j: number) => number[] | null> = {
  brick: () => [24, 20, 80, 86],
  office: () => [0, 28, 128, 68],
  glass: () => [4, 4, 120, 120],
  stone: () => [36, 12, 56, 96],
  apartment: () => [28, 22, 72, 74],
  industrial: (j) => (j % 4 === 2 ? [8, 42, 112, 28] : null),
};

function glassPane(ctx: Ctx, x: number, y: number, w: number, h: number, rng: Rng, style: FacadeStyle) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.25, y + h);
  const tint = rng.range(-10, 10);
  if (style === 'glass') {
    g.addColorStop(0, hsl(197 + tint, 56, 70));
    g.addColorStop(0.36, hsl(204 + tint, 58, 44));
    g.addColorStop(0.72, hsl(212 + tint, 54, 24));
    g.addColorStop(1, hsl(218 + tint, 52, 14));
  } else {
    g.addColorStop(0, hsl(202 + tint, 38, 52));
    g.addColorStop(0.48, hsl(212 + tint, 40, 24));
    g.addColorStop(1, hsl(220 + tint, 44, 10));
  }
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // Subtle parallax room ceiling + recessed interior silhouette
  ctx.fillStyle = 'rgba(10, 16, 26, 0.36)';
  ctx.fillRect(x, y, w, h * 0.24);
  if (rng.chance(0.55)) {
    ctx.fillStyle = 'rgba(255, 224, 175, 0.14)';
    ctx.fillRect(x + w * 0.14, y + h * 0.16, w * 0.72, Math.max(2, h * 0.08));
  }
  // Crisp diagonal sky reflection streaks
  ctx.fillStyle = style === 'glass' ? 'rgba(225,245,255,0.24)' : 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.06, y + h);
  ctx.lineTo(x + w * 0.42, y);
  ctx.lineTo(x + w * 0.62, y);
  ctx.lineTo(x + w * 0.26, y + h);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.44, y + h);
  ctx.lineTo(x + w * 0.78, y);
  ctx.lineTo(x + w * 0.86, y);
  ctx.lineTo(x + w * 0.52, y + h);
  ctx.fill();
}

export function makeFacade(style: FacadeStyle, seed: number) {
  const rng = new Rng(seed);
  const N = TILE_N, S = 1024, C = S / N;
  const [cd, d] = mk(S, S);
  const [ce, e] = mk(S / 2, S / 2);
  e.fillStyle = '#000';
  e.fillRect(0, 0, S / 2, S / 2);
  e.scale(0.5, 0.5);

  // base wall material with rich mortar/joint craft
  if (style === 'brick') {
    d.fillStyle = '#c4baa8';
    d.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 8) {
      const off = (y / 8) % 2 ? 11 : 0;
      for (let x = -11; x < S; x += 22) {
        const l = rng.range(36, 54);
        d.fillStyle = hsl(rng.range(6, 20), rng.range(32, 48), l);
        d.fillRect(x + off, y + 1, 20, 6);
        // subtle brick highlight lip
        d.fillStyle = 'rgba(255,245,230,0.12)';
        d.fillRect(x + off, y + 1, 20, 1);
      }
    }
  } else if (style === 'office') {
    d.fillStyle = '#cfd3d6';
    d.fillRect(0, 0, S, S);
    // architectural precast panel seams
    d.strokeStyle = 'rgba(55,60,68,0.22)';
    d.lineWidth = 2;
    for (let y = 0; y < S; y += C) {
      d.beginPath(); d.moveTo(0, y); d.lineTo(S, y); d.stroke();
    }
    for (let x = 0; x < S; x += C / 2) {
      d.beginPath(); d.moveTo(x, 0); d.lineTo(x, S); d.stroke();
    }
  } else if (style === 'glass') {
    d.fillStyle = '#203244';
    d.fillRect(0, 0, S, S);
  } else if (style === 'stone') {
    d.fillStyle = '#e2dac8';
    d.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 32) {
      for (let x = ((y / 32) % 2) * 32 - 32; x < S; x += 64) {
        d.fillStyle = hsl(38, rng.range(16, 24), rng.range(76, 86));
        d.fillRect(x + 1, y + 1, 62, 30);
      }
    }
    d.strokeStyle = 'rgba(95,85,68,0.34)';
    d.lineWidth = 1.6;
    for (let y = 0; y < S; y += 32) {
      d.beginPath(); d.moveTo(0, y); d.lineTo(S, y); d.stroke();
      for (let x = ((y / 32) % 2) * 32; x < S; x += 64) {
        d.beginPath(); d.moveTo(x, y); d.lineTo(x, y + 32); d.stroke();
      }
    }
  } else if (style === 'apartment') {
    d.fillStyle = '#ece3d2';
    d.fillRect(0, 0, S, S);
    // horizontal stucco stringcourses
    for (let j = 0; j < N; j++) {
      d.fillStyle = 'rgba(130,118,98,0.16)';
      d.fillRect(0, j * C, S, 4);
      d.fillStyle = 'rgba(255,255,255,0.22)';
      d.fillRect(0, j * C + 4, S, 2);
    }
  } else {
    // corrugated weathered industrial metal
    for (let x = 0; x < S; x += 8) {
      d.fillStyle = (x / 8) % 2 ? '#a6b0b5' : '#859096';
      d.fillRect(x, 0, 8, S);
      d.fillStyle = 'rgba(0,0,0,0.12)';
      d.fillRect(x + 6, 0, 2, S);
    }
    for (let y = 0; y < S; y += 128) {
      d.fillStyle = 'rgba(30,36,42,0.25)';
      d.fillRect(0, y, S, 3);
    }
  }
  addNoise(d, S, S, style === 'glass' ? 10 : 24, rng);

  // subtle vertical rainwater weathering streaks near floor ledges
  for (let k = 0; k < 28; k++) {
    const sx = rng.range(0, S), sy = rng.range(0, S);
    const g = d.createLinearGradient(sx, sy, sx, sy + rng.range(30, 110));
    g.addColorStop(0, 'rgba(30,28,24,0.12)');
    g.addColorStop(1, 'rgba(30,28,24,0)');
    d.fillStyle = g;
    d.fillRect(sx, sy, rng.range(4, 14), 110);
  }

  const lit: boolean[][] = [];
  const curtain: number[][] = [];
  for (let j = 0; j < N; j++) {
    lit[j] = [];
    curtain[j] = [];
    for (let i = 0; i < N; i++) {
      lit[j][i] = rng.chance(0.42);
      curtain[j][i] = rng.chance(0.45) ? rng.range(0.22, 0.95) : 0;
      const cx = i * C, cy = j * C;
      const w = WIN[style](j);
      // floor slab shadow / spandrel
      if (style === 'office') {
        d.fillStyle = '#9aa1a8';
        d.fillRect(cx, cy + 96, C, 32);
        d.fillStyle = 'rgba(0,0,0,0.28)';
        d.fillRect(cx, cy + 96, C, 3);
        d.fillStyle = 'rgba(255,255,255,0.2)';
        d.fillRect(cx, cy + 125, C, 2);
      }
      if (style === 'stone') {
        d.fillStyle = 'rgba(255,255,255,0.34)';
        d.fillRect(cx + 4, cy, 14, C);
        d.fillRect(cx + C - 18, cy, 14, C);
        if (j % 4 === 3) {
          d.fillStyle = '#c8bc9f';
          d.fillRect(cx, cy + C - 13, C, 13);
          d.fillStyle = 'rgba(0,0,0,0.3)';
          d.fillRect(cx, cy + C - 3, C, 3);
        }
      }
      if (!w) continue;
      const [wx, wy, ww, wh] = [cx + w[0], cy + w[1], w[2], w[3]];
      if (style === 'brick' || style === 'apartment' || style === 'stone') {
        // recessed lintel + frame + sill
        d.fillStyle = 'rgba(0,0,0,0.28)';
        d.fillRect(wx - 6, wy - 8, ww + 12, 4);
        d.fillStyle = style === 'brick' ? '#f0ebe2' : style === 'stone' ? '#bdb299' : '#f5f2e9';
        d.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
        d.fillStyle = '#b4aea0';
        d.fillRect(wx - 10, wy + wh + 3, ww + 20, 7);
        d.fillStyle = 'rgba(0,0,0,0.34)';
        d.fillRect(wx - 10, wy + wh + 10, ww + 20, 4);
      }
      if (style === 'glass') {
        glassPane(d, wx, wy, ww, wh, rng, style);
        // spandrel floor band
        d.fillStyle = 'rgba(12, 22, 34, 0.55)';
        d.fillRect(wx, wy + wh - 20, ww, 20);
        if (rng.chance(0.18)) { d.fillStyle = 'rgba(255,255,255,0.14)'; d.fillRect(wx, wy, ww, wh); }
        d.fillStyle = '#121a22';
        d.fillRect(cx, cy, C, 4);
        d.fillRect(cx, cy, 4, C);
        d.fillRect(cx + C / 2 - 1, cy, 2, C);
      } else {
        glassPane(d, wx, wy, ww, wh, rng, style);
        // recessed shadow inside window top
        d.fillStyle = 'rgba(0,0,0,0.32)';
        d.fillRect(wx, wy, ww, 6);
        d.fillStyle = style === 'industrial' ? '#566' : '#f2efe8';
        if (style === 'office') {
          d.fillStyle = '#434a52';
          d.fillRect(cx + C - 2, wy, 3, wh);
          d.fillRect(cx + C / 2 - 1, wy, 2, wh);
          d.fillRect(cx, wy - 2, C, 3);
          d.fillRect(cx, wy + wh - 1, C, 3);
        } else if (style !== 'industrial') {
          d.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
          d.fillRect(wx, wy + wh * 0.42, ww, 3);
        }
      }
      if (curtain[j][i] > 0 && style !== 'glass') {
        // Venetian blinds or drapes
        const bh = wh * curtain[j][i] * 0.78;
        d.fillStyle = hsl(rng.range(24, 48), rng.range(18, 42), rng.range(64, 86));
        d.globalAlpha = 0.85;
        d.fillRect(wx, wy, ww, bh);
        d.globalAlpha = 1;
        d.fillStyle = 'rgba(0,0,0,0.12)';
        for (let by = wy + 4; by < wy + bh; by += 5) d.fillRect(wx, by, ww, 1);
      }
      if (style === 'apartment') {
        if ((i + j) % 2 === 0) {
          d.fillStyle = '#292e33';
          d.fillRect(wx - 12, wy + wh - 18, ww + 24, 3);
          for (let k = 0; k <= 8; k++) d.fillRect(wx - 12 + k * ((ww + 22) / 8), wy + wh - 18, 2, 24);
          d.fillStyle = 'rgba(55,55,55,0.58)';
          d.fillRect(wx - 12, wy + wh + 6, ww + 24, 4);
        } else {
          d.fillStyle = hsl(rng.pick([152, 204, 12, 32]), 36, 38);
          d.fillRect(wx - 20, wy - 2, 14, wh + 4);
          d.fillRect(wx + ww + 6, wy - 2, 14, wh + 4);
        }
      }
      if (style === 'brick' && rng.chance(0.14)) {
        d.fillStyle = '#d8d8d3';
        d.fillRect(wx + 10, wy + wh - 22, 40, 22);
        d.fillStyle = '#666';
        d.fillRect(wx + 14, wy + wh - 18, 32, 3);
        d.fillRect(wx + 14, wy + wh - 12, 32, 3);
      }
      // night emissive glow
      if (lit[j][i]) {
        const g = e.createLinearGradient(wx, wy, wx, wy + wh);
        const warm = rng.chance(0.72);
        const k = rng.range(0.55, 1);
        if (warm) {
          g.addColorStop(0, `rgb(${255 * k},${204 * k},${134 * k})`);
          g.addColorStop(1, `rgb(${255 * k},${168 * k},${88 * k})`);
        } else {
          g.addColorStop(0, `rgb(${195 * k},${225 * k},${255 * k})`);
          g.addColorStop(1, `rgb(${145 * k},${185 * k},${255 * k})`);
        }
        e.fillStyle = g;
        e.fillRect(wx, wy, ww, wh);
        if (curtain[j][i] > 0) {
          e.fillStyle = 'rgba(0,0,0,0.48)';
          e.fillRect(wx, wy, ww, wh * curtain[j][i] * 0.78);
        }
      }
    }
  }
  if (style === 'industrial') {
    d.fillStyle = 'rgba(118,62,28,0.28)';
    for (let k = 0; k < 48; k++) d.fillRect(rng.range(0, S), rng.range(0, S), rng.range(2, 7), rng.range(40, 220));
  }
  return {
    map: toTex(cd),
    emissive: toTex(ce),
    bump: bumpFromCanvas(cd, style === 'glass' ? 0.6 : 1.5, 4),
  };
}

// ---------------------------------------------------------------- storefront (7m x 4.4m)
export function makeStorefront(seed: number) {
  const rng = new Rng(seed);
  const W = 512, H = 320;
  const [c, d] = mk(W, H);
  const [ce, e] = mk(W, H);
  d.fillStyle = '#d6d1c8';
  d.fillRect(0, 0, W, H);
  addNoise(d, W, H, 18, rng);
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);
  const sx = W / 7, sy = H / 4.4;
  // stone plinth
  d.fillStyle = '#44464a';
  d.fillRect(0, H - 0.52 * sy, W, 0.52 * sy);
  // sign band with cornice shadow
  d.fillStyle = '#22242a';
  d.fillRect(0, 0, W, 1.05 * sy);
  d.fillStyle = 'rgba(255,255,255,0.18)';
  d.fillRect(0, 1.05 * sy - 3, W, 3);
  d.fillStyle = 'rgba(0,0,0,0.35)';
  d.fillRect(0, 1.05 * sy, W, 5);
  // display window
  const wx = 0.35 * sx, wy = 1.2 * sy, ww = 4.4 * sx, wh = 2.6 * sy;
  d.fillStyle = '#16181c';
  d.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
  const g = d.createLinearGradient(wx, wy, wx + ww * 0.5, wy + wh);
  g.addColorStop(0, '#82a2b8'); g.addColorStop(0.48, '#334859'); g.addColorStop(1, '#141d26');
  d.fillStyle = g;
  d.fillRect(wx, wy, ww, wh);
  d.fillStyle = 'rgba(255,255,255,0.14)';
  d.beginPath(); d.moveTo(wx + ww * 0.16, wy + wh); d.lineTo(wx + ww * 0.44, wy); d.lineTo(wx + ww * 0.62, wy); d.lineTo(wx + ww * 0.34, wy + wh); d.fill();
  d.fillStyle = '#17181c';
  d.fillRect(wx + ww / 2 - 3, wy, 6, wh);
  // interior glow + shelves
  const ge = e.createLinearGradient(wx, wy, wx, wy + wh);
  ge.addColorStop(0, 'rgb(255,218,155)'); ge.addColorStop(1, 'rgb(195,125,65)');
  e.fillStyle = ge;
  e.fillRect(wx, wy, ww, wh);
  e.fillStyle = 'rgba(0,0,0,0.48)';
  for (let k = 0; k < 4; k++) {
    e.fillRect(wx + 10 + rng.range(0, ww - 60), wy + wh * 0.35 + (k % 2) * wh * 0.3, rng.range(30, 70), 8);
  }
  // door
  const dx = 5.0 * sx, dy = 1.0 * sy, dw = 1.5 * sx, dh = 2.9 * sy;
  d.fillStyle = '#111215';
  d.fillRect(dx - 5, dy - 5, dw + 10, dh + 10);
  const g2 = d.createLinearGradient(dx, dy, dx + dw, dy + dh);
  g2.addColorStop(0, '#7290a3'); g2.addColorStop(1, '#1a2531');
  d.fillStyle = g2;
  d.fillRect(dx, dy, dw, dh);
  d.fillStyle = '#d4d4d4';
  d.fillRect(dx + dw - 14, dy + dh * 0.45, 4, 42);
  e.fillStyle = 'rgb(255,205,135)';
  e.fillRect(dx, dy, dw, dh);
  return { map: toTex(c), emissive: toTex(ce), bump: bumpFromCanvas(c, 1.1, 4) };
}

// ---------------------------------------------------------------- roads
export const ROAD_TILE_LEN = 12.5;
export function makeRoad(seed = 5) {
  const rng = new Rng(seed);
  const W = 512, H = 320; // 20m wide x 12.5m long -> 25.6 px/m
  const [c, d] = mk(W, H);
  d.fillStyle = '#2d3036';
  d.fillRect(0, 0, W, H);
  // fine asphalt stone aggregate
  addNoise(d, W, H, 34, rng);
  const ppm = 25.6;
  // subtle edge gutter AO darkening
  const gl = d.createLinearGradient(0, 0, 34, 0);
  gl.addColorStop(0, 'rgba(0,0,0,0.42)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
  d.fillStyle = gl; d.fillRect(0, 0, 34, H);
  const gr = d.createLinearGradient(W - 34, 0, W, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.42)');
  d.fillStyle = gr; d.fillRect(W - 34, 0, 34, H);
  // tire wear tracks with subtle sheen contrast
  for (const off of [-5.9, -2.4, 2.4, 5.9]) {
    for (const o of [-0.75, 0.75]) {
      d.fillStyle = 'rgba(14,15,18,0.22)';
      d.fillRect(W / 2 + (off + o) * ppm - 14, 0, 28, H);
    }
  }
  // asphalt cracks & tar repairs
  d.strokeStyle = 'rgba(10,10,12,0.62)';
  d.lineWidth = 1.4;
  for (let k = 0; k < 10; k++) {
    d.beginPath();
    let x = rng.range(0, W), y = rng.range(0, H);
    d.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += rng.range(-24, 24); y += rng.range(-24, 24); d.lineTo(x, y); }
    d.stroke();
  }
  d.fillStyle = 'rgba(20,22,26,0.48)';
  for (let k = 0; k < 4; k++) d.fillRect(rng.range(0, W - 70), rng.range(0, H - 50), rng.range(30, 75), rng.range(20, 55));
  // double yellow centerlines
  d.fillStyle = '#f2c229';
  d.fillRect(W / 2 - 0.35 * ppm - 2.5, 0, 5, H);
  d.fillRect(W / 2 + 0.35 * ppm - 2.5, 0, 5, H);
  // crisp lane & edge markings
  d.fillStyle = '#edf0f5';
  for (const s of [-1, 1]) {
    const x = W / 2 + s * 4.15 * ppm;
    d.fillRect(x - 2, 0, 4, H * 0.46);
    d.fillRect(W / 2 + s * 7.85 * ppm - 2.5, 0, 5, H);
  }
  // subtle paint wear
  d.globalCompositeOperation = 'destination-out';
  d.fillStyle = 'rgba(0,0,0,0.18)';
  for (let k = 0; k < 110; k++) d.fillRect(rng.range(0, W), rng.range(0, H), rng.range(2, 7), rng.range(2, 9));
  d.globalCompositeOperation = 'source-over';
  return toTex(c, { aniso: 16 });
}

export function makeRoadBump(seed = 55) {
  const rng = new Rng(seed);
  const [c, d] = mk(256, 256);
  d.fillStyle = '#808080';
  d.fillRect(0, 0, 256, 256);
  addNoise(d, 256, 256, 65, rng);
  d.strokeStyle = '#303030';
  d.lineWidth = 1.5;
  for (let k = 0; k < 8; k++) {
    d.beginPath();
    let x = rng.range(0, 256), y = rng.range(0, 256);
    d.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += rng.range(-25, 25); y += rng.range(-25, 25); d.lineTo(x, y); }
    d.stroke();
  }
  return toTex(c, { srgb: false, aniso: 8 });
}

/** Procedural organic rain-slicked asphalt & multi-lobe puddle roughness map for Simulated RTX street reflections. */
export function makeRoadRoughness(seed = 58) {
  const rng = new Rng(seed);
  const S = 512;
  const [c, d] = mk(S, S);
  // Matte dry asphalt base (~0.88 -> #e0e0e0)
  d.fillStyle = '#e0e0e0';
  d.fillRect(0, 0, S, S);
  addNoise(d, S, S, 34, rng);

  // Broad damp-asphalt longitudinal rain streaks along traffic lanes (natural wet sheen ~0.42–0.56)
  for (const x of [76, 178, 334, 436]) {
    const w = rng.range(54, 84);
    const g = d.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, 'rgba(130,130,130,0)');
    g.addColorStop(0.35, 'rgba(116,116,116,0.42)');
    g.addColorStop(0.5, 'rgba(92,92,92,0.58)');
    g.addColorStop(0.65, 'rgba(116,116,116,0.42)');
    g.addColorStop(1, 'rgba(130,130,130,0)');
    d.fillStyle = g;
    d.fillRect(x - w, 0, w * 2, S);
  }

  // Irregular multi-lobe wet puddles (composited overlapping elongated blobs with soft damp halos — zero circular rings)
  for (let k = 0; k < 14; k++) {
    const cx = rng.range(48, S - 48);
    const cy = rng.range(48, S - 48);
    const lobes = 4 + Math.floor(rng.next() * 4);
    for (let l = 0; l < lobes; l++) {
      const ox = cx + rng.range(-34, 34);
      const oy = cy + rng.range(-48, 48);
      const rx = rng.range(22, 54);
      const ry = rng.range(36, 92);
      const rot = rng.range(-0.35, 0.35);
      d.save();
      d.translate(ox, oy);
      d.rotate(rot);
      d.scale(1, ry / rx);
      const g = d.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
      g.addColorStop(0, 'rgba(28,28,28,0.68)');
      g.addColorStop(0.55, 'rgba(54,54,54,0.42)');
      g.addColorStop(1, 'rgba(220,220,220,0)');
      d.fillStyle = g;
      d.beginPath();
      d.arc(0, 0, rx, 0, Math.PI * 2);
      d.fill();
      d.restore();
    }
  }
  // Subtle micro-grit variation so reflections break up realistically across asphalt aggregate
  addNoise(d, S, S, 18, rng);
  return toTex(c, { srgb: false, aniso: 8 });
}

/** Crisp airport asphalt runway texture with painted edge lines and centerline dashes. */
export function makeRunwayTexture(seed = 88) {
  const rng = new Rng(seed);
  const W = 512, H = 512;
  const [c, d] = mk(W, H);
  d.fillStyle = '#2d3036';
  d.fillRect(0, 0, W, H);
  addNoise(d, W, H, 24, rng);
  // Rubber tire skid marks down the center
  for (let k = 0; k < 22; k++) {
    d.fillStyle = 'rgba(14,15,18,0.22)';
    const x = W / 2 + rng.range(-70, 70);
    d.fillRect(x, 0, rng.range(4, 14), H);
  }
  // Solid white runway side stripes
  d.fillStyle = '#eef2f6';
  d.fillRect(22, 0, 10, H);
  d.fillRect(W - 32, 0, 10, H);
  // Bold white centerline dashes
  d.fillRect(W / 2 - 6, 40, 12, 220);
  d.fillRect(W / 2 - 6, 320, 12, 160);
  // Touchdown aim bars
  d.fillStyle = 'rgba(240,244,248,0.75)';
  for (const s of [-1, 1]) {
    d.fillRect(W / 2 + s * 115 - 12, 80, 24, 140);
  }
  return toTex(c, { aniso: 12 });
}

export function makeIntersection(seed = 6) {
  const rng = new Rng(seed);
  const S = 512;
  const [c, d] = mk(S, S);
  d.fillStyle = '#383a3e';
  d.fillRect(0, 0, S, S);
  addNoise(d, S, S, 30, rng);
  for (const off of [-5.9, -2.4, 2.4, 5.9]) {
    d.fillStyle = 'rgba(0,0,0,0.12)';
    d.fillRect(S / 2 + off * 25.6 - 16, 0, 32, S);
    d.fillRect(0, S / 2 + off * 25.6 - 16, S, 32);
  }
  // manhole cover detail
  d.strokeStyle = 'rgba(20,22,25,0.65)';
  d.fillStyle = '#474a50';
  d.lineWidth = 3;
  d.beginPath(); d.arc(S * 0.56, S * 0.44, 11, 0, Math.PI * 2); d.fill(); d.stroke();
  return toTex(c, { aniso: 12 });
}
export function makeCrosswalk() {
  const W = 128, H = 512;
  const [c, d] = mk(W, H);
  const rng = new Rng(9);
  d.fillStyle = 'rgba(240,240,238,0.94)';
  for (let y = 12; y < H - 12; y += 36) d.fillRect(8, y, W - 16, 18);
  d.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 150; k++) {
    d.fillStyle = `rgba(0,0,0,${rng.range(0.08, 0.45)})`;
    d.fillRect(rng.range(0, W), rng.range(0, H), rng.range(2, 11), rng.range(2, 9));
  }
  return toTex(c, { repeat: false });
}
export function makeStopLine() {
  const [c, d] = mk(32, 256);
  d.fillStyle = 'rgba(235,235,235,0.9)';
  d.fillRect(0, 0, 32, 256);
  return toTex(c, { repeat: false });
}

// ---------------------------------------------------------------- ground & interior surfaces
function surfaceCanvas(base: string, noiseAmt: number, seed: number, size = 256, extra?: (d: Ctx, rng: Rng, s: number) => void) {
  const rng = new Rng(seed);
  const [c, d] = mk(size, size);
  d.fillStyle = base;
  d.fillRect(0, 0, size, size);
  extra?.(d, rng, size);
  addNoise(d, size, size, noiseAmt, rng);
  return c;
}
function surface(base: string, noiseAmt: number, seed: number, size = 256, extra?: (d: Ctx, rng: Rng, s: number) => void) {
  return toTex(surfaceCanvas(base, noiseAmt, seed, size, extra));
}

export const makeSidewalk = () =>
  surface('#585650', 28, 11, 512, (d, rng, s) => {
    const cell = s / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const x0 = i * cell + 5, y0 = j * cell + 5, w = cell - 10, h = cell - 10;
      d.fillStyle = hsl(34, 8, rng.range(47, 54));
      d.fillRect(x0, y0, w, h);
      // subtle directional broom-finish concrete grain
      for (let line = 0; line < 18; line++) {
        d.fillStyle = line % 2 === 0 ? 'rgba(255,252,244,0.035)' : 'rgba(20,18,16,0.045)';
        d.fillRect(x0, y0 + rng.range(0, h - 2), w, rng.range(1, 3));
      }
      // soft pedestrian weathering patches
      d.fillStyle = 'rgba(34,32,28,0.07)';
      d.fillRect(x0 + rng.range(8, w * 0.5), y0 + rng.range(8, h * 0.5), rng.range(36, 92), rng.range(28, 76));
      // crisp top-edge sunlight catch & bottom recessed mortar bevel
      d.fillStyle = 'rgba(255,250,240,0.16)';
      d.fillRect(x0, y0, w, 3);
      d.fillRect(x0, y0, 2, h);
      d.fillStyle = 'rgba(12,12,10,0.28)';
      d.fillRect(x0, y0 + h - 3, w, 3);
      d.fillRect(x0 + w - 2, y0, 2, h);
    }
  });

export const makeSidewalkBump = () =>
  bumpFromCanvas(
    surfaceCanvas('#909090', 26, 111, 256, (d, _r, s) => {
      d.strokeStyle = '#202020';
      d.lineWidth = 4;
      d.strokeRect(0, 0, s, s);
      d.beginPath(); d.moveTo(s / 2, 0); d.lineTo(s / 2, s); d.moveTo(0, s / 2); d.lineTo(s, s / 2); d.stroke();
    }),
    1.5,
  );

export const makeConcrete = () =>
  surface('#93938d', 18, 12, 256, (d, rng, s) => {
    d.strokeStyle = 'rgba(38,38,40,0.38)';
    d.lineWidth = 2;
    d.strokeRect(0, 0, s, s);
    d.beginPath(); d.moveTo(s / 2, 0); d.lineTo(s / 2, s); d.moveTo(0, s / 2); d.lineTo(s, s / 2); d.stroke();
    for (let k = 0; k < 20; k++) {
      d.fillStyle = 'rgba(0,0,0,0.08)';
      d.beginPath(); d.arc(rng.range(0, s), rng.range(0, s), rng.range(2, 10), 0, Math.PI * 2); d.fill();
    }
  });

export const makeAsphaltLot = () =>
  surface('#45474b', 28, 13, 256, (d, rng, s) => {
    d.strokeStyle = 'rgba(0,0,0,0.44)';
    for (let k = 0; k < 8; k++) {
      d.beginPath(); let x = rng.range(0, s), y = rng.range(0, s); d.moveTo(x, y);
      for (let q = 0; q < 5; q++) { x += rng.range(-30, 30); y += rng.range(-30, 30); d.lineTo(x, y); }
      d.stroke();
    }
  });

export const makeGrass = () =>
  surface('#4e7d34', 28, 14, 256, (d, rng, s) => {
    for (let k = 0; k < 2400; k++) {
      d.strokeStyle = hsl(rng.range(74, 108), rng.range(34, 58), rng.range(22, 44));
      const x = rng.range(0, s), y = rng.range(0, s);
      d.beginPath(); d.moveTo(x, y); d.lineTo(x + rng.range(-2.2, 2.2), y - rng.range(2, 7)); d.stroke();
    }
  });

/** Tactile wind-rippled golden sand albedo + matching bump map. */
export const makeSand = () =>
  surface('#dec992', 24, 15, 256, (d, rng, s) => {
    // subtle wind-blown ripples
    for (let y = 0; y < s; y += 16) {
      const g = d.createLinearGradient(0, y, 0, y + 16);
      g.addColorStop(0, 'rgba(255,244,210,0.18)');
      g.addColorStop(0.5, 'rgba(175,142,84,0.18)');
      g.addColorStop(1, 'rgba(255,244,210,0.15)');
      d.fillStyle = g;
      d.beginPath();
      d.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) {
        d.lineTo(x, y + Math.sin((x / s) * Math.PI * 2 + y * 0.08) * 3.5);
      }
      d.lineTo(s, y + 16);
      d.lineTo(0, y + 16);
      d.closePath();
      d.fill();
    }
    // tiny quartz & shell flecks
    for (let k = 0; k < 450; k++) {
      d.fillStyle = rng.chance(0.5) ? 'rgba(255,250,232,0.35)' : 'rgba(130,104,64,0.28)';
      d.fillRect(rng.range(0, s), rng.range(0, s), 1.5, 1.5);
    }
  });

export const makeSandBump = () => {
  const c = surfaceCanvas('#808080', 38, 151, 256, (d, _rng, s) => {
    for (let y = 0; y < s; y += 16) {
      const g = d.createLinearGradient(0, y, 0, y + 16);
      g.addColorStop(0, '#c8c8c8');
      g.addColorStop(0.5, '#464646');
      g.addColorStop(1, '#c8c8c8');
      d.fillStyle = g;
      d.fillRect(0, y, s, 16);
    }
  });
  return toTex(c, { srgb: false, aniso: 6 });
};

export const makeGravel = () => surface('#58585a', 44, 16, 128);
export const makeDirt = () => surface('#6d5a45', 34, 17, 256);

export const makeWood = () =>
  surface('#8b6240', 16, 18, 512, (d, rng, s) => {
    const rows = 8;
    const rh = s / rows;
    for (let row = 0; row < rows; row++) {
      const y = row * rh;
      const tone = rng.range(32, 42);
      d.fillStyle = hsl(27 + rng.range(-3, 3), rng.range(34, 46), tone);
      d.fillRect(0, y, s, rh - 1.5);
      // Warm cathedral wood grain lines
      for (let g = 0; g < 10; g++) {
        d.strokeStyle = g % 3 === 0 ? 'rgba(255,228,192,0.08)' : 'rgba(38,20,8,0.2)';
        d.lineWidth = g % 4 === 0 ? 1.6 : 0.9;
        d.beginPath();
        const yy = y + rng.range(3, rh - 4);
        d.moveTo(0, yy);
        d.bezierCurveTo(s * 0.3, yy + rng.range(-4, 4), s * 0.7, yy + rng.range(-4, 4), s, yy);
        d.stroke();
      }
      // Subtle bevel edge
      d.fillStyle = 'rgba(255,235,205,0.12)';
      d.fillRect(0, y + 1, s, 1.5);
      d.fillStyle = 'rgba(24,12,4,0.52)';
      d.fillRect(0, y + rh - 2, s, 2);
    }
  });

/** Seamless 512x512 oak/walnut hardwood floorboards with staggered butt joints, plank bevels & knots. */
export const makeFloorboards = () =>
  surface('#916843', 14, 182, 512, (d, rng, s) => {
    const planks = 8;
    const ph = s / planks;
    for (let row = 0; row < planks; row++) {
      const y = row * ph;
      const jointX = ((row * 167 + 90) % (s - 80)) + 40;
      const segs: [number, number][] = [[0, jointX], [jointX, s]];
      for (const [x0, x1] of segs) {
        const hue = 26 + rng.range(-4, 4);
        const sat = rng.range(32, 46);
        const lit = rng.range(33, 45);
        d.fillStyle = hsl(hue, sat, lit);
        d.fillRect(x0, y, x1 - x0, ph);
        // Longitudinal wood grain streaks & subtle sheen variation
        for (let g = 0; g < 14; g++) {
          d.strokeStyle = g % 4 === 0 ? 'rgba(255,236,205,0.09)' : 'rgba(42,24,10,0.19)';
          d.lineWidth = rng.range(0.7, 1.8);
          d.beginPath();
          const gy = y + rng.range(3, ph - 4);
          d.moveTo(x0, gy);
          d.bezierCurveTo(x0 + (x1 - x0) * 0.33, gy + rng.range(-3, 3), x0 + (x1 - x0) * 0.66, gy + rng.range(-3, 3), x1, gy);
          d.stroke();
        }
        // Occasional wood knot
        if (rng.chance(0.32) && x1 - x0 > 90) {
          const kx = rng.range(x0 + 26, x1 - 26);
          const ky = y + rng.range(12, ph - 12);
          d.fillStyle = 'rgba(42,24,12,0.42)';
          d.beginPath();
          d.ellipse(kx, ky, rng.range(6, 12), rng.range(3, 5.5), 0, 0, Math.PI * 2);
          d.fill();
        }
        // Subtle light bevel on top edge of plank
        d.fillStyle = 'rgba(255,240,214,0.12)';
        d.fillRect(x0 + 1, y + 1, x1 - x0 - 2, 1.5);
      }
      // Crisp dark plank groove seams (horizontal + staggered vertical butt joint)
      d.fillStyle = 'rgba(22,12,5,0.68)';
      d.fillRect(0, y, s, 2.2);
      d.fillRect(jointX - 1, y, 2.2, ph);
    }
  });

export const makeFloorboardsBump = () => {
  const c = surfaceCanvas('#8a8a8a', 18, 183, 512, (d, rng, s) => {
    const planks = 8;
    const ph = s / planks;
    for (let row = 0; row < planks; row++) {
      const y = row * ph;
      const jointX = ((row * 167 + 90) % (s - 80)) + 40;
      for (let g = 0; g < 10; g++) {
        d.strokeStyle = g % 2 === 0 ? 'rgba(220,220,220,0.16)' : 'rgba(60,60,60,0.22)';
        d.lineWidth = 1;
        const gy = y + rng.range(3, ph - 3);
        d.beginPath(); d.moveTo(0, gy); d.lineTo(s, gy); d.stroke();
      }
      d.fillStyle = '#181818';
      d.fillRect(0, y, s, 3);
      d.fillRect(jointX - 1.5, y, 3, ph);
    }
  });
  return toTex(c, { srgb: false, aniso: 8 });
};

/** Woven upholstery & leatherette furniture texture + matching tactile bump map. */
export const makeUpholstery = () =>
  surface('#d8d2c8', 12, 191, 256, (d, rng, s) => {
    // Cross-hatched woven textile fibers
    for (let y = 0; y < s; y += 4) {
      d.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';
      d.fillRect(0, y, s, 2);
    }
    for (let x = 0; x < s; x += 4) {
      d.fillStyle = x % 8 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
      d.fillRect(x, 0, 2, s);
    }
    // Subtle tufted seam lines
    d.strokeStyle = 'rgba(0,0,0,0.16)';
    d.lineWidth = 1.5;
    for (let k = 64; k < s; k += 64) {
      d.beginPath(); d.moveTo(0, k); d.lineTo(s, k); d.stroke();
      d.beginPath(); d.moveTo(k, 0); d.lineTo(k, s); d.stroke();
    }
    for (let i = 0; i < 40; i++) {
      d.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      d.fillRect(rng.range(0, s), rng.range(0, s), rng.range(8, 22), 2);
    }
  });

export const makeUpholsteryBump = () => {
  const c = surfaceCanvas('#848484', 24, 192, 256, (d, _rng, s) => {
    for (let y = 0; y < s; y += 4) {
      d.fillStyle = y % 8 === 0 ? '#a8a8a8' : '#646464';
      d.fillRect(0, y, s, 2);
    }
    for (let x = 0; x < s; x += 4) {
      d.fillStyle = 'rgba(180,180,180,0.35)';
      d.fillRect(x, 0, 2, s);
    }
    d.strokeStyle = '#303030';
    d.lineWidth = 2;
    for (let k = 64; k < s; k += 64) {
      d.beginPath(); d.moveTo(0, k); d.lineTo(s, k); d.stroke();
    }
  });
  return toTex(c, { srgb: false, aniso: 4 });
};

/** Subtle warm architectural wall plaster & painted paneling texture. */
export const makeWallPlaster = () =>
  surface('#ece8df', 12, 196, 256, (d, rng, s) => {
    for (let k = 0; k < 28; k++) {
      const rx = rng.range(0, s), ry = rng.range(0, s), rad = rng.range(16, 48);
      const g = d.createRadialGradient(rx, ry, 2, rx, ry, rad);
      g.addColorStop(0, rng.chance(0.5) ? 'rgba(255,255,255,0.08)' : 'rgba(120,110,95,0.07)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(rx - rad, ry - rad, rad * 2, rad * 2);
    }
    // Fine vertical wallpaper/panel seams
    d.strokeStyle = 'rgba(110,104,94,0.14)';
    d.lineWidth = 1;
    for (let x = 0; x < s; x += 64) {
      d.beginPath(); d.moveTo(x, 0); d.lineTo(x, s); d.stroke();
    }
  });

/** Coffered architectural ceiling tile grid texture + bump map. */
export const makeCeilingTile = () =>
  surface('#f1eee6', 10, 199, 256, (d, rng, s) => {
    const step = s / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const x = i * step, y = j * step;
      d.fillStyle = '#f3f0e8';
      d.fillRect(x + 4, y + 4, step - 8, step - 8);
      d.strokeStyle = 'rgba(120,115,105,0.34)';
      d.lineWidth = 3;
      d.strokeRect(x + 2, y + 2, step - 4, step - 4);
      d.strokeStyle = 'rgba(255,255,255,0.45)';
      d.lineWidth = 1.5;
      d.strokeRect(x + 6, y + 6, step - 12, step - 12);
      // Subtle acoustic micro-stipple
      for (let p = 0; p < 55; p++) {
        d.fillStyle = 'rgba(105,100,90,0.12)';
        d.fillRect(x + rng.range(10, step - 10), y + rng.range(10, step - 10), 2, 2);
      }
    }
  });

/** Crisp backlit illuminated architectural EXIT sign texture. */
export function makeExitSign() {
  const [c, d] = mk(256, 96);
  d.fillStyle = '#0e1714';
  d.fillRect(0, 0, 256, 96);
  d.strokeStyle = '#36f59a';
  d.lineWidth = 6;
  d.strokeRect(6, 6, 244, 84);
  d.fillStyle = '#143326';
  d.fillRect(12, 12, 232, 72);
  d.fillStyle = '#52ffb0';
  d.font = 'bold 52px Impact, "Arial Black", sans-serif';
  d.textAlign = 'center';
  d.textBaseline = 'middle';
  d.fillText('EXIT', 112, 50);
  // Running-man / directional arrow glyph
  d.beginPath();
  d.moveTo(188, 32);
  d.lineTo(222, 48);
  d.lineTo(188, 64);
  d.closePath();
  d.fill();
  return toTex(c, { repeat: false, aniso: 4 });
}

export const makeInteriorTile = () =>
  surface('#d8d4ca', 12, 31, 256, (d, rng, s) => {
    const step = s / 4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const alt = (i + j) % 2 === 0;
      d.fillStyle = alt ? hsl(40, 12, rng.range(80, 85)) : hsl(38, 10, rng.range(72, 77));
      d.fillRect(i * step + 2, j * step + 2, step - 4, step - 4);
    }
    d.strokeStyle = 'rgba(60,55,48,0.45)';
    d.lineWidth = 2;
    for (let k = 0; k <= 4; k++) {
      d.beginPath(); d.moveTo(k * step, 0); d.lineTo(k * step, s); d.stroke();
      d.beginPath(); d.moveTo(0, k * step); d.lineTo(s, k * step); d.stroke();
    }
  });

export const makeInteriorMarble = () =>
  surface('#ebe5d8', 10, 32, 256, (d, rng, s) => {
    // natural marble veining
    for (let k = 0; k < 14; k++) {
      d.strokeStyle = `rgba(130,120,104,${rng.range(0.08, 0.24)})`;
      d.lineWidth = rng.range(0.8, 2.5);
      d.beginPath();
      let x = rng.range(0, s), y = rng.range(0, s);
      d.moveTo(x, y);
      for (let q = 0; q < 6; q++) { x += rng.range(-40, 50); y += rng.range(-30, 40); d.lineTo(x, y); }
      d.stroke();
    }
    d.strokeStyle = 'rgba(110,100,85,0.28)';
    d.lineWidth = 1.5;
    d.strokeRect(0, 0, s, s);
    d.beginPath(); d.moveTo(s / 2, 0); d.lineTo(s / 2, s); d.moveTo(0, s / 2); d.lineTo(s, s / 2); d.stroke();
  });

export function makeWaterNormal(size = 256) {
  const h = new Float32Array(size * size);
  const rng = new Rng(77);
  const waves: number[][] = [];
  for (let k = 0; k < 9; k++) waves.push([rng.int(1, 6), rng.int(1, 6), rng.range(0, 6.28), rng.range(0.4, 1) / (k + 1)]);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const [fx, fy, ph, a] of waves) v += Math.sin(((x * fx + y * fy) / size) * Math.PI * 2 + ph) * a;
      h[y * size + x] = v;
    }
  const [c, d] = mk(size, size);
  const id = d.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x], dn = h[((y + 1) % size) * size + x];
      let nx = (l - r) * 1.5, ny = (u - dn) * 1.5, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      id.data[i] = (nx * 0.5 + 0.5) * 255;
      id.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      id.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      id.data[i + 3] = 255;
    }
  d.putImageData(id, 0, 0);
  return toTex(c, { srgb: false });
}

export function makeGlow() {
  const [c, d] = mk(128, 128);
  const g = d.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  d.fillStyle = g;
  d.fillRect(0, 0, 128, 128);
  return toTex(c, { repeat: false, aniso: 1 });
}

/** Soft radial contact shadow decal texture for pedestrians. */
export function makeContactShadow() {
  const [c, d] = mk(128, 128);
  const g = d.createRadialGradient(64, 64, 8, 64, 64, 60);
  g.addColorStop(0, 'rgba(0,0,0,0.56)');
  g.addColorStop(0.52, 'rgba(0,0,0,0.26)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  d.fillStyle = g;
  d.fillRect(0, 0, 128, 128);
  return toTex(c, { repeat: false, aniso: 1 });
}

/** Soft rounded-rectangle underbody AO contact shadow for cars & aircraft. */
export function makeVehicleShadow() {
  const W = 128, H = 256;
  const [c, d] = mk(W, H);
  d.clearRect(0, 0, W, H);
  // Outer soft ambient penumbra
  const g1 = d.createRadialGradient(W / 2, H / 2, 16, W / 2, H / 2, W * 0.56);
  g1.addColorStop(0, 'rgba(0,0,0,0.52)');
  g1.addColorStop(0.7, 'rgba(0,0,0,0.24)');
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  d.save();
  d.translate(W / 2, H / 2);
  d.scale(1, 1.85);
  d.fillStyle = g1;
  d.beginPath();
  d.arc(0, 0, W * 0.52, 0, Math.PI * 2);
  d.fill();
  d.restore();
  // Dense chassis core AO directly under frame
  d.save();
  d.filter = 'blur(8px)';
  d.fillStyle = 'rgba(0,0,0,0.68)';
  d.beginPath();
  d.roundRect(22, 24, W - 44, H - 48, 22);
  d.fill();
  d.restore();
  return toTex(c, { repeat: false, aniso: 4 });
}

// ---------------------------------------------------------------- 320+ GTA-6 Store Sign Atlas (8 cols x 42 rows, 2048x2048)
const SIGN_COLS = 8;
const SIGN_ROWS = 42;
export const SIGN_NAMES: string[] = STORES.map((s) => s.name);

export function makeSignAtlas() {
  const W = 2048, H = 2048;
  const cellW = W / SIGN_COLS; // 256
  const cellH = H / SIGN_ROWS; // ~48.76
  const [c, d] = mk(W, H);
  d.fillStyle = '#07070b';
  d.fillRect(0, 0, W, H);
  STORES.forEach((store, idx) => {
    const col = idx % SIGN_COLS;
    const row = Math.floor(idx / SIGN_COLS);
    const x = col * cellW;
    const y = row * cellH;
    // Rich style-specific sign backing & framing
    d.fillStyle = store.bg;
    d.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
    if (store.style === 'deco') {
      // Art Deco pastel horizontal trim stripes
      d.fillStyle = store.accent;
      d.fillRect(x + 6, y + 5, cellW - 12, 3);
      d.fillRect(x + 6, y + cellH - 8, cellW - 12, 3);
      d.strokeStyle = store.fg;
      d.lineWidth = 2;
      d.strokeRect(x + 4, y + 4, cellW - 8, cellH - 8);
    } else if (store.style === 'luxury') {
      // Gold hairline double border
      d.strokeStyle = store.accent;
      d.lineWidth = 2;
      d.strokeRect(x + 5, y + 5, cellW - 10, cellH - 10);
      d.strokeStyle = 'rgba(255,235,165,0.45)';
      d.lineWidth = 1;
      d.strokeRect(x + 9, y + 8, cellW - 18, cellH - 16);
    } else if (store.style === 'bodega') {
      // Warm storefront banner top bar + bold frame
      d.fillStyle = store.accent;
      d.fillRect(x + 3, y + 3, cellW - 6, 6);
      d.strokeStyle = store.fg;
      d.lineWidth = 2;
      d.strokeRect(x + 4, y + 4, cellW - 8, cellH - 8);
    } else if (store.style === 'diner') {
      // Retro chrome checkerboard corners + neon outline
      d.strokeStyle = store.accent;
      d.lineWidth = 2.5;
      d.strokeRect(x + 5, y + 5, cellW - 10, cellH - 10);
      d.fillStyle = store.fg;
      d.fillRect(x + 8, y + cellH / 2 - 3, 6, 6);
      d.fillRect(x + cellW - 14, y + cellH / 2 - 3, 6, 6);
    } else {
      // Neon / retail glowing border
      d.strokeStyle = store.fg;
      d.lineWidth = 2.5;
      d.strokeRect(x + 5, y + 5, cellW - 10, cellH - 10);
    }
    // Crisp auto-fitted store typography
    d.fillStyle = store.fg;
    const fontFamily = store.style === 'luxury'
      ? 'Georgia, "Times New Roman", serif'
      : store.style === 'deco'
        ? '"Trebuchet MS", Arial, sans-serif'
        : 'Impact, "Arial Black", sans-serif';
    let size = store.style === 'luxury' ? 23 : 27;
    d.font = `bold ${size}px ${fontFamily}`;
    while (d.measureText(store.name).width > cellW - 26 && size > 11) {
      size -= 1;
      d.font = `bold ${size}px ${fontFamily}`;
    }
    d.textAlign = 'center';
    d.textBaseline = 'middle';
    d.fillText(store.name, x + cellW * 0.5, y + cellH * 0.53);
  });
  return toTex(c, { repeat: false, aniso: 8 });
}

export function signUV(nameOrIdx: string | number): [number, number, number, number] {
  const idx = typeof nameOrIdx === 'number'
    ? ((nameOrIdx % STORES.length) + STORES.length) % STORES.length
    : getStoreIndexByName(nameOrIdx);
  const col = idx % SIGN_COLS;
  const row = Math.floor(idx / SIGN_COLS);
  return [col / SIGN_COLS, 1 - (row + 1) / SIGN_ROWS, 1 / SIGN_COLS, 1 / SIGN_ROWS];
}

// highway interstate gantry signs (2x2 atlas)
export function makeHighwaySignAtlas() {
  const [c, d] = mk(1024, 512);
  const entries = [
    { top: 'I-95 NORTH · BELTWAY', sub: 'NORTH HILLS  ▲  3.0 KM' },
    { top: 'ROUTE 66 WEST · DUNES', sub: 'GOLDEN DUNES  ◀  2.5 KM' },
    { top: 'OCEAN CAUSEWAY SOUTH', sub: 'NOVA KEYS ISLAND  ▼  1.8 KM' },
    { top: 'SAN NOVA DOWNTOWN', sub: 'METRO CORE · BEACHFRONT  ▶' },
  ];
  entries.forEach((en, i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
    d.fillStyle = '#0e5b34';
    d.fillRect(x, y, 512, 256);
    d.strokeStyle = '#f2f6f2';
    d.lineWidth = 10;
    d.strokeRect(x + 14, y + 14, 484, 228);
    d.fillStyle = '#ffffff';
    d.textAlign = 'center';
    d.textBaseline = 'middle';
    d.font = 'bold 36px Arial, sans-serif';
    d.fillText(en.top, x + 256, y + 96);
    d.fillStyle = '#ffd659';
    d.font = 'bold 28px Arial, sans-serif';
    d.fillText(en.sub, x + 256, y + 166);
  });
  return toTex(c, { repeat: false });
}

// billboards / ads atlas (2x2, 512x256 each)
export function makeAdAtlas() {
  const [c, d] = mk(1024, 512);
  const ads = [
    { t: 'NOVA COLA', s: 'ICE COLD. EVERY TIME.', a: '#d11a2a', b: '#ff7b54' },
    { t: 'SKYLINE AIR', s: 'FLY ABOVE IT ALL', a: '#0f5fbf', b: '#45d1ff' },
    { t: 'BURGER BARON', s: 'FIT FOR A KING', a: '#e8a200', b: '#ffdd55' },
    { t: 'VICE MOTORS', s: 'DRIVE THE NIGHT', a: '#4b1fa8', b: '#ff4fd8' },
  ];
  ads.forEach((ad, i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
    const g = d.createLinearGradient(x, y, x + 512, y + 256);
    g.addColorStop(0, ad.a); g.addColorStop(1, ad.b);
    d.fillStyle = g;
    d.fillRect(x, y, 512, 256);
    d.fillStyle = 'rgba(255,255,255,0.12)';
    d.beginPath(); d.arc(x + 420, y + 60, 120, 0, 7); d.fill();
    d.fillStyle = '#fff';
    d.textAlign = 'center';
    d.font = 'bold 64px Impact, "Arial Black", sans-serif';
    d.fillText(ad.t, x + 256, y + 120);
    d.font = 'bold 26px Arial, sans-serif';
    d.fillText(ad.s, x + 256, y + 170);
  });
  return toTex(c, { repeat: false });
}

// ---------------------------------------------------------------- foliage atlas (2x2, transparent)
export function makeLeafAtlas() {
  const S = 512;
  const [c, d] = mk(S, S);
  d.clearRect(0, 0, S, S);
  const rng = new Rng(451);
  d.translate(S / 2, S / 2);
  const leaf = (x: number, y: number, len: number, wid: number, a: number, col: string) => {
    d.save();
    d.translate(x, y);
    d.rotate(a);
    const g = d.createLinearGradient(0, -len / 2, 0, len / 2);
    g.addColorStop(0, col);
    g.addColorStop(0.55, shadeH(col, 0.82));
    g.addColorStop(1, shadeH(col, 0.6));
    d.fillStyle = g;
    d.beginPath();
    d.moveTo(0, -len / 2);
    d.bezierCurveTo(wid, -len / 4, wid * 0.9, len / 3.4, 0, len / 2);
    d.bezierCurveTo(-wid * 0.9, len / 3.4, -wid, -len / 4, 0, -len / 2);
    d.fill();
    d.strokeStyle = 'rgba(0,0,0,0.22)';
    d.lineWidth = 1.4;
    d.beginPath(); d.moveTo(0, -len / 2); d.lineTo(0, len / 2); d.stroke();
    for (let i = 1; i < 4; i++) {
      d.beginPath(); d.moveTo(0, -len / 2 + i * len / 5);
      d.lineTo(wid * 0.55, -len / 2 + i * len / 5 + 4);
      d.moveTo(0, -len / 2 + i * len / 5);
      d.lineTo(-wid * 0.55, -len / 2 + i * len / 5 + 4);
      d.stroke();
    }
    d.restore();
  };
  function shadeH(hslStr: string, k: number) {
    const m = hslStr.match(/hsl\((\d+),(\d+)%,(\d+)%\)/);
    if (!m) return hslStr;
    return `hsl(${m[1]},${m[2]}%,${Math.max(4, +m[3] * k)}%)`;
  }
  d.save(); d.translate(-128, -128);
  for (let i = 0; i < 46; i++) {
    const a = rng.next() * Math.PI * 2, r = Math.pow(rng.next(), 0.6) * 120;
    leaf(Math.cos(a) * r, Math.sin(a) * r, 62 + rng.range(-14, 22), 17 + rng.next() * 10, a + Math.PI / 2 + rng.range(-0.5, 0.5), `hsl(${rng.range(88, 125)},${rng.range(38, 58)}%,${rng.range(20, 38)}%)`);
  }
  d.restore();
  d.save(); d.translate(128, -128);
  for (let i = 0; i < 26; i++) {
    const y = -120 + i * 9;
    const w = 1 - i / 32;
    leaf((i % 2 ? 1 : -1) * 22 * w, y, 54 + rng.next() * 18, 6, Math.PI / 2 + (i % 2 ? 1 : -1) * 1.1, `hsl(${rng.range(120, 152)},${rng.range(30, 48)}%,${rng.range(14, 26)}%)`);
  }
  d.restore();
  d.save(); d.translate(-128, 128);
  d.strokeStyle = '#4a6b2a'; d.lineWidth = 5;
  d.beginPath(); d.moveTo(-110, 40); d.quadraticCurveTo(0, -70, 118, 20); d.stroke();
  for (let i = 0; i < 30; i++) {
    const t = i / 29;
    const x = -110 + t * 228, y = 40 - Math.sin(t * Math.PI) * 74;
    leaf(x, y, 58 - t * 22, 7, (i % 2 ? 1 : -1) * 0.9 + Math.PI / 2, `hsl(${rng.range(96, 128)},${rng.range(40, 58)}%,${rng.range(22, 40)}%)`);
  }
  d.restore();
  d.save(); d.translate(128, 128);
  for (let i = 0; i < 60; i++) {
    const a = rng.next() * Math.PI * 2, r = Math.pow(rng.next(), 0.5) * 118;
    leaf(Math.cos(a) * r, Math.sin(a) * r * 0.9, 30 + rng.next() * 26, 10 + rng.next() * 7, a + Math.PI / 2, `hsl(${rng.range(70, 110)},${rng.range(30, 55)}%,${rng.range(18, 34)}%)`);
  }
  d.restore();
  return toTex(c, { repeat: false, aniso: 4 });
}
export const LEAF_CELLS: [number, number, number, number][] = [
  [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], [0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5],
];
