import { useEffect, useRef, useState } from 'react';
import type { Game, HudState } from '../game/Game';
import type { PhoneAppId, SnapNovaPost } from '../game/phoneSystem';
import { MISSIONS } from '../game/missions';

interface PhoneOverlayProps {
  game: Game;
  hud: HudState;
  onToggleRtx: () => void;
  onToggleGlb: () => void;
  onToggleMicro: () => void;
  onToggleGore: () => void;
  onToggleVoices: () => void;
  onToggleBetaBody: () => void;
  onToggleGeminiNpcs: () => void;
}

const FILTER_CSS: Record<SnapNovaPost['filter'], string> = {
  none: 'none',
  vice: 'saturate(1.45) hue-rotate(-14deg) contrast(1.08)',
  noir: 'grayscale(1) contrast(1.28) brightness(0.95)',
  golden: 'sepia(0.38) saturate(1.35) brightness(1.06)',
  chrome: 'contrast(1.22) saturate(0.85) hue-rotate(8deg)',
};

const FILTER_LABELS: { id: SnapNovaPost['filter']; label: string }[] = [
  { id: 'none', label: 'Original' },
  { id: 'vice', label: 'Vice' },
  { id: 'golden', label: 'Golden' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'noir', label: 'Noir' },
];

export function PhoneOverlay({
  game,
  hud,
  onToggleRtx,
  onToggleGlb,
  onToggleMicro,
  onToggleGore,
  onToggleVoices,
  onToggleBetaBody,
  onToggleGeminiNpcs,
}: PhoneOverlayProps) {
  const phone = game.phone;
  const banking = game.banking;
  const app: PhoneAppId = phone.activeApp;
  const [smsInput, setSmsInput] = useState('');
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [photoFilter, setPhotoFilter] = useState<SnapNovaPost['filter']>('none');
  const [photoCaption, setPhotoCaption] = useState('');
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const activeContact = phone.contacts.find((c) => c.id === phone.selectedContactId) ?? phone.contacts[0];
  const activeThread = phone.threads[activeContact.id] ?? [];

  useEffect(() => {
    if (app === 'messages') {
      msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [app, activeThread.length, activeContact.id]);

  // Keep call timer display live while a call is connected
  useEffect(() => {
    if (!phone.activeCall) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [phone.activeCall]);

  const stopKeys = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') e.stopPropagation();
  };

  const handleSendSms = (textOverride?: string) => {
    const body = (textOverride ?? smsInput).trim();
    if (!body) return;
    game.sendPhoneSms(activeContact.id, body);
    if (!textOverride) setSmsInput('');
    setTick((t) => t + 1);
  };

  const handleSnap = () => {
    const dataUrl = game.captureCanvasPhoto();
    if (dataUrl) {
      setCapturedUrl(dataUrl);
      setStatusNote('Photo captured from San Nova camera.');
    } else {
      setStatusNote('Camera preview ready — add a caption to post.');
    }
  };

  const handlePostPhoto = () => {
    const img = capturedUrl ?? game.captureCanvasPhoto();
    game.postSnapNovaPhoto(
      photoCaption.trim() || `Out in ${hud.district}`,
      photoFilter,
      img,
    );
    setCapturedUrl(null);
    setPhotoCaption('');
    setStatusNote(null);
    game.setPhoneApp('snapnova');
    setTick((t) => t + 1);
  };

  const fmtCallSec = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const apps: { id: PhoneAppId; label: string; bg: string; icon: string; badge?: number }[] = [
    { id: 'messages', label: 'Messages', bg: 'bg-emerald-600', icon: 'MSG', badge: hud.phoneUnread },
    { id: 'contacts', label: 'Contacts', bg: 'bg-sky-600', icon: 'CALL' },
    { id: 'missions', label: 'Contracts', bg: 'bg-amber-600', icon: 'JOBS', badge: MISSIONS.length - hud.completedMissions.length },
    { id: 'camera', label: 'Camera', bg: 'bg-orange-500', icon: 'CAM' },
    { id: 'snapnova', label: 'SnapNova', bg: 'bg-pink-600', icon: 'FEED' },
    { id: 'bank', label: 'NovaBank', bg: 'bg-teal-600', icon: 'BANK' },
    { id: 'settings', label: 'Settings', bg: 'bg-zinc-600', icon: 'SET' },
  ];

  return (
    <aside
      aria-label="San Nova Smartphone"
      data-testid="phone-overlay"
      className="pointer-events-auto fixed bottom-3 left-1/2 z-30 flex h-[min(580px,84dvh)] w-[min(348px,calc(100vw-20px))] -translate-x-1/2 flex-col overflow-hidden rounded-[30px] border-[3px] border-zinc-700 bg-[#0b0f17] text-white shadow-[0_22px_60px_rgba(0,0,0,0.88)] sm:bottom-5 sm:left-auto sm:right-5 sm:w-[324px] sm:translate-x-0 sm:rounded-[34px]"
    >
      {/* Top hardware bezel + status bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#070a10] px-5 py-2.5 text-[11px] font-bold text-white/85">
        <span className="tabular-nums">{hud.time}</span>
        <div className="h-2.5 w-16 rounded-full bg-zinc-800" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-wider text-emerald-400">5G</span>
          <button
            type="button"
            aria-label="Close Phone"
            onClick={() => game.togglePhone(false)}
            className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-white/25"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Active Voice Call Banner */}
      {phone.activeCall && (
        <div
          data-testid="phone-active-call"
          className="border-b border-emerald-500/35 bg-[#0a231c] px-4 py-2.5"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-300">
                Connected · {fmtCallSec(phone.activeCall.elapsedSec)}
              </div>
              <div className="text-sm font-bold text-white">{phone.activeCall.contactName}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                game.hangUpPhone();
                setTick((t) => t + 1);
              }}
              className="rounded-full bg-red-600 px-3 py-1 text-xs font-extrabold text-white hover:bg-red-500"
            >
              Hang Up
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-emerald-100/90">
            “{phone.activeCall.transcript}”
          </p>
        </div>
      )}

      {/* App Header Bar (when inside an app) */}
      {app !== 'home' && (
        <div className="flex items-center justify-between border-b border-white/10 bg-[#101624] px-3.5 py-2">
          <button
            type="button"
            onClick={() => {
              game.setPhoneApp('home');
              setTick((t) => t + 1);
            }}
            className="rounded bg-white/10 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-white/20"
          >
            ‹ Home
          </button>
          <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-white/90">
            {app === 'snapnova' ? 'SnapNova' : app === 'bank' ? 'NovaBank' : app === 'missions' ? 'Contracts' : app}
          </span>
          <div className="w-12 text-right">
            {app === 'snapnova' && (
              <button
                type="button"
                onClick={() => {
                  game.setPhoneApp('camera');
                  setTick((t) => t + 1);
                }}
                className="rounded bg-pink-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-pink-500"
              >
                +Snap
              </button>
            )}
          </div>
        </div>
      )}

      {/* Screen Content */}
      <div className="flex-1 overflow-y-auto bg-[#0e1420]">
        {/* ---------------- HOME ---------------- */}
        {app === 'home' && (
          <div className="flex h-full flex-col justify-between bg-gradient-to-b from-[#131d33] via-[#101727] to-[#0a0e18] p-4">
            <div>
              <div className="rounded-2xl border border-white/10 bg-[#0b101b] p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">
                  {hud.district}
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <div>
                    <div className="text-[10px] text-white/55">WALLET CASH</div>
                    <div className="gta-font text-xl text-emerald-400">
                      ${hud.money.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-white/55">NOVABANK CARD</div>
                    <div className="gta-font text-xl text-sky-300">
                      ${hud.bankBalance.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {apps.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    data-phone-app={a.id}
                    onClick={() => {
                      game.setPhoneApp(a.id);
                      setTick((t) => t + 1);
                    }}
                    className="group relative flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition hover:bg-white/10"
                  >
                    <div
                      className={`relative flex h-14 w-14 items-center justify-center rounded-2xl ${a.bg} text-xs font-black tracking-wider text-white shadow-md transition group-hover:scale-105`}
                    >
                      {a.icon}
                      {a.badge ? (
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">
                          {a.badge}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[11px] font-semibold text-white/90">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0a0f18] px-3 py-2 text-[11px] text-white/65">
              <div className="flex items-center justify-between">
                <span>Story Contracts</span>
                <span className="font-bold text-emerald-300">
                  {hud.completedMissions.length} / {MISSIONS.length}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between">
                <span>Events Found</span>
                <span className="font-bold text-amber-300">
                  {hud.randomEventsDone} / {hud.randomEventsTotal}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between">
                <span>Active NPC Plans</span>
                <span className="font-bold text-sky-300">{hud.activePlansCount}</span>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- MESSAGES ---------------- */}
        {app === 'messages' && (
          <div className="flex h-full flex-col">
            {/* Contact tabs */}
            <div className="flex gap-1.5 overflow-x-auto border-b border-white/10 bg-[#0a0f1a] px-2.5 py-2">
              {phone.contacts.map((c) => {
                const selected = c.id === activeContact.id;
                const unread = phone.unreadByContact[c.id] || 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      game.selectPhoneContact(c.id);
                      setTick((t) => t + 1);
                    }}
                    className={`relative shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                      selected
                        ? 'border-emerald-400 bg-emerald-600/25 text-white'
                        : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {c.name.split(' ')[0]}
                    {unread > 0 && (
                      <span className="ml-1 inline-block h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Thread messages */}
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              <div className="text-center text-[10px] font-semibold uppercase tracking-widest text-white/40">
                {activeContact.name} · {activeContact.role}
              </div>
              {activeThread.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.sender === 'player' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                      m.sender === 'player'
                        ? 'rounded-br-sm bg-sky-600 text-white'
                        : 'rounded-bl-sm bg-zinc-800 text-white/95'
                    }`}
                  >
                    {m.text}
                  </div>
                  <span className="mt-0.5 text-[9px] text-white/40">{m.timestamp}</span>
                </div>
              ))}
              <div ref={msgEndRef} />
            </div>

            {/* Quick replies */}
            <div className="flex gap-1.5 overflow-x-auto border-t border-white/10 bg-[#0b101a] px-2.5 py-1.5">
              {activeContact.quickTexts.map((qt) => (
                <button
                  key={qt}
                  type="button"
                  onClick={() => handleSendSms(qt)}
                  className="shrink-0 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium text-white/85 hover:bg-white/15"
                >
                  {qt}
                </button>
              ))}
            </div>

            {/* Compose input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendSms();
              }}
              className="flex items-center gap-1.5 border-t border-white/10 bg-[#080c14] p-2.5"
            >
              <input
                type="text"
                aria-label="Message text"
                value={smsInput}
                onKeyDown={stopKeys}
                onChange={(e) => setSmsInput(e.target.value)}
                placeholder={`Text ${activeContact.name.split(' ')[0]}...`}
                className="min-w-0 flex-1 rounded-lg border border-white/15 bg-zinc-900 px-2.5 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-sky-400 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-500"
              >
                Send
              </button>
            </form>
          </div>
        )}

        {/* ---------------- CONTACTS ---------------- */}
        {app === 'contacts' && (
          <div className="divide-y divide-white/10 p-2">
            {phone.contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-2 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                    style={{ background: c.avatarColor }}
                  >
                    {c.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-white">{c.name}</div>
                    <div className="truncate text-[10px] text-white/55">
                      {c.role} · {c.phoneNumber}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    aria-label={`Call ${c.name}`}
                    onClick={() => {
                      game.callPhoneContact(c.id);
                      setTick((t) => t + 1);
                    }}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-emerald-500"
                  >
                    Call
                  </button>
                  <button
                    type="button"
                    aria-label={`Text ${c.name}`}
                    onClick={() => {
                      game.selectPhoneContact(c.id);
                      game.setPhoneApp('messages');
                      setTick((t) => t + 1);
                    }}
                    className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white/90 hover:bg-white/20"
                  >
                    Text
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---------------- CAMERA ---------------- */}
        {app === 'camera' && (
          <div className="flex h-full flex-col justify-between p-3.5">
            <div>
              <div className="relative flex h-48 w-full items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black">
                {capturedUrl ? (
                  <img
                    src={capturedUrl}
                    alt="Captured San Nova snapshot"
                    className="h-full w-full object-cover"
                    style={{ filter: FILTER_CSS[photoFilter] }}
                  />
                ) : (
                  <div className="px-4 text-center">
                    <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">
                      San Nova Camera
                    </div>
                    <p className="mt-1 text-[11px] text-white/60">
                      Press Snap Photo to capture your current 3D view and post it online.
                    </p>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 rounded bg-black/75 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/90">
                  {hud.district}
                </div>
              </div>

              {/* Filter Picker */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {FILTER_LABELS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPhotoFilter(f.id)}
                    className={`rounded-md border px-2 py-1 text-[10px] font-bold transition ${
                      photoFilter === f.id
                        ? 'border-amber-400 bg-amber-400 text-black'
                        : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/15'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/60">
                  SnapNova Caption
                </label>
                <input
                  type="text"
                  aria-label="Photo caption"
                  value={photoCaption}
                  onKeyDown={stopKeys}
                  onChange={(e) => setPhotoCaption(e.target.value)}
                  placeholder="Write a caption for your followers..."
                  className="w-full rounded-lg border border-white/15 bg-zinc-900 px-2.5 py-2 text-xs text-white placeholder:text-white/40 focus:border-pink-400 focus:outline-none"
                />
              </div>

              {statusNote && (
                <div className="mt-2 text-[11px] font-medium text-emerald-300">{statusNote}</div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSnap}
                className="rounded-xl bg-amber-400 py-2.5 text-xs font-extrabold text-black hover:bg-amber-300"
              >
                {capturedUrl ? 'Retake Photo' : 'Snap Photo'}
              </button>
              <button
                type="button"
                onClick={handlePostPhoto}
                className="rounded-xl bg-pink-600 py-2.5 text-xs font-extrabold text-white hover:bg-pink-500"
              >
                Post Online
              </button>
            </div>
          </div>
        )}

        {/* ---------------- SNAPNOVA FEED ---------------- */}
        {app === 'snapnova' && (
          <div className="space-y-3 p-3">
            {phone.posts.map((post) => (
              <article
                key={post.id}
                className="overflow-hidden rounded-xl border border-white/10 bg-[#121928]"
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <div>
                    <div className="text-xs font-bold text-white">{post.author}</div>
                    <div className="text-[10px] text-white/55">
                      {post.handle} · {post.location}
                    </div>
                  </div>
                  <span className="text-[10px] text-white/45">{post.timestamp}</span>
                </div>

                {post.imageDataUrl ? (
                  <img
                    src={post.imageDataUrl}
                    alt={post.caption}
                    className="h-36 w-full object-cover"
                    style={{ filter: FILTER_CSS[post.filter] }}
                  />
                ) : (
                  <div
                    className="flex h-28 w-full items-end p-3"
                    style={{ background: post.accentGradient }}
                  >
                    <span className="rounded bg-black/55 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">
                      {post.location}
                    </span>
                  </div>
                )}

                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        game.likeSnapNovaPost(post.id);
                        setTick((t) => t + 1);
                      }}
                      className={`rounded-md px-2 py-0.5 text-xs font-bold transition ${
                        post.likedByPlayer
                          ? 'bg-pink-600 text-white'
                          : 'bg-white/10 text-white/80 hover:bg-white/20'
                      }`}
                    >
                      ♥ {post.likes}
                    </button>
                    {post.filter !== 'none' && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white/65">
                        {post.filter}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-snug text-white/95">{post.caption}</p>
                  {post.comments.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                      {post.comments.map((cm, idx) => (
                        <div key={idx} className="text-[10px] leading-snug text-white/75">
                          <span className="mr-1 font-bold text-sky-300">{cm.author}</span>
                          {cm.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {/* ---------------- NOVABANK MOBILE ---------------- */}
        {app === 'bank' && (
          <div className="space-y-3 p-3.5">
            <div className="rounded-xl border border-emerald-500/35 bg-[#0a1d1c] p-3.5">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-emerald-300">
                NovaBank Card Balance
              </div>
              <div className="gta-font mt-0.5 text-3xl text-white">
                ${hud.bankBalance.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-white/70">
                Wallet Cash: <b className="text-emerald-300">${hud.money.toLocaleString()}</b>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/55">
                Quick Deposit to Card
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    game.bankDeposit(100);
                    setTick((t) => t + 1);
                  }}
                  className="rounded-lg bg-emerald-700 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
                >
                  +$100
                </button>
                <button
                  type="button"
                  onClick={() => {
                    game.bankDeposit(500);
                    setTick((t) => t + 1);
                  }}
                  className="rounded-lg bg-emerald-700 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
                >
                  +$500
                </button>
                <button
                  type="button"
                  onClick={() => {
                    game.bankDeposit(hud.money);
                    setTick((t) => t + 1);
                  }}
                  className="rounded-lg bg-emerald-600 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  All Cash
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/55">
                Quick Cash Withdrawal
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    game.bankWithdraw(100);
                    setTick((t) => t + 1);
                  }}
                  className="rounded-lg bg-sky-700 py-1.5 text-xs font-bold text-white hover:bg-sky-600"
                >
                  -$100 Cash
                </button>
                <button
                  type="button"
                  onClick={() => {
                    game.bankWithdraw(500);
                    setTick((t) => t + 1);
                  }}
                  className="rounded-lg bg-sky-700 py-1.5 text-xs font-bold text-white hover:bg-sky-600"
                >
                  -$500 Cash
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/55">
                Recent Transactions
              </div>
              <div className="space-y-1.5">
                {banking.transactions.slice(0, 6).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px]"
                  >
                    <div className="min-w-0 truncate">
                      <div className="truncate font-semibold text-white/90">{tx.label}</div>
                      <div className="text-[9px] text-white/45">{tx.timestamp}</div>
                    </div>
                    <span
                      className={`ml-2 shrink-0 font-bold ${
                        tx.amount >= 0 ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {tx.amount >= 0 ? '+' : '-'}${Math.abs(tx.amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ---------------- CONTRACTS / MISSIONS ---------------- */}
        {app === 'missions' && (
          <div className="space-y-2.5 p-3">
            {hud.mission && (
              <div className="rounded-xl border border-amber-400/50 bg-amber-500/15 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                    ACTIVE CONTRACT
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      game.cancelActiveMission();
                      setTick((t) => t + 1);
                    }}
                    className="rounded bg-red-600/90 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-500"
                  >
                    Abort
                  </button>
                </div>
                <div className="mt-0.5 text-sm font-extrabold text-white">{hud.mission.title}</div>
                <div className="text-[11px] text-white/80">{hud.mission.objective}</div>
              </div>
            )}

            <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-widest text-white/55">
              <span>{MISSIONS.length} San Nova Contracts</span>
              <span className="text-emerald-300">{hud.completedMissions.length} Completed</span>
            </div>

            {MISSIONS.map((m, idx) => {
              const done = hud.completedMissions.includes(m.id);
              const isActive = hud.mission?.title === m.title;
              return (
                <div
                  key={m.id}
                  data-mission-card={m.id}
                  className={`rounded-xl border p-2.5 transition ${
                    isActive
                      ? 'border-amber-400 bg-amber-500/15'
                      : done
                        ? 'border-emerald-500/35 bg-emerald-950/25'
                        : 'border-white/10 bg-[#121928]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-black text-white/45">#{idx + 1}</span>
                        <span className="truncate text-xs font-extrabold text-white">{m.title}</span>
                        {done && (
                          <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black text-black">
                            DONE
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300/90">
                        {m.category} · {m.district} · {m.giver.name}
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-emerald-600/25 px-2 py-0.5 text-[11px] font-black text-emerald-300">
                      ${m.reward.toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-white/75">{m.summary}</p>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      data-start-mission={m.id}
                      onClick={() => {
                        game.launchMissionById(m.id);
                      }}
                      className={`rounded-lg px-3 py-1 text-[11px] font-extrabold transition ${
                        isActive
                          ? 'bg-white/15 text-white/75'
                          : 'bg-amber-400 text-black hover:bg-amber-300'
                      }`}
                    >
                      {isActive ? 'Restart' : done ? 'Replay' : 'Start Contract'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ---------------- SETTINGS ---------------- */}
        {app === 'settings' && (
          <div className="space-y-2 p-3">
            {[
              {
                label: 'Ray-Traced RTX',
                sub: 'SSR reflections, AO & sun contact shadows',
                on: hud.rtxEnabled,
                toggle: onToggleRtx,
                beta: false,
              },
              {
                label: 'Handcrafted .GLB Models',
                sub: `${hud.glbLoaded}/${hud.glbTotal} loaded · ${hud.glbFailed} failed`,
                on: hud.hdGlbMode,
                toggle: onToggleGlb,
                beta: false,
              },
              {
                label: 'PBR Microtextures',
                sub: 'Surface normal & roughness maps',
                on: hud.microtexturesEnabled,
                toggle: onToggleMicro,
                beta: false,
              },
              {
                label: 'Gemini AI NPCs',
                sub: 'All nearby NPCs think, react & talk via Gemini',
                on: hud.geminiNpcsEnabled,
                toggle: onToggleGeminiNpcs,
                beta: false,
              },
              {
                label: 'Body-Logic NPCs',
                sub: 'Eliminates canned NPC animations with IK physics',
                on: hud.experimentalBodyLogic,
                toggle: onToggleBetaBody,
                beta: true,
              },
              {
                label: 'Realistic Gore & Blood',
                sub: 'Kinetic impact scaling',
                on: hud.goreEnabled,
                toggle: onToggleGore,
                beta: false,
              },
              {
                label: 'NPC Voices',
                sub: 'Ambient speech & dialogue',
                on: hud.voicesEnabled,
                toggle: onToggleVoices,
                beta: false,
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.toggle}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/10"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <span>{item.label}</span>
                    {item.beta && (
                      <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-black">
                        BETA
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-white/55">{item.sub}</div>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-black ${
                    item.on ? 'bg-emerald-500 text-black' : 'bg-white/15 text-white/70'
                  }`}
                >
                  {item.on ? 'ON' : 'OFF'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Home Indicator Bar */}
      <div className="flex items-center justify-center border-t border-white/10 bg-[#070a10] py-2">
        <button
          type="button"
          aria-label="Phone Home"
          onClick={() => {
            game.setPhoneApp('home');
            setTick((t) => t + 1);
          }}
          className="h-1.5 w-24 rounded-full bg-white/35 transition hover:bg-white/70"
        />
      </div>
    </aside>
  );
}
