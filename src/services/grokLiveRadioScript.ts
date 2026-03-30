/**
 * xAI Grok for live radio–style scripts (OpenAI-compatible chat completions).
 * Env: XAI_API_KEY. Optional: XAI_MODEL (default grok-2-latest).
 */
import { parseTitleScriptFromModel } from './parseModelJsonScript';

const XAI_BASE = 'https://api.x.ai/v1';

export async function generateLiveRadioScriptWithGrok(params: {
  topic: string;
  tones: string;
  radioStyle: string | null;
  lengthMinutes: number;
}): Promise<{ title: string; script: string }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing XAI_API_KEY');
  }

  const model = process.env.XAI_MODEL ?? 'grok-2-latest';
  const wpm = 155;
  const minutes = Math.max(1, Math.min(180, params.lengthMinutes));
  const targetWords = Math.max(200, Math.round(minutes * wpm));

  const trimmedTones = params.tones.trim();
  const toneLine = trimmedTones
    ? trimmedTones
    : 'energetic, professional broadcast';

  const userPrompt = `Write a full live radio show segment script (as if going to air).

Topic / show focus: ${params.topic}
Target on-air length: about ${minutes} minutes (aim for roughly ${targetWords} words at ~${wpm} spoken words per minute).
Voice and attitude (tones): ${toneLine}.
${params.radioStyle ? `Station / format notes: ${params.radioStyle}` : ''}

Include realistic radio elements where appropriate: cold open, host patter, possible caller or co-host beats, music/sting placeholders [BED], [STING], [BREAK], time checks, and sponsor-style transitions if it fits the topic.

Return ONLY valid JSON with exactly two keys:
- "title": short show or segment title (string)
- "script": full script (string)`;

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert live radio writer. Reply with only a single JSON object (no markdown fences) containing keys "title" and "script".',
        },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  const rawBody = await res.text();
  if (!res.ok) {
    throw new Error(`xAI error ${res.status}: ${rawBody.slice(0, 800)}`);
  }

  let json: { choices?: Array<{ message?: { content?: string | null } }> };
  try {
    json = JSON.parse(rawBody) as typeof json;
  } catch {
    throw new Error('xAI returned non-JSON response');
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('xAI returned empty content');
  }

  return parseTitleScriptFromModel(content);
}
