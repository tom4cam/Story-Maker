import type { Context } from '@netlify/functions';
import { buildFromAnswers, ModerationError, saveFailedVersion } from './_lib/build';
import type { StoryAnswer } from './_lib/types';

interface WorkerRequest {
  id: string;
  version: number;
  answers: StoryAnswer[];
}

// Background worker: runs the actual story generation pipeline. Netlify
// background functions are allowed up to 15 minutes. The caller (the
// synchronous createStory trigger) gets 202 immediately. This worker
// updates the story record in place when it's done.
export default async (req: Request, _ctx: Context): Promise<Response> => {
  let body: WorkerRequest;
  try {
    body = await req.json();
  } catch (e) {
    console.error('background worker bad body', e);
    return new Response('bad request', { status: 400 });
  }
  if (!body.id || !body.answers || !Array.isArray(body.answers)) {
    console.error('background worker missing fields', body);
    return new Response('bad request', { status: 400 });
  }
  try {
    const story = await buildFromAnswers(body.id, body.answers);
    console.log('story built', story.id, story.title, story.paragraphs.length, 'paragraphs');
  } catch (e) {
    const message = e instanceof ModerationError
      ? e.message
      : `Something went wrong while making the story: ${(e as Error).message}`;
    console.error('background worker failed', e);
    try {
      await saveFailedVersion({
        id: body.id,
        version: body.version || 1,
        sourceAnswers: body.answers,
        error: message,
      });
    } catch (saveErr) {
      console.error('Could not record failure state', saveErr);
    }
  }
  return new Response(null, { status: 202 });
};
