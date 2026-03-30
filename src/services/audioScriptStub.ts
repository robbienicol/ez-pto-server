/**
 * Dev / cost-saving: set `AUDIO_SCRIPT_STUB=1` (or `true`) to skip Gemini & Grok
 * script generation only. Gemini TTS still runs for the stub script unless
 * `GEMINI_TTS_ENABLED=0` / `false`.
 */

export function isAudioScriptStubEnabled(): boolean {
  const v = process.env.AUDIO_SCRIPT_STUB?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function dummyScriptForKind(
  kind: 'podcast' | 'audiobook' | 'live_radio',
  topic: string,
  tones: string,
  lengthMinutes: number,
): { title: string; script: string } {
  const safeTopic = topic.trim() || 'Untitled topic';
  const title =
    safeTopic.length > 90 ? `${safeTopic.slice(0, 87)}… (stub)` : `${safeTopic} (stub)`;

  const head =
    kind === 'live_radio'
      ? `[STUB LIVE RADIO — unset AUDIO_SCRIPT_STUB to use Grok]\n\n`
      : `[STUB PODCAST — unset AUDIO_SCRIPT_STUB to use Gemini]\n\n`;

  const script = `${head}Topic: ${safeTopic}\nTones: ${tones}\nTarget length: ${lengthMinutes} minutes\nFormat: ${kind}\n\n[HOST]: This is fixed placeholder copy for local testing.\n[HOST]: No AI APIs were called for this script.\n\n[BED: light ambient]\n[HOST]: Second beat — replace with real generation when you are ready.\n`;

  return { title, script };
}
