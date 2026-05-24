import type { Context } from '@netlify/functions';
import { randomUUID } from 'node:crypto';
import { moderateAnswers, ModerationError, saveGeneratingStub } from './_lib/build';
import type { StoryAnswer } from './_lib/types';
import { badRequest, json, readJson, serverError } from './_lib/util';

interface CreateStoryRequest {
  answers: StoryAnswer[];
}

// Synchronous trigger: validates input, runs moderation, writes a pending
// stub, fires the background worker, and returns the story id so the UI
// can navigate and poll. The real story generation happens in
// createWorker-background.ts (which can run up to 15 minutes).
export default async (req: Request, _ctx: Context): Promise<Response> => {
  if (req.method !== 'POST') return badRequest('POST only');
  let body: CreateStoryRequest;
  try {
    body = await readJson<CreateStoryRequest>(req);
  } catch (e) {
    return badRequest((e as Error).message);
  }
  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return badRequest('answers must be a non empty array');
  }
  const trimmed = body.answers
    .filter((a) => a && typeof a.answer === 'string' && a.answer.trim().length > 0)
    .map((a) => ({ question: String(a.question || ''), answer: a.answer.trim() }));
  if (trimmed.length < 3) {
    return badRequest('At least three answers are required to make a story.');
  }
  try {
    await moderateAnswers(trimmed);
  } catch (e) {
    if (e instanceof ModerationError) return json({ error: e.message }, 422);
    console.error('moderation failed', e);
    return serverError((e as Error).message);
  }

  const id = randomUUID();
  try {
    await saveGeneratingStub({ id, version: 1, sourceAnswers: trimmed });
  } catch (e) {
    console.error('saveGeneratingStub failed', e);
    return serverError((e as Error).message);
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_URL || `https://${req.headers.get('host') || ''}`;
  try {
    // Background functions return 202 immediately, so this await is fast.
    await fetch(`${siteUrl}/.netlify/functions/createWorker-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, version: 1, answers: trimmed }),
    });
  } catch (e) {
    console.error('Failed to dispatch background worker', e);
    return serverError('Could not start the story builder');
  }

  return json({ id, version: 1, status: 'generating', title: 'Your new story', paragraphs: [], narration_url: null, source_answers: trimmed, created_at: new Date().toISOString() }, 202);
};
