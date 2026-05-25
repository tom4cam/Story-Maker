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
      tick();
    };
    const onSeek = () => { tick(); };

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPauseOrEnd);
    el.addEventListener('ended', onPauseOrEnd);
    el.addEventListener('seeked', onSeek);

    if (!el.paused && !el.ended) onPlay();
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
