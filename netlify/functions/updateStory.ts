import type { Context } from '@netlify/functions';
import { saveGeneratingStub } from './_lib/build';
import { getStoryIndex, getStoryVersion } from './_lib/storage';
import { badRequest, json, notFound, readJson, serverError } from './_lib/util';

interface UpdateStoryRequest {
  id: string;
  title: string;
  paragraphs: { text: string; image_url: string | null; image_prompt?: string; regenerate_image?: boolean }[];
}

// Synchronous trigger for edits. Writes a pending stub for the next
// version and hands off to the background worker.
export default async (req: Request, _ctx: Context): Promise<Response> => {
  if (req.method !== 'POST') return badRequest('POST only');
  let body: UpdateStoryRequest;
  try {
    body = await readJson<UpdateStoryRequest>(req);
  } catch (e) {
    return badRequest((e as Error).message);
  }
  if (!body.id) return badRequest('Missing story id');
  if (!Array.isArray(body.paragraphs) || body.paragraphs.length === 0) {
    return badRequest('paragraphs must be a non empty array');
  }
  const idx = await getStoryIndex(body.id);
  if (!idx) return notFound('That story does not exist.');
  const previous = await getStoryVersion(body.id, idx.latest_version);

  const nextVersion = idx.latest_version + 1;
  try {
    await saveGeneratingStub({
      id: body.id,
      version: nextVersion,
      sourceAnswers: previous?.source_answers ?? [],
    });
  } catch (e) {
    console.error('updateStory stub failed', e);
    return serverError((e as Error).message);
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_URL || `https://${req.headers.get('host') || ''}`;
  try {
    await fetch(`${siteUrl}/.netlify/functions/updateWorker-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: body.id,
        version: nextVersion,
        title: body.title || idx.title,
        sourceAnswers: previous?.source_answers ?? [],
        paragraphs: body.paragraphs.map((p) => ({
          text: p.text,
          image_url: p.image_url ?? null,
          image_prompt: p.image_prompt,
          regenerate_image: !!p.regenerate_image,
        })),
      }),
    });
  } catch (e) {
    console.error('Failed to dispatch update worker', e);
    return serverError('Could not start the editor');
  }

  return json({
    id: body.id,
    version: nextVersion,
    status: 'generating',
    title: body.title || idx.title,
    paragraphs: [],
    narration_url: null,
    source_answers: previous?.source_answers ?? [],
    created_at: new Date().toISOString(),
  }, 202);
};
