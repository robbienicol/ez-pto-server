import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.wav$/i;

export function isSafeAudioFilename(name: string): boolean {
  return FILENAME_RE.test(name);
}

export function audioStorageDir(): string {
  return process.env.AUDIO_STORAGE_DIR?.trim() || join(process.cwd(), 'data', 'audio');
}

export function publicAudioUrlForId(audioId: string): string {
  const base = (
    process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, '') ||
    `http://localhost:${process.env.PORT ?? 3000}`
  ).replace(/\/$/, '');
  return `${base}/media/audio/${audioId}.wav`;
}

export async function writeAudioWav(audioId: string, wav: Uint8Array): Promise<string> {
  const dir = audioStorageDir();
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${audioId}.wav`);
  await Bun.write(path, wav);
  return publicAudioUrlForId(audioId);
}
