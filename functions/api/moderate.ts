// POST /api/moderate

import type { Env } from './_lib/env';
import { moderate } from './_lib/moderation';
import { badRequest, json, serverError } from './_lib/util';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { text?: string };
  try { body = (await request.json()) as { text?: string }; }
  catch (e) { return badRequest((e as Error).message || 'Bad JSON'); }
  if (!body.text || typeof body.text !== 'string') return badRequest('text required');
  try {
    const result = await moderate(env, body.text);
    return json(result);
  } catch (e) {
    console.error('moderate failed', e);
    return serverError((e as Error).message);
  }
};
