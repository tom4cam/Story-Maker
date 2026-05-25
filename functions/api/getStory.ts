// GET /api/getStory?id=...&version=...

import type { Env } from './_lib/env';
import { getStoryVersion } from './_lib/storage';
import { badRequest, json, notFound } from './_lib/util';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const versionStr = url.searchParams.get('version');
  if (!id) return badRequest('id required');
  const version = versionStr ? parseInt(versionStr, 10) : undefined;
  const story = await getStoryVersion(env, id, version);
  if (!story) return notFound('Story not found.');
  return json(story);
};
