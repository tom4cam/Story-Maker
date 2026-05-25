import type { Context } from '@netlify/functions';
import { buildAndSaveVersion, saveFailedVersion } from './_lib/build';
import type { StoryAnswer } from './_lib/types';

interface WorkerRequest {
  id: string;
  version: number;
  title: string;
  sourceAnswers: StoryAnswer[];
  language: 'en' | 'sv';
  voiceId?: string;
  paragraphs: { text: string; image_url: string | null; image_prompt?: string; regenerate_image?: boolean }[];
}

export default async (req: Request, _ctx: Context): Promise<Response> => {
  let body: WorkerRequest;
  try {
    body = await req.json();
  } catch (e) {
    console.error('update worker bad body', e);
    return new Response('bad request', { status: 400 });
  }
  if (body.language !== 'en' && body.language !== 'sv') {
    console.error('update worker missing language', body);
    return new Response('bad request', { status: 400 });
  }
  try {
    const story = await buildAndSaveVersion({
      id: body.id,
      version: body.version,
      title: body.title,
      sourceAnswers: body.sourceAnswers,
      language: body.language,
      voiceId: body.voiceId,
      paragraphs: body.paragraphs,
    });
    console.log('story updated', story.id, 'v' + story.version);
  } catch (e) {
    console.error('update worker failed', e);
    try {
      await saveFailedVersion({
        id: body.id,
        version: body.version,
        sourceAnswers: body.sourceAnswers,
        language: body.language,
        voiceId: body.voiceId,
        error: `Something went wrong while saving the new version: ${(e as Error).message}`,
      });
    } catch (saveErr) {
      console.error('Could not record failure state', saveErr);
    }
  }
  return new Response(null, { status: 202 });
};
