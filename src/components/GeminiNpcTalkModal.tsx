import { useEffect, useRef, useState } from 'react';
import type { Game, HudState } from '../game/Game';

interface Props {
  game: Game;
  hud: HudState;
}

const QUICK_PROMPTS = [
  "What's going on around here?",
  'Want to roll with me?',
  'Any hot rumors in San Nova?',
  'Empty your pockets right now!',
];

const MOOD_BADGE: Record<string, string> = {
  friendly: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  excited: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
  suspicious: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/40',
  scared: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
  angry: 'bg-red-500/20 text-red-300 border-red-400/40',
  chill: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40',
};

export function GeminiNpcTalkModal({ game, hud }: Props) {
  const talk = hud.geminiTalk;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [talk?.history.length, sending]);

  useEffect(() => {
    if (talk && !hud.mobileMode) {
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [talk?.pedId, hud.mobileMode]);

  if (!talk) return null;

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || sending) return;
    setDraft('');
    setErrMsg(null);
    setSending(true);
    const res = await game.sendGeminiNpcMessage(talk.pedId, clean);
    setSending(false);
    if (!res.ok) {
      setErrMsg(res.error ?? 'Gemini NPC could not respond.');
    }
  };

  const moodClass = MOOD_BADGE[talk.mood] ?? MOOD_BADGE.chill;

  return (
    <div
      data-testid="gemini-talk-modal"
      className="pointer-events-auto fixed bottom-4 left-1/2 z-40 w-[min(468px,calc(100vw-20px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-cyan-400/45 bg-[#0a101e] text-white shadow-[0_18px_54px_rgba(0,0,0,0.85)]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-white/10 bg-[#10192d] px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black tracking-wide text-white">{talk.name}</span>
            <span className="rounded border border-cyan-400/40 bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-cyan-200">
              GEMINI AI
            </span>
            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${moodClass}`}>
              {talk.mood}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-white/60">
            {talk.occupation} · {talk.role}
            {talk.thought ? ` · "${talk.thought}"` : ''}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close NPC Talk"
          onClick={() => game.closeGeminiTalk()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-xs font-black text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Chat Log */}
      <div ref={listRef} className="max-h-44 space-y-2 overflow-y-auto px-4 py-2.5 text-xs">
        {talk.history.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/70">
            Say anything to <b className="text-white">{talk.name}</b> — Gemini will reply in character and physically react in the world.
          </div>
        ) : (
          talk.history.map((m, idx) => (
            <div key={idx} className={`flex ${m.from === 'player' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-1.5 leading-snug ${
                  m.from === 'player'
                    ? 'bg-amber-400 text-black font-semibold'
                    : 'border border-cyan-400/25 bg-[#131f38] text-white/95'
                }`}
              >
                <div>{m.text}</div>
                {m.from === 'npc' && m.intent && (
                  <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-cyan-300/80">
                    Action: {m.intent.replace('_', ' ')}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-xl border border-cyan-400/20 bg-[#131f38] px-3 py-1.5 text-[11px] text-cyan-200/80">
              {talk.name} is thinking…
            </div>
          </div>
        )}
      </div>

      {errMsg && (
        <div className="mx-4 mb-2 rounded-lg border border-red-400/40 bg-red-950/80 px-3 py-1.5 text-[11px] text-red-200">
          {errMsg}
        </div>
      )}

      {/* Quick Street Prompts */}
      <div className="flex flex-wrap gap-1.5 border-t border-white/10 px-4 pt-2">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={sending}
            onClick={() => void send(q)}
            className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-semibold text-white/80 transition hover:border-cyan-300/60 hover:bg-cyan-500/15 hover:text-white disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        className="flex items-center gap-2 p-3 pt-2.5"
      >
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={200}
          disabled={sending}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Talk to ${talk.name}…`}
          className="flex-1 rounded-xl border border-white/20 bg-[#070b14] px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded-xl bg-cyan-400 px-3.5 py-2 text-xs font-black tracking-wider text-black transition hover:bg-cyan-300 disabled:opacity-40"
        >
          SEND
        </button>
      </form>
    </div>
  );
}
