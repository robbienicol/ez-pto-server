import { audios } from '../db/schema';

export function audioRowToGql(row: typeof audios.$inferSelect) {
  return {
    id: row.id,
    topic: row.topic,
    title: row.title,
    script: row.script,
    audioUrl: row.audioUrl,
    lengthMinutes: row.lengthMinutes,
    format: row.format,
    tones: row.tones ?? '',
    radioStyle: row.radioStyle,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}
