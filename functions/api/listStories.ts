// GET /api/listStories

import type { Env } from './_lib/env';
import { listStoryIndexes } from './_lib/storage';
import { json, serverError } from './_lib/util';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const items = await listStoryIndexes(env);
    return json(items.slice(0, 30), 200, {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
    });
  } catch (e) {
    console.error('listStories failed', e);
    return serverError((e as Error).message);
  }
};
