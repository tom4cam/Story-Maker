// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getCreatorId, COOKIE_NAME, STORAGE_KEY } from './creatorId';

beforeEach(() => {
  document.cookie = `${COOKIE_NAME}=; Max-Age=0; path=/`;
  window.localStorage.removeItem(STORAGE_KEY);
});

describe('getCreatorId', () => {
  it('generates and persists an id on first call', () => {
    const id = getCreatorId();
    expect(id).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(document.cookie).toContain(`${COOKIE_NAME}=${id}`);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(id);
  });

  it('returns the same id on subsequent calls', () => {
    const a = getCreatorId();
    const b = getCreatorId();
    expect(a).toBe(b);
  });

  it('recovers from localStorage if cookie was cleared', () => {
    window.localStorage.setItem(STORAGE_KEY, 'stored-id-123');
    expect(getCreatorId()).toBe('stored-id-123');
    expect(document.cookie).toContain('creator_id=stored-id-123');
  });

  it('recovers from cookie if localStorage was cleared', () => {
    document.cookie = `${COOKIE_NAME}=cookie-id-456; path=/`;
    expect(getCreatorId()).toBe('cookie-id-456');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('cookie-id-456');
  });
});
