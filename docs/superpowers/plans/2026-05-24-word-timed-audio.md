# Word-Timed Audio + Custom Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync a 5-word sliding-window highlight to the narration audio, let kids click a word to jump the audio there, and replace the small speaker icon with a friendly 64px play/pause button + clickable progress bar. Plan 2 of 4 in the v2 series.

**Architecture:** ElevenLabs `/with-timestamps` returns per-character timing for the narration MP3. A pure helper (`charsToWords`) collapses that into per-word `{paragraphIndex, wordIndex, start, end}` entries stored on `StoryVersion.narration_words`. The frontend renders each word as a focusable `<button>`, a `useAudioSync` hook drives a `requestAnimationFrame` loop that highlights the active 5-word window, and click-to-seek sets `audio.currentTime` to the word's start. A new `<AudioBar>` component owns the audio element and the play/pause + progress UI; `StoryPage` forwards its ref into `useAudioSync` so highlight and player share one audio source.

**Tech Stack:** React 18, Vite, TypeScript, Netlify Functions, ElevenLabs `eleven_multilingual_v2` (with `with-timestamps` endpoint), Vitest for the two pure helpers.

---

## File Structure

**New files:**
- `netlify/functions/_lib/words.ts` — pure `charsToWords()` converter from char-level alignment to word timings.
- `netlify/functions/_lib/words.test.ts` — *(adjacent to source; will need a small Vitest config update or move — see Task 2)*.
- `apps/web/src/audioSync.ts` — `useAudioSync` React hook and pure `findActiveWordIndex` helper.
- `apps/web/src/audioSync.test.ts` — Vitest tests for `findActiveWordIndex`.
- `apps/web/src/components/AudioBar.tsx` — custom player UI; owns `<audio>` element; exposes ref via `forwardRef`.

**Modified files:**
- `apps/web/vitest.config.ts` — include the backend `_lib/*.test.ts` path so we can co-locate `words.test.ts` (or keep it strictly in apps/web — see Task 2 decision).
- `netlify/functions/_lib/elevenlabs.ts` — switch endpoint to `/with-timestamps`, return `{ audio, alignment }`.
- `netlify/functions/_lib/build.ts` — call `charsToWords()` on the alignment and persist `narration_words` on the saved version.
- `netlify/functions/_lib/types.ts` and `apps/web/src/types.ts` — add `WordTiming` interface and `narration_words?: WordTiming[]` on `StoryVersion`.
- `apps/web/src/routes/StoryPage.tsx` — render each paragraph as word `<button>`s with `is-current` class, wire `useAudioSync`, mount `<AudioBar>` instead of the old `<audio controls>`.
- `apps/web/src/i18n/strings/en.ts` and `sv.ts` — add three short labels: `audio.play`, `audio.pause`, `audio.replay`.
- `apps/web/src/styles.css` — `.word` (default + hover/focus), `.word.is-current`, `.audio-bar` (new player layout), `.play-btn`, `.audio-progress`, `.audio-time`.

**Untouched:**
- `_lib/fal.ts`, `_lib/moderation.ts`, `_lib/storage.ts`, `media.ts`, `listStories.ts`, `getStory.ts`, `moderate.ts`, `createStory.ts`, `createWorker-background.ts`, `updateStory.ts`, `updateWorker-background.ts` — they pass the audio through unchanged.
- `apps/web/src/routes/{HomePage,CreatePage,EditPage,NotFoundPage}.tsx` — no audio.

---

## Task 1 — Add `WordTiming` type and optional `narration_words` field

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `netlify/functions/_lib/types.ts`

- [ ] **Step 1: Add the type in `apps/web/src/types.ts`**

Add (above or below `StoryVersion`, doesn't matter):

```ts
export interface WordTiming {
  paragraphIndex: number;
  wordIndex: number;
  word: string;
  start: number;
  end: number;
}
```

Then extend `StoryVersion`:

```ts
export interface StoryVersion {
  // ...existing fields...
  language: 'en' | 'sv';
  narration_words?: WordTiming[];
}
```

- [ ] **Step 2: Mirror in `netlify/functions/_lib/types.ts`**

Same `WordTiming` interface, same `narration_words?: WordTiming[]` addition to `StoryVersion`.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/types.ts netlify/functions/_lib/types.ts
git commit -m "Add WordTiming type and optional narration_words field"
```

---

## Task 2 — Decide test location and update Vitest config

**Context:** `words.ts` lives under `netlify/functions/_lib/`, but the only Vitest setup we have is inside `apps/web/`. Two options:
- (a) Co-locate the test inside `apps/web/src/words.test.ts` and import from a relative path that crosses package boundaries — ugly and fragile.
- (b) Mirror the source location: put the test at `netlify/functions/_lib/words.test.ts` and broaden the Vitest include glob to find it.

This task picks (b) since it keeps the test next to its source.

**Files:**
- Modify: `apps/web/vitest.config.ts`

- [ ] **Step 1: Update `vitest.config.ts` to include backend tests**

Replace the file contents with:

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // Include both web tests and the netlify/_lib tests; both are pure
    // Node-environment helpers, so a single runner is fine.
    include: [
      'src/**/*.test.ts',
      resolve(__dirname, '../../netlify/functions/_lib/**/*.test.ts'),
    ],
  },
});
```

- [ ] **Step 2: Confirm existing tests still run**

```bash
npm --workspace apps/web run test
```

Expected: existing 10 i18n tests still pass; no new tests yet.

- [ ] **Step 3: Commit**

```bash
git add apps/web/vitest.config.ts
git commit -m "Broaden Vitest include glob to find backend _lib tests"
```

---

## Task 3 — TDD: write failing tests for `charsToWords`

**Files:**
- Create: `netlify/functions/_lib/words.test.ts`

The helper converts ElevenLabs char-level alignment into per-paragraph word timings. The input narration text is the same `paragraphs.map(p => p.text).join('\n\n')` string we feed to ElevenLabs; the alignment maps to that exact concatenated string.

Behaviour to test:
- Single paragraph, one word: returns one `WordTiming` with the word's text and the char's start/end.
- Single paragraph, multiple words: indexes are 0-based within the paragraph.
- Multiple paragraphs split by `\n\n`: words in the second paragraph get `paragraphIndex: 1` and reset `wordIndex` to 0.
- Punctuation attached to a word counts as part of that word (e.g., `"Hi,"` is one token).
- Leading/trailing whitespace doesn't produce empty words.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { charsToWords } from './words';

// Helper to build an alignment object from a string with per-char fixed timing.
function fakeAlignment(text: string, msPerChar = 100) {
  const characters = [...text];
  const character_start_times_seconds = characters.map((_, i) => (i * msPerChar) / 1000);
  const character_end_times_seconds = characters.map((_, i) => ((i + 1) * msPerChar) / 1000);
  return { characters, character_start_times_seconds, character_end_times_seconds };
}

describe('charsToWords', () => {
  it('handles a single-word paragraph', () => {
    const text = 'Hi';
    const out = charsToWords(['Hi'], fakeAlignment(text));
    expect(out).toEqual([
      { paragraphIndex: 0, wordIndex: 0, word: 'Hi', start: 0.0, end: 0.2 },
    ]);
  });

  it('numbers words 0-indexed within a paragraph', () => {
    const text = 'one two three';
    const out = charsToWords(['one two three'], fakeAlignment(text));
    expect(out.map((w) => [w.wordIndex, w.word])).toEqual([
      [0, 'one'],
      [1, 'two'],
      [2, 'three'],
    ]);
  });

  it('uses the first char start and last char end for each word', () => {
    const text = 'hi yo';
    const out = charsToWords(['hi yo'], fakeAlignment(text, 100));
    // "hi" spans chars 0-1 -> 0.0..0.2; "yo" spans chars 3-4 -> 0.3..0.5
    expect(out[0]).toMatchObject({ word: 'hi', start: 0.0, end: 0.2 });
    expect(out[1]).toMatchObject({ word: 'yo', start: 0.3, end: 0.5 });
  });

  it('starts paragraphIndex from 0 and resets wordIndex per paragraph', () => {
    const text = 'one\n\ntwo three';
    const out = charsToWords(['one', 'two three'], fakeAlignment(text));
    expect(out.map((w) => [w.paragraphIndex, w.wordIndex, w.word])).toEqual([
      [0, 0, 'one'],
      [1, 0, 'two'],
      [1, 1, 'three'],
    ]);
  });

  it('keeps punctuation attached to its word', () => {
    const text = 'Hi, friend.';
    const out = charsToWords(['Hi, friend.'], fakeAlignment(text));
    expect(out.map((w) => w.word)).toEqual(['Hi,', 'friend.']);
  });

  it('ignores leading and trailing whitespace gracefully', () => {
    const text = '  hi  ';
    const out = charsToWords(['  hi  '], fakeAlignment(text));
    expect(out.map((w) => w.word)).toEqual(['hi']);
    expect(out[0]).toMatchObject({ paragraphIndex: 0, wordIndex: 0 });
  });

  it('handles three paragraphs', () => {
    const text = 'a b\n\nc\n\nd e f';
    const out = charsToWords(['a b', 'c', 'd e f'], fakeAlignment(text));
    expect(out.map((w) => [w.paragraphIndex, w.wordIndex])).toEqual([
      [0, 0], [0, 1],
      [1, 0],
      [2, 0], [2, 1], [2, 2],
    ]);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm --workspace apps/web run test
```

Expected: failures because `./words` doesn't exist yet.

---

## Task 4 — Implement `charsToWords`

**Files:**
- Create: `netlify/functions/_lib/words.ts`

The implementation walks the `characters` array, tracks position in the source text (which equals `paragraphs.map(p => p.text).join('\n\n')`), groups non-whitespace runs into words, and increments `paragraphIndex` each time the running offset crosses a paragraph boundary.

- [ ] **Step 1: Write the implementation**

```ts
import type { WordTiming } from './types';

export interface CharacterAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/**
 * Convert ElevenLabs character-level alignment into per-word timings.
 * The alignment is expected to correspond 1:1 to the same text we sent
 * to ElevenLabs: paragraphs joined by `joiner` (default "\n\n").
 *
 * A "word" is a maximal run of non-whitespace characters; punctuation
 * stays attached to whatever word it's adjacent to.
 */
export function charsToWords(
  paragraphs: string[],
  alignment: CharacterAlignment,
  joiner = '\n\n'
): WordTiming[] {
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;

  // Build a parallel array of paragraphIndex per character position.
  const paraIndexAtChar: number[] = new Array(chars.length);
  let cursor = 0;
  for (let p = 0; p < paragraphs.length; p += 1) {
    const para = paragraphs[p];
    for (let i = 0; i < para.length; i += 1) {
      paraIndexAtChar[cursor + i] = p;
    }
    cursor += para.length;
    if (p < paragraphs.length - 1) {
      for (let j = 0; j < joiner.length; j += 1) {
        // Joiner chars belong to "no paragraph" (-1). They are whitespace
        // so they will never be inside a word.
        paraIndexAtChar[cursor + j] = -1;
      }
      cursor += joiner.length;
    }
  }

  const out: WordTiming[] = [];
  const wordIndexByParagraph: number[] = paragraphs.map(() => 0);

  let i = 0;
  while (i < chars.length) {
    // Skip whitespace.
    while (i < chars.length && /\s/.test(chars[i])) i += 1;
    if (i >= chars.length) break;

    // Collect a word.
    const startIdx = i;
    let endIdx = i;
    while (endIdx < chars.length && !/\s/.test(chars[endIdx])) endIdx += 1;

    const word = chars.slice(startIdx, endIdx).join('');
    const paragraphIndex = paraIndexAtChar[startIdx];
    if (paragraphIndex < 0) {
      // Defensive: shouldn't happen because non-whitespace lies inside a paragraph.
      i = endIdx;
      continue;
    }
    out.push({
      paragraphIndex,
      wordIndex: wordIndexByParagraph[paragraphIndex],
      word,
      start: starts[startIdx],
      end: ends[endIdx - 1],
    });
    wordIndexByParagraph[paragraphIndex] += 1;
    i = endIdx;
  }

  return out;
}
```

- [ ] **Step 2: Run tests and confirm they pass**

```bash
npm --workspace apps/web run test
```

Expected: existing 10 i18n tests + 7 new word tests = 17 total, all passing.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/_lib/words.ts netlify/functions/_lib/words.test.ts
git commit -m "Add charsToWords helper to convert ElevenLabs alignment into word timings"
```

---

## Task 5 — Switch ElevenLabs synth to `/with-timestamps`

**Files:**
- Modify: `netlify/functions/_lib/elevenlabs.ts`

The endpoint now returns a JSON body with `audio_base64` (the MP3) and an `alignment` object. Decode the audio to an `ArrayBuffer` and pass the alignment back to the caller.

- [ ] **Step 1: Replace `synthesize()` end to end**

Replace `netlify/functions/_lib/elevenlabs.ts` with:

```ts
// ElevenLabs text-to-speech with character-level timestamps. Returns the
// MP3 buffer plus the alignment that maps each input character to its
// audio position.

import type { CharacterAlignment } from './words';
import { requireEnv } from './util';

const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'; // Daniel
const MODEL_ID = 'eleven_multilingual_v2';

export interface SynthResult {
  audio: ArrayBuffer;
  alignment: CharacterAlignment;
}

interface ElevenLabsTimestampedResponse {
  audio_base64: string;
  alignment: CharacterAlignment;
  normalized_alignment?: CharacterAlignment;
}

export async function synthesize(text: string): Promise<SynthResult> {
  const apiKey = requireEnv('ELEVENLABS_API_KEY');
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`ElevenLabs synthesis failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const body = (await res.json()) as ElevenLabsTimestampedResponse;
  const audio = base64ToArrayBuffer(body.audio_base64);
  return { audio, alignment: body.alignment };
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, 'base64');
  // Convert Node Buffer to a fresh ArrayBuffer (avoid sharing underlying memory).
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
```

- [ ] **Step 2: Typecheck — expect errors in `build.ts`**

```bash
npm run typecheck
```

Expected: `build.ts` will now fail because it destructures the old `ArrayBuffer` return shape. Task 6 fixes it.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/_lib/elevenlabs.ts
git commit -m "Switch ElevenLabs synthesis to /with-timestamps; return audio + alignment"
```

---

## Task 6 — Wire word timings into `buildAndSaveVersion`

**Files:**
- Modify: `netlify/functions/_lib/build.ts`

`synthesize()` now returns `{ audio, alignment }`. Pipe the alignment through `charsToWords()` (using the same paragraph array we already have) and persist `narration_words` on the saved `StoryVersion`.

- [ ] **Step 1: Update the imports**

At the top of `_lib/build.ts`, add:

```ts
import { charsToWords } from './words';
```

- [ ] **Step 2: Update the narration task inside `buildAndSaveVersion`**

Find the lines that currently look like:

```ts
const narrationText = opts.paragraphs.map((p) => p.text).join('\n\n');
const narrationTask = synthesize(narrationText).then((audio) =>
  storeMedia(`${id}-v${opts.version}.mp3`, audio, 'audio/mpeg')
);

const [paragraphs, narrationUrl] = await Promise.all([Promise.all(tasks), narrationTask]);
```

Replace with:

```ts
const paragraphTexts = opts.paragraphs.map((p) => p.text);
const narrationText = paragraphTexts.join('\n\n');
const narrationTask = synthesize(narrationText).then(async ({ audio, alignment }) => {
  const url = await storeMedia(`${id}-v${opts.version}.mp3`, audio, 'audio/mpeg');
  const words = charsToWords(paragraphTexts, alignment);
  return { url, words };
});

const [paragraphs, narration] = await Promise.all([Promise.all(tasks), narrationTask]);
```

- [ ] **Step 3: Update the saved `StoryVersion` literal**

The block that builds the final version object:

```ts
const version: StoryVersion = {
  id,
  version: opts.version,
  title,
  paragraphs,
  narration_url: narrationUrl,
  source_answers: opts.sourceAnswers,
  created_at: new Date().toISOString(),
  status: 'ready',
  language: opts.language,
};
```

Becomes:

```ts
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
};
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_lib/build.ts
git commit -m "Persist narration_words on every saved StoryVersion"
```

---

## Task 7 — TDD: `findActiveWordIndex` selector

**Files:**
- Create: `apps/web/src/audioSync.test.ts`

The pure helper finds the active word for a given `currentTime`. It returns -1 when the time is before the first word, the last index when time is past the last word's end, and the index whose `[start, end)` window contains the time otherwise. Uses binary search since `narration_words` is sorted by `start`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { findActiveWordIndex } from './audioSync';
import type { WordTiming } from './types';

const w = (start: number, end: number): WordTiming => ({
  paragraphIndex: 0, wordIndex: 0, word: 'x', start, end,
});

describe('findActiveWordIndex', () => {
  const words: WordTiming[] = [
    w(0.0, 0.2),
    w(0.2, 0.5),
    w(0.5, 0.9),
    w(1.0, 1.4),
  ];

  it('returns -1 when there are no words', () => {
    expect(findActiveWordIndex([], 1)).toBe(-1);
  });

  it('returns -1 when time is before the first word', () => {
    expect(findActiveWordIndex(words, -0.5)).toBe(-1);
  });

  it('returns 0 at exactly the first start', () => {
    expect(findActiveWordIndex(words, 0.0)).toBe(0);
  });

  it('returns the index whose window contains the time', () => {
    expect(findActiveWordIndex(words, 0.1)).toBe(0);
    expect(findActiveWordIndex(words, 0.3)).toBe(1);
    expect(findActiveWordIndex(words, 0.7)).toBe(2);
    expect(findActiveWordIndex(words, 1.2)).toBe(3);
  });

  it('treats end times as exclusive', () => {
    // 0.2 is start of word 1, not end of word 0
    expect(findActiveWordIndex(words, 0.2)).toBe(1);
  });

  it('returns the previous word when time falls in a gap', () => {
    // 0.95 is after word 2 (0.5..0.9) and before word 3 (1.0..1.4)
    expect(findActiveWordIndex(words, 0.95)).toBe(2);
  });

  it('returns the last index when past the last word end', () => {
    expect(findActiveWordIndex(words, 99)).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm --workspace apps/web run test
```

Expected: failure on `./audioSync` import.

---

## Task 8 — Implement `findActiveWordIndex` and `useAudioSync`

**Files:**
- Create: `apps/web/src/audioSync.ts`

`findActiveWordIndex` is a pure binary search. `useAudioSync` is a React hook that owns the rAF loop and returns the current active index, which the renderer uses to decide which spans get `is-current`.

- [ ] **Step 1: Write the file**

```ts
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { WordTiming } from './types';

/**
 * Returns the index of the word whose [start, end) window contains `t`.
 *   - Returns -1 if `t` is before the first word's start, or words is empty.
 *   - Returns the previous index when `t` falls in a gap between two words.
 *   - Returns the last index when `t` is past the last word's end.
 */
export function findActiveWordIndex(words: WordTiming[], t: number): number {
  if (words.length === 0) return -1;
  if (t < words[0].start) return -1;
  // Binary search for the largest index whose start <= t.
  let lo = 0;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (words[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Returns the current active word index for the given audio element ref.
 * Updates only when the index changes — re-renders the consumer at word
 * boundaries, not every frame.
 *
 * Returns -1 when there's no audio, no timings, or playback hasn't begun.
 */
export function useAudioSync(
  audioRef: RefObject<HTMLAudioElement | null>,
  words: WordTiming[] | undefined
): number {
  const [activeIndex, setActiveIndex] = useState(-1);
  const rafRef = useRef<number | null>(null);
  const lastIndexRef = useRef(-1);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !words || words.length === 0) {
      setActiveIndex(-1);
      lastIndexRef.current = -1;
      return;
    }

    const tick = () => {
      const t = el.currentTime;
      const idx = findActiveWordIndex(words, t);
      if (idx !== lastIndexRef.current) {
        lastIndexRef.current = idx;
        setActiveIndex(idx);
      }
      if (!el.paused && !el.ended) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const onPlay = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
    };
    const onPauseOrEnd = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Snap once after pause so the highlight matches where playback stopped.
      tick();
    };
    const onSeek = () => {
      // Force a tick so the highlight updates immediately after a seek.
      tick();
    };

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPauseOrEnd);
    el.addEventListener('ended', onPauseOrEnd);
    el.addEventListener('seeked', onSeek);

    // If audio was already playing when this effect runs, start the loop.
    if (!el.paused && !el.ended) onPlay();
    // Initial snap.
    tick();

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPauseOrEnd);
      el.removeEventListener('ended', onPauseOrEnd);
      el.removeEventListener('seeked', onSeek);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [audioRef, words]);

  return activeIndex;
}
```

- [ ] **Step 2: Run tests**

```bash
npm --workspace apps/web run test
```

Expected: 17 prior tests + 7 new selector tests = 24 total, all passing.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/audioSync.ts apps/web/src/audioSync.test.ts
git commit -m "Add findActiveWordIndex and useAudioSync hook"
```

---

## Task 9 — Add audio + word strings

**Files:**
- Modify: `apps/web/src/i18n/strings/en.ts`
- Modify: `apps/web/src/i18n/strings/sv.ts`

- [ ] **Step 1: Add three keys to `en.ts`**

Inside the `en` object, in the `Mic / speech` group (or a new `Audio` group):

```ts
'audio.play': 'Play',
'audio.pause': 'Pause',
'audio.replay': 'Play again',
```

- [ ] **Step 2: Mirror in `sv.ts`**

```ts
'audio.play': 'Spela',
'audio.pause': 'Pausa',
'audio.replay': 'Spela igen',
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/i18n/strings/en.ts apps/web/src/i18n/strings/sv.ts
git commit -m "Add audio player strings (en + sv)"
```

---

## Task 10 — Build the `AudioBar` component

**Files:**
- Create: `apps/web/src/components/AudioBar.tsx`

A custom shell over a hidden `<audio>` element. `forwardRef` exposes the `<audio>` so `StoryPage` can pass the same ref into `useAudioSync`.

- [ ] **Step 1: Write the component**

```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useT } from '../i18n';

interface Props {
  src: string;
}

export type AudioBarRef = HTMLAudioElement;

export const AudioBar = forwardRef<AudioBarRef, Props>(function AudioBar({ src }, ref) {
  const t = useT();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ended, setEnded] = useState(false);

  // Expose the inner audio element to the parent.
  useImperativeHandle(ref, () => audioRef.current as HTMLAudioElement, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => { setIsPlaying(true); setEnded(false); };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setEnded(true); };
    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused || el.ended) {
      if (el.ended) el.currentTime = 0;
      void el.play();
    } else {
      el.pause();
    }
  };

  const onProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * duration;
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const label = ended ? t('audio.replay') : isPlaying ? t('audio.pause') : t('audio.play');

  return (
    <div className="audio-bar">
      <button
        type="button"
        className={`play-btn ${isPlaying ? 'is-playing' : ''}`}
        onClick={toggle}
        aria-label={label}
        aria-pressed={isPlaying}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>
      <div
        className="audio-progress"
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(1, Math.round(duration))}
        aria-valuenow={Math.round(currentTime)}
        onClick={onProgressClick}
      >
        <div className="audio-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="audio-time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>
      <audio ref={audioRef} src={src} preload="metadata" hidden />
    </div>
  );
});

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/AudioBar.tsx
git commit -m "Add AudioBar component with custom play/pause and seekable progress"
```

---

## Task 11 — Style the player and the words

**Files:**
- Modify: `apps/web/src/styles.css`

The existing `.audio-bar` rule already places a sticky bar with the right border/shadow; tweak it for the new layout, and add new rules for the play button, progress bar, time, and word spans.

- [ ] **Step 1: Replace the `.audio-bar` block**

Find the existing block:

```css
.audio-bar {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--paper);
  border: 4px solid var(--ink);
  border-radius: 20px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  box-shadow: var(--shadow);
}
.audio-bar audio { flex: 1; }
```

Replace with:

```css
.audio-bar {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--paper);
  border: 4px solid var(--ink);
  border-radius: 20px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
  box-shadow: var(--shadow);
}

.play-btn {
  flex: 0 0 64px;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 4px solid var(--ink);
  background: var(--accent);
  color: var(--paper);
  font-size: 24px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow);
  transition: transform 0.05s ease;
  padding: 0;
}
.play-btn:hover { background: var(--accent-deep); }
.play-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 rgba(0,24,88,0.12); }
.play-btn.is-playing { background: var(--accent-deep); }

.audio-progress {
  flex: 1;
  height: 18px;
  background: var(--accent-soft);
  border: 3px solid var(--ink);
  border-radius: 999px;
  overflow: hidden;
  cursor: pointer;
  min-width: 60px;
}
.audio-progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.1s linear;
}

.audio-time {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--ink-soft);
  font-size: 16px;
}
```

- [ ] **Step 2: Append word styles**

At the end of `styles.css`:

```css
/* Word-level narration sync */
.p-text .word {
  background: none;
  border: none;
  padding: 0 2px;
  margin: 0;
  font: inherit;
  font-size: inherit;
  color: inherit;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.1s ease;
}
.p-text .word:hover {
  background: var(--accent-soft);
}
.p-text .word:focus-visible {
  outline: 3px solid var(--accent-deep);
  outline-offset: 1px;
}
.p-text .word.is-current {
  background: var(--sun);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/styles.css
git commit -m "Style new audio player and word-highlight spans"
```

---

## Task 12 — Wire StoryPage to render words and use AudioBar

**Files:**
- Modify: `apps/web/src/routes/StoryPage.tsx`

Render each paragraph as a sequence of word `<button>`s. Mount `<AudioBar>` instead of the native `<audio controls>`, and pass the same audio ref to `useAudioSync`. Apply `is-current` to a 5-word window centered on the active index.

- [ ] **Step 1: Add imports + ref**

At the top of `StoryPage.tsx`, add:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioBar, type AudioBarRef } from '../components/AudioBar';
import { useAudioSync } from '../audioSync';
```

Inside the `StoryPage` component, at the TOP (above all conditional returns — React's Rules of Hooks require hooks to run in the same order every render), declare:

```tsx
const audioRef = useRef<AudioBarRef | null>(null);
const activeIndex = useAudioSync(audioRef, story?.narration_words);
```

`useAudioSync` already returns `-1` when `words` is `undefined` or empty, so calling it before `story` exists is safe.

- [ ] **Step 2: Compute the active-word window**

After the conditional returns (where `story` is guaranteed defined), just before the `return` JSX, compute the window:

```tsx
const words = story.narration_words;
const HALO = 2; // active + 2 on each side = 5-word window
const windowStart = activeIndex - HALO;
const windowEnd = activeIndex + HALO;
```

- [ ] **Step 3: Replace the audio-bar JSX**

Find the existing `{story.narration_url && ...}` block that renders `<div className="audio-bar"><span>{'\u{1F509}'}</span><audio controls ... /></div>` and replace with:

```tsx
{story.narration_url && (
  <AudioBar ref={audioRef} src={story.narration_url} />
)}
```

- [ ] **Step 4: Replace paragraph rendering with word buttons**

Find the existing `{story.paragraphs.map((p, i) => ( ... <div className="p-text">{p.text}</div> ... ))}` block. Replace the `<div className="p-text">{p.text}</div>` with a renderer that splits per paragraph using `words` if present, otherwise falls back to plain text:

```tsx
<div className="p-text">
  {renderParagraph(p.text, i, words, activeIndex, windowStart, windowEnd, audioRef)}
</div>
```

Add the helper at the bottom of the file (alongside `formatDate`):

```tsx
function renderParagraph(
  text: string,
  paragraphIndex: number,
  words: import('../types').WordTiming[] | undefined,
  activeIndex: number,
  windowStart: number,
  windowEnd: number,
  audioRef: React.RefObject<HTMLAudioElement | null>
) {
  if (!words || words.length === 0) {
    return text;
  }
  const wordsForPara = words.filter((w) => w.paragraphIndex === paragraphIndex);
  if (wordsForPara.length === 0) return text;

  // Indexes into the flat words array, used for window comparison.
  const flatIndexes = words
    .map((w, i) => (w.paragraphIndex === paragraphIndex ? i : -1))
    .filter((i) => i >= 0);

  return wordsForPara.map((w, localIdx) => {
    const flatIdx = flatIndexes[localIdx];
    const isCurrent = flatIdx >= windowStart && flatIdx <= windowEnd && activeIndex >= 0;
    return (
      <span key={`${w.paragraphIndex}-${w.wordIndex}`}>
        <button
          type="button"
          className={`word${isCurrent ? ' is-current' : ''}`}
          data-pw={`${w.paragraphIndex}-${w.wordIndex}`}
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            el.currentTime = w.start;
            void el.play();
          }}
        >
          {w.word}
        </button>
        {localIdx < wordsForPara.length - 1 ? ' ' : ''}
      </span>
    );
  });
}
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: green. If there's a complaint about `HTMLAudioElement | null`, ensure the `audioRef` declaration uses `useRef<AudioBarRef | null>(null)` (since `AudioBarRef = HTMLAudioElement`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/StoryPage.tsx
git commit -m "Render paragraph words as buttons; wire AudioBar + useAudioSync"
```

---

## Task 13 — End-to-end verification and deploy

**Files:** none modified.

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: green.

- [ ] **Step 2: Run unit tests**

```bash
npm --workspace apps/web run test
```

Expected: 24 tests pass (10 i18n + 7 words + 7 audioSync).

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: success.

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```

Expected: auto-deploy fires (since the Netlify GitHub link was wired before this plan).

- [ ] **Step 5: Smoke-test the live site (after the deploy lands, ~2 min)**

In a browser:
1. Open https://brennans-story-maker.netlify.app
2. Create a new English story (3 required answers). Wait ~60s for it to build.
3. On the story page:
   - The audio bar shows the big round play/pause button + a progress bar + `0:00 / m:ss`.
   - Click play. A 5-word band lights up in yellow and glides through the paragraphs.
   - Click any word inside any paragraph. Playback jumps to that word and the highlight snaps.
   - Click the progress bar; playback seeks proportionally.
4. Open a *legacy* story (any that was created before this plan landed) at `/s/<old-id>`. The new player still works; words are plain text (no highlight, no click-to-seek) because `narration_words` is missing on that record. Verify the page renders without errors.

- [ ] **Step 6: If any smoke step fails, return to the relevant task and iterate**

Don't claim done until every step passes.

---

## Out-of-scope (deferred to plans 3 and 4)

- **Plan 3 — Adaptive create flow and voice picker.** Story-type opener, moderation redirect, `askVoice` Netlify Function for kid questions, "Say it simpler" + "Help me answer" helpers, slow-speech toggle in the settings cog, per-story voice picker with samples, `voice_id` on `StoryVersion`.
- **Plan 4 — Default story seeding.** `scripts/seed-default-stories.ts`, `scripts/data/pip-source.ts`, sample voice MP3s for the voice picker.
