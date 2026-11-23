import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Game, HudState } from './game/Game';
import { MobileControls } from './components/MobileControls';

type Toast = { id: number; text: string; kind: string };
type Banner = { kind: 'wasted' | 'passed' | 'failed'; title: string; sub?: string } | null;

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move · Drive · Throttle'],
  ['Mouse', 'Look around'],
  ['Shift', 'Sprint (stamina)'],
  ['C / Ctrl', 'Crouch · Sprint+C Slide'],
  ['Space', 'Jump · Handbrake · Climb'],
  ['↑ / ↓', 'Plane Dive / Climb'],
  ['Left Click', 'Shoot / swing / rocket'],
  ['Right Click', 'Aim'],
  ['F / E', 'Cars, planes, 328 stores'],
  ['Q / Z / Wheel', '15 weapons · Rudder'],
  ['1–0 / - / =', 'Quick weapon slots'],
  ['R / H', 'Radio station · Horn'],
  ['G / T', 'Scope · Package finder'],
  ['M', '10km Map, Airport & GPS'],
  ['Esc / P', 'Pause · Mobile / RTX / Gore'],
];

function Skyline() {
  const rects = useMemo(() => {
    let s = 12345;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const out: { x: number; w: number; h: number; c: string; wins: { x: number; y: number; on: boolean }[] }[] = [];
    let x = 0;
    while (x < 1600) {
      const w = 40 + r() * 70, h = 80 + r() * 330;
      const wins: { x: number; y: number; on: boolean }[] = [];
      for (let yy = 12; yy < h - 8; yy += 14) for (let xx = 8; xx < w - 10; xx += 12) if (r() < 0.8) wins.push({ x: xx, y: yy, on: r() < 0.45 });
      out.push({ x, w, h, c: `hsl(${225 + r() * 30},${20 + r() * 20}%,${7 + r() * 9}%)`, wins });
      x += w + r() * 8;
    }
    return out;
  }, []);
  return (
    <svg className="absolute bottom-0 left-0 h-[60%] w-[200%] skyline-drift" viewBox="0 0 1600 420" preserveAspectRatio="none">
      {[0, 1].map((k) => (
        <g key={k} transform={`translate(${k * 1600},0)`}>
          {rects.map((b, i) => (
            <g key={i} transform={`translate(${b.x},${420 - b.h})`}>
              <rect width={b.w} height={b.h} fill={b.c} />
              {b.wins.map((w, j) => (
                <rect key={j} x={w.x} y={w.y} width={6} height={8} fill={w.on ? '#ffd27a' : '#14182a'} opacity={w.on ? 0.9 : 0.6} />
              ))}
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

function Stars({ n, searching }: { n: number; searching: boolean }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={`h-7 w-7 drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)] ${i <= n ? (searching ? 'animate-pulse' : '') : ''}`}>
          <path
            d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.7 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z"
            fill={i <= n ? '#ffd23d' : 'rgba(0,0,0,0.35)'}
            stroke={i <= n ? '#7a5a00' : 'rgba(255,255,255,0.25)'}
            strokeWidth="1.2"
          />
        </svg>
      ))}
    </div>
  );
}

function Bar({ v, color, label, compact = false }: { v: number; color: string; label: string; compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-sm border border-black/80 bg-black/75 ${compact ? 'h-3 w-[88px]' : 'h-3.5 w-44'}`}>
      <div className="h-full transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} />
      <span className={`absolute inset-0 flex items-center justify-center font-bold tracking-widest text-white/95 hud-text ${compact ? 'text-[8px]' : 'text-[9px]'}`}>{label}</span>
    </div>
  );
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const toastId = useRef(1);
  const [phase, setPhase] = useState<'title' | 'loading' | 'playing'>('title');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [mobileMode, setMobileMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const p = new URLSearchParams(window.location.search);
    if (p.get('mobile') === '1') return true;
    if (p.get('mobile') === '0') return false;
    return window.innerWidth < 820 && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  });
  const [rtxEnabled, setRtxEnabled] = useState<boolean>(true);
  const [goreEnabled, setGoreEnabled] = useState<boolean>(true);
  const [hud, setHud] = useState<HudState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banner, setBanner] = useState<Banner>(null);
  const [error, setError] = useState<string | null>(null);
  const [dayLen, setDayLen] = useState(30);
  const [volume, setVolume] = useState(70);

  const startingRef = useRef(false);
  const startTimerRef = useRef<number | null>(null);

  const start = useCallback(() => {
    if (gameRef.current || startingRef.current) return;
    startingRef.current = true;
    setPhase('loading');
    setError(null);
    startTimerRef.current = window.setTimeout(() => {
      startTimerRef.current = null;
      if (gameRef.current || !mountRef.current) return;
      try {
        const g = new Game(mountRef.current, quality, {
          onHud: (h) => setHud(h),
          onToast: (text, kind = 'info') => {
            const id = toastId.current++;
            setToasts((t) => [...t.slice(-4), { id, text, kind }]);
            setTimeout(() => setToasts((t) => t.filter((q) => q.id !== id)), 3600);
          },
          onBanner: (kind, title, sub) => setBanner(kind ? { kind, title: title ?? '', sub } : null),
          onLock: () => {},
        });
        g.setMobileMode(mobileMode);
        g.setRtxEnabled(rtxEnabled);
        g.setGoreEnabled(goreEnabled);
        gameRef.current = g;
        (window as any).__game = g;
        g.attachMinimap(miniRef.current);
        g.start();
        setPhase('playing');
      } catch (e: any) {
        console.error(e);
        startingRef.current = false;
        setError(String(e?.message ?? e));
        setPhase('title');
      }
    }, 60);
  }, [quality, mobileMode, rtxEnabled, goreEnabled]);

  // Support ?autostart=1 and Enter/Space to start on title screen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && phase === 'title') {
      start();
    }
  }, [phase, start]);

  useEffect(() => {
    if (phase !== 'title') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, start]);

  // Sync document.body.dataset.state for crisp screen state tracking
  useEffect(() => {
    if (phase !== 'playing') {
      document.body.dataset.state = phase === 'loading' ? 'loading' : 'title';
    } else if (banner?.kind === 'wasted') {
      document.body.dataset.state = 'gameover';
    } else if (hud?.paused) {
      document.body.dataset.state = 'paused';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [phase, hud?.paused, banner?.kind]);

  useEffect(() => () => {
    if (startTimerRef.current !== null) { window.clearTimeout(startTimerRef.current); startTimerRef.current = null; }
    gameRef.current?.destroy();
    gameRef.current = null;
    startingRef.current = false;
  }, []);

  const g = gameRef.current;
  const resume = () => g?.setPaused(false);
  const toggleMobile = () => {
    const next = !(hud?.mobileMode ?? mobileMode);
    setMobileMode(next);
    g?.setMobileMode(next);
  };
  const toggleRtx = () => {
    const next = !(hud?.rtxEnabled ?? rtxEnabled);
    setRtxEnabled(next);
    g?.setRtxEnabled(next);
  };
  const toggleGore = () => {
    const next = !(hud?.goreEnabled ?? goreEnabled);
    setGoreEnabled(next);
    g?.setGoreEnabled(next);
  };
  const onMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    g?.mapClick(((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height);
  };

  const playing = phase === 'playing' && hud;
  const isMobileHud = Boolean(hud?.mobileMode);
  const bannerColors = { wasted: 'text-red-600', passed: 'text-amber-300', failed: 'text-red-500' } as const;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-white">
      <div ref={mountRef} className="absolute inset-0" />

      {/* ------------------------------------------------------------ HUD */}
      <div className={`pointer-events-none absolute inset-0 ${phase === 'playing' ? '' : 'hidden'}`}>
        {/* hurt vignette */}
        <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 ${120 + (hud?.hurt ?? 0) * 140}px rgba(190,0,0,${Math.min(0.85, (hud?.hurt ?? 0) * 0.9 + ((hud?.hp ?? 100) < 25 ? 0.25 : 0))})` }} />
        {hud && hud.hp > 0 && hud.hp < 100 && hud.hp <= 25 && <div className="absolute inset-0 animate-pulse bg-red-900/10" />}

        {/* crosshair */}
        {hud?.crosshair && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className={`rounded-full border-2 transition-all ${hud.aiming ? 'h-7 w-7 border-white/90' : 'h-4 w-4 border-white/50'}`}>
              <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
            </div>
          </div>
        )}

        {/* sniper scope overlay */}
        {hud?.scope && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative h-[min(78vh,86vw)] w-[min(78vh,86vw)] rounded-full border-[14px] border-black shadow-[0_0_0_9999px_rgba(0,0,0,0.97),inset_0_0_90px_rgba(0,0,0,0.95),inset_0_0_18px_rgba(120,220,255,0.25)]">
              <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 50% 42%, rgba(150,215,245,0.06), rgba(6,14,20,0.55) 72%, rgba(0,0,0,0.95) 100%)' }} />
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-black/70" />
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-black/70" />
              <div className="absolute left-1/2 top-1/2 h-0.5 w-[46%] -translate-x-1/2 -translate-y-1/2 bg-emerald-300/10" />
              {[12, 24, 36, 48].map((o) => (
                <div key={o} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <div className="absolute h-1.5 w-1.5 rounded-full bg-black/80" style={{ transform: `translate(${o}px, ${o * 0.45}px)` }} />
                  <div className="absolute h-1.5 w-1.5 rounded-full bg-black/80" style={{ transform: `translate(${-o}px, ${o * 0.45}px)` }} />
                  <div className="absolute h-1.5 w-1.5 rounded-full bg-black/80" style={{ transform: `translate(${o * 0.45}px, ${o}px)` }} />
                  <div className="absolute h-1.5 w-1.5 rounded-full bg-black/80" style={{ transform: `translate(${o * 0.45}px, ${-o}px)` }} />
                </div>
              ))}
              <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/25" />
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
              <div className="absolute bottom-[14%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-3 py-1 text-[11px] tracking-[0.3em] text-emerald-300">
                {hud.weapon.toUpperCase()} · ZOOM 6.0× · RANGE 520m
              </div>
              <div className="absolute right-[16%] top-1/2 -translate-y-1/2 rotate-90 text-[10px] tracking-[0.4em] text-emerald-300/70">BREATH HOLD · G RELEASE</div>
              <div className="absolute left-1/2 top-[16%] -translate-x-1/2 text-[10px] tracking-[0.4em] text-emerald-300/70">SAN NOVA MARKSMAN OPTIC</div>
            </div>
          </div>
        )}

        {/* top right: money / time / wanted / weapon */}
        {hud && (
          <div className={`absolute flex flex-col items-end ${isMobileHud ? 'right-2.5 top-[62px] gap-0.5' : 'right-6 top-4 gap-1'}`}>
            <div className={`flex items-center gap-1.5 font-bold tracking-[0.18em] text-amber-200/90 hud-text ${isMobileHud ? 'text-[10px]' : 'text-xs'}`}>
              <span className={isMobileHud ? 'max-w-[130px] truncate' : ''}>{hud.district}</span>
              <span className="text-white/50">·</span>
              <span className={`gta-font text-white ${isMobileHud ? 'text-sm' : 'text-lg'}`}>{hud.time}</span>
            </div>
            <div className={`gta-font text-[#8ee06c] hud-text ${isMobileHud ? 'text-2xl leading-none' : 'text-4xl'}`}>${hud.money.toLocaleString()}</div>
            <div className={isMobileHud ? 'scale-75 origin-right' : ''}>
              <Stars n={hud.wanted} searching={hud.searching} />
            </div>
            {hud.wanted > 0 && <div className={`text-[10px] font-bold tracking-[0.28em] hud-text ${hud.searching ? 'animate-pulse text-sky-300' : 'text-red-400'}`}>{hud.searching ? 'EVADING' : 'WANTED'}</div>}
            <div className={`flex items-center gap-2 rounded bg-black/75 border border-white/15 ${isMobileHud ? 'px-2 py-0.5' : 'mt-1 px-3 py-1 gap-3'}`}>
              {!isMobileHud && <span className="text-[10px] font-bold text-white/55">{hud.weaponIdx}/{hud.weaponCount}</span>}
              <span className={`gta-font tracking-wider text-white ${isMobileHud ? 'text-xs' : 'text-sm'}`}>{hud.weapon.toUpperCase()}</span>
              {hud.ammo !== null && <span className={`gta-font text-amber-300 ${isMobileHud ? 'text-sm' : 'text-lg'}`}>{hud.ammo}</span>}
            </div>
            {!isMobileHud && (
              <>
                <div className="text-[11px] font-semibold tracking-wider text-orange-300/95 hud-text">PACKAGES {hud.packages[0]}/{hud.packages[1]}</div>
                <div className="mt-0.5 flex items-center gap-3 rounded bg-black/70 px-3 py-1 text-[11px]">
                  <span className="text-sky-300">CREW {hud.allies}/3</span>
                  <span className="text-lime-300">GRENADES {hud.grenades}</span>
                  {hud.rtxEnabled && <span className="font-bold text-fuchsia-300">RTX</span>}
                </div>
              </>
            )}
            {hud.scope && <div className="animate-pulse rounded bg-emerald-600/90 px-3 py-1 text-[10px] font-bold tracking-[0.3em]">SCOPE ACTIVE</div>}
          </div>
        )}

        {/* mission panel */}
        {hud && !hud.scope && !isMobileHud && (
          <div className="absolute left-6 top-4 w-[360px]">
            {hud.mission ? (
              <div className="rounded-md border-l-4 border-amber-400 bg-black/75 px-4 py-3">
                <div className="gta-font text-xs tracking-[0.25em] text-amber-300">MISSION</div>
                <div className="gta-font text-2xl leading-none text-white hud-text">{hud.mission.title.toUpperCase()}</div>
                {hud.mission.objective && <div className="mt-2 text-[15px] font-medium leading-snug text-white/95 hud-text">{hud.mission.objective}</div>}
                {hud.mission.timer !== null && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold tracking-widest text-white/60">{hud.mission.timerLabel}</span>
                    <span className={`gta-font text-2xl ${hud.mission.timer < 20 ? 'animate-pulse text-red-400' : 'text-white'}`}>
                      {Math.floor(hud.mission.timer / 60)}:{String(Math.floor(hud.mission.timer % 60)).padStart(2, '0')}
                    </span>
                  </div>
                )}
                {hud.mission.progress !== null && (
                  <div className="mt-2 h-2 overflow-hidden rounded bg-white/15">
                    <div className="h-full bg-amber-400 transition-[width]" style={{ width: `${hud.mission.progress}%` }} />
                  </div>
                )}
              </div>
            ) : (
              hud.nextMission && (
                <div className="rounded-md border-l-4 border-white/40 bg-black/70 px-4 py-2">
                  <div className="text-[10px] font-bold tracking-[0.25em] text-white/65">NEXT CONTRACT</div>
                  <div className="gta-font text-lg text-amber-200">{hud.nextMission.toUpperCase()}</div>
                  <div className="text-xs text-white/75">Follow the pink GPS line to the yellow marker.</div>
                </div>
              )
            )}
          </div>
        )}

        {/* compact mission chip in mobile mode */}
        {hud && !hud.scope && isMobileHud && hud.mission && (
          <div className="absolute left-1/2 top-[198px] max-w-[86vw] -translate-x-1/2 truncate rounded border-l-2 border-amber-400 bg-black/75 px-3 py-1 text-[11px] font-semibold text-white">
            <span className="mr-1.5 font-extrabold text-amber-300">{hud.mission.title.toUpperCase()}:</span>
            {hud.mission.objective}
          </div>
        )}

        {/* minimap + bars */}
        <div
          className={`absolute flex transition-opacity ${hud?.scope ? 'opacity-20' : 'opacity-100'} ${
            isMobileHud ? 'left-2.5 top-[62px] flex-col items-start gap-1.5' : 'bottom-6 left-6 items-end gap-3'
          }`}
        >
          <div
            className={`relative rounded-full shadow-[0_0_0_3px_rgba(0,0,0,0.75),0_8px_24px_rgba(0,0,0,0.65)] ${
              isMobileHud ? 'h-[88px] w-[88px]' : 'h-[210px] w-[210px]'
            }`}
          >
            <canvas ref={miniRef} width={210} height={210} className="h-full w-full rounded-full" />
            <div className="gta-font absolute left-1/2 top-0.5 -translate-x-1/2 text-[10px] text-white/85">N</div>
          </div>
          {hud && (
            <div className={`flex flex-col ${isMobileHud ? 'gap-1' : 'mb-2 gap-1.5'}`}>
              {!isMobileHud && (
                <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-white/80 hud-text">
                  <span>{hud.coords[0]}m, {hud.coords[1]}m</span>
                  {hud.sliding && <span className="rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] text-black">SLIDE</span>}
                  {!hud.sliding && hud.crouching && <span className="rounded bg-sky-500/85 px-1.5 py-0.5 text-[9px] text-black">CROUCH</span>}
                  {hud.sandGrip && <span className="rounded bg-amber-300/90 px-1.5 py-0.5 text-[9px] text-black">SOFT SAND</span>}
                </div>
              )}
              <Bar compact={isMobileHud} v={hud.stamina} color="linear-gradient(#facc15,#ca8a04)" label={isMobileHud ? `STA ${hud.stamina}` : `STAMINA ${hud.stamina}`} />
              <Bar compact={isMobileHud} v={hud.armor} color="linear-gradient(#6aa8ff,#2a62d8)" label={isMobileHud ? `ARM ${hud.armor}` : `ARMOR ${hud.armor}`} />
              <Bar compact={isMobileHud} v={hud.hp} color={hud.hp > 35 ? 'linear-gradient(#ff6b6b,#c0262d)' : 'linear-gradient(#ff2a2a,#8a0000)'} label={isMobileHud ? `HP ${hud.hp}` : `HEALTH ${hud.hp}`} />
            </div>
          )}
        </div>

        {/* vehicle / aircraft HUD */}
        {hud && hud.speed !== null && (
          <div
            className={`absolute flex flex-col gap-1 ${
              isMobileHud
                ? 'left-1/2 top-[204px] -translate-x-1/2 items-center rounded-lg border border-white/15 bg-black/75 px-3 py-1.5'
                : 'bottom-6 right-6 items-end'
            }`}
          >
            {hud.aircraft ? (
              <>
                {hud.aircraft.stalling && (
                  <div className="animate-pulse rounded bg-red-600 px-2.5 py-0.5 text-[11px] font-black tracking-[0.25em] text-white">
                    STALL WARNING
                  </div>
                )}
                <div className="flex items-baseline gap-3 whitespace-nowrap">
                  <div className={`gta-font leading-none text-white hud-text ${isMobileHud ? 'text-2xl' : 'text-6xl'}`}>
                    {hud.aircraft.airspeed}
                    <span className="ml-1 text-xs text-sky-300 sm:text-base">KM/H</span>
                  </div>
                  <div className={`gta-font leading-none text-amber-300 hud-text ${isMobileHud ? 'text-2xl' : 'text-4xl'}`}>
                    {hud.aircraft.altitude}
                    <span className="ml-1 text-[11px] text-white/70 sm:text-xs">M ALT</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.22em]">
                  <span className={`rounded px-1.5 py-0.5 ${hud.aircraft.onGround ? 'bg-amber-400 text-black' : 'bg-sky-500 text-black'}`}>
                    {hud.aircraft.onGround ? 'RUNWAY' : 'AIRBORNE'}
                  </span>
                  <span className="text-white/85 hud-text">{hud.vehicleName?.toUpperCase()}</span>
                </div>
                <div className={`flex items-center gap-2 ${isMobileHud ? 'w-44' : 'w-56'}`}>
                  <span className="text-[10px] font-bold tracking-widest text-emerald-300">THR {hud.aircraft.throttle}%</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-black/80 border border-white/15">
                    <div className="h-full bg-emerald-400" style={{ width: `${hud.aircraft.throttle}%` }} />
                  </div>
                </div>
                {!isMobileHud && (
                  <div className="text-[10px] tracking-wider text-white/70">W/S Throttle · Space/↑/↓ Pitch · A/D Bank · Q/E Rudder</div>
                )}
              </>
            ) : (
              <>
                <div className={`gta-font leading-none text-white hud-text ${isMobileHud ? 'text-3xl' : 'text-7xl'}`}>
                  {hud.speed}
                  <span className="ml-1 text-base text-white/70">KM/H</span>
                </div>
                <div className="flex items-center gap-2">
                  {hud.sandGrip && <span className="rounded bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold tracking-widest text-black">SAND DRIFT</span>}
                  <span className="text-xs font-bold tracking-[0.22em] text-white/80 hud-text">{hud.vehicleName?.toUpperCase()}</span>
                </div>
              </>
            )}
            <div className={`h-2 overflow-hidden rounded bg-black/75 ${isMobileHud ? 'w-36' : 'w-52'}`}>
              <div className="h-full" style={{ width: `${hud.vehicleHp}%`, background: (hud.vehicleHp ?? 0) > 40 ? '#4ade80' : '#ef4444' }} />
            </div>
            {!isMobileHud && (
              <div className="mt-1 rounded bg-black/70 px-3 py-1 text-xs tracking-wider text-fuchsia-200">♪ {hud.radio === 'OFF' ? 'RADIO OFF (press R)' : hud.radio}</div>
            )}
          </div>
        )}

        {/* package finder */}
        {hud?.finder && (
          <div className={`absolute left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-orange-400/60 bg-black/80 px-5 py-2 ${isMobileHud ? 'top-[224px]' : 'top-4'}`}>
            <div className="relative h-9 w-9 rounded-full border border-orange-400/70">
              <div className="absolute left-1/2 top-1/2 h-0 w-0" style={{ transform: `translate(-50%,-50%) rotate(${(-hud.finder.angle * 180) / Math.PI + 180}deg)` }}>
                <div className="absolute -top-4 -left-[5px] h-0 w-0 border-x-[5px] border-b-[14px] border-x-transparent border-b-orange-400" />
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-[0.3em] text-orange-300">PACKAGE FINDER</div>
              <div className="gta-font text-lg text-white">{hud.finder.dist < 0 ? 'ALL COLLECTED' : `${Math.round(hud.finder.dist)} m`}</div>
            </div>
          </div>
        )}

        {hud?.indoor && (
          <div className={`absolute left-1/2 -translate-x-1/2 rounded-full border border-teal-300/50 bg-black/85 px-4 py-1 text-[11px] font-bold tracking-[0.3em] text-teal-200 ${isMobileHud ? 'top-[198px]' : 'top-3'}`}>
            INTERIOR · {hud.indoor}
          </div>
        )}

        {/* interaction prompt */}
        {hud?.prompt && !hud.scope && (
          <div className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-4 py-1.5 text-xs font-semibold tracking-wide text-white hud-text ${isMobileHud ? 'bottom-[242px]' : 'bottom-[26%] text-sm py-2'}`}>{hud.prompt}</div>
        )}

        {/* subtitles (story/mission takes priority over ambient NPC chatter) */}
        {hud?.subtitle && !hud.scope && (
          <div className={`absolute left-1/2 w-[min(780px,88vw)] -translate-x-1/2 text-center ${isMobileHud ? 'bottom-[228px]' : 'bottom-20'}`}>
            <span className={`rounded bg-black/75 px-3 py-1 font-semibold leading-snug text-white hud-text ${isMobileHud ? 'text-xs' : 'text-base leading-relaxed'}`}>
              <span className="mr-1.5 font-black text-amber-300">{hud.subtitle.who}:</span>
              {hud.subtitle.text}
            </span>
          </div>
        )}
        {!hud?.subtitle && hud?.ambientSubtitle && !hud.scope && (
          <div
            data-ambient-subtitle="true"
            className={`absolute left-1/2 w-[min(680px,86vw)] -translate-x-1/2 text-center ${isMobileHud ? 'bottom-[228px]' : 'bottom-20'}`}
          >
            <span className={`inline-block rounded-md border border-white/15 bg-black/75 px-3.5 py-1.5 font-medium leading-snug text-white/95 shadow-lg hud-text ${isMobileHud ? 'text-xs' : 'text-[15px]'}`}>
              <span
                className={`mr-1.5 font-extrabold uppercase tracking-wider ${
                  hud.ambientSubtitle.kind === 'cop'
                    ? 'text-sky-300'
                    : hud.ambientSubtitle.kind === 'tourist'
                      ? 'text-cyan-300'
                      : hud.ambientSubtitle.kind === 'gang'
                        ? 'text-rose-300'
                        : hud.ambientSubtitle.kind === 'ally'
                          ? 'text-emerald-300'
                          : 'text-amber-200'
                }`}
              >
                {hud.ambientSubtitle.who}:
              </span>
              <span className="italic">“{hud.ambientSubtitle.text}”</span>
            </span>
          </div>
        )}

        {/* toasts */}
        <div className={`absolute flex flex-col items-end gap-1.5 ${isMobileHud ? 'right-2.5 top-[210px]' : hud?.scope ? 'right-6 top-4' : 'right-6 top-[236px]'}`}>
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast-in rounded px-3 py-1.5 text-xs font-semibold shadow-lg sm:text-sm ${
                t.kind === 'cash' ? 'bg-emerald-600/95' : t.kind === 'warn' ? 'bg-red-700/95' : t.kind === 'good' ? 'bg-sky-600/95' : 'bg-zinc-900/95'
              }`}
            >
              {t.text}
            </div>
          ))}
        </div>

        {/* banners */}
        {banner && (
          <div className={`pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center ${banner.kind === 'wasted' ? 'bg-black/50' : ''}`}>
            <div className={`banner-in gta-font text-[clamp(56px,11vw,150px)] leading-none hud-text ${bannerColors[banner.kind]}`}>{banner.title}</div>
            {banner.sub && <div className="banner-in mt-3 text-xl font-semibold tracking-wider text-white hud-text">{banner.sub}</div>}
          </div>
        )}

        {/* click to capture (desktop only) */}
        {phase === 'playing' && hud && !hud.mobileMode && !hud.locked && !hud.paused && !hud.mapOpen && !banner && !hud.scope && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-4 flex justify-center">
            <div className="rounded-full bg-black/80 px-5 py-1.5 text-center text-[11px] tracking-wide border border-white/15">
              <span className="font-bold text-amber-300">CLICK TO CAPTURE MOUSE</span>
              <span className="ml-2 text-white/70">or press Esc for Mobile Mode / RTX settings</span>
            </div>
          </div>
        )}

        {hud && !isMobileHud && <div className="absolute bottom-1 right-2 text-[10px] text-white/45">{hud.fps} FPS · {hud.storeCount} STORES</div>}
      </div>

      {/* ------------------------------------------------------------ mobile touch controls */}
      {playing && hud.mobileMode && !hud.paused && !hud.mapOpen && !banner && g && (
        <MobileControls game={g} hud={hud} />
      )}

      {/* ------------------------------------------------------------ full map */}
      {playing && hud.mapOpen && !hud.paused && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 p-4">
          <div className="flex h-full max-h-[850px] w-full max-w-[820px] flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="gta-font whitespace-nowrap text-xl tracking-widest text-white sm:text-2xl">SAN NOVA · 10 KM × 10 KM</div>
              <div className="flex flex-wrap gap-2.5 text-xs text-white/85">
                <span><b className="text-yellow-300">●</b> Mission</span>
                <span><b className="text-sky-400">●</b> Police</span>
                <span><b className="text-red-400">●</b> Hospital</span>
                <span><b className="text-orange-300">●</b> Ammu-Nation</span>
                <span><b className="text-sky-300">✈</b> Airport</span>
                <span><b className="text-emerald-400">●</b> Landmarks</span>
                <span><b className="text-fuchsia-400">●</b> GPS</span>
              </div>
              <button onClick={() => g?.setMapOpen(false)} className="whitespace-nowrap rounded bg-white/15 px-4 py-1.5 text-sm font-semibold hover:bg-white/25">Close (M)</button>
            </div>
            <canvas
              ref={(c) => g?.attachFullmap(c)}
              width={800}
              height={800}
              onClick={onMapClick}
              className="mx-auto aspect-square min-h-0 max-h-full w-auto flex-1 cursor-crosshair rounded-lg border border-white/20 bg-black"
            />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ pause */}
      {playing && hud.paused && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 p-4 overflow-y-auto">
          <div className="w-[min(880px,94vw)] max-h-[92vh] overflow-y-auto rounded-xl border border-white/15 bg-zinc-950 p-6 sm:p-8 shadow-2xl">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="gta-font text-4xl sm:text-5xl text-amber-300">PAUSED</div>
                <div className="text-sm text-white/65">San Nova · {hud.district} · {hud.time} · {hud.storeCount} Stores</div>
              </div>
              <button onClick={resume} className="rounded-lg bg-amber-400 px-7 py-2.5 text-base sm:text-lg font-extrabold tracking-wider text-black transition hover:bg-amber-300">RESUME</button>
            </div>

            {/* Quick Mode & Graphics Toggles */}
            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <button
                type="button"
                data-toggle-mobile="true"
                onClick={toggleMobile}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                  hud.mobileMode
                    ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                    : 'border-white/15 bg-white/5 text-white/85 hover:bg-white/10'
                }`}
              >
                <div>
                  <div className="text-xs font-extrabold tracking-widest">MOBILE MODE</div>
                  <div className="text-[11px] text-white/60">Touch thumbstick & HUD</div>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-black ${hud.mobileMode ? 'bg-amber-400 text-black' : 'bg-white/15 text-white/70'}`}>
                  {hud.mobileMode ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                type="button"
                data-toggle-rtx="true"
                onClick={toggleRtx}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                  hud.rtxEnabled
                    ? 'border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200'
                    : 'border-white/15 bg-white/5 text-white/85 hover:bg-white/10'
                }`}
              >
                <div>
                  <div className="text-xs font-extrabold tracking-widest">SIMULATED RTX</div>
                  <div className="text-[11px] text-white/60">PBR reflections & GI bounce</div>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-black ${hud.rtxEnabled ? 'bg-fuchsia-400 text-black' : 'bg-white/15 text-white/70'}`}>
                  {hud.rtxEnabled ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                type="button"
                data-toggle-gore="true"
                onClick={toggleGore}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                  hud.goreEnabled
                    ? 'border-red-400 bg-red-500/20 text-red-200'
                    : 'border-white/15 bg-white/5 text-white/85 hover:bg-white/10'
                }`}
              >
                <div>
                  <div className="text-xs font-extrabold tracking-widest">GORE & BLOOD</div>
                  <div className="text-[11px] text-white/60">Ballistic spray, pools & gibs</div>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-black ${hud.goreEnabled ? 'bg-red-500 text-white' : 'bg-white/15 text-white/70'}`}>
                  {hud.goreEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            <div className="mt-6 grid gap-8 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-bold tracking-[0.3em] text-white/50">CONTROLS</div>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {CONTROLS.map(([k, v]) => (
                    <div key={k} className="contents">
                      <span className="rounded bg-white/10 px-2 py-0.5 text-center font-mono text-xs text-amber-200">{k}</span>
                      <span className="text-white/85">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <div className="mb-1 text-xs font-bold tracking-[0.3em] text-white/50">DAY LENGTH · {dayLen}s per hour</div>
                  <input type="range" min={6} max={120} value={dayLen} onChange={(e) => { setDayLen(+e.target.value); if (g) g.dayLength = +e.target.value; }} className="w-full accent-amber-400" />
                </div>
                <div>
                  <div className="mb-1 text-xs font-bold tracking-[0.3em] text-white/50">TIME OF DAY · {hud.time}</div>
                  <input type="range" min={0} max={23.9} step={0.1} defaultValue={g?.hour ?? 9.4} onChange={(e) => { if (g) g.hour = +e.target.value; }} className="w-full accent-amber-400" />
                </div>
                <div>
                  <div className="mb-1 text-xs font-bold tracking-[0.3em] text-white/50">VOLUME · {volume}%</div>
                  <input type="range" min={0} max={100} value={volume} onChange={(e) => { setVolume(+e.target.value); if (g?.audio.master) g.audio.master.gain.value = (+e.target.value / 100) * 0.9; }} className="w-full accent-amber-400" />
                </div>
                <div className="rounded-lg bg-white/5 p-3 text-xs leading-relaxed text-white/75">
                  <b className="text-white">Tips:</b> Head east to <b>San Nova International Airport</b> (✈ on map) to pilot prop planes, private jets & seaplanes. Explore <b>328 Leonida stores</b> across Ocean Beach Art Deco, Little Havana, Wynwood Arts & Strip Plazas, test <b>4-wheel car suspension</b> over dunes, or toggle <b>Mobile Mode</b> & <b>Simulated RTX</b> anytime.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ title screen */}
      {phase !== 'playing' && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-gradient-to-b from-[#1b1040] via-[#5b1d63] to-[#ff7a45]">
          <div className="absolute left-1/2 top-[34%] h-56 w-56 -translate-x-1/2 rounded-full bg-gradient-to-b from-yellow-200 to-pink-500 blur-[1px]" />
          <div className="absolute left-1/2 top-[34%] h-56 w-56 -translate-x-1/2 overflow-hidden rounded-full">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="absolute left-0 w-full bg-[#5b1d63]" style={{ top: 100 + i * 20, height: 2 + i * 1.6 }} />)}
          </div>
          <Skyline />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/45" />
          <div className="relative z-10 flex min-h-full flex-col items-center justify-center px-4 py-6 text-center">
            <div className="neon-flicker gta-font text-[clamp(58px,12vw,160px)] leading-none text-white drop-shadow-[0_0_30px_rgba(255,60,160,0.8)]" style={{ WebkitTextStroke: '3px #ff3da0' }}>
              SAN NOVA
            </div>
            <div className="mt-2 text-xs font-semibold tracking-[0.42em] text-cyan-200 sm:text-lg">10 KM × 10 KM LEONIDA OPEN WORLD SANDBOX</div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-white/90">
              {['328 UNIQUE STORES', 'FLYABLE JETS & PLANES', 'SIMULATED RTX & PBR', 'CAR · RAGDOLL · GORE PHYSICS', 'MOBILE MODE', '15 WEAPONS + RPG', '6 MISSIONS'].map((f) => (
                <span key={f} className="rounded border border-white/25 bg-black/55 px-2.5 py-1">{f}</span>
              ))}
            </div>

            {phase === 'loading' ? (
              <div className="mt-10 flex flex-col items-center gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-amber-300" />
                <div className="gta-font text-xl tracking-widest text-amber-200">BUILDING SAN NOVA…</div>
                <div className="text-xs text-white/75">Generating 328 stores, airport runways, PBR reflections, crowds & physics</div>
              </div>
            ) : (
              <>
                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                  {/* Quality */}
                  <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-black/65 p-1">
                    {(['low', 'medium', 'high'] as const).map((q) => (
                      <button key={q} type="button" onClick={() => setQuality(q)} className={`rounded-md px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${quality === q ? 'bg-amber-400 text-black' : 'text-white/80 hover:bg-white/10'}`}>
                        {q}
                      </button>
                    ))}
                  </div>

                  {/* Mobile Mode Menu Toggle */}
                  <button
                    type="button"
                    data-title-mobile="true"
                    onClick={() => setMobileMode((v) => !v)}
                    className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-extrabold tracking-widest transition ${
                      mobileMode
                        ? 'border-amber-300 bg-amber-400 text-black'
                        : 'border-white/20 bg-black/65 text-white hover:bg-white/15'
                    }`}
                  >
                    <span>MOBILE MODE:</span>
                    <span>{mobileMode ? 'ON' : 'OFF'}</span>
                  </button>

                  {/* Simulated RTX Menu Toggle */}
                  <button
                    type="button"
                    data-title-rtx="true"
                    onClick={() => setRtxEnabled((v) => !v)}
                    className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-extrabold tracking-widest transition ${
                      rtxEnabled
                        ? 'border-fuchsia-300 bg-fuchsia-500 text-white'
                        : 'border-white/20 bg-black/65 text-white/80 hover:bg-white/15'
                    }`}
                  >
                    <span>SIMULATED RTX:</span>
                    <span>{rtxEnabled ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                <div className="mt-1.5 text-[11px] text-white/75">Graphics quality · toggle Mobile Mode for touch UI or Simulated RTX for wet PBR reflections</div>
                <button
                  data-start="true"
                  onClick={start}
                  className="gta-font mt-5 rounded-md bg-gradient-to-b from-amber-300 to-orange-500 px-14 py-3.5 text-3xl tracking-[0.2em] text-black shadow-[0_8px_40px_rgba(255,140,0,0.55)] transition hover:scale-105 active:scale-95"
                >
                  START GAME
                </button>
                {error && <div className="mt-4 max-w-xl rounded bg-red-900/90 px-4 py-2 text-sm">Could not start: {error}</div>}
                <div className="mt-6 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-black/65 px-5 py-3.5 text-left text-xs text-white/85 sm:grid-cols-3">
                  {CONTROLS.slice(0, 12).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="min-w-[74px] rounded bg-white/10 px-1.5 py-0.5 text-center font-mono text-[10px] text-amber-200">{k}</span>
                      <span className="truncate">{v}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
