// Client-side Gemini Live API voice chat engine (16kHz PCM mic capture + 24kHz gapless PCM playback).
// Pure PCM math helpers are exported separately for deterministic node:test unit verification.

export const LIVE_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'] as const;
export type LiveVoiceName = (typeof LIVE_VOICES)[number];

export type LiveVoiceStatus = 'idle' | 'connecting' | 'live' | 'error';

export interface LiveNpcInitPayload {
  id: number;
  name: string;
  role: string;
  occupation: string;
  personality: string;
  mood: string;
  dist: number;
  indoor: boolean;
  hostile: boolean;
  gender?: 'm' | 'f';
}

export interface LiveWorldInitPayload {
  district: string;
  timeStr: string;
  isNight: boolean;
  wanted: number;
  playerArmed: boolean;
  playerWeapon: string;
  playerInVehicle: boolean;
  playerVehicleName: string;
  playerSpeedKmh: number;
  playerFiring: boolean;
  playerFighting: boolean;
  recentEvent?: string;
}

export interface LiveVoiceCallbacks {
  onStatus?: (status: LiveVoiceStatus, error?: string) => void;
  onMicLevel?: (level: number) => void;
  onSpeakingChange?: (npcSpeaking: boolean) => void;
  onInputTranscript?: (chunk: string) => void;
  onOutputTranscript?: (chunk: string) => void;
  onTurnComplete?: () => void;
  onReaction?: (reaction: { intent: string; mood: string; thought: string }) => void;
}

/** Deterministically maps an NPC to a natural Gemini Live prebuilt voice matching role & gender. */
export function pickLiveVoiceForNpc(npcId: number, role: string, gender?: 'm' | 'f'): LiveVoiceName {
  const h = Math.abs(Math.imul(npcId | 0, 2654435761)) >>> 0;
  if (gender === 'f') {
    const fem: LiveVoiceName[] = ['Kore', 'Zephyr'];
    return fem[h % fem.length];
  }
  if (role === 'cop' || role === 'guard' || role === 'gang') {
    const tough: LiveVoiceName[] = ['Fenrir', 'Charon'];
    return tough[h % tough.length];
  }
  if (gender === 'm') {
    const masc: LiveVoiceName[] = ['Puck', 'Charon', 'Fenrir'];
    return masc[h % masc.length];
  }
  return LIVE_VOICES[h % LIVE_VOICES.length];
}

/**
 * Downsamples arbitrary browser mic sample rates (48kHz / 44.1kHz / 16kHz — especially critical on mobile Safari/Chrome)
 * into clean 16-bit little-endian PCM at targetSampleRate (default 16000Hz) for Gemini Live API.
 */
export function downsampleFloat32ToInt16Pcm(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000,
): Int16Array {
  if (input.length === 0) return new Int16Array(0);
  const srcRate = Math.max(8000, inputSampleRate || targetSampleRate);
  const ratio = srcRate / targetSampleRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLen);

  if (Math.abs(ratio - 1) < 0.005) {
    for (let i = 0; i < outLen; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    }
    return out;
  }

  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let acc = 0;
    for (let j = start; j < end; j++) acc += input[j];
    const avg = acc / (end - start);
    const s = Math.max(-1, Math.min(1, avg));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** Encodes a 16-bit signed PCM Int16Array (little-endian) to base64 without stack overflow on large buffers. */
export function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  if (typeof Buffer !== 'undefined' && typeof btoa === 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunk = 0x4000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

/** Decodes base64 raw 16-bit signed little-endian PCM (24kHz from Gemini Live) into normalized Float32Array (-1..1). */
export function base64ToFloat32Pcm(base64: string): Float32Array {
  if (!base64) return new Float32Array(0);
  let bytes: Uint8Array;
  if (typeof atob === 'undefined' && typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } else {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  }
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

/** Computes a responsive normalized 0..1 microphone loudness meter value from a Float32 audio block. */
export function computeMicLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
  const rms = Math.sqrt(sumSq / samples.length);
  return Math.max(0, Math.min(1, rms * 5.2));
}

export function buildGeminiLiveWsUrl(loc?: Pick<Location, 'protocol' | 'host'>): string {
  const target = loc ?? (typeof window !== 'undefined' ? window.location : { protocol: 'http:', host: 'localhost:3000' });
  const proto = target.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${target.host}/api/gemini-live`;
}

/**
 * Browser-side Gemini Live real-time voice client (works on PC and iOS/Android Mobile).
 * Streams 16kHz PCM mic input over WebSocket and schedules 24kHz PCM replies gaplessly via nextStartTime.
 */
export class GeminiLiveVoiceClient {
  private ws: WebSocket | null = null;
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private muteGain: GainNode | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private status: LiveVoiceStatus = 'idle';
  private muted = false;
  private sessionReady = false;
  private stopped = false;
  private cb: LiveVoiceCallbacks;

  constructor(callbacks: LiveVoiceCallbacks = {}) {
    this.cb = callbacks;
  }

  get currentStatus(): LiveVoiceStatus {
    return this.status;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.cb.onMicLevel?.(0);
  }

  private setStatus(next: LiveVoiceStatus, err?: string) {
    this.status = next;
    this.cb.onStatus?.(next, err);
  }

  async start(npc: LiveNpcInitPayload, world: LiveWorldInitPayload): Promise<void> {
    this.stop();
    this.stopped = false;
    this.sessionReady = false;
    this.setStatus('connecting');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.setStatus('error', 'Microphone access is not available in this browser context.');
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      this.setStatus('error', 'Web Audio API is not supported on this device.');
      return;
    }

    // Create and resume both AudioContexts synchronously inside the tap/click gesture (essential for Mobile Safari/Chrome)
    try {
      this.inputCtx = new AudioCtx({ sampleRate: 16000 });
    } catch {
      this.inputCtx = new AudioCtx();
    }
    try {
      this.outputCtx = new AudioCtx({ sampleRate: 24000 });
    } catch {
      this.outputCtx = new AudioCtx();
    }
    void this.inputCtx.resume().catch(() => {});
    void this.outputCtx.resume().catch(() => {});

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone permission denied.';
      this.stop();
      this.setStatus('error', `Microphone access blocked: ${msg}`);
      return;
    }

    if (this.stopped) {
      this.stop();
      return;
    }

    const voiceName = pickLiveVoiceForNpc(npc.id, npc.role, npc.gender);
    const wsUrl = buildGeminiLiveWsUrl();
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      if (this.stopped) {
        ws.close();
        return;
      }
      ws.send(JSON.stringify({ type: 'init', npc, world, voiceName }));
    };

    ws.onmessage = (event) => {
      if (this.stopped || typeof event.data !== 'string') return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        return;
      }

      if (msg.type === 'ready') {
        this.sessionReady = true;
        this.startMicPipeline();
        this.setStatus('live');
      } else if (msg.type === 'audio' && typeof msg.data === 'string') {
        this.schedulePlaybackChunk(msg.data);
      } else if (msg.type === 'interrupted') {
        this.clearPlaybackQueue();
      } else if (msg.type === 'inputTranscript' && typeof msg.text === 'string') {
        this.cb.onInputTranscript?.(msg.text);
      } else if (msg.type === 'outputTranscript' && typeof msg.text === 'string') {
        this.cb.onOutputTranscript?.(msg.text);
      } else if (msg.type === 'turnComplete') {
        this.cb.onTurnComplete?.();
      } else if (msg.type === 'reaction' && typeof msg.intent === 'string') {
        this.cb.onReaction?.({
          intent: msg.intent,
          mood: typeof msg.mood === 'string' ? msg.mood : 'chill',
          thought: typeof msg.thought === 'string' ? msg.thought : '',
        });
      } else if (msg.type === 'error') {
        const errText = typeof msg.error === 'string' ? msg.error : 'Gemini Live voice session failed.';
        this.stop();
        this.setStatus('error', errText);
      }
    };

    ws.onerror = () => {
      if (this.stopped) return;
      this.stop();
      this.setStatus('error', 'Could not connect to the Gemini Live voice server.');
    };

    ws.onclose = () => {
      if (this.stopped) return;
      if (this.status === 'connecting') {
        this.stop();
        this.setStatus('error', 'Gemini Live voice connection closed before starting.');
      } else if (this.status === 'live') {
        this.stop();
        this.setStatus('idle');
      }
    };
  }

  sendText(text: string) {
    const clean = text.trim();
    if (!clean || !this.ws || this.ws.readyState !== WebSocket.OPEN || !this.sessionReady) return;
    this.ws.send(JSON.stringify({ type: 'text', text: clean }));
  }

  private startMicPipeline() {
    if (!this.inputCtx || !this.mediaStream) return;
    const ctx = this.inputCtx;
    void ctx.resume().catch(() => {});

    const source = ctx.createMediaStreamSource(this.mediaStream);
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (ev) => {
      if (this.stopped || !this.sessionReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (this.muted) {
        this.cb.onMicLevel?.(0);
        return;
      }
      const input = ev.inputBuffer.getChannelData(0);
      this.cb.onMicLevel?.(computeMicLevel(input));
      const pcm16 = downsampleFloat32ToInt16Pcm(input, ctx.sampleRate, 16000);
      const b64 = int16ToBase64(pcm16);
      this.ws.send(JSON.stringify({ type: 'audio', data: b64 }));
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(ctx.destination);

    this.sourceNode = source;
    this.processorNode = processor;
    this.muteGain = silentGain;
  }

  private schedulePlaybackChunk(base64Pcm: string) {
    if (!this.outputCtx || this.stopped) return;
    const ctx = this.outputCtx;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

    const samples = base64ToFloat32Pcm(base64Pcm);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    if (this.nextStartTime < now + 0.015) {
      this.nextStartTime = now + 0.025;
    }
    const startAt = this.nextStartTime;
    this.nextStartTime += buffer.duration;

    this.activeSources.add(src);
    this.cb.onSpeakingChange?.(true);
    src.onended = () => {
      this.activeSources.delete(src);
      if (this.activeSources.size === 0) {
        this.cb.onSpeakingChange?.(false);
      }
    };
    src.start(startAt);
  }

  private clearPlaybackQueue() {
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {
        // Already ended
      }
    }
    this.activeSources.clear();
    if (this.outputCtx) {
      this.nextStartTime = this.outputCtx.currentTime;
    } else {
      this.nextStartTime = 0;
    }
    this.cb.onSpeakingChange?.(false);
  }

  stop() {
    this.stopped = true;
    this.sessionReady = false;
    this.clearPlaybackQueue();

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      try {
        this.processorNode.disconnect();
      } catch {
        // Ignore disconnect error
      }
      this.processorNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // Ignore
      }
      this.sourceNode = null;
    }
    if (this.muteGain) {
      try {
        this.muteGain.disconnect();
      } catch {
        // Ignore
      }
      this.muteGain = null;
    }
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) track.stop();
      this.mediaStream = null;
    }
    if (this.inputCtx) {
      void this.inputCtx.close().catch(() => {});
      this.inputCtx = null;
    }
    if (this.outputCtx) {
      void this.outputCtx.close().catch(() => {});
      this.outputCtx = null;
    }
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      sock.onopen = null;
      sock.onmessage = null;
      sock.onerror = null;
      sock.onclose = null;
      if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING) {
        sock.close();
      }
    }
    this.cb.onMicLevel?.(0);
    this.cb.onSpeakingChange?.(false);
  }
}
