import type { Context } from '@netlify/functions';
import { deleteStoryAndMedia } from './_lib/storage';
import { badRequest, json, readJson, serverError } from './_lib/util';

interface DeleteStoryRequest {
  id: string;
}

// No-accounts app: anyone with the link can delete. Matches the spirit
// of the rest of the API (anyone with the link can also read and edit).
// Client confirms with the user before calling this.
export default async (req: Request, _ctx: Context): Promise<Response> => {
  if (req.method !== 'POST') return badRequest('POST only');
  let body: DeleteStoryRequest;
  try {
    body = await readJson<DeleteStoryRequest>(req);
  } catch (e) {
    return badRequest((e as Error).message);
  }
  if (!body.id || typeof body.id !== 'string') return badRequest('id required');
  try {
    const counts = await deleteStoryAndMedia(body.id);
    return json({ ok: true, deleted: counts });
  } catch (e) {
    console.error('deleteStory failed', e);
    return serverError((e as Error).message);
  }
};
