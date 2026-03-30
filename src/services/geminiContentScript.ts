/**
 * Google Gemini generateContent for podcast / audiobook scripts.
 * Env: GEMINI_API_KEY (or GOOGLE_API_KEY). Optional: GEMINI_MODEL (default gemini-2.5-flash).
 */
import { parseTitleScriptFromModel } from './parseModelJsonScript';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiContentKind = 'podcast' | 'audiobook';

export async function generateScriptWithGemini(params: {
  contentKind: GeminiContentKind;
  topic: string;
  tones: string;
  radioStyle: string | null;
  lengthMinutes: number;
}): Promise<{ title: string; script: string }> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY');
  }

  const model =
    process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  const wpm = params.contentKind === 'audiobook' ? 150 : 140;
  const minutes = Math.max(1, Math.min(180, params.lengthMinutes));
  const targetWords = Math.max(200, Math.round(minutes * wpm));

  const trimmedTones = params.tones.trim();
  const toneLine = trimmedTones
    ? trimmedTones
    : params.contentKind === 'audiobook'
      ? 'warm, immersive narration'
      : 'conversational, clear, engaging';

  const kindInstructions =
    params.contentKind === 'podcast'
      ? `Write a full podcast episode script with host segments, optional guest beats, and clear act structure.
Use cues like [HOST], [GUEST], [MUSIC], [SFX] where helpful.`
      : `Write audiobook-style narration: continuous spoken prose suitable for a single narrator (or clearly marked character voices if the topic implies dialogue).
Use chapter or section markers like "Chapter One" or [SECTION] where appropriate. Prefer immersive, listenable language over stage directions.`;

  const userPrompt = `${kindInstructions}

Topic: ${params.topic}
Target spoken length: about ${minutes} minutes (aim for roughly ${targetWords} words, ~${wpm} spoken words per minute).
Tone(s) to reflect: ${toneLine}.
${params.radioStyle ? `Additional style notes: ${params.radioStyle}` : ''}

The JSON must include "title" (short compelling title) and "script" (full script text).`;

  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                'Reply with only a JSON object (no markdown) with keys "title" and "script" (both strings).\n\n' +
                userPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });

  const rawBody = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${rawBody.slice(0, 800)}`);
  }

  let body: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message?: string };
  };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    throw new Error('Gemini returned non-JSON response');
  }

  if (body.error?.message) {
    throw new Error(`Gemini: ${body.error.message}`);
  }

  const text =
    body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ??
    '';

  if (!text.trim()) {
    throw new Error('Gemini returned empty content');
  }

  return parseTitleScriptFromModel(text);
}
