# Story Maker v2 — design spec

**Date:** 2026-05-24
**Owner:** Tom Caswell
**Status:** Draft, ready for review

A round of feature work on Brennan & Linnéa's Story Maker that adds
karaoke-style word highlighting with click-to-seek, a friendlier audio
player, a personalized brand, two seeded default stories, an adaptive
question flow with better TTS, and full English + Swedish support.

## Goals

1. **Word-by-word reading sync.** Highlight a 5-word band that follows the
   narration audio, and let a kid click anywhere in the text to jump the
   audio to that spot.
2. **Friendlier audio player.** A large play/pause button replacing the
   speaker icon, with a clickable progress bar and time display.
3. **Personalization.** Brand the app for Brennan and Linnéa with a
   dedication line.
4. **Two seeded default stories.** Bob's Big Butter Adventure (English)
   and Pip Draken Bakar Ett Bröd (Swedish), so the home page is never
   empty for a first-time visitor.
5. **Adaptive create flow.** A story-type opener, gentle moderation
   redirect, settings cog for slower speech, per-question "say it
   simpler" and "help me answer" (yes/no) fallbacks for less verbal kids.
6. **English + Swedish, end to end.** Story text, narration voice, UI
   chrome, speech recognition. Default by browser language with a manual
   override in the settings cog.

## Non-goals

- Accounts or per-kid namespacing.
- More than two seeded default stories.
- Per-paragraph narration re-use on edit (audio still regenerates fully
  on every save).
- Languages beyond English and Swedish.
- A scrubber UX beyond what a basic progress bar provides.

## Personalization

- **Brand label** in the header on every page:
  - EN: "Brennan & Linnéa's Story Maker"
  - SV: "Brennan & Linnéas Sagomakare"
- **Dedication line** in the hero on the home page and in the footer:
  - EN: "Made with love by Uncle Tom for Brennan and Linnéa's birthdays."
  - SV: "Gjord med kärlek av farbror Tom till Brennans och Linnéas födelsedagar."
- README.md updates with the same dedication and bilingual mention.

## Section 1 — Word-timed audio (features 1 and 2)

### Backend

`netlify/functions/_lib/elevenlabs.ts` changes:

- `synthesize(text, opts)` → returns `{ audio: ArrayBuffer, alignment: CharacterAlignment }`.
- Switch endpoint from `POST /v1/text-to-speech/{voice}` to
  `POST /v1/text-to-speech/{voice}/with-timestamps`. The response is a
  JSON body containing `audio_base64` (the MP3) and `alignment` with
  three parallel arrays: `characters`, `character_start_times_seconds`,
  `character_end_times_seconds`.
- `opts` adds `voiceId?: string`, `modelId?: string`, `speed?: number`.
  Default model stays `eleven_multilingual_v2`, which works for both
  English and Swedish without changes.

`netlify/functions/_lib/words.ts` (new, pure module, easy to unit-test):

```ts
export interface WordTiming {
  paragraphIndex: number;
  wordIndex: number;          // index within paragraph
  word: string;
  start: number;              // seconds
  end: number;
}

export function charsToWords(
  paragraphs: string[],
  alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] },
  joiner = '\n\n'
): WordTiming[]
```

The joiner argument must match the string the backend passes to
`synthesize()` so paragraph boundaries line up.

`buildAndSaveVersion` in `_lib/build.ts`:

- Builds `narrationText = paragraphs.map(p => p.text).join('\n\n')` (no
  change), but now also passes that paragraph array to `charsToWords`
  after synthesis.
- Persists `narration_words: WordTiming[]` on the `StoryVersion`.

### Data model

`netlify/functions/_lib/types.ts` and mirror in `apps/web/src/types.ts`:

```ts
export interface WordTiming { paragraphIndex: number; wordIndex: number; word: string; start: number; end: number; }

export interface StoryVersion {
  // existing fields...
  narration_words?: WordTiming[];   // optional, missing on legacy stories
  language: 'en' | 'sv';            // see Section 5
  voice_id: string;                 // see Section 5
}
```

`narration_words` is optional and the renderer treats its absence as "no
highlighting." This keeps every existing story still readable.

### Frontend

`apps/web/src/routes/StoryPage.tsx`:

- Tokenize each paragraph into words for rendering. Each word becomes a
  `<button type="button" data-w="P-I" class="word">…</button>` element
  (use `<button>` so it is keyboard-accessible and easy to style on
  hover/focus). Whitespace between words is preserved as plain text so
  copy-paste still works.
- A new `useAudioSync(audioRef, words)` hook runs a `requestAnimationFrame`
  loop while `audio.paused === false`. Each tick:
  1. Read `audio.currentTime`.
  2. Binary-search the `words` array for the active index (`start <= t < end`).
  3. If the active index changed, apply `is-current` to indexes
     `[active - 2, active + 2]` clamped to the array bounds, and scroll
     the active word into view smoothly if it would otherwise be off
     screen.
- Click handler on each `.word` element sets
  `audio.currentTime = word.start` and calls `audio.play()`.
- A keyboard `Enter`/`Space` on a focused word does the same.
- Hover/focus styling underlines the word so the affordance is
  discoverable.

### Tests

- `_lib/words.test.ts` — character alignment from ElevenLabs to word
  timings, including punctuation handling, multi-paragraph splits,
  whitespace runs, and the trailing word at the end of a paragraph.
- `apps/web/src/audioSync.test.ts` — given an array of word timings and
  a `currentTime`, returns the right active index and window. Cover
  edge cases (`t < first.start`, `t > last.end`, exact-boundary times).

## Section 2 — Audio player redesign (feature 3)

Replace `<audio controls>` with a custom shell on the same hidden
`<audio>` ref:

```
┌─────────────────────────────────────────────────────┐
│  [ ▶ / ❚❚ ]   ▓▓▓▓▓▓░░░░░░░░░░░   0:23 / 2:14      │
└─────────────────────────────────────────────────────┘
```

- 64×64 round play/pause button using the existing accent palette
  (`--accent` background, `--ink` border, `--paper` icon).
- Progress bar: clickable; click sets `audio.currentTime` proportionally.
  Drag is nice-to-have but not required for v1.
- Time label: `mm:ss / mm:ss`.
- Sticky bar keeps its current position and size.
- New component: `apps/web/src/components/AudioBar.tsx`. Exposes the
  audio ref via `forwardRef` so `StoryPage` can pass it to `useAudioSync`.

No external library.

## Section 3 — Default stories (feature 4)

Two seeded defaults, both built via the existing `buildAndSaveVersion`
pipeline so they get the same word-timings, voice, and storage shape as
user-created stories.

| ID | Title | Lang | Voice | Source |
|---|---|---|---|---|
| `default-bobs-butter` | Bob's Big Butter Adventure | en | Daniel | `default-story.html` (20 stanzas) |
| `default-pip-bread` | (Claude-translated final title, draft: *Pip Draken Bakar Ett Bröd*) | sv | Sanna | The 7-paragraph English Pip story, translated paragraph-by-paragraph via Claude |

### `scripts/seed-default-stories.ts`

A Node script run with `npx tsx scripts/seed-default-stories.ts`. Reads
the same `.env` the Netlify Functions use (so all four API keys plus
`NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` must be available). It does
not need the Netlify Functions runtime — it imports `_lib/build.ts`
directly.

For **Bob**:

1. Read `default-story.html`.
2. Extract the `stanzaData` array via a tiny regex pull (the literal is
   already in the file, plain quoted strings).
3. Build paragraphs as `{ text: stanza, image_prompt: <from regenerateImagePrompt(stanza, title)> }`.
4. Call `buildAndSaveVersion({ id: 'default-bobs-butter', version: 1, title: "Bob's Big Butter Adventure", language: 'en', voiceId: <Daniel>, paragraphs, sourceAnswers: [] })`.

For **Pip-sv**:

1. Hard-code the 7 English paragraphs and English image_prompts in
   `scripts/data/pip-source.ts` (lifted from the existing prod story).
2. Translate title and paragraphs via Claude with a prompt: *"Translate
   this children's story into warm, simple Swedish suitable for ages
   3–6. Keep paragraph breaks. Translate the title too. Keep proper
   names (Pip, Marta) unchanged. Return JSON with `title` and
   `paragraphs` (array of strings)."*
3. Reuse the English `image_prompt` strings as-is (Fal performs best in
   English regardless of story language).
4. Call `buildAndSaveVersion({ id: 'default-pip-bread', version: 1, title: <translated>, language: 'sv', voiceId: <Sanna>, paragraphs, sourceAnswers: [] })`.

Re-running the script overwrites both IDs in place — idempotent. The
HomePage already lists `status: 'ready'` stories sorted by
`updated_at`, so both defaults show up alongside user-created ones with
no HomePage code change required.

### Voice samples

Same script also (re)generates `apps/web/public/voice-samples/{voiceKey}.mp3`
for each of the 4 catalog voices, used by the voice picker (Section 5).

## Section 4 — Adaptive create flow (feature 5)

### Story-type opener

A new first step on `CreatePage`: *"What kind of story do you want?"*

- Quick-pick chips: Adventure, Silly, Animal friends, Bedtime calm,
  Magic, Mystery, Surprise me. Plus a free-text fallback.
- Selecting a chip moves to the next step immediately. Free text uses
  the existing Next button.
- The chosen type becomes the first answer and is prepended to the
  Claude prompt so it shapes genre and tone.

### Moderation redirect

When a kid types something that violates moderation:

- Before submitting, the opener answer is moderated client-side via the
  existing `POST /moderate` endpoint. Any subsequent free-text answer is
  also moderated.
- On `flagged`, the page shows a warm message instead of an error:
  > "Let's pick something different. How about one of these?"
  With three safe story-type chips (Adventure, Silly, Animal friends).
- Server-side moderation in `_lib/build.ts` stays as the final guard for
  anything that slips through.

### Settings cog

Top-right of every CreatePage (and HomePage, since the UI-language
toggle lives there too):

- Cog icon button opens a popover.
- One toggle: **Slow speech** — when on, all question audio plays at
  `speed: 0.75` via ElevenLabs.
- One toggle: **Language: English / Svenska** (see Section 5).
- Persisted in `localStorage.storyMaker.prefs` as `{ slow: bool, lang: 'en'|'sv' }`.

### Better TTS for questions

New function `netlify/functions/askVoice.ts`:

- `POST /.netlify/functions/askVoice` — body `{ text: string, language: 'en'|'sv', voiceId?: string, speed?: number }`. Returns `audio/mpeg`.
- Internally calls the same ElevenLabs synthesis path used for story
  narration (no timestamps needed here — questions are short).
- Sets `Cache-Control: public, max-age=86400` so the browser cache picks
  up repeats within a session.

Frontend `apps/web/src/speech.ts`:

- New `playAskVoice(text, opts)` that POSTs to `/askVoice`, creates an
  object URL from the blob, plays via a hidden `<audio>` element.
- An in-memory `Map<cacheKey, Blob>` keyed on `${lang}|${voice}|${speed}|${text}` for instant repeats.
- New `speakBest(text, opts)` wrapper: tries `playAskVoice`; on any
  failure (network, API error, slow first-byte timeout of 1.5s), falls
  back to the existing browser `speak()`.

All current `speak(q.spoken)` call sites switch to `speakBest(q.spoken, { lang })`.

### Per-question "Say it simpler"

Each `Question` entry gets an optional `simpler?: { en: string; sv: string }` field with a hand-written easier phrasing.

- Button appears under the question label only when a `simpler` exists.
- Clicking it swaps the displayed and spoken text to the simpler
  version. Clicking again toggles back to the original.

### Per-question "Help me answer" (yes/no fallback)

Each `Question` entry gets an optional `yesNo?: YesNoNode` decision tree:

```ts
type YesNoNode = {
  prompt: { en: string; sv: string };
  yes: YesNoNode | { answer: { en: string; sv: string } };
  no:  YesNoNode | { answer: { en: string; sv: string } };
};
```

- Button appears only when a tree exists.
- Entering the mini-flow swaps the card to two big buttons (Yes / No)
  under the current yes/no prompt. Each click descends the tree. Leaves
  fill the textarea with the composed answer (kid can still edit).
- Backs out cleanly with a "Cancel" link.

Yes/no trees ship for the three required questions (hero, setting,
goal). Optional questions (friend, problem, ending) are skippable, so
they don't need a tree to be useful.

## Section 5 — Bilingual support (EN + SV)

### i18n plumbing

New `apps/web/src/i18n/`:

- `strings/en.ts` and `strings/sv.ts` — flat objects of dotted keys
  (`home.cta`, `create.next`, `error.flagged`, `dedication.line`, …).
- `LangProvider` (React context) wraps the app at `main.tsx`.
- `useT()` hook returns `t(key, vars?)`.
- Initial language: `localStorage.storyMaker.prefs.lang` if set,
  otherwise `navigator.language.startsWith('sv') ? 'sv' : 'en'`.
- Setting language updates the context, the `localStorage`, and the
  `<html lang>` attribute.

No external i18n library. The whole module is ~50 lines.

### Story language as a data field

`StoryVersion.language: 'en' | 'sv'` is required for new stories. On
read, missing field defaults to `'en'` so old stories render.

### Per-story language pick

A new step at the start of the create flow, before the story-type
opener: *"English or Svenska?"* — two big buttons. Pre-selected to the
UI language but the kid can switch per story.

### Claude prompt updates

`generateStory(answers, language)` in `_lib/anthropic.ts`:

- Adds an explicit instruction:
  > "Write the story title and every paragraph's text in {language}.
  > Keep each `image_prompt` in English so the image model understands
  > it. Use proper Swedish spelling and punctuation where applicable."
- The system prompt language is unchanged (still English to the model).

`regenerateImagePrompt(text, title)` is unchanged — output is always
English regardless of input language. Claude is good at this.

### Browser STT language hint

`apps/web/src/speech.ts`:

- `listenOnce(onResult, onError, opts?: { lang?: 'en-US' | 'sv-SE' })`.
- Default `'en-US'` for backwards compatibility; `CreatePage` passes the
  current story language.

### Moderation

OpenAI omni-moderation handles Swedish without a language hint. No
changes to `_lib/moderation.ts`.

### Voice picker

New `apps/web/src/voices.ts` catalog:

```ts
export interface VoiceMeta {
  key: 'daniel' | 'rachel' | 'sanna' | 'adam';
  displayName: string;
  language: 'en' | 'sv';
  gender: 'm' | 'f';
  elevenlabsVoiceId: string;   // filled in during implementation
  sampleUrl: string;           // /voice-samples/{key}.mp3
}
```

Final ElevenLabs voice IDs are placeholders in the spec; implementation
picks them by listening to the ElevenLabs voice library and recording
sample URLs in the catalog file. **TBD-impl: confirm IDs for Rachel,
Sanna, Adam.**

Picker UI on `CreatePage` (right before "Make my story"):

- A list of voice rows: display name + language tag + gender tag +
  "▶ Play sample" button + radio selector.
- Default selection follows story language (Daniel for `en`, Sanna for `sv`).
- Samples are pre-generated MP3s in `apps/web/public/voice-samples/`.
- Sample script:
  - EN: "Hi, I'm {name}. I love telling stories."
  - SV: "Hej, jag heter {name}. Jag älskar att berätta sagor."

Selected `voiceId` is sent to `createStory` and stored on `StoryVersion`.
Edits re-use it.

### Strings inventory

Approximately 120 short strings total, split across:

- ~50 UI chrome strings (header, buttons, errors, helpers).
- ~70 question-flow strings (story-type chips, question prompts/spoken
  /placeholders, simpler variants, yes/no nodes — all bilingual).
- ~2 dedication lines.

All strings live in `strings/en.ts` and `strings/sv.ts`. Translation
work happens during implementation (Tom or a Swedish-fluent reviewer).

## API surface changes

| Function | Change |
|---|---|
| `POST /createStory` | Body adds `language: 'en'\|'sv'` and `voiceId: string`. Both required. |
| `POST /updateStory` | Body adds `voiceId?: string` (defaults to existing story's voice). Language is immutable per story. |
| `GET /getStory` | Response includes `language`, `voice_id`, `narration_words`. |
| `POST /askVoice` | **New.** `{ text, language, voiceId?, speed? }` → `audio/mpeg`. |
| `POST /moderate` | No change. |

## Storage shape

`StoryVersion` JSON in Netlify Blobs gains three fields:

```jsonc
{
  // existing...
  "language": "en",
  "voice_id": "<elevenlabs id>",
  "narration_words": [
    { "paragraphIndex": 0, "wordIndex": 0, "word": "High", "start": 0.00, "end": 0.18 },
    // ...
  ]
}
```

Estimated bloat: a 7-paragraph story with ~120 words adds ~12 KB of
JSON. Acceptable for Netlify Blobs.

## Failure modes

- **ElevenLabs `/with-timestamps` returns an error.** Fall back to plain
  `/text-to-speech` so the audio still ships, and persist
  `narration_words: undefined` so the renderer just doesn't highlight.
  Log the failure.
- **`/askVoice` slow or down.** Frontend falls back to browser TTS
  silently after a 1.5s first-byte timeout.
- **STT not available** (Safari, Firefox). Existing typed-fallback path
  already covers this.
- **Translation API failure during seed.** Script logs the error and
  exits non-zero; nothing partial is written.
- **Voice sample missing.** Player shows the picker without a sample
  button rather than failing.

## Risks and assumptions

- ElevenLabs `/with-timestamps` is at the same price as regular TTS.
  Confirmed via current docs at the time of writing.
- The Daniel voice on `eleven_multilingual_v2` is the current default
  and works in English. The Swedish voices (Sanna, Adam) and the en-US
  female (Rachel) are placeholders to be confirmed by listening during
  implementation.
- Browser STT in `sv-SE` works in Chrome/Edge on macOS, Windows, and
  Android. Untested on iOS Safari (probably falls back to typing).
- Total per-flow ElevenLabs cost (7 questions × 1 narration generation)
  is on the order of a few cents per story. The hybrid mode (browser
  default with an opt-in better-voice button) is a small revert if cost
  grows.

## Open questions for implementation time

- Final ElevenLabs voice IDs for Rachel, Sanna, Adam.
- Confirmation of the Swedish dedication line phrasing with a native
  Swedish speaker.
- Whether to pin the two default stories at the top of the home
  carousel or let them sort naturally by `updated_at`. (Default: sort
  naturally; revisit if it feels wrong.)

## Testing strategy

- **Unit (pure functions):** `charsToWords`, the active-word selector,
  the yes/no-tree composer, `LangProvider` resolution of initial language.
- **Manual smoke tests** (documented in the eventual implementation
  plan): play a story end-to-end, click-to-seek into different
  paragraphs, toggle slow speech mid-flow, exercise the moderation
  redirect with a flagged phrase, switch UI language, generate a Swedish
  story, run the seed script and verify both defaults appear.
- **`npm run typecheck`** stays green across the whole repo.

## File-level summary

New files:

- `netlify/functions/_lib/words.ts`
- `netlify/functions/askVoice.ts`
- `apps/web/src/components/AudioBar.tsx`
- `apps/web/src/audioSync.ts`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/i18n/strings/en.ts`
- `apps/web/src/i18n/strings/sv.ts`
- `apps/web/src/voices.ts`
- `apps/web/public/voice-samples/{daniel,rachel,sanna,adam}.mp3`
- `scripts/seed-default-stories.ts`
- `scripts/data/pip-source.ts`

Touched files:

- `netlify/functions/_lib/elevenlabs.ts` (switch to `/with-timestamps`)
- `netlify/functions/_lib/build.ts` (word timings, language, voice)
- `netlify/functions/_lib/types.ts` and `apps/web/src/types.ts`
- `netlify/functions/_lib/anthropic.ts` (language-aware prompt)
- `netlify/functions/createStory.ts`, `createWorker-background.ts`,
  `updateStory.ts`, `updateWorker-background.ts` (carry language/voice)
- `apps/web/src/routes/StoryPage.tsx` (word spans, audio bar, sync)
- `apps/web/src/routes/CreatePage.tsx` (opener, language step, voice
  picker, settings, helpers, moderation redirect, i18n)
- `apps/web/src/routes/HomePage.tsx` (brand, dedication, settings,
  language toggle, i18n)
- `apps/web/src/components/Layout.tsx` (header brand, settings cog,
  language toggle)
- `apps/web/src/components/MicInput.tsx` (STT language hint)
- `apps/web/src/speech.ts` (`playAskVoice`, `speakBest`, STT lang opt)
- `apps/web/src/api.ts` (new fields on requests/responses)
- `apps/web/src/styles.css` (word styles, audio bar, settings cog,
  voice picker, helper buttons)
- `README.md` (bilingual mention, dedication)
- `package.json` (add `tsx` devDependency for the seed script)
