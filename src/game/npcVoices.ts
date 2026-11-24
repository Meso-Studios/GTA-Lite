// Real NPC Voice Engine using live public CORS-enabled neural TTS site API (ottsy.weilbyte.dev)
// Completely non-blocking (runs off rAF tick, zero synchronous speechSynthesis stalls, fault-isolated).

export type VoiceKind = 'civ' | 'tourist' | 'cop' | 'gang' | 'guard' | 'target' | 'ally' | 'story';

export interface VoiceProfile {
  voice: string;
  label: string;
  pitch: number;
  rate: number;
  gender: 'm' | 'f';
}

export const TTS_API_ENDPOINT = 'https://ottsy.weilbyte.dev/api/generation';

const VOICE_POOLS: Record<VoiceKind, VoiceProfile[]> = {
  civ: [
    { voice: 'en_us_006', label: 'Marcus', pitch: 1.0, rate: 1.02, gender: 'm' },
    { voice: 'en_us_001', label: 'Aria', pitch: 1.04, rate: 1.02, gender: 'f' },
    { voice: 'en_us_007', label: 'Devon', pitch: 0.96, rate: 1.05, gender: 'm' },
    { voice: 'en_us_002', label: 'Elena', pitch: 1.06, rate: 1.0, gender: 'f' },
    { voice: 'en_us_009', label: 'Mateo', pitch: 0.98, rate: 1.03, gender: 'm' },
    { voice: 'en_us_010', label: 'Jack', pitch: 0.95, rate: 1.02, gender: 'm' },
  ],
  tourist: [
    { voice: 'en_au_001', label: 'Chloe', pitch: 1.06, rate: 1.04, gender: 'f' },
    { voice: 'en_uk_001', label: 'Liam', pitch: 1.0, rate: 1.02, gender: 'm' },
    { voice: 'en_au_002', label: 'Lachlan', pitch: 0.98, rate: 1.02, gender: 'm' },
    { voice: 'en_us_002', label: 'Elena', pitch: 1.08, rate: 1.04, gender: 'f' },
    { voice: 'en_uk_003', label: 'Arthur', pitch: 0.96, rate: 1.0, gender: 'm' },
  ],
  cop: [
    { voice: 'en_us_010', label: 'Ofc. Jack', pitch: 0.92, rate: 1.04, gender: 'm' },
    { voice: 'en_us_006', label: 'Ofc. Marcus', pitch: 0.9, rate: 1.05, gender: 'm' },
    { voice: 'en_us_001', label: 'Ofc. Aria', pitch: 0.98, rate: 1.06, gender: 'f' },
  ],
  gang: [
    { voice: 'en_us_009', label: 'Mateo', pitch: 0.88, rate: 1.08, gender: 'm' },
    { voice: 'en_us_007', label: 'Devon', pitch: 0.86, rate: 1.06, gender: 'm' },
    { voice: 'en_us_010', label: 'Rico', pitch: 0.85, rate: 1.05, gender: 'm' },
  ],
  guard: [
    { voice: 'en_us_010', label: 'Sec. Jack', pitch: 0.9, rate: 1.0, gender: 'm' },
    { voice: 'en_uk_003', label: 'Sec. Arthur', pitch: 0.88, rate: 0.98, gender: 'm' },
  ],
  target: [
    { voice: 'en_uk_003', label: 'Boss Arthur', pitch: 0.88, rate: 1.02, gender: 'm' },
    { voice: 'en_us_009', label: 'Boss Mateo', pitch: 0.84, rate: 1.04, gender: 'm' },
  ],
  ally: [
    { voice: 'en_us_007', label: 'Devon', pitch: 0.95, rate: 1.04, gender: 'm' },
    { voice: 'en_us_001', label: 'Aria', pitch: 1.02, rate: 1.04, gender: 'f' },
    { voice: 'en_us_006', label: 'Marcus', pitch: 0.96, rate: 1.03, gender: 'm' },
  ],
  story: [
    { voice: 'en_us_010', label: 'Sal', pitch: 0.92, rate: 1.0, gender: 'm' },
    { voice: 'en_us_006', label: 'Sal', pitch: 0.94, rate: 1.0, gender: 'm' },
  ],
};

/** Deterministically assigns a consistent API voice & vocal cadence to an NPC ID + kind. */
export function selectVoiceProfile(pedId: number, kind: VoiceKind): VoiceProfile {
  const pool = VOICE_POOLS[kind] ?? VOICE_POOLS.civ;
  const idx = Math.abs(Math.floor(pedId * 2654435761)) % pool.length;
  return pool[idx];
}

/** Builds the live public TTS site API request (URL + JSON body) for natural neural voice audio. */
export function buildTtsApiRequest(voice: string, text: string): { url: string; body: { voice: string; text: string } } {
  const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  return {
    url: TTS_API_ENDPOINT,
    body: { voice, text: cleaned },
  };
}

/** Canonical TTS API URL helper for diagnostics & unit tests. */
export function buildTtsApiUrl(voice: string, text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  return `${TTS_API_ENDPOINT}?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(cleaned)}`;
}

/** Computes realistic 3D spatial voice attenuation (0 beyond 28m). */
export function computeVoiceVolume(distanceMeters: number, masterVolume = 0.8): number {
  const mv = Math.max(0, Math.min(1, masterVolume));
  if (mv <= 0 || distanceMeters >= 28) return 0;
  const d = Math.max(0, distanceMeters);
  const atten = 1 / (1 + Math.pow(d / 7.5, 1.45));
  return Math.max(0.08, Math.min(1, atten)) * mv;
}

export class NpcVoiceEngine {
  enabled = true;
  masterVolume = 0.78;
  unlocked = false;
  speakingPedId: number | null = null;
  speakingVoiceName: string | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private cache = new Map<string, string>(); // stores lightweight data:audio/mpeg;base64,... URLs
  private abortCtrl: AbortController | null = null;
  private lastSpeakMs = 0;
  private apiBlockedUntilMs = 0;
  private epoch = 0;
  private usedWebSpeech = false;
  private pendingTimer: number | null = null;

  unlock() {
    this.unlocked = true;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stop();
  }

  setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.audioEl) {
      try {
        this.audioEl.volume = Math.max(0, Math.min(1, this.masterVolume));
      } catch { /* ignore */ }
    }
  }

  stop() {
    this.epoch++;
    if (this.pendingTimer !== null) {
      try { window.clearTimeout(this.pendingTimer); } catch { /* ignore */ }
      this.pendingTimer = null;
    }
    if (this.abortCtrl) {
      try { this.abortCtrl.abort(); } catch { /* ignore */ }
      this.abortCtrl = null;
    }
    if (this.audioEl) {
      const old = this.audioEl;
      this.audioEl = null;
      try {
        old.onended = null;
        old.onerror = null;
        old.pause();
        old.removeAttribute('src');
        old.load();
      } catch { /* ignore */ }
    }
    // Only invoke speechSynthesis.cancel() if we actually started a Web Speech utterance
    // (unconditional cancel() inside rAF is a known Chromium/Safari main-thread freeze bug!)
    if (this.usedWebSpeech && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.usedWebSpeech = false;
      window.setTimeout(() => {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      }, 0);
    }
    this.speakingPedId = null;
    this.speakingVoiceName = null;
  }

  /** Schedules an NPC line asynchronously off the animation frame so gameplay can NEVER stall or freeze. */
  speak(pedId: number, kind: VoiceKind, text: string, distanceMeters = 4, priority = false) {
    try {
      if (!this.enabled || !text || !text.trim() || typeof window === 'undefined') return;
      const vol = computeVoiceVolume(distanceMeters, this.masterVolume);
      if (vol <= 0.02) return;

      const now = Date.now();
      if (!priority && now - this.lastSpeakMs < 1800) return;
      this.lastSpeakMs = now;

      this.stop();
      const myEpoch = this.epoch;
      const profile = selectVoiceProfile(pedId, kind);
      this.speakingPedId = pedId;
      this.speakingVoiceName = profile.label;

      // Defer actual network/audio work off the current requestAnimationFrame tick
      this.pendingTimer = window.setTimeout(() => {
        this.pendingTimer = null;
        if (myEpoch !== this.epoch || !this.enabled) return;
        this.dispatchSpeech(myEpoch, pedId, profile, text, vol);
      }, 0);
    } catch {
      // Never allow voice synthesis errors to disrupt the game loop
    }
  }

  private dispatchSpeech(myEpoch: number, pedId: number, profile: VoiceProfile, text: string, vol: number) {
    try {
      const cacheKey = `${profile.voice}|${text}`;
      const cachedDataUrl = this.cache.get(cacheKey);
      if (cachedDataUrl) {
        this.playDataUrl(myEpoch, cachedDataUrl, vol, pedId, profile, text);
        return;
      }

      if (Date.now() < this.apiBlockedUntilMs) {
        this.speakWebSpeech(myEpoch, text, vol, profile, pedId);
        return;
      }

      const req = buildTtsApiRequest(profile.voice, text);
      const ctrl = new AbortController();
      this.abortCtrl = ctrl;
      const timer = window.setTimeout(() => {
        try { ctrl.abort(); } catch { /* ignore */ }
      }, 2800);

      fetch(req.url, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: ctrl.signal,
      })
        .then((res) => {
          window.clearTimeout(timer);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<{ success?: boolean; data?: string }>;
        })
        .then((json) => {
          if (myEpoch !== this.epoch || ctrl.signal.aborted || !this.enabled) return;
          if (!json?.success || typeof json.data !== 'string' || json.data.length < 120) {
            throw new Error('Empty TTS payload');
          }
          const dataUrl = `data:audio/mpeg;base64,${json.data}`;
          if (this.cache.size >= 36) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) this.cache.delete(oldestKey);
          }
          this.cache.set(cacheKey, dataUrl);
          this.playDataUrl(myEpoch, dataUrl, vol, pedId, profile, text);
        })
        .catch(() => {
          window.clearTimeout(timer);
          if (myEpoch !== this.epoch || !this.enabled) return;
          this.apiBlockedUntilMs = Date.now() + 30_000;
          this.speakWebSpeech(myEpoch, text, vol, profile, pedId);
        });
    } catch {
      if (myEpoch === this.epoch) {
        this.speakingPedId = null;
        this.speakingVoiceName = null;
      }
    }
  }

  private playDataUrl(
    myEpoch: number,
    dataUrl: string,
    vol: number,
    pedId: number,
    profile: VoiceProfile,
    text: string,
  ) {
    if (myEpoch !== this.epoch || !this.enabled) return;
    try {
      // Fresh detached Audio instance avoids InvalidStateError / media decode stalls
      const audio = new Audio();
      this.audioEl = audio;
      audio.preload = 'auto';
      audio.volume = Math.max(0.05, Math.min(1, vol));
      audio.playbackRate = profile.rate;
      audio.onended = () => {
        if (myEpoch === this.epoch && this.speakingPedId === pedId) {
          this.speakingPedId = null;
          this.speakingVoiceName = null;
        }
        if (this.audioEl === audio) this.audioEl = null;
      };
      audio.onerror = () => {
        if (this.audioEl === audio) this.audioEl = null;
        if (myEpoch === this.epoch && this.enabled) {
          this.speakWebSpeech(myEpoch, text, vol, profile, pedId);
        }
      };
      audio.src = dataUrl;
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // Autoplay blocked before user gesture -> silently clear without hammering speechSynthesis
          if (this.audioEl === audio) this.audioEl = null;
          if (!this.unlocked) {
            if (myEpoch === this.epoch && this.speakingPedId === pedId) {
              this.speakingPedId = null;
              this.speakingVoiceName = null;
            }
            return;
          }
          if (myEpoch === this.epoch && this.enabled) {
            this.speakWebSpeech(myEpoch, text, vol, profile, pedId);
          }
        });
      }
    } catch {
      if (myEpoch === this.epoch) {
        this.speakingPedId = null;
        this.speakingVoiceName = null;
      }
    }
  }

  private speakWebSpeech(myEpoch: number, text: string, vol: number, profile: VoiceProfile, pedId: number) {
    if (myEpoch !== this.epoch || !this.enabled || !this.unlocked) {
      if (myEpoch === this.epoch && this.speakingPedId === pedId) {
        this.speakingPedId = null;
        this.speakingVoiceName = null;
      }
      return;
    }
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      if (myEpoch === this.epoch && this.speakingPedId === pedId) this.speakingPedId = null;
      return;
    }
    try {
      this.usedWebSpeech = true;
      const u = new SpeechSynthesisUtterance(text);
      u.volume = Math.max(0.05, Math.min(1, vol));
      u.pitch = profile.pitch;
      u.rate = profile.rate;
      const voices = window.speechSynthesis.getVoices();
      const en = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
      if (en.length > 0) {
        u.voice = en[Math.abs(pedId) % en.length];
      }
      u.onend = () => {
        if (myEpoch === this.epoch && this.speakingPedId === pedId) {
          this.speakingPedId = null;
          this.speakingVoiceName = null;
        }
      };
      u.onerror = () => {
        if (myEpoch === this.epoch && this.speakingPedId === pedId) {
          this.speakingPedId = null;
          this.speakingVoiceName = null;
        }
      };
      window.speechSynthesis.speak(u);
    } catch {
      if (myEpoch === this.epoch && this.speakingPedId === pedId) {
        this.speakingPedId = null;
        this.speakingVoiceName = null;
      }
    }
  }

  dispose() {
    this.stop();
    this.cache.clear();
  }
}
