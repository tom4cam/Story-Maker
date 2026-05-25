// POST /api/deleteStory

import type { Env } from './_lib/env';
import { deleteStoryAndMedia } from './_lib/storage';
import { badRequest, json, serverError } from './_lib/util';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { id?: string };
  try { body = (await request.json()) as { id?: string }; }
  catch (e) { return badRequest((e as Error).message || 'Bad JSON'); }
  if (!body.id || typeof body.id !== 'string') return badRequest('id required');
  try {
    const counts = await deleteStoryAndMedia(env, body.id);
    return json({ ok: true, deleted: counts });
  } catch (e) {
    console.error('deleteStory failed', e);
    return serverError((e as Error).message);
  }
};
