import { useEffect, useRef, useState } from 'react';
import type { Game, HudState } from '../game/Game';
import { GeminiLiveVoiceClient, type LiveVoiceStatus } from '../game/liveVoiceChat';

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
  const [voiceStatus, setVoiceStatus] = useState<LiveVoiceStatus>('idle');
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [npcSpeaking, setNpcSpeaking] = useState(false);
  const [liveUserLine, setLiveUserLine] = useState('');
  const [liveNpcLine, setLiveNpcLine] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceClientRef = useRef<GeminiLiveVoiceClient | null>(null);
  const activePedIdRef = useRef<number | null>(null);
  const userBufRef = useRef('');
  const npcBufRef = useRef('');

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [talk?.history.length, sending, liveUserLine, liveNpcLine]);

  useEffect(() => {
    if (talk && !hud.mobileMode) {
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [talk?.pedId, hud.mobileMode]);

  const stopVoiceSession = () => {
    if (voiceClientRef.current) {
      voiceClientRef.current.stop();
      voiceClientRef.current = null;
    }
    userBufRef.current = '';
    npcBufRef.current = '';
    setLiveUserLine('');
    setLiveNpcLine('');
    setMicLevel(0);
    setNpcSpeaking(false);
    setVoiceMuted(false);
    setVoiceStatus('idle');
    game.setGeminiLiveVoiceActive(false);
  };

  // Stop live voice cleanly if modal closes, NPC switches, or component unmounts
  useEffect(() => {
    const nextId = talk?.pedId ?? null;
    if (activePedIdRef.current !== null && activePedIdRef.current !== nextId) {
      stopVoiceSession();
    }
    activePedIdRef.current = nextId;
    return () => {
      if (voiceClientRef.current) {
        voiceClientRef.current.stop();
        voiceClientRef.current = null;
        game.setGeminiLiveVoiceActive(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talk?.pedId]);

  if (!talk) return null;

  const startVoiceSession = () => {
    if (voiceStatus === 'connecting' || voiceStatus === 'live') {
      stopVoiceSession();
      return;
    }
    const initPayload = game.getGeminiLiveInit(talk.pedId);
    if (!initPayload) {
      setErrMsg('That citizen moved out of range.');
      return;
    }

    setErrMsg(null);
    userBufRef.current = '';
    npcBufRef.current = '';
    setLiveUserLine('');
    setLiveNpcLine('');
    setVoiceMuted(false);
    game.setGeminiLiveVoiceActive(true);

    const pedId = talk.pedId;
    const client = new GeminiLiveVoiceClient({
      onStatus: (nextStatus, error) => {
        setVoiceStatus(nextStatus);
        if (nextStatus === 'error') {
          setErrMsg(error ?? 'Live voice chat failed to connect.');
          game.setGeminiLiveVoiceActive(false);
        } else if (nextStatus === 'idle') {
          game.setGeminiLiveVoiceActive(false);
        }
      },
      onMicLevel: (lvl) => {
        setMicLevel(lvl);
      },
      onSpeakingChange: (speaking) => {
        setNpcSpeaking(speaking);
        game.markGeminiNpcSpeaking(pedId, speaking);
      },
      onInputTranscript: (chunk) => {
        userBufRef.current = (userBufRef.current + chunk).slice(-240);
        setLiveUserLine(userBufRef.current.trim());
      },
      onOutputTranscript: (chunk) => {
        npcBufRef.current = (npcBufRef.current + chunk).slice(-240);
        setLiveNpcLine(npcBufRef.current.trim());
      },
      onTurnComplete: () => {
        const u = userBufRef.current.trim();
        const n = npcBufRef.current.trim();
        if (u) game.recordGeminiLiveTurn(pedId, 'player', u);
        if (n) game.recordGeminiLiveTurn(pedId, 'npc', n);
        userBufRef.current = '';
        npcBufRef.current = '';
        setLiveUserLine('');
        setLiveNpcLine('');
      },
      onReaction: (reaction) => {
        game.applyGeminiLiveReaction(pedId, reaction);
      },
    });

    voiceClientRef.current = client;
    void client.start(initPayload.npc, initPayload.world);
  };

  const toggleMute = () => {
    const next = !voiceMuted;
    setVoiceMuted(next);
    voiceClientRef.current?.setMuted(next);
  };

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || sending) return;
    setDraft('');
    setErrMsg(null);

    if (voiceStatus === 'live' && voiceClientRef.current) {
      game.recordGeminiLiveTurn(talk.pedId, 'player', clean);
      voiceClientRef.current.sendText(clean);
      return;
    }

    setSending(true);
    const res = await game.sendGeminiNpcMessage(talk.pedId, clean);
    setSending(false);
    if (!res.ok) {
      setErrMsg(res.error ?? 'Gemini NPC could not respond.');
    }
  };

  const moodClass = MOOD_BADGE[talk.mood] ?? MOOD_BADGE.chill;
  const isVoiceLive = voiceStatus === 'live';
  const isVoiceConnecting = voiceStatus === 'connecting';

  return (
    <div
      data-testid="gemini-talk-modal"
      className="pointer-events-auto fixed bottom-3 left-1/2 z-40 w-[min(480px,calc(100vw-16px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-cyan-400/45 bg-[#0a101e] text-white shadow-[0_18px_54px_rgba(0,0,0,0.88)]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-white/10 bg-[#10192d] px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
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
          onClick={() => {
            stopVoiceSession();
            game.closeGeminiTalk();
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-xs font-black text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Live Voice Chat Control Strip (PC & Mobile touch-friendly) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0d1527] px-3.5 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="live-voice-toggle-btn"
            aria-label={isVoiceLive ? 'End Live Voice Chat' : isVoiceConnecting ? 'Connecting Live Voice' : 'Start Live Voice Chat'}
            onClick={startVoiceSession}
            className={`flex min-h-[38px] items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-black tracking-wider transition active:scale-95 ${
              isVoiceLive
                ? 'border-rose-400/70 bg-rose-600 text-white shadow-[0_0_18px_rgba(244,63,94,0.35)]'
                : isVoiceConnecting
                  ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                  : 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isVoiceLive
                  ? 'animate-pulse bg-white'
                  : isVoiceConnecting
                    ? 'animate-pulse bg-amber-300'
                    : 'bg-emerald-300'
              }`}
            />
            {isVoiceLive ? 'END LIVE VOICE' : isVoiceConnecting ? 'CONNECTING MIC…' : 'LIVE VOICE CHAT'}
          </button>

          {isVoiceLive && (
            <button
              type="button"
              data-testid="live-voice-mute-btn"
              aria-label={voiceMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              onClick={toggleMute}
              className={`min-h-[38px] rounded-xl border px-2.5 py-1.5 text-[10px] font-black tracking-wider transition ${
                voiceMuted
                  ? 'border-amber-400/60 bg-amber-500/25 text-amber-200'
                  : 'border-white/15 bg-white/10 text-white/90 hover:bg-white/20'
              }`}
            >
              {voiceMuted ? 'MIC MUTED' : 'MUTE MIC'}
            </button>
          )}
        </div>

        {/* Live Voice Status + Mic Level Meter */}
        <div className="flex items-center gap-2">
          {isVoiceLive ? (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-200">
                {npcSpeaking ? `${talk.name.split(' ')[0]} speaking` : voiceMuted ? 'Muted' : 'Listening…'}
              </span>
              <div className="flex h-4 w-16 items-end gap-0.5 rounded bg-black/40 px-1 py-0.5" aria-label="Microphone level">
                {[0.18, 0.34, 0.5, 0.68, 0.84].map((thresh, i) => {
                  const active = !voiceMuted && micLevel >= thresh * 0.65;
                  return (
                    <span
                      key={i}
                      className={`w-2 rounded-sm transition-all ${
                        active ? 'bg-emerald-400' : 'bg-white/15'
                      }`}
                      style={{ height: `${35 + i * 16}%` }}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <span className="text-[10px] font-medium text-white/55">
              Speak live with mic on Mobile &amp; PC
            </span>
          )}
        </div>
      </div>

      {/* Chat Log & Live Transcripts */}
      <div ref={listRef} className="max-h-40 space-y-2 overflow-y-auto px-3.5 py-2.5 text-xs">
        {talk.history.length === 0 && !liveUserLine && !liveNpcLine ? (
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/70">
            Tap <b className="text-emerald-300">LIVE VOICE CHAT</b> to talk out loud with <b className="text-white">{talk.name}</b>, or type a message below.
          </div>
        ) : (
          <>
            {talk.history.map((m, idx) => (
              <div key={idx} className={`flex ${m.from === 'player' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-1.5 leading-snug ${
                    m.from === 'player'
                      ? 'bg-amber-400 font-semibold text-black'
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
            ))}
            {liveUserLine && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-xl border border-amber-300/50 bg-amber-400/25 px-3 py-1.5 text-amber-100">
                  <span className="mr-1.5 text-[9px] font-black uppercase tracking-wider text-amber-300">LIVE MIC</span>
                  {liveUserLine}
                </div>
              </div>
            )}
            {liveNpcLine && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl border border-emerald-400/40 bg-[#112533] px-3 py-1.5 text-emerald-100">
                  <span className="mr-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">VOICE</span>
                  {liveNpcLine}
                </div>
              </div>
            )}
          </>
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
        <div className="mx-3.5 mb-2 rounded-lg border border-red-400/40 bg-red-950/85 px-3 py-1.5 text-[11px] text-red-200">
          {errMsg}
        </div>
      )}

      {/* Quick Street Prompts */}
      <div className="flex flex-wrap gap-1.5 border-t border-white/10 px-3.5 pt-2">
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
          placeholder={isVoiceLive ? `Speak into mic or type to ${talk.name}…` : `Talk to ${talk.name}…`}
          className="flex-1 rounded-xl border border-white/20 bg-[#070b14] px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="min-h-[36px] rounded-xl bg-cyan-400 px-3.5 py-2 text-xs font-black tracking-wider text-black transition hover:bg-cyan-300 disabled:opacity-40"
        >
          SEND
        </button>
      </form>
    </div>
  );
}
