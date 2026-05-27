// Stable per-visitor id. Stored in a 1-year first-party cookie (read
// by the server) and mirrored to localStorage as a self-heal fallback
// in case one storage gets cleared but not the other.

export const COOKIE_NAME = 'creator_id';
export const STORAGE_KEY = 'storyMaker.creatorId';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

function readCookie(): string | null {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${COOKIE_NAME}=`)) continue;
    const raw = trimmed.slice(COOKIE_NAME.length + 1);
    if (!raw) return null;
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return null;
}

function writeCookie(id: string): void {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

function readStorage(): string | null {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function writeStorage(id: string): void {
  try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}

export function getCreatorId(): string {
  let id = readCookie() ?? readStorage();
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `cid-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  }
  writeCookie(id);
  writeStorage(id);
  return id;
}
