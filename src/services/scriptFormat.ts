/**
 * Normalizes `createAudio.format` for routing to Gemini vs Grok.
 */
export type ScriptedAudioFormat = 'podcast' | 'audiobook' | 'live_radio';

export function inferScriptedAudioFormat(formatRaw: string): ScriptedAudioFormat | null {
  const n = formatRaw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (n === 'podcast') return 'podcast';
  if (n === 'audiobook' || n === 'audio_book') return 'audiobook';
  if (n === 'live_radio' || n === 'liveradio') return 'live_radio';

  return null;
}

/** User-facing list for validation errors (spacing/hyphen variants are accepted). */
export const SCRIPTED_FORMAT_OPTIONS =
  'podcast, audiobook (or audio_book), live_radio (or liveradio)';
