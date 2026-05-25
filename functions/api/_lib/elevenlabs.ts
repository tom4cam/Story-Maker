import type { Env } from './env';
import type { CharacterAlignment } from './words';
import { requireEnv } from './env';

const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'; // Daniel
const MODEL_ID = 'eleven_multilingual_v2';

export interface SynthResult {
  audio: ArrayBuffer;
  alignment: CharacterAlignment;
}

export interface SynthOpts {
  voiceId?: string;
  speed?: number;
}

interface ElevenLabsTimestampedResponse {
  audio_base64: string;
  alignment: CharacterAlignment;
  normalized_alignment?: CharacterAlignment;
}

export async function synthesize(env: Env, text: string, opts: SynthOpts = {}): Promise<SynthResult> {
  const apiKey = requireEnv(env, 'ELEVENLABS_API_KEY');
  const voiceId = opts.voiceId || env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.15,
          use_speaker_boost: true,
          ...(opts.speed != null ? { speed: opts.speed } : {}),
        },
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`ElevenLabs synthesis failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as ElevenLabsTimestampedResponse;
  const audio = base64ToArrayBuffer(body.audio_base64);
  return { audio, alignment: body.alignment };
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  // Cloudflare Workers run on the V8 isolate; atob is available globally.
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
