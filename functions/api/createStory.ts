// POST /api/createStory
// Validates, writes a "generating" stub, kicks off the long build work
// via ctx.waitUntil (which lets Cloudflare keep running it after the
// response is returned), and returns 202 immediately.

import type { Env } from './_lib/env';
import { buildFromAnswers, ModerationError, moderateAnswers, saveFailedVersion, saveGeneratingStub } from './_lib/build';
import type { StoryAnswer } from './_lib/types';
import { badRequest, json, serverError } from './_lib/util';

interface CreateStoryRequest {
  answers: StoryAnswer[];
  language: 'en' | 'sv';
  voice_id?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  let body: CreateStoryRequest;
  try { body = (await request.json()) as CreateStoryRequest; }
  catch (e) { return badRequest((e as Error).message || 'Bad JSON'); }

  if (!Array.isArray(body.answers) || body.answers.length === 0) return badRequest('answers must be a non empty array');
  if (body.language !== 'en' && body.language !== 'sv') return badRequest('language must be "en" or "sv"');
  const trimmed = body.answers
    .filter((a) => a && typeof a.answer === 'string' && a.answer.trim().length > 0)
    .map((a) => ({ question: String(a.question || ''), answer: a.answer.trim() }));
  if (trimmed.length < 3) return badRequest('At least three answers are required to make a story.');

  try { await moderateAnswers(env, trimmed); }
  catch (e) {
    if (e instanceof ModerationError) return json({ error: e.message }, 422);
    console.error('moderation failed', e);
    return serverError((e as Error).message);
  }

  const voiceId = typeof body.voice_id === 'string' && body.voice_id ? body.voice_id : undefined;
  const id = crypto.randomUUID();
  try { await saveGeneratingStub(env, { id, version: 1, sourceAnswers: trimmed, language: body.language, voiceId }); }
  catch (e) {
    console.error('saveGeneratingStub failed', e);
    return serverError((e as Error).message);
  }

  // Kick off the long-running build in the background. waitUntil keeps
  // the worker alive past the response so the pipeline finishes even
  // though the client got 202 immediately.
  waitUntil((async () => {
    try {
      const story = await buildFromAnswers(env, id, trimmed, body.language, voiceId);
      console.log('story built', story.id, story.title, story.paragraphs.length, 'paragraphs');
    } catch (e) {
      const message = e instanceof ModerationError
        ? e.message
        : `Something went wrong while making the story: ${(e as Error).message}`;
      console.error('background build failed', e);
      try {
        await saveFailedVersion(env, {
          id, version: 1, sourceAnswers: trimmed, language: body.language, voiceId, error: message,
        });
      } catch (saveErr) { console.error('Could not record failure state', saveErr); }
    }
  })());

  return json({
    id, version: 1, status: 'generating',
    title: 'Your new story', paragraphs: [], narration_url: null,
    source_answers: trimmed, created_at: new Date().toISOString(),
    language: body.language,
    ...(voiceId ? { voice_id: voiceId } : {}),
  }, 202);
};
