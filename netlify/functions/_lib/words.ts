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
        paraIndexAtChar[cursor + j] = -1;
      }
      cursor += joiner.length;
    }
  }

  const out: WordTiming[] = [];
  const wordIndexByParagraph: number[] = paragraphs.map(() => 0);

  let i = 0;
  while (i < chars.length) {
    while (i < chars.length && /\s/.test(chars[i])) i += 1;
    if (i >= chars.length) break;

    const startIdx = i;
    let endIdx = i;
    while (endIdx < chars.length && !/\s/.test(chars[endIdx])) endIdx += 1;

    const word = chars.slice(startIdx, endIdx).join('');
    const paragraphIndex = paraIndexAtChar[startIdx];
    if (paragraphIndex < 0) {
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
