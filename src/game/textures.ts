// Procedural PBR canvas textures with paired bump/roughness maps (100% runtime, zero external assets).
import * as THREE from 'three';
import { Rng } from './config';

type Ctx = CanvasRenderingContext2D;

function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
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
  const g = ctx.createLinearGradient(x, y, x + w * 0.35, y + h);
  const tint = rng.range(-10, 10);
  if (style === 'glass') {
    g.addColorStop(0, hsl(198 + tint, 48, 66));
    g.addColorStop(0.45, hsl(204 + tint, 52, 42));
    g.addColorStop(1, hsl(214 + tint, 58, 22));
  } else {
    g.addColorStop(0, hsl(204 + tint, 32, 48));
    g.addColorStop(0.55, hsl(212 + tint, 36, 26));
    g.addColorStop(1, hsl(218 + tint, 40, 13));
  }
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // subtle interior ceiling/depth hint inside glass
  ctx.fillStyle = 'rgba(20, 28, 38, 0.25)';
  ctx.fillRect(x, y, w, h * 0.28);
  // diagonal sky reflection streak
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.08, y + h);
  ctx.lineTo(x + w * 0.46, y);
  ctx.lineTo(x + w * 0.72, y);
  ctx.lineTo(x + w * 0.34, y + h);
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
  d.fillStyle = '#383a3e';
  d.fillRect(0, 0, W, H);
  // fine asphalt stone aggregate
  addNoise(d, W, H, 32, rng);
  const ppm = 25.6;
  // subtle edge gutter darkening
  const gl = d.createLinearGradient(0, 0, 28, 0);
  gl.addColorStop(0, 'rgba(0,0,0,0.28)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
  d.fillStyle = gl; d.fillRect(0, 0, 28, H);
  const gr = d.createLinearGradient(W - 28, 0, W, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.28)');
  d.fillStyle = gr; d.fillRect(W - 28, 0, 28, H);
  // tire wear tracks
  for (const off of [-5.9, -2.4, 2.4, 5.9]) {
    for (const o of [-0.75, 0.75]) {
      d.fillStyle = 'rgba(18,19,22,0.16)';
      d.fillRect(W / 2 + (off + o) * ppm - 14, 0, 28, H);
    }
  }
  // asphalt cracks & tar repairs
  d.strokeStyle = 'rgba(12,12,14,0.58)';
  d.lineWidth = 1.4;
  for (let k = 0; k < 10; k++) {
    d.beginPath();
    let x = rng.range(0, W), y = rng.range(0, H);
    d.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += rng.range(-24, 24); y += rng.range(-24, 24); d.lineTo(x, y); }
    d.stroke();
  }
  d.fillStyle = 'rgba(26,27,31,0.46)';
  for (let k = 0; k < 4; k++) d.fillRect(rng.range(0, W - 70), rng.range(0, H - 50), rng.range(30, 75), rng.range(20, 55));
  // double yellow centerlines
  d.fillStyle = '#e8ba22';
  d.fillRect(W / 2 - 0.35 * ppm - 2.5, 0, 5, H);
  d.fillRect(W / 2 + 0.35 * ppm - 2.5, 0, 5, H);
  // crisp lane & edge markings
  d.fillStyle = '#e4e6ea';
  for (const s of [-1, 1]) {
    const x = W / 2 + s * 4.15 * ppm;
    d.fillRect(x - 2, 0, 4, H * 0.46);
    d.fillRect(W / 2 + s * 7.85 * ppm - 2.5, 0, 5, H);
  }
  // subtle paint wear
  d.globalCompositeOperation = 'destination-out';
  d.fillStyle = 'rgba(0,0,0,0.22)';
  for (let k = 0; k < 120; k++) d.fillRect(rng.range(0, W), rng.range(0, H), rng.range(2, 7), rng.range(2, 9));
  d.globalCompositeOperation = 'source-over';
  return toTex(c, { aniso: 12 });
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
  surface('#aeaea7', 22, 11, 256, (d, rng, s) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      d.fillStyle = hsl(38, 6, rng.range(62, 70));
      d.fillRect(i * s / 2 + 2, j * s / 2 + 2, s / 2 - 4, s / 2 - 4);
      // bevel highlight & shadow
      d.fillStyle = 'rgba(255,255,255,0.18)';
      d.fillRect(i * s / 2 + 2, j * s / 2 + 2, s / 2 - 4, 2);
      d.fillStyle = 'rgba(0,0,0,0.22)';
      d.fillRect(i * s / 2 + 2, (j + 1) * s / 2 - 4, s / 2 - 4, 2);
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
  surface('#825d3e', 18, 18, 256, (d, rng, s) => {
    for (let y = 0; y < s; y += 32) {
      d.fillStyle = hsl(28, rng.range(30, 42), rng.range(30, 40));
      d.fillRect(0, y, s, 30);
      // wood grain streaks
      d.strokeStyle = 'rgba(40,22,10,0.18)';
      d.lineWidth = 1;
      for (let g = 0; g < 6; g++) {
        d.beginPath();
        const yy = y + rng.range(2, 28);
        d.moveTo(0, yy);
        d.bezierCurveTo(s * 0.33, yy + rng.range(-3, 3), s * 0.66, yy + rng.range(-3, 3), s, yy);
        d.stroke();
      }
      d.strokeStyle = 'rgba(0,0,0,0.5)';
      d.lineWidth = 2;
      d.beginPath(); d.moveTo(0, y); d.lineTo(s, y); d.stroke();
    }
  });

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

/** Soft radial contact shadow decal texture for pedestrians & vehicles. */
export function makeContactShadow() {
  const [c, d] = mk(128, 128);
  const g = d.createRadialGradient(64, 64, 8, 64, 64, 60);
  g.addColorStop(0, 'rgba(0,0,0,0.46)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  d.fillStyle = g;
  d.fillRect(0, 0, 128, 128);
  return toTex(c, { repeat: false, aniso: 1 });
}

// ---------------------------------------------------------------- neon sign atlas (4 cols x 8 rows, 256x64 cells)
export const SIGN_NAMES = [
  'PIZZA', 'BANK', 'HOTEL', 'DINER', '24H MART', 'CAFE', 'BARBER', 'BURGERS',
  'SUSHI BAR', 'PHARMACY', 'TACOS', 'GYM', 'ARCADE', 'RECORDS', 'LIQUOR', 'NOODLES',
  'POLICE', 'HOSPITAL', 'AMMO', 'PAY N SPRAY', 'GAS', 'MOTEL', 'CINEMA', 'BOOKS',
  'TATTOO', 'COFFEE', 'PUB', 'LAUNDRY', 'CLUB NOVA', 'AUTO PARTS', 'SAN NOVA', 'CASINO',
];
const SIGN_COLORS = ['#ff3d8b', '#31e8ff', '#ffd23d', '#6dff6a', '#ff7a2a', '#b46bff', '#ffffff', '#ff4040'];
export function makeSignAtlas() {
  const [c, d] = mk(1024, 512);
  const rng = new Rng(21);
  d.fillStyle = '#07070b';
  d.fillRect(0, 0, 1024, 512);
  SIGN_NAMES.forEach((name, idx) => {
    const col = idx % 4, row = Math.floor(idx / 4);
    const x = col * 256, y = row * 64;
    let color = SIGN_COLORS[idx % SIGN_COLORS.length];
    if (name === 'POLICE') color = '#5aa0ff';
    if (name === 'HOSPITAL') color = '#ff5a5a';
    if (name === 'BANK') color = '#ffe066';
    if (name === 'AMMO') color = '#ff4040';
    d.fillStyle = '#14141c';
    d.fillRect(x + 4, y + 4, 248, 56);
    d.strokeStyle = color;
    d.lineWidth = 3;
    d.shadowColor = color;
    d.shadowBlur = 10;
    d.strokeRect(x + 7, y + 7, 242, 50);
    d.fillStyle = color;
    let size = 38;
    d.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
    while (d.measureText(name).width > 215 && size > 14) {
      size -= 2;
      d.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
    }
    d.textAlign = 'center';
    d.textBaseline = 'middle';
    d.fillText(name, x + 128, y + 33);
    d.shadowBlur = 0;
    void rng;
  });
  return toTex(c, { repeat: false });
}
export function signUV(name: string): [number, number, number, number] {
  const idx = Math.max(0, SIGN_NAMES.indexOf(name));
  const col = idx % 4, row = Math.floor(idx / 4);
  return [col / 4, 1 - (row + 1) / 8, 0.25, 0.125];
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
