// The end to end story build pipeline. Lives here so it can be shared by
// the createStory + createWorker-background pair and by updateStory.

import { randomUUID } from 'node:crypto';
import { generateStory, regenerateImagePrompt } from './anthropic';
import { synthesize } from './elevenlabs';
import { generateImage } from './fal';
import { moderate } from './moderation';
import { saveStoryVersion, storeMedia } from './storage';
import type { GeneratedStory, Paragraph, StoryAnswer, StoryVersion } from './types';
import { charsToWords } from './words';

export class ModerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModerationError';
  }
}

// Run moderation against every answer. Throws if any input is flagged.
export async function moderateAnswers(answers: StoryAnswer[]): Promise<void> {
  const joined = answers.map((a) => a.answer).join('\n\n');
  const result = await moderate(joined);
  if (result.flagged) {
    throw new ModerationError(
      'I cannot make a story with those words. Try different words for your hero, the place, or the problem.'
    );
  }
}

// Write a "generating" placeholder so the UI can poll and show a loading
// state. We deliberately don't touch the {id}/index.json record yet, so
// the home page list does not include unfinished stories.
export async function saveGeneratingStub(opts: {
  id: string;
  version: number;
  sourceAnswers: StoryAnswer[];
  language: 'en' | 'sv';
  voiceId?: string;
}): Promise<StoryVersion> {
  const stub: StoryVersion = {
    id: opts.id,
    version: opts.version,
    title: 'Your new story',
    paragraphs: [],
    narration_url: null,
    source_answers: opts.sourceAnswers,
    created_at: new Date().toISOString(),
    status: 'generating',
    language: opts.language,
    ...(opts.voiceId ? { voice_id: opts.voiceId } : {}),
  };
  await saveStoryVersion(stub);
  return stub;
}

// Mark a generating record as failed so the UI can show a friendly message
// instead of polling forever.
export async function saveFailedVersion(opts: {
  id: string;
  version: number;
  sourceAnswers: StoryAnswer[];
  error: string;
  language: 'en' | 'sv';
  voiceId?: string;
}): Promise<void> {
  const rec: StoryVersion = {
    id: opts.id,
    version: opts.version,
    title: 'Story did not finish',
    paragraphs: [],
    narration_url: null,
    source_answers: opts.sourceAnswers,
    created_at: new Date().toISOString(),
    status: 'failed',
    error: opts.error,
    language: opts.language,
    ...(opts.voiceId ? { voice_id: opts.voiceId } : {}),
  };
  await saveStoryVersion(rec);
}

interface BuildOptions {
  id?: string;
  version: number;
  title?: string;
  sourceAnswers: StoryAnswer[];
  language: 'en' | 'sv';
  voiceId?: string;
  /**
   * Optional editor-supplied story + character summary. When present, it's
   * prepended to every image prompt sent to Fal so character appearance
   * (hair color, age, clothing, etc.) stays consistent across regenerations.
   */
  summary?: string;
  paragraphs: { text: string; image_prompt?: string; image_url: string | null; regenerate_image?: boolean }[];
}

// Fal's free tier caps concurrent image requests at 10. Cap our own
// fan-out below that so large stories (e.g., Bob's 20 stanzas) don't
// fail with 429. Narration still runs in parallel with image batches.
const FAL_CONCURRENCY = 6;

// Builds the assets (any missing images + fresh narration audio) and saves
// the story as the canonical {id}/v{n}.json record plus updating the
// {id}/index.json summary.
export async function buildAndSaveVersion(opts: BuildOptions): Promise<StoryVersion> {
  const id = opts.id ?? randomUUID();
  const title = opts.title?.trim() || 'A Brand New Story';

  // Kick narration off immediately; it runs alongside the image batches.
  const paragraphTexts = opts.paragraphs.map((p) => p.text);
  const narrationText = paragraphTexts.join('\n\n');
  const narrationTask = synthesize(narrationText, { voiceId: opts.voiceId }).then(async ({ audio, alignment }) => {
    const url = await storeMedia(`${id}-v${opts.version}.mp3`, audio, 'audio/mpeg');
    const words = charsToWords(paragraphTexts, alignment);
    return { url, words };
  });

  // Process paragraphs in concurrency-capped batches so Fal isn't asked
  // for more than FAL_CONCURRENCY images at once. Paragraphs whose image
  // is already present just pass through inside the batch without
  // calling Fal.
  const paragraphs: Paragraph[] = new Array(opts.paragraphs.length);
  for (let start = 0; start < opts.paragraphs.length; start += FAL_CONCURRENCY) {
    const slice = opts.paragraphs.slice(start, start + FAL_CONCURRENCY);
    const results = await Promise.all(slice.map(async (p, j) => {
      const i = start + j;
      const needsImage = p.regenerate_image || !p.image_url;
      if (!needsImage) {
        return { text: p.text, image_url: p.image_url, image_prompt: p.image_prompt } satisfies Paragraph;
      }
      const basePrompt = p.image_prompt && p.image_prompt.trim().length > 0
        ? p.image_prompt
        : await regenerateImagePrompt(p.text, title);
      const summary = opts.summary?.trim();
      const prompt = summary
        ? `Cartoon illustration. Characters: ${summary} Scene: ${basePrompt} Style: bright colors, friendly faces, cartoon style, no text in the image.`
        : basePrompt;
      const img = await generateImage(prompt);
      const url = await storeMedia(`${id}-v${opts.version}-p${i + 1}.png`, img.data, img.contentType);
      return { text: p.text, image_url: url, image_prompt: prompt } satisfies Paragraph;
    }));
    for (let j = 0; j < results.length; j += 1) paragraphs[start + j] = results[j];
  }

  const narration = await narrationTask;

  const version: StoryVersion = {
    id,
    version: opts.version,
    title,
    paragraphs,
    narration_url: narration.url,
    source_answers: opts.sourceAnswers,
    created_at: new Date().toISOString(),
    status: 'ready',
    language: opts.language,
    narration_words: narration.words,
    ...(opts.voiceId ? { voice_id: opts.voiceId } : {}),
    ...(opts.summary && opts.summary.trim() ? { summary: opts.summary.trim() } : {}),
  };
  await saveStoryVersion(version);
  return version;
}

// Generates a story from the kid's answers (moderates first), then builds
// the assets. Throws ModerationError if anything is flagged.
export async function buildFromAnswers(
  id: string,
  answers: StoryAnswer[],
  language: 'en' | 'sv',
  voiceId?: string
): Promise<StoryVersion> {
  await moderateAnswers(answers);
  const generated = await safelyGenerate(answers, language);
  return buildAndSaveVersion({
    id,
    version: 1,
    title: generated.title,
    sourceAnswers: answers,
    language,
    voiceId,
    paragraphs: generated.paragraphs.map((p) => ({
      text: p.text,
      image_prompt: p.image_prompt,
      image_url: null,
    })),
  });
}

async function safelyGenerate(answers: StoryAnswer[], language: 'en' | 'sv'): Promise<GeneratedStory> {
  const generated = await generateStory(answers, language);
  const fullText = `${generated.title}\n\n${generated.paragraphs.map((p) => p.text).join('\n\n')}`;
  const result = await moderate(fullText);
  if (result.flagged) {
    throw new ModerationError(
      'The story came out a little off. Try asking again with different details.'
    );
  }
  return generated;
}
