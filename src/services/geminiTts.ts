/**
 * Gemini text-to-speech (preview): same API key as script generation.
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 *
 * Env: GEMINI_API_KEY or GOOGLE_API_KEY
 * Optional: GEMINI_TTS_MODEL (default gemini-2.5-flash-preview-tts), GEMINI_TTS_VOICE (default Kore)
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const SAMPLE_RATE = 24000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

/** Max characters per TTS request (long scripts are chunked). */
const TTS_CHUNK_CHARS = 3500;

function writeString(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) {
    view.setUint8(offset + i, s.charCodeAt(i));
  }
}

/** Wrap raw PCM s16le mono in a WAV container for browsers / `<audio>`. */
export function pcm16MonoToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const dataSize = pcm.length;
  const headerSize = 44;
  const out = new Uint8Array(headerSize + dataSize);
  const view = new DataView(out.buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * CHANNELS * BITS_PER_SAMPLE) / 8, true);
  view.setUint16(32, (CHANNELS * BITS_PER_SAMPLE) / 8, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  out.set(pcm, headerSize);
  return out;
}

function splitTextForTts(text: string, maxLen: number): string[] {
  const t = text.trim();
  if (t.length <= maxLen) return [t];

  const chunks: string[] = [];
  const paras = t.split(/\n{2,}/);
  let cur = '';

  const flush = () => {
    const s = cur.trim();
    if (s) chunks.push(s);
    cur = '';
  };

  for (const p of paras) {
    const next = cur ? `${cur}\n\n${p}` : p;
    if (next.length > maxLen && cur) {
      flush();
      cur = p;
    } else {
      cur = next;
    }
  }
  flush();

  return chunks.flatMap((c) => {
    if (c.length <= maxLen) return [c];
    const hard: string[] = [];
    for (let i = 0; i < c.length; i += maxLen) {
      hard.push(c.slice(i, i + maxLen));
    }
    return hard;
  });
}

type GenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
        inline_data?: { data?: string; mime_type?: string };
      }>;
    };
  }>;
  error?: { message?: string; code?: number };
};

function extractPcmBase64(
  part:
    | {
        inlineData?: { data?: string };
        inline_data?: { data?: string };
      }
    | undefined,
): string {
  const data =
    part?.inlineData?.data ??
    part?.inline_data?.data ??
    '';
  if (!data) throw new Error('TTS response missing inline audio data');
  return data;
}

async function ttsOneChunk(text: string, apiKey: string, model: string, voiceName: string): Promise<Uint8Array> {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text }],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },
      },
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini TTS HTTP ${res.status}: ${raw.slice(0, 600)}`);
  }

  let body: GenerateContentResponse;
  try {
    body = JSON.parse(raw) as GenerateContentResponse;
  } catch {
    throw new Error('Gemini TTS returned non-JSON');
  }

  if (body.error?.message) {
    throw new Error(`Gemini TTS: ${body.error.message}`);
  }

  const part = body.candidates?.[0]?.content?.parts?.[0];
  if (!part) throw new Error('Gemini TTS: empty candidates');

  const b64 = extractPcmBase64(part);
  const binary = Buffer.from(b64, 'base64');
  return new Uint8Array(binary);
}

/**
 * Full script → single WAV (mono PCM inside), using chunked TTS calls.
 */
export async function synthesizeScriptToWav(script: string): Promise<Uint8Array> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY for TTS');
  }

  const model =
    process.env.GEMINI_TTS_MODEL?.trim() || 'gemini-2.5-flash-preview-tts';
  const voiceName = process.env.GEMINI_TTS_VOICE?.trim() || 'Kore';

  const pieces = splitTextForTts(script, TTS_CHUNK_CHARS);
  const pcmParts: Uint8Array[] = [];

  for (let i = 0; i < pieces.length; i++) {
    const pcm = await ttsOneChunk(pieces[i]!, apiKey, model, voiceName);
    pcmParts.push(pcm);
  }

  const totalLen = pcmParts.reduce((n, p) => n + p.length, 0);
  const merged = new Uint8Array(totalLen);
  let off = 0;
  for (const p of pcmParts) {
    merged.set(p, off);
    off += p.length;
  }

  return pcm16MonoToWav(merged, SAMPLE_RATE);
}
