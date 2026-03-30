import { GraphQLError } from 'graphql';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { audios } from '../../../db/schema';
import { writeAudioWav } from '../../../services/audioStorage';
import {
  dummyScriptForKind,
  isAudioScriptStubEnabled,
} from '../../../services/audioScriptStub';
import { generateScriptWithGemini } from '../../../services/geminiContentScript';
import { synthesizeScriptToWav } from '../../../services/geminiTts';
import { generateLiveRadioScriptWithGrok } from '../../../services/grokLiveRadioScript';
import {
  inferScriptedAudioFormat,
  SCRIPTED_FORMAT_OPTIONS,
  type ScriptedAudioFormat,
} from '../../../services/scriptFormat';
import { audioRowToGql } from '../../mappers';
import {
  graphQLErrorForAudiosInsert,
  sanitizePgText,
} from '../../pgErrors';
import type { YogaContext } from '../../types';

type CreateAudioArgs = {
  topic: string;
  format: string;
  tones: string;
  lengthMinutes: number;
};

function requireAuth(ctx: YogaContext) {
  if (!ctx.userId) {
    throw new GraphQLError('Not authenticated', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
}

function parseCreateAudioArgs(args: CreateAudioArgs) {
  const topic = args.topic.trim();
  if (!topic) {
    throw new GraphQLError('Topic is required', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const formatRaw = args.format.trim();
  if (!formatRaw) {
    throw new GraphQLError('Format is required', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const tones = args.tones.trim();
  if (!tones) {
    throw new GraphQLError('Tones is required', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const lm = args.lengthMinutes;
  if (!Number.isInteger(lm) || lm < 1 || lm > 180) {
    throw new GraphQLError(
      'lengthMinutes must be an integer between 1 and 180',
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }

  return { topic, formatRaw, tones, lengthMinutes: lm };
}

async function resolveScriptAndTitle(params: {
  scriptedFormat: ScriptedAudioFormat;
  scriptStub: boolean;
  topic: string;
  tones: string;
  lengthMinutes: number;
}): Promise<{ title: string; script: string }> {
  const { scriptedFormat, scriptStub, topic, tones, lengthMinutes } = params;
  const radioStyle: string | null = null;

  if (scriptStub && (scriptedFormat === 'podcast' || scriptedFormat === 'audiobook')) {
    return dummyScriptForKind(scriptedFormat, topic, tones, lengthMinutes);
  }

  if (scriptStub && scriptedFormat === 'live_radio') {
    return dummyScriptForKind('live_radio', topic, tones, lengthMinutes);
  }

  if (scriptedFormat === 'podcast' || scriptedFormat === 'audiobook') {
    try {
      return await generateScriptWithGemini({
        contentKind: scriptedFormat,
        topic,
        tones,
        radioStyle,
        lengthMinutes,
      });
    } catch (err) {
      console.error('[createAudio] Gemini', err);
      const msg =
        err instanceof Error ? err.message : 'Failed to generate script';
      throw new GraphQLError(msg, {
        extensions: { code: 'UPSTREAM_ERROR' },
      });
    }
  }

  if (scriptedFormat === 'live_radio') {
    try {
      return await generateLiveRadioScriptWithGrok({
        topic,
        tones,
        radioStyle,
        lengthMinutes,
      });
    } catch (err) {
      console.error('[createAudio] Grok', err);
      const msg =
        err instanceof Error ? err.message : 'Failed to generate script';
      throw new GraphQLError(msg, {
        extensions: { code: 'UPSTREAM_ERROR' },
      });
    }
  }

  const _never: never = scriptedFormat;
  return _never;
}

function geminiTtsExplicitlyDisabled(): boolean {
  return (
    process.env.GEMINI_TTS_ENABLED === '0' ||
    process.env.GEMINI_TTS_ENABLED === 'false'
  );
}

function formatSupportsTts(scriptedFormat: ScriptedAudioFormat): boolean {
  return (
    scriptedFormat === 'podcast' ||
    scriptedFormat === 'audiobook' ||
    scriptedFormat === 'live_radio'
  );
}

export async function createAudio(
  _: unknown,
  args: CreateAudioArgs,
  ctx: YogaContext,
) {
  requireAuth(ctx);
  const userId = ctx.userId as string;

  const { topic, formatRaw, tones, lengthMinutes } = parseCreateAudioArgs(args);
  const scriptedFormat = inferScriptedAudioFormat(formatRaw);
  if (scriptedFormat === null) {
    throw new GraphQLError(
      `Unsupported format "${formatRaw}". Supported: ${SCRIPTED_FORMAT_OPTIONS}.`,
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }
  const scriptStub = isAudioScriptStubEnabled();

  const { title, script } = await resolveScriptAndTitle({
    scriptedFormat,
    scriptStub,
    topic,
    tones,
    lengthMinutes,
  });

  let row: typeof audios.$inferSelect | undefined;
  try {
    [row] = await db
      .insert(audios)
      .values({
        clerkUserId: userId,
        topic: sanitizePgText(topic),
        title: sanitizePgText(title),
        script: script ? sanitizePgText(script) : null,
        audioUrl: null,
        lengthMinutes,
        format: sanitizePgText(formatRaw),
        tones: sanitizePgText(tones),
        radioStyle: null,
      })
      .returning();
  } catch (err) {
    throw graphQLErrorForAudiosInsert(err);
  }

  if (!row) {
    throw new GraphQLError('Failed to create audio record', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }

  let resultRow = row;

  if (
    !geminiTtsExplicitlyDisabled() &&
    script &&
    formatSupportsTts(scriptedFormat)
  ) {
    try {
      const wav = await synthesizeScriptToWav(script);
      const url = await writeAudioWav(row.id, wav);
      await db
        .update(audios)
        .set({ audioUrl: url })
        .where(eq(audios.id, row.id));
      resultRow = { ...row, audioUrl: url };
    } catch (err) {
      console.error('[createAudio] Gemini TTS', err);
    }
  }

  return audioRowToGql(resultRow);
}
