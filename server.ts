import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const GEMINI_MODEL = 'gemini-4-hydrogen';

const VALID_INTENTS = [
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

const VALID_MOODS = ['chill', 'excited', 'suspicious', 'scared', 'angry', 'friendly'] as const;

let cachedAi: GoogleGenAI | null = null;
let cachedKey = '';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey) return null;
  if (!cachedAi || cachedKey !== apiKey) {
    cachedKey = apiKey;
    cachedAi = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}

function classifyGeminiError(err: unknown): { status: number; code: string; message: string } {
  const msg = err instanceof Error ? err.message : String(err ?? 'Unknown Gemini API error');
  const lower = msg.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
    return {
      status: 403,
      code: 'API_KEY_INVALID',
      message: 'Gemini API key was rejected. Please check your API key in Settings > Secrets.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      status: 429,
      code: 'RESOURCE_EXHAUSTED',
      message: 'Gemini API rate limit or quota reached. Please wait a moment or check Settings > Secrets.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      code: 'MODEL_NOT_FOUND',
      message: `Gemini model "${GEMINI_MODEL}" was not found.`,
    };
  }
  return {
    status: 502,
    code: 'UPSTREAM_ERROR',
    message: `Gemini NPC request failed: ${msg.slice(0, 180)}`,
  };
}

interface BatchNpcInput {
  id: number;
  name: string;
  role: string;
  occupation: string;
  personality: string;
  mood: string;
  dist: number;
  indoor: boolean;
  hostile: boolean;
  lastLine?: string;
}

interface WorldSnapInput {
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

interface TalkHistoryEntry {
  from: 'player' | 'npc';
  text: string;
}

function sanitizeStr(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLen);
}

function sanitizeNum(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '128kb' }));

  app.get('/api/gemini-npc/status', (_req, res) => {
    const configured = Boolean((process.env.GEMINI_API_KEY ?? '').trim());
    res.json({ configured, model: GEMINI_MODEL });
  });

  app.post('/api/gemini-npc/batch', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        code: 'MISSING_API_KEY',
        error: 'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to enable Gemini AI NPCs.',
      });
      return;
    }

    const body = req.body as { world?: WorldSnapInput; npcs?: BatchNpcInput[] } | undefined;
    if (!body || !body.world || !Array.isArray(body.npcs) || body.npcs.length === 0) {
      res.status(400).json({ code: 'INVALID_REQUEST', error: 'Expected world context and a non-empty npcs array.' });
      return;
    }

    const npcs = body.npcs.slice(0, 6).map((n) => ({
      id: Math.trunc(sanitizeNum(n.id, 0)),
      name: sanitizeStr(n.name, 36) || 'Citizen',
      role: sanitizeStr(n.role, 24) || 'civ',
      occupation: sanitizeStr(n.occupation, 36) || 'local',
      personality: sanitizeStr(n.personality, 60) || 'streetwise',
      mood: sanitizeStr(n.mood, 20) || 'chill',
      dist: Math.round(sanitizeNum(n.dist, 12) * 10) / 10,
      indoor: Boolean(n.indoor),
      hostile: Boolean(n.hostile),
      lastLine: sanitizeStr(n.lastLine, 80),
    })).filter((n) => n.id > 0);

    if (npcs.length === 0) {
      res.status(400).json({ code: 'INVALID_REQUEST', error: 'No valid NPC IDs provided.' });
      return;
    }

    const w: WorldSnapInput = {
      district: sanitizeStr(body.world.district, 48) || 'SAN NOVA',
      timeStr: sanitizeStr(body.world.timeStr, 12) || '12:00',
      isNight: Boolean(body.world.isNight),
      wanted: Math.max(0, Math.min(5, Math.trunc(sanitizeNum(body.world.wanted, 0)))),
      playerArmed: Boolean(body.world.playerArmed),
      playerWeapon: sanitizeStr(body.world.playerWeapon, 32) || 'Fists',
      playerInVehicle: Boolean(body.world.playerInVehicle),
      playerVehicleName: sanitizeStr(body.world.playerVehicleName, 36),
      playerSpeedKmh: Math.round(sanitizeNum(body.world.playerSpeedKmh, 0)),
      playerFiring: Boolean(body.world.playerFiring),
      playerFighting: Boolean(body.world.playerFighting),
      recentEvent: sanitizeStr(body.world.recentEvent, 90),
    };

    const prompt = [
      `Location: ${w.district} at ${w.timeStr} (${w.isNight ? 'night' : 'day'}).`,
      `Player status: wanted=${w.wanted} stars, ${w.playerInVehicle ? `driving ${w.playerVehicleName || 'a car'} at ${w.playerSpeedKmh} km/h` : `on foot holding ${w.playerArmed ? w.playerWeapon : 'nothing'}`}${w.playerFiring ? ', ACTIVELY SHOOTING' : ''}${w.playerFighting ? ', IN A FIGHT' : ''}.`,
      w.recentEvent ? `Nearby event: ${w.recentEvent}.` : '',
      `Nearby NPCs to direct right now:`,
      ...npcs.map(
        (n) =>
          `- ID ${n.id}: ${n.name} (${n.role}, ${n.occupation}, trait: ${n.personality}, mood: ${n.mood}, ${n.dist}m away${n.indoor ? ', indoors' : ''}${n.hostile ? ', hostile' : ''}${n.lastLine ? `, prev line: "${n.lastLine}"` : ''})`,
      ),
      `Return one live decision JSON entry for EVERY NPC ID listed above.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction:
            'You are the live AI director controlling every NPC in SAN NOVA, a sunny Vice-City / Leonida open-world crime sandbox. For each NPC, decide an authentic real-time physical action (intent), brief internal thought (<= 55 chars), emotional mood, and ONE punchy, realistic, varied spoken line (6 to 16 words) that directly reacts to the player, their car/weapon/wanted stars, the district, or nearby events. Never break character, never mention AI or video games, never repeat their previous line. Use confront only for bold/hostile/cop/gang NPCs when provoked; use flee if the player is shooting or recklessly speeding close by; use photo for flashy cars or wild moments; use wave or approach_player for friendly locals.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              decisions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER, description: 'Exact numeric NPC ID from input' },
                    intent: {
                      type: Type.STRING,
                      enum: [...VALID_INTENTS],
                      description: 'Physical steering behavior to execute right now',
                    },
                    mood: {
                      type: Type.STRING,
                      enum: [...VALID_MOODS],
                      description: 'Current emotional state',
                    },
                    thought: {
                      type: Type.STRING,
                      description: 'Brief inner reasoning under 55 characters',
                    },
                    speech: {
                      type: Type.STRING,
                      description: 'Short natural spoken line in character (6-16 words)',
                    },
                  },
                  required: ['id', 'intent', 'mood', 'thought', 'speech'],
                },
              },
            },
            required: ['decisions'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as { decisions?: unknown[] };
      res.json({
        model: GEMINI_MODEL,
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      });
    } catch (err) {
      const info = classifyGeminiError(err);
      res.status(info.status).json({ code: info.code, error: info.message });
    }
  });

  app.post('/api/gemini-npc/talk', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        code: 'MISSING_API_KEY',
        error: 'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to talk with Gemini AI NPCs.',
      });
      return;
    }

    const body = req.body as {
      npc?: BatchNpcInput;
      world?: WorldSnapInput;
      message?: string;
      history?: TalkHistoryEntry[];
    } | undefined;

    const playerMsg = sanitizeStr(body?.message, 220);
    if (!body?.npc || !body?.world || !playerMsg) {
      res.status(400).json({ code: 'INVALID_REQUEST', error: 'Expected npc, world, and message.' });
      return;
    }

    const n = body.npc;
    const w = body.world;
    const hist = Array.isArray(body.history)
      ? body.history.slice(-6).map((h) => `${h.from === 'player' ? 'Player' : sanitizeStr(n.name, 32)}: ${sanitizeStr(h.text, 160)}`)
      : [];

    const prompt = [
      `You are ${sanitizeStr(n.name, 36) || 'a local citizen'}, a ${sanitizeStr(n.occupation, 36) || 'resident'} (${sanitizeStr(n.role, 20) || 'civ'}) in ${sanitizeStr(w.district, 48) || 'San Nova'} at ${sanitizeStr(w.timeStr, 12) || '12:00'}.`,
      `Your personality: ${sanitizeStr(n.personality, 60) || 'streetwise'}. Current mood: ${sanitizeStr(n.mood, 20) || 'chill'}.`,
      `Player nearby: wanted=${Math.trunc(sanitizeNum(w.wanted, 0))} stars, ${w.playerArmed ? `visibly holding ${sanitizeStr(w.playerWeapon, 32)}` : 'unarmed'}${w.playerInVehicle ? `, near ${sanitizeStr(w.playerVehicleName, 36)}` : ''}.`,
      hist.length ? `Conversation so far:\n${hist.join('\n')}` : '',
      `Player just said to you: "${playerMsg}"`,
      `Respond naturally in character (1-2 short spoken sentences max, lively San Nova street voice) and choose your immediate physical reaction.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction:
            'You are roleplaying a living citizen inside the open-world city of San Nova (Vice City / Miami inspired). Reply directly to what the player said in 1 to 2 crisp spoken sentences. Never break character, never mention being an AI or in a game. React realistically: if threatened or robbed while unarmed, either flee or hand over a small tipCash ($20-$150) nervously; if asked to hang out/team up nicely, you may follow_player; if insulted or challenged and you are bold/gang/guard, confront; if complimented or asked for local tips, wave or chat_nearby and give colorful San Nova neighborhood gossip (Ocean Beach, Golden Dunes, Little Havana, NovaBank, Wynwood, Airport).',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING, description: 'In-character spoken reply (1-2 concise sentences)' },
              intent: {
                type: Type.STRING,
                enum: [...VALID_INTENTS],
                description: 'Immediate physical reaction after replying',
              },
              mood: {
                type: Type.STRING,
                enum: [...VALID_MOODS],
                description: 'Updated emotional state',
              },
              thought: {
                type: Type.STRING,
                description: 'Short internal thought (<= 55 chars)',
              },
              tipCash: {
                type: Type.INTEGER,
                description: 'Optional cash handed to player (0 normally; 20-150 only if generously tipping or intimidated into handing over wallet)',
              },
            },
            required: ['reply', 'intent', 'mood', 'thought', 'tipCash'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      res.json({
        model: GEMINI_MODEL,
        reply: sanitizeStr(parsed.reply, 240) || 'Hey, watch yourself out here in San Nova.',
        intent: VALID_INTENTS.includes(parsed.intent as (typeof VALID_INTENTS)[number]) ? parsed.intent : 'watch',
        mood: VALID_MOODS.includes(parsed.mood as (typeof VALID_MOODS)[number]) ? parsed.mood : 'chill',
        thought: sanitizeStr(parsed.thought, 64),
        tipCash: Math.max(0, Math.min(200, Math.trunc(sanitizeNum(parsed.tipCash, 0)))),
      });
    } catch (err) {
      const info = classifyGeminiError(err);
      res.status(info.status).json({ code: info.code, error: info.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SAN NOVA server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SAN NOVA server:', err);
  process.exit(1);
});
