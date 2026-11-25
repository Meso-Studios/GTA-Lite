// Optional Gemini AI NPC Director — pure scheduling, sanitization, steering & client bridge to /api/gemini-npc/*
// Never imports @google/genai on the client; all Gemini API calls run server-side in server.ts.

export const GEMINI_NPC_INTENTS = [
  'stroll',
  'approach_player',
  'follow_player',
  'flee',
  'confront',
  'photo',
  'chat_nearby',
  'wave',
  'shop',
  'watch',
] as const;

export type GeminiNpcIntent = (typeof GEMINI_NPC_INTENTS)[number];

export const GEMINI_NPC_MOODS = ['chill', 'excited', 'suspicious', 'scared', 'angry', 'friendly'] as const;
export type GeminiNpcMood = (typeof GEMINI_NPC_MOODS)[number];

export interface GeminiNpcDecision {
  id: number;
  intent: GeminiNpcIntent;
  mood: GeminiNpcMood;
  thought: string;
  speech: string;
  updatedAt: number;
  spoken: boolean;
}

export interface GeminiNpcCandidate {
  id: number;
  name: string;
  role: string;
  occupation: string;
  personality: string;
  mood: string;
  x: number;
  z: number;
  dist: number;
  indoor: boolean;
  hostile: boolean;
  lastUpdatedAt: number;
  lastLine?: string;
}

export interface GeminiWorldContext {
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

export interface GeminiSteeringOutput {
  moveDx: number;
  moveDz: number;
  speedMul: number;
  stop: boolean;
  facePlayer: boolean;
  triggerFlee: boolean;
  triggerConfront: boolean;
  triggerPhoto: boolean;
  wave: boolean;
}

export interface GeminiTalkMessage {
  from: 'player' | 'npc';
  text: string;
  mood?: GeminiNpcMood;
  intent?: GeminiNpcIntent;
  thought?: string;
}

export interface GeminiTalkResult {
  ok: boolean;
  reply?: string;
  intent?: GeminiNpcIntent;
  mood?: GeminiNpcMood;
  thought?: string;
  tipCash?: number;
  error?: string;
  code?: string;
}

const INTENT_SET = new Set<string>(GEMINI_NPC_INTENTS);
const MOOD_SET = new Set<string>(GEMINI_NPC_MOODS);

/**
 * Selects up to `maxBatch` nearby living NPCs to refresh via Gemini AI.
 * Prioritizes closest NPCs that have never received a Gemini thought or have gone stale,
 * ensuring every NPC around the player is controlled by Gemini without spamming the API.
 */
export function selectNearbyNpcsForGemini(
  candidates: GeminiNpcCandidate[],
  nowSec: number,
  maxBatch = 6,
  maxDist = 56,
  minRefreshAgeSec = 14,
  urgent = false,
): GeminiNpcCandidate[] {
  const freshAge = urgent ? 3.5 : minRefreshAgeSec;
  const eligible = candidates.filter((c) => {
    if (c.dist > maxDist) return false;
    const age = c.lastUpdatedAt <= 0 ? 9999 : nowSec - c.lastUpdatedAt;
    return age >= freshAge;
  });
  eligible.sort((a, b) => {
    const aNever = a.lastUpdatedAt <= 0 ? 0 : 1;
    const bNever = b.lastUpdatedAt <= 0 ? 0 : 1;
    if (aNever !== bNever) return aNever - bNever;
    // Blend proximity and staleness so nearby NPCs always feel immediately alive
    const aScore = a.dist - Math.min(30, (nowSec - a.lastUpdatedAt) * 0.65);
    const bScore = b.dist - Math.min(30, (nowSec - b.lastUpdatedAt) * 0.65);
    return aScore - bScore;
  });
  return eligible.slice(0, Math.max(1, maxBatch));
}

/** Validates and normalizes raw structured JSON decisions returned by /api/gemini-npc/batch. */
export function sanitizeGeminiDecisions(
  rawList: unknown,
  validIds: Set<number>,
  nowSec: number,
): GeminiNpcDecision[] {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set<number>();
  const out: GeminiNpcDecision[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id = Math.trunc(Number(obj.id));
    if (!Number.isFinite(id) || !validIds.has(id) || seen.has(id)) continue;
    seen.add(id);

    const rawIntent = typeof obj.intent === 'string' ? obj.intent.trim() : 'stroll';
    const intent: GeminiNpcIntent = INTENT_SET.has(rawIntent) ? (rawIntent as GeminiNpcIntent) : 'stroll';

    const rawMood = typeof obj.mood === 'string' ? obj.mood.trim() : 'chill';
    const mood: GeminiNpcMood = MOOD_SET.has(rawMood) ? (rawMood as GeminiNpcMood) : 'chill';

    const thought = typeof obj.thought === 'string' ? obj.thought.replace(/\s+/g, ' ').trim().slice(0, 70) : '';
    const speech = typeof obj.speech === 'string' ? obj.speech.replace(/\s+/g, ' ').trim().slice(0, 160) : '';

    out.push({
      id,
      intent,
      mood,
      thought,
      speech,
      updatedAt: nowSec,
      spoken: false,
    });
  }
  return out;
}

/**
 * Translates a Gemini AI NPC's current intent into smooth physical steering & animation cues.
 */
export function computeGeminiSteering(
  decision: GeminiNpcDecision,
  npcX: number,
  npcZ: number,
  playerX: number,
  playerZ: number,
): GeminiSteeringOutput {
  const dx = playerX - npcX;
  const dz = playerZ - npcZ;
  const dist = Math.hypot(dx, dz) || 1;
  const ux = dx / dist;
  const uz = dz / dist;

  switch (decision.intent) {
    case 'flee':
      return {
        moveDx: -ux,
        moveDz: -uz,
        speedMul: 2.35,
        stop: false,
        facePlayer: false,
        triggerFlee: true,
        triggerConfront: false,
        triggerPhoto: false,
        wave: false,
      };
    case 'confront':
      return {
        moveDx: ux,
        moveDz: uz,
        speedMul: 1.55,
        stop: dist < 2.1,
        facePlayer: true,
        triggerFlee: false,
        triggerConfront: true,
        triggerPhoto: false,
        wave: false,
      };
    case 'approach_player':
      if (dist > 3.1 && dist < 28) {
        return {
          moveDx: ux,
          moveDz: uz,
          speedMul: 1.15,
          stop: false,
          facePlayer: true,
          triggerFlee: false,
          triggerConfront: false,
          triggerPhoto: false,
          wave: dist < 6.5,
        };
      }
      return {
        moveDx: 0,
        moveDz: 0,
        speedMul: 0,
        stop: true,
        facePlayer: true,
        triggerFlee: false,
        triggerConfront: false,
        triggerPhoto: false,
        wave: dist < 7,
      };
    case 'follow_player':
      if (dist > 4.2 && dist < 42) {
        return {
          moveDx: ux,
          moveDz: uz,
          speedMul: dist > 9 ? 1.65 : 1.18,
          stop: false,
          facePlayer: true,
          triggerFlee: false,
          triggerConfront: false,
          triggerPhoto: false,
          wave: false,
        };
      }
      return {
        moveDx: 0,
        moveDz: 0,
        speedMul: 0,
        stop: true,
        facePlayer: true,
        triggerFlee: false,
        triggerConfront: false,
        triggerPhoto: false,
        wave: false,
      };
    case 'photo':
      return {
        moveDx: 0,
        moveDz: 0,
        speedMul: 0,
        stop: true,
        facePlayer: true,
        triggerFlee: false,
        triggerConfront: false,
        triggerPhoto: true,
        wave: false,
      };
    case 'wave':
      return {
        moveDx: 0,
        moveDz: 0,
        speedMul: 0,
        stop: true,
        facePlayer: true,
        triggerFlee: false,
        triggerConfront: false,
        triggerPhoto: false,
        wave: true,
      };
    case 'watch':
    case 'chat_nearby':
      return {
        moveDx: 0,
        moveDz: 0,
        speedMul: 0,
        stop: dist < 14,
        facePlayer: dist < 16,
        triggerFlee: false,
        triggerConfront: false,
        triggerPhoto: false,
        wave: false,
      };
    case 'shop':
    case 'stroll':
    default:
      return {
        moveDx: 0,
        moveDz: 0,
        speedMul: 1.0,
        stop: false,
        facePlayer: false,
        triggerFlee: false,
        triggerConfront: false,
        triggerPhoto: false,
        wave: false,
      };
  }
}

export class GeminiNpcDirector {
  enabled = false;
  inFlight = false;
  cooldownT = 0;
  backoffSec = 5.5;
  lastError: string | null = null;
  lastErrorNotifiedAt = -999;
  totalCalls = 0;
  decisions = new Map<number, GeminiNpcDecision>();
  histories = new Map<number, GeminiTalkMessage[]>();
  private lastUrgentSig = '';

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) {
      this.cooldownT = 0.6;
      this.backoffSec = 5.5;
      this.lastError = null;
    } else {
      this.inFlight = false;
    }
  }

  getDecision(pedId: number): GeminiNpcDecision | null {
    return this.decisions.get(pedId) ?? null;
  }

  getHistory(pedId: number): GeminiTalkMessage[] {
    return this.histories.get(pedId) ?? [];
  }

  pruneStale(activeIds: Set<number>) {
    for (const id of this.decisions.keys()) {
      if (!activeIds.has(id)) {
        this.decisions.delete(id);
        this.histories.delete(id);
      }
    }
  }

  /**
   * Schedules periodic batched Gemini updates for nearby NPCs while enabled.
   * Non-blocking — never stalls the 60fps render loop.
   */
  step(
    dt: number,
    nowSec: number,
    world: GeminiWorldContext,
    candidates: GeminiNpcCandidate[],
    onDecisions: (list: GeminiNpcDecision[]) => void,
    onError: (msg: string, code: string) => void,
  ) {
    if (!this.enabled) return;

    const urgentSig = `${world.wanted}|${world.playerFiring ? 1 : 0}|${world.playerFighting ? 1 : 0}`;
    const urgent = urgentSig !== this.lastUrgentSig && (world.wanted > 0 || world.playerFiring || world.playerFighting);
    if (urgent) {
      this.lastUrgentSig = urgentSig;
      this.cooldownT = Math.min(this.cooldownT, 0.45);
    }

    if (this.inFlight) return;
    this.cooldownT -= dt;
    if (this.cooldownT > 0) return;

    const batch = selectNearbyNpcsForGemini(candidates, nowSec, 6, 56, 15, urgent);
    if (batch.length === 0) {
      this.cooldownT = 2.0;
      return;
    }

    this.inFlight = true;
    const validIds = new Set(batch.map((b) => b.id));

    void fetch('/api/gemini-npc/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        world,
        npcs: batch.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          occupation: c.occupation,
          personality: c.personality,
          mood: c.mood,
          dist: c.dist,
          indoor: c.indoor,
          hostile: c.hostile,
          lastLine: c.lastLine,
        })),
      }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          decisions?: unknown;
          error?: string;
          code?: string;
        };
        if (!res.ok) {
          const code = data.code || `HTTP_${res.status}`;
          const msg =
            data.error ||
            (res.status === 404
              ? 'Gemini NPC server endpoint is unavailable on static hosting.'
              : `Gemini NPC request failed (${res.status}).`);
          throw Object.assign(new Error(msg), { code });
        }
        const parsed = sanitizeGeminiDecisions(data.decisions, validIds, nowSec);
        this.totalCalls++;
        this.lastError = null;
        this.backoffSec = 5.5;
        this.cooldownT = 5.5;
        for (const d of parsed) {
          this.decisions.set(d.id, d);
        }
        if (parsed.length > 0) onDecisions(parsed);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Gemini AI NPC request failed.';
        const code = (err as { code?: string })?.code ?? 'NETWORK_ERROR';
        this.lastError = msg;
        // Exponential backoff on errors so we never hammer the API
        this.backoffSec = Math.min(45, this.backoffSec * 2);
        this.cooldownT = this.backoffSec;
        if (nowSec - this.lastErrorNotifiedAt > 18) {
          this.lastErrorNotifiedAt = nowSec;
          onError(msg, code);
        }
      })
      .finally(() => {
        this.inFlight = false;
      });
  }

  /** Direct 1-on-1 conversation with a specific NPC via Gemini. */
  async talkToNpc(
    npc: GeminiNpcCandidate,
    world: GeminiWorldContext,
    playerMessage: string,
    nowSec: number,
  ): Promise<GeminiTalkResult> {
    const cleanMsg = playerMessage.trim().slice(0, 220);
    if (!cleanMsg) return { ok: false, error: 'Say something first.' };

    const hist = this.histories.get(npc.id) ?? [];
    try {
      const res = await fetch('/api/gemini-npc/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npc: {
            id: npc.id,
            name: npc.name,
            role: npc.role,
            occupation: npc.occupation,
            personality: npc.personality,
            mood: npc.mood,
            dist: npc.dist,
            indoor: npc.indoor,
            hostile: npc.hostile,
            lastLine: npc.lastLine,
          },
          world,
          message: cleanMsg,
          history: hist.slice(-6).map((m) => ({ from: m.from, text: m.text })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        intent?: string;
        mood?: string;
        thought?: string;
        tipCash?: number;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        const error =
          data.error ||
          (res.status === 404
            ? 'Gemini NPC server endpoint is unavailable on static hosting.'
            : `Gemini talk failed (${res.status}).`);
        this.lastError = error;
        return { ok: false, error, code: data.code ?? `HTTP_${res.status}` };
      }

      const intent: GeminiNpcIntent = INTENT_SET.has(data.intent ?? '') ? (data.intent as GeminiNpcIntent) : 'watch';
      const mood: GeminiNpcMood = MOOD_SET.has(data.mood ?? '') ? (data.mood as GeminiNpcMood) : 'chill';
      const reply = (data.reply ?? '').trim() || 'Watch your step around here.';
      const thought = (data.thought ?? '').trim().slice(0, 70);
      const tipCash = Math.max(0, Math.min(200, Math.trunc(Number(data.tipCash) || 0)));

      const updatedHist: GeminiTalkMessage[] = [
        ...hist.slice(-8),
        { from: 'player', text: cleanMsg },
        { from: 'npc', text: reply, mood, intent, thought },
      ];
      this.histories.set(npc.id, updatedHist);
      this.decisions.set(npc.id, {
        id: npc.id,
        intent,
        mood,
        thought,
        speech: reply,
        updatedAt: nowSec,
        spoken: true,
      });
      this.totalCalls++;
      this.lastError = null;
      return { ok: true, reply, intent, mood, thought, tipCash };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Could not reach Gemini NPC server.';
      this.lastError = error;
      return { ok: false, error, code: 'NETWORK_ERROR' };
    }
  }

  /** Records a spoken transcript turn from a live Gemini Voice Chat session into the NPC's chat history. */
  recordLiveTranscript(pedId: number, from: 'player' | 'npc', text: string, nowSec: number) {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!clean) return;
    const hist = this.histories.get(pedId) ?? [];
    const existing = this.decisions.get(pedId);
    const updated: GeminiTalkMessage[] = [
      ...hist.slice(-10),
      from === 'npc'
        ? { from: 'npc', text: clean, mood: existing?.mood, intent: existing?.intent, thought: existing?.thought }
        : { from: 'player', text: clean },
    ];
    this.histories.set(pedId, updated);
    if (from === 'npc') {
      this.decisions.set(pedId, {
        id: pedId,
        intent: existing?.intent ?? 'watch',
        mood: existing?.mood ?? 'chill',
        thought: existing?.thought ?? '',
        speech: clean,
        updatedAt: nowSec,
        spoken: true,
      });
    }
  }

  /** Applies an in-world physical reaction emitted by Gemini Live tool calling. */
  applyLiveReaction(pedId: number, rawIntent: string, rawMood: string, rawThought: string, nowSec: number): GeminiNpcDecision {
    const existing = this.decisions.get(pedId);
    const intent: GeminiNpcIntent = INTENT_SET.has(rawIntent) ? (rawIntent as GeminiNpcIntent) : (existing?.intent ?? 'watch');
    const mood: GeminiNpcMood = MOOD_SET.has(rawMood) ? (rawMood as GeminiNpcMood) : (existing?.mood ?? 'chill');
    const thought = rawThought.replace(/\s+/g, ' ').trim().slice(0, 70) || (existing?.thought ?? '');
    const decision: GeminiNpcDecision = {
      id: pedId,
      intent,
      mood,
      thought,
      speech: existing?.speech ?? '',
      updatedAt: nowSec,
      spoken: true,
    };
    this.decisions.set(pedId, decision);
    return decision;
  }
}

