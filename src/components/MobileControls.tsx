import { useRef, useState } from 'react';
import type { Game, HudState } from '../game/Game';

interface Props {
  game: Game;
  hud: HudState;
}

type HoldAction =
  | 'fire' | 'aim' | 'crouch' | 'jump' | 'horn'
  | 'gas' | 'brake' | 'handbrake' | 'pitchUp' | 'pitchDown' | 'thrUp' | 'thrDown';

function TouchBtn({
  label,
  sub,
  onDown,
  onUp,
  className = '',
  active = false,
  badge,
  testId,
}: {
  label: string;
  sub?: string;
  onDown: () => void;
  onUp?: () => void;
  className?: string;
  active?: boolean;
  badge?: number;
  testId?: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      data-testid={testId}
      onPointerDown={(e) => {
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic pointer events may not support capture
        }
        setPressed(true);
        onDown();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        setPressed(false);
        onUp?.();
      }}
      onPointerCancel={(e) => {
        e.stopPropagation();
        setPressed(false);
        onUp?.();
      }}
      className={`pointer-events-auto relative touch-none select-none flex flex-col items-center justify-center rounded-xl border text-center font-extrabold tracking-wider transition-transform active:scale-95 ${
        pressed || active ? 'border-amber-300 bg-amber-400/90 text-black' : 'border-white/25 bg-black/75 text-white'
      } ${className}`}
    >
      <span className="leading-none">{label}</span>
      {sub && <span className={`mt-0.5 text-[9px] font-bold ${pressed || active ? 'text-black/80' : 'text-white/60'}`}>{sub}</span>}
      {badge && badge > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black text-white shadow">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function MobileControls({ game, hud }: Props) {
  const stickRef = useRef<HTMLDivElement>(null);
  const stickPtr = useRef<number | null>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const [sprintOn, setSprintOn] = useState(false);

  const lookPtr = useRef<number | null>(null);
  const lookLast = useRef<[number, number]>([0, 0]);

  const inCar = hud.speed !== null && !hud.aircraft;
  const inPlane = hud.aircraft !== null;

  const updateStick = (clientX: number, clientY: number) => {
    const el = stickRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const maxR = r.width * 0.36;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setKnob([dx, dy]);
    game.setTouchMove(dx / maxR, -dy / maxR);
  };

  const resetStick = () => {
    stickPtr.current = null;
    setKnob([0, 0]);
    game.setTouchMove(0, 0);
  };

  const hold = (a: HoldAction) => ({
    onDown: () => game.setTouchAction(a, true),
    onUp: () => game.setTouchAction(a, false),
  });

  return (
    <div data-mobile-controls="true" className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden">
      {/* Right-half touch-drag look pad (behind buttons) */}
      <div
        onPointerDown={(e) => {
          if (lookPtr.current !== null) return;
          lookPtr.current = e.pointerId;
          lookLast.current = [e.clientX, e.clientY];
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (lookPtr.current !== e.pointerId) return;
          const [lx, ly] = lookLast.current;
          game.addTouchLook(e.clientX - lx, e.clientY - ly);
          lookLast.current = [e.clientX, e.clientY];
        }}
        onPointerUp={(e) => {
          if (lookPtr.current === e.pointerId) lookPtr.current = null;
        }}
        onPointerCancel={(e) => {
          if (lookPtr.current === e.pointerId) lookPtr.current = null;
        }}
        className="pointer-events-auto touch-none absolute right-0 top-14 bottom-0 w-[56%]"
        aria-label="Camera look pad"
      />

      {/* Top-center compact mobile toolbar: PAUSE · MAP · PHONE · WEAPON/RADIO */}
      <div className="pointer-events-none absolute left-1/2 top-2.5 flex -translate-x-1/2 items-center gap-1.5">
        <TouchBtn
          label="II"
          sub="PAUSE"
          onDown={() => game.setPaused(true)}
          className="h-11 min-w-[46px] px-2 text-xs"
        />
        <TouchBtn
          label="MAP"
          onDown={() => game.setMapOpen(true)}
          className="h-11 min-w-[46px] px-2 text-xs"
        />
        <TouchBtn
          label="PHONE"
          sub="APPS"
          testId="mobile-phone-btn"
          badge={hud.phoneUnread}
          onDown={() => game.togglePhone(true)}
          className="h-11 min-w-[58px] border-amber-400/60 bg-[#11192c]/95 px-2.5 text-[11px] text-amber-300"
        />
        {inCar || inPlane ? (
          <TouchBtn
            label="RADIO"
            onDown={() => game.setTouchAction('radio', true)}
            className="h-11 min-w-[52px] px-2 text-xs"
          />
        ) : (
          <>
            <TouchBtn
              label="◀"
              sub="GUN"
              onDown={() => game.setTouchAction('prevWeapon', true)}
              className="h-11 min-w-[44px] px-1.5 text-xs"
            />
            <TouchBtn
              label="▶"
              sub="GUN"
              onDown={() => game.setTouchAction('nextWeapon', true)}
              className="h-11 min-w-[44px] px-1.5 text-xs"
            />
          </>
        )}
      </div>

      {/* Left Virtual Analog Stick (Move / Steer / Roll) */}
      <div className="pointer-events-none absolute bottom-5 left-5 flex flex-col items-start gap-2">
        {!inCar && !inPlane && (
          <TouchBtn
            label={sprintOn ? 'RUN ON' : 'SPRINT'}
            active={sprintOn}
            onDown={() => {
              const nxt = !sprintOn;
              setSprintOn(nxt);
              game.setTouchAction('sprint', nxt);
            }}
            className="h-10 min-w-[78px] px-3 text-[11px]"
          />
        )}
        <div
          ref={stickRef}
          onPointerDown={(e) => {
            e.stopPropagation();
            stickPtr.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateStick(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (stickPtr.current !== e.pointerId) return;
            updateStick(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            if (stickPtr.current === e.pointerId) resetStick();
          }}
          onPointerCancel={(e) => {
            if (stickPtr.current === e.pointerId) resetStick();
          }}
          className="pointer-events-auto touch-none relative flex h-32 w-32 items-center justify-center rounded-full border-2 border-white/30 bg-black/55"
        >
          <div className="pointer-events-none absolute inset-4 rounded-full border border-white/15" />
          <div
            className="pointer-events-none h-13 w-13 rounded-full border-2 border-amber-300 bg-amber-400/80 shadow-lg"
            style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }}
          />
          <span className="pointer-events-none absolute bottom-1.5 text-[9px] font-bold tracking-widest text-white/55">
            {inPlane ? 'ROLL / PITCH' : inCar ? 'STEER' : 'MOVE'}
          </span>
        </div>
      </div>

      {/* Context-aware Interact / Exit / Gemini Talk buttons */}
      {(hud.prompt || inCar || inPlane || (hud.geminiNpcsEnabled && hud.nearbyGeminiNpc && !hud.geminiTalk)) && (
        <div className={`pointer-events-none absolute right-5 flex items-center gap-2 ${inPlane ? 'bottom-[218px]' : 'bottom-44'}`}>
          {hud.geminiNpcsEnabled && hud.nearbyGeminiNpc && !inCar && !inPlane && !hud.geminiTalk && (
            <TouchBtn
              label="TALK"
              sub="GEMINI"
              testId="mobile-talk-btn"
              active
              onDown={() => game.openGeminiTalk(hud.nearbyGeminiNpc?.id)}
              className="h-12 min-w-[76px] border-cyan-300 bg-cyan-400/95 px-3 text-xs text-black"
            />
          )}
          {(hud.prompt || inCar || inPlane) && (
            <TouchBtn
              label={inPlane || inCar ? 'EXIT' : 'USE'}
              sub={inPlane || inCar ? 'VEHICLE' : 'ENTER'}
              active={Boolean(hud.prompt) && !inCar && !inPlane}
              onDown={() => game.setTouchAction('interact', true)}
              className="h-12 min-w-[76px] px-3 text-xs"
            />
          )}
        </div>
      )}

      {/* Right Thumb-Zone Context Controls */}
      {inPlane ? (
        <div className="pointer-events-none absolute bottom-5 right-5 grid grid-cols-2 gap-2.5">
          <TouchBtn label="THR +" sub="POWER" {...hold('thrUp')} className="h-14 w-16 text-xs border-emerald-400/60" />
          <TouchBtn label="NOSE ▲" sub="CLIMB" {...hold('pitchUp')} className="h-14 w-16 text-xs border-sky-400/60" />
          <TouchBtn label="THR -" sub="CUT" {...hold('thrDown')} className="h-14 w-16 text-xs" />
          <TouchBtn label="NOSE ▼" sub="DIVE" {...hold('pitchDown')} className="h-14 w-16 text-xs" />
          <TouchBtn label="BRAKE" sub="AIR" {...hold('handbrake')} className="col-span-2 h-11 w-full text-xs" />
        </div>
      ) : inCar ? (
        <div className="pointer-events-none absolute bottom-5 right-5 flex items-end gap-2.5">
          <div className="flex flex-col gap-2">
            <TouchBtn label="HORN" {...hold('horn')} className="h-12 w-14 text-[11px]" />
            <TouchBtn label="DRIFT" {...hold('handbrake')} className="h-12 w-14 text-[11px]" />
          </div>
          <TouchBtn label="BRAKE" sub="REV" {...hold('brake')} className="h-16 w-16 text-xs border-red-400/60" />
          <TouchBtn label="GAS" sub="DRIVE" {...hold('gas')} className="h-20 w-18 text-sm border-emerald-400/70" />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-5 right-5 flex items-end gap-2.5">
          <div className="flex flex-col gap-2">
            <TouchBtn
              label="SCOPE"
              active={hud.scope}
              onDown={() => game.setTouchAction('scope', true)}
              className="h-11 w-14 text-[10px]"
            />
            <TouchBtn
              label="AIM"
              active={hud.aiming}
              {...hold('aim')}
              className="h-12 w-14 text-xs"
            />
            <TouchBtn label="SLIDE" sub="CROUCH" {...hold('crouch')} className="h-12 w-14 text-[10px]" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <TouchBtn label="JUMP" {...hold('jump')} className="h-13 w-16 text-xs" />
            <TouchBtn
              label="FIRE"
              sub="ATTACK"
              {...hold('fire')}
              className="h-20 w-20 rounded-full border-2 border-red-400/80 bg-red-600/80 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
