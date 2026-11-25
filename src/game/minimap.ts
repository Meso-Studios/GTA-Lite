// 10km x 10km Minimap, full map, and GPS route rendering on a 2048x2048 offscreen canvas.
import { DECK, HALF, NB, OUTER_HIGHWAYS, P, WORLD_HALF, roadLine } from './config';
import { ATM_LOCATIONS, BANK_BRANCHES } from './bankingSystem';
import type { CityData } from './city';
import type { Game } from './Game';

const MIN_X = -WORLD_HALF, MIN_Z = -WORLD_HALF, MAX_X = WORLD_HALF, MAX_Z = WORLD_HALF;
const MW = MAX_X - MIN_X; // 10000 x 10000 m
const TEX = 2048;
const SCALE = TEX / MW; // 0.2048 px per meter
const SLABS = new Set(['#5b6b4a', '#6c675e', '#4f7a3a', '#5b5d60', '#8a8160', '#55575c']);

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
const toX = (x: number) => (x - MIN_X) * SCALE;
const toZ = (z: number) => (z - MIN_Z) * SCALE;

export class MapRenderer {
  base: HTMLCanvasElement;

  constructor(city: CityData) {
    const c = document.createElement('canvas');
    c.width = TEX; c.height = TEX;
    const d = c.getContext('2d')!;

    // Base biome: Northern hills & Eastern plains (deep forest/meadow green)
    d.fillStyle = '#1b2c21';
    d.fillRect(0, 0, TEX, TEX);

    // Subtle elevation shading in North Hills
    const hillGrad = d.createLinearGradient(0, 0, 0, toZ(-740));
    hillGrad.addColorStop(0, '#2a342c');
    hillGrad.addColorStop(1, '#1d3124');
    d.fillStyle = hillGrad;
    d.fillRect(toX(-740), 0, (MAX_X + 740) * SCALE, toZ(-740));

    // Western Golden Dunes & Desert Biome (x < -740)
    d.fillStyle = '#8b774d';
    d.fillRect(0, 0, toX(-740), toZ(4450));
    // Soft dune ripples
    d.strokeStyle = 'rgba(220, 198, 148, 0.14)';
    d.lineWidth = 3;
    for (let z = -4800; z < 4400; z += 220) {
      d.beginPath();
      d.moveTo(0, toZ(z));
      d.quadraticCurveTo(toX(-2900), toZ(z + 90), toX(-760), toZ(z - 40));
      d.stroke();
    }

    // Southern Ocean Bay
    d.fillStyle = '#0e344f';
    d.fillRect(toX(-740), toZ(612), (MAX_X + 740) * SCALE, (MAX_Z - 612) * SCALE);
    d.fillRect(0, toZ(4450), toX(-740), (MAX_Z - 4450) * SCALE);

    // Main San Nova Beachfront strip
    d.fillStyle = '#8b7a52';
    d.fillRect(toX(-740), toZ(522), (MAX_X + 740) * SCALE, 92 * SCALE);

    // Nova Keys Resort Island
    d.fillStyle = '#9c8a5c';
    d.beginPath();
    d.arc(toX(DECK.ISLAND.cx), toZ(DECK.ISLAND.cz), DECK.ISLAND.r * SCALE, 0, Math.PI * 2);
    d.fill();
    d.fillStyle = '#2a5a34';
    d.beginPath();
    d.arc(toX(DECK.ISLAND.cx), toZ(DECK.ISLAND.cz), (DECK.ISLAND.r - 120) * SCALE, 0, Math.PI * 2);
    d.fill();

    // Pier
    d.fillStyle = '#7b5835';
    d.fillRect(toX(-154.5), toZ(606), 9 * SCALE, 99 * SCALE);

    // Outer 10km Expressways & Outer Beltway
    d.fillStyle = '#5f697a';
    for (const h of OUTER_HIGHWAYS) {
      if (h.axis === 'x') {
        d.fillRect(toX(h.a0), toZ(h.fixed - h.halfW), (h.a1 - h.a0) * SCALE, h.halfW * 2 * SCALE);
      } else {
        d.fillRect(toX(h.fixed - h.halfW), toZ(h.a0), h.halfW * 2 * SCALE, (h.a1 - h.a0) * SCALE);
      }
    }

    // Core city blocks, roads, inner ring & bridge
    for (const r of city.mapRects) {
      if (r.c === '#2a2d33') d.fillStyle = '#7a879d';
      else if (r.c === '#4f7a3a') d.fillStyle = '#2f5a2c';
      else if (r.c === '#3b6f90') d.fillStyle = '#2d6a92';
      else if (SLABS.has(r.c)) d.fillStyle = shade(r.c, 0.42);
      else d.fillStyle = shade(r.c, 0.78);
      d.fillRect(toX(r.x0), toZ(r.z0), Math.max(1, (r.x1 - r.x0) * SCALE), Math.max(1, (r.z1 - r.z0) * SCALE));
    }

    // Subtle 1km grid lines across outer map for sense of 10km scale
    d.strokeStyle = 'rgba(255,255,255,0.06)';
    d.lineWidth = 1;
    for (let g = -4000; g <= 4000; g += 1000) {
      d.beginPath(); d.moveTo(toX(g), 0); d.lineTo(toX(g), TEX); d.stroke();
      d.beginPath(); d.moveTo(0, toZ(g)); d.lineTo(TEX, toZ(g)); d.stroke();
    }

    // San Nova International Airport apron & runway
    d.fillStyle = '#383d46';
    d.fillRect(toX(DECK.AIRPORT.x0), toZ(DECK.AIRPORT.z0), (DECK.AIRPORT.x1 - DECK.AIRPORT.x0) * SCALE, (DECK.AIRPORT.z1 - DECK.AIRPORT.z0) * SCALE);
    d.fillStyle = '#1b1f26';
    d.fillRect(toX(DECK.AIRPORT.x0 + 35), toZ(DECK.AIRPORT.runwayZ - DECK.AIRPORT.runwayW / 2), (DECK.AIRPORT.x1 - DECK.AIRPORT.x0 - 70) * SCALE, DECK.AIRPORT.runwayW * SCALE);
    d.strokeStyle = 'rgba(255,255,255,0.65)';
    d.lineWidth = 1.5;
    d.setLineDash([6, 6]);
    d.beginPath();
    d.moveTo(toX(DECK.AIRPORT.x0 + 50), toZ(DECK.AIRPORT.runwayZ));
    d.lineTo(toX(DECK.AIRPORT.x1 - 50), toZ(DECK.AIRPORT.runwayZ));
    d.stroke();
    d.setLineDash([]);

    // District labels on full map canvas
    d.fillStyle = 'rgba(255,255,255,0.45)';
    d.font = 'bold 26px sans-serif';
    d.textAlign = 'center';
    d.fillText('NORTH SAN NOVA HILLS', toX(1200), toZ(-2200));
    d.fillText('GOLDEN DUNES', toX(-2600), toZ(1500));
    d.fillText('SAN NOVA INTL AIRPORT', toX(1700), toZ(-455));
    d.fillText('NOVA KEYS ISLAND', toX(DECK.ISLAND.cx), toZ(DECK.ISLAND.cz + 580));
    d.fillStyle = 'rgba(210,235,215,0.58)';
    d.font = 'bold 20px sans-serif';
    d.fillText('NORTH PALMS SUBURBS', toX(0), toZ(-1180));
    d.fillText('PALMETTO HEIGHTS', toX(-1040), toZ(-340));
    d.fillText('BAYVIEW SUBURBS', toX(980), toZ(260));
    d.fillStyle = 'rgba(255,235,170,0.65)';
    d.font = 'bold 22px sans-serif';
    d.fillText('SAN NOVA METRO · LEONIDA', toX(0), toZ(-680));

    this.base = c;
  }

  private blips(g: Game) {
    const list: { x: number; z: number; kind: string; label?: string }[] = [];
    for (const m of g.missionGivers()) list.push({ x: m.x, z: m.z, kind: 'mission', label: 'M' });
    for (const m of g.goals) list.push({ x: m.x, z: m.z, kind: m.kind, label: m.label });
    for (const [n, p] of Object.entries(g.city.places)) {
      if (n === 'hospital') list.push({ x: p.x, z: p.z, kind: 'hospital', label: '+' });
      else if (n === 'police') list.push({ x: p.x, z: p.z, kind: 'police', label: 'P' });
      else if (n === 'payspray') list.push({ x: p.x, z: p.z, kind: 'spray', label: 'S' });
      else if (n === 'gunshop') list.push({ x: p.x, z: p.z, kind: 'gun', label: 'G' });
      else if (n === 'bank') list.push({ x: p.x, z: p.z, kind: 'bank', label: '$' });
      else if (n === 'parking') list.push({ x: p.x, z: p.z, kind: 'parking', label: 'PK' });
      else if (n === 'resort') list.push({ x: p.x, z: p.z, kind: 'landmark', label: 'R' });
      else if (n === 'oasis') list.push({ x: p.x, z: p.z, kind: 'landmark', label: 'O' });
      else if (n === 'observatory') list.push({ x: p.x, z: p.z, kind: 'landmark', label: '★' });
      else if (n === 'airport') list.push({ x: p.x, z: p.z, kind: 'airport', label: '✈' });
      else if (n.startsWith('gas_')) list.push({ x: p.x, z: p.z, kind: 'gas', label: 'F' });
    }
    // NovaBank branches, ATMs & pulsing Random World Events
    for (const b of BANK_BRANCHES) list.push({ x: b.x, z: b.z, kind: 'bank', label: '$' });
    for (const a of ATM_LOCATIONS) list.push({ x: a.x, z: a.z, kind: 'atm', label: 'A' });
    if (g.randomEvents?.active && !g.randomEvents.active.resolved) {
      list.push({ x: g.randomEvents.active.x, z: g.randomEvents.active.z, kind: 'event', label: '?' });
    }
    if (g.waypoint) list.push({ x: g.waypoint.x, z: g.waypoint.z, kind: 'waypoint' });
    if (g.finderOn) for (const pk of g.pickups) if (pk.kind === 'package' && !pk.taken && Math.hypot(pk.x - g.playerX, pk.z - g.playerZ) < 200) list.push({ x: pk.x, z: pk.z, kind: 'package' });
    if (g.wanted > 0) for (const p of g.peds) if (p.kind === 'cop' && !p.dead) list.push({ x: p.x, z: p.z, kind: 'cop' });
    if (g.wanted > 0) for (const v of g.vehicles) if (v.mode === 'police') list.push({ x: v.x, z: v.z, kind: 'cop' });
    return list;
  }

  private icon(d: CanvasRenderingContext2D, kind: string, label: string | undefined, s: number, t: number) {
    const colors: Record<string, string> = {
      mission: '#ffd23d', goal: '#ffd23d', enemy: '#ff4040', vehicle: '#3dd6ff', item: '#ffd23d',
      hospital: '#ff5a5a', police: '#4a90ff', spray: '#ffb347', gun: '#e0e0e0', bank: '#34d399',
      parking: '#0ea5e9', atm: '#38bdf8', event: '#fbbf24',
      waypoint: '#ff2fd0', package: '#ff9d2e', cop: '#ff3030', landmark: '#38d9a9', airport: '#38bdf8', gas: '#ff7b2e',
    };
    const col = colors[kind] ?? '#fff';
    d.fillStyle = col;
    d.strokeStyle = '#000';
    d.lineWidth = 2;
    if (kind === 'event') {
      const pulse = 1 + 0.18 * Math.sin(t * 6.5);
      d.beginPath(); d.arc(0, 0, 6.5 * s * pulse, 0, 7); d.fill(); d.stroke();
      d.fillStyle = '#000';
      d.font = `bold ${9 * s}px sans-serif`;
      d.textAlign = 'center'; d.textBaseline = 'middle';
      d.fillText('?', 0, 0.5);
      return;
    }
    if (kind === 'cop') {
      d.fillStyle = Math.floor(t * 4) % 2 ? '#ff2a2a' : '#2a6aff';
      d.beginPath(); d.arc(0, 0, 3.5 * s, 0, 7); d.fill();
      return;
    }
    if (kind === 'enemy') {
      d.beginPath(); d.moveTo(0, -5 * s); d.lineTo(4 * s, 3 * s); d.lineTo(-4 * s, 3 * s); d.closePath(); d.fill(); d.stroke();
      return;
    }
    if (kind === 'waypoint') {
      d.beginPath(); d.arc(0, 0, 5 * s, 0, 7); d.fill(); d.stroke();
      d.fillStyle = '#fff'; d.beginPath(); d.arc(0, 0, 1.8 * s, 0, 7); d.fill();
      return;
    }
    d.beginPath(); d.arc(0, 0, 6 * s, 0, 7); d.fill(); d.stroke();
    if (label) {
      d.fillStyle = '#000';
      d.font = `bold ${8 * s}px sans-serif`;
      d.textAlign = 'center'; d.textBaseline = 'middle';
      d.fillText(label, 0, 0.5);
    }
  }

  private route(d: CanvasRenderingContext2D, g: Game, lw: number) {
    const r = g.route;
    if (!r || r.length < 2) return;
    d.strokeStyle = '#ff2fd0';
    d.lineWidth = lw;
    d.lineJoin = 'round';
    d.lineCap = 'round';
    d.beginPath();
    r.forEach(([x, z], i) => (i ? d.lineTo(toX(x), toZ(z)) : d.moveTo(toX(x), toZ(z))));
    d.stroke();
  }

  drawMini(canvas: HTMLCanvasElement, g: Game) {
    const d = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    d.clearRect(0, 0, W, H);
    if (g.interior) {
      const room = g.interior.room;
      d.save();
      d.beginPath(); d.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2); d.clip();
      d.fillStyle = '#1b1f24'; d.fillRect(0, 0, W, H);
      const sc = (W * 0.72) / room.w;
      d.translate(W / 2, H / 2);
      d.fillStyle = '#39434d';
      d.fillRect(-room.w * sc / 2, -room.d * sc / 2, room.w * sc, room.d * sc);
      d.strokeStyle = '#7fd6c8'; d.lineWidth = 3;
      d.strokeRect(-room.w * sc / 2, -room.d * sc / 2, room.w * sc, room.d * sc);
      const box = (x: number, z: number, w: number, dd: number, col: string) => { d.fillStyle = col; d.fillRect(x * sc, z * sc, w * sc, dd * sc); };
      d.strokeStyle = 'rgba(255,255,255,0.07)';
      d.lineWidth = 1;
      for (let gx = -room.w / 2; gx < room.w / 2; gx += 2) { d.beginPath(); d.moveTo(gx * sc, -room.d / 2 * sc); d.lineTo(gx * sc, room.d / 2 * sc); d.stroke(); }
      for (let gz = -room.d / 2; gz < room.d / 2; gz += 2) { d.beginPath(); d.moveTo(-room.w / 2 * sc, gz * sc); d.lineTo(room.w / 2 * sc, gz * sc); d.stroke(); }
      switch (room.kind) {
        case 'bank': for (let i = 0; i < 4; i++) box(-9.5 + i * 5, -3.9, 4.2, 1, '#8d6e34'); box(-3, 5.2, 6, 1, '#7a2f2f'); break;
        case 'diner': box(-7.5, 2.2, 11, 1, '#7d3c3c'); for (let i = 0; i < 3; i++) box(-8.2 + i * 7, -4.4, 2.4, 2.2, '#8a6a45'); break;
        case 'office': box(-4, 1.8, 8, 1, '#2f4858'); for (let i = 0; i < 4; i++) box(-7.2 + (i % 2) * 6, -3.6 + Math.floor(i / 2) * 3.6, 2.4, 1.2, '#9a8a74'); break;
        case 'apartment': box(-8.4, -6.5, 4.8, 3.2, '#8a6a45'); box(3.8, 0.8, 3.6, 1.4, '#3f5a6a'); box(-8, 3.5, 6, 1.4, '#8a6a45'); break;
        case 'police': box(-4.5, 2.9, 9, 1, '#24365c'); for (let i = 0; i < 7; i++) box(2.4 + i * 0.55, -6.6, 0.1, 3.2, '#9aa0a5'); break;
        case 'hospital': box(-4, 2.9, 8, 1, '#9fd6cf'); for (let i = 0; i < 4; i++) box(-8.1 + i * 1.5, -3.4, 1, 2.1, '#cfd4d8'); break;
        case 'gun': box(-6.6, 2.1, 10, 1, '#6b2b2b'); for (let i = 0; i < 5; i++) box(-8.15 + i * 1.9, -7.5, 1.5, 0.5, '#5a4434'); break;
        case 'garage': box(-3.4, -4, 6.8, 3.2, '#3a3d42'); for (let i = 0; i < 5; i++) box(-8.6 + (i % 3) * 2.6, -7 + Math.floor(i / 3) * 1.4, 2.4, 0.7, '#6b5a3a'); break;
        case 'parking': for (let i = 0; i < 4; i++) box(-12 + i * 6.5, -8.5, 3.6, 5.2, '#5a6370'); box(-12.5, 4.8, 3.8, 3.2, '#1e3a8a'); break;
        default: box(-6.5, 2.7, 7, 1, '#7d3c3c'); for (let i = 0; i < 2; i++) box(i ? 3.8 : -9.5, -5.5, 6, 1.2, '#6c5844');
      }
      for (const n of room.npcSpots) {
        d.fillStyle = n.role === 'guard'
          ? '#ff5a5a'
          : n.role === 'doctor' || n.role === 'nurse'
            ? '#38d9a9'
            : n.role === 'chef' || n.role === 'attendant' || n.role === 'clerk' || n.role === 'server'
              ? '#ffd23d'
              : '#8fd6c0';
        d.beginPath(); d.arc((n.x - room.cx) * sc, (n.z - room.cz) * sc, 3.4, 0, 7); d.fill();
      }
      const px = (g.playerX - room.cx) * sc, pz = (g.playerZ - room.cz) * sc;
      d.fillStyle = '#ffffff';
      d.beginPath(); d.moveTo(px, pz - 7); d.lineTo(px + 5, pz + 6); d.lineTo(px, pz + 2.5); d.lineTo(px - 5, pz + 6); d.closePath(); d.fill();
      d.restore();
      d.lineWidth = 4; d.strokeStyle = '#10151b';
      d.beginPath(); d.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); d.stroke();
      return;
    }

    d.save();
    d.beginPath();
    d.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2);
    d.clip();
    d.fillStyle = '#0c141c';
    d.fillRect(0, 0, W, H);
    // Zoom in tex-space so ~220m radius is visible on foot, ~340m when driving
    const pxPerMeter = g.playerVehicle ? 0.56 : 0.85;
    const zoom = pxPerMeter / SCALE;
    const px = toX(g.playerX), pz = toZ(g.playerZ);
    d.translate(W / 2, H / 2);
    const rot = g.camYaw - Math.PI;
    d.rotate(rot);
    d.scale(zoom, zoom);
    d.translate(-px, -pz);
    d.drawImage(this.base, 0, 0);
    this.route(d, g, 4 / zoom);
    const t = performance.now() / 1000;
    for (const b of this.blips(g)) {
      const bx = toX(b.x), bz = toZ(b.z);
      const dx = bx - px, dz = bz - pz;
      const dist = Math.hypot(dx, dz);
      const lim = (W / 2 - 14) / zoom;
      let x = bx, z = bz;
      if (dist > lim) { x = px + (dx / dist) * lim; z = pz + (dz / dist) * lim; }
      d.save();
      d.translate(x, z);
      d.rotate(-rot);
      d.scale(1 / zoom, 1 / zoom);
      this.icon(d, b.kind, b.label, 1, t);
      d.restore();
    }
    d.restore();

    // Player arrow
    d.save();
    d.translate(W / 2, H / 2);
    const heading = (g.playerVehicle ? g.playerVehicle.yaw : g.player.yaw) - g.camYaw;
    d.rotate(-heading);
    d.fillStyle = '#ffffff';
    d.strokeStyle = '#000';
    d.lineWidth = 2;
    d.beginPath();
    d.moveTo(0, -9); d.lineTo(6, 7); d.lineTo(0, 3.5); d.lineTo(-6, 7); d.closePath();
    d.fill(); d.stroke();
    d.restore();

    // Outer ring
    d.lineWidth = 4;
    d.strokeStyle = g.wanted > 0 && Math.floor(t * 3) % 2 ? (Math.floor(t * 6) % 2 ? '#ff2a2a' : '#2a6aff') : '#10151b';
    d.beginPath(); d.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); d.stroke();
  }

  private fit(canvas: HTMLCanvasElement) {
    const s = Math.min(canvas.width / TEX, canvas.height / TEX);
    return { s, ox: (canvas.width - TEX * s) / 2, oy: (canvas.height - TEX * s) / 2 };
  }

  drawFull(canvas: HTMLCanvasElement, g: Game) {
    const d = canvas.getContext('2d')!;
    const { s, ox, oy } = this.fit(canvas);
    d.fillStyle = '#07111a';
    d.fillRect(0, 0, canvas.width, canvas.height);
    d.save();
    d.translate(ox, oy);
    d.scale(s, s);
    d.drawImage(this.base, 0, 0);
    this.route(d, g, 5 / s);
    const t = performance.now() / 1000;
    for (const b of this.blips(g)) {
      d.save();
      d.translate(toX(b.x), toZ(b.z));
      d.scale(1 / s, 1 / s);
      this.icon(d, b.kind, b.label, 1.35, t);
      d.restore();
    }
    d.save();
    d.translate(toX(g.playerX), toZ(g.playerZ));
    d.rotate(Math.PI - (g.playerVehicle ? g.playerVehicle.yaw : g.player.yaw));
    d.scale(1 / s, 1 / s);
    d.fillStyle = '#fff'; d.strokeStyle = '#000'; d.lineWidth = 2;
    d.beginPath(); d.moveTo(0, -10); d.lineTo(7, 8); d.lineTo(0, 4); d.lineTo(-7, 8); d.closePath(); d.fill(); d.stroke();
    d.restore();
    d.restore();

    // Scale & instructions footer
    d.fillStyle = 'rgba(255,255,255,0.65)';
    d.font = 'bold 12px sans-serif';
    d.fillText('10 KM × 10 KM SAN NOVA METROPOLITAN REGION  ·  Click anywhere to set a GPS waypoint', 16, canvas.height - 14);
  }

  toWorld(canvas: HTMLCanvasElement, px: number, py: number): [number, number] {
    const { s, ox, oy } = this.fit(canvas);
    return [(px - ox) / (s * SCALE) + MIN_X, (py - oy) / (s * SCALE) + MIN_Z];
  }
}

export function buildRoute(fromX: number, fromZ: number, toX: number, toZ: number): [number, number][] {
  // If either endpoint is outside the core 9x9 grid, route cleanly via nearest expressway/direct line
  const inCore = (x: number, z: number) => Math.abs(x) <= HALF + 40 && Math.abs(z) <= HALF + 40;
  if (!inCore(fromX, fromZ) || !inCore(toX, toZ)) {
    const midX = Math.abs(toX - fromX) > Math.abs(toZ - fromZ) ? toX : fromX;
    const midZ = Math.abs(toX - fromX) > Math.abs(toZ - fromZ) ? fromZ : toZ;
    return [[fromX, fromZ], [midX, midZ], [toX, toZ]];
  }
  const k0 = Math.max(0, Math.min(NB, Math.round(fromX / P + NB / 2))), l0 = Math.max(0, Math.min(NB, Math.round(fromZ / P + NB / 2)));
  const k1 = Math.max(0, Math.min(NB, Math.round(toX / P + NB / 2))), l1 = Math.max(0, Math.min(NB, Math.round(toZ / P + NB / 2)));
  const pts: [number, number][] = [[fromX, fromZ]];
  const n0: [number, number] = [roadLine(k0), roadLine(l0)];
  const n1: [number, number] = [roadLine(k1), roadLine(l1)];
  pts.push(n0);
  let [k, l] = [k0, l0];
  const alongX = Math.abs(k1 - k0) >= Math.abs(l1 - l0);
  const stepX = () => { while (k !== k1) { k += Math.sign(k1 - k); pts.push([roadLine(k), roadLine(l)]); } };
  const stepZ = () => { while (l !== l1) { l += Math.sign(l1 - l); pts.push([roadLine(k), roadLine(l)]); } };
  if (alongX) { stepX(); stepZ(); } else { stepZ(); stepX(); }
  pts.push(n1);
  pts.push([toX, toZ]);
  return pts;
}
