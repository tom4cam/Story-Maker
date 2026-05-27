// Vitest setup: fix Node 25's broken built-in localStorage stub.
// Node 25 exposes `globalThis.localStorage` as an empty object (no Storage
// methods) when no --localstorage-file is given. jsdom tests need a real
// in-memory Storage. We replace it only when the global lacks .getItem.

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    key(n: number) { return [...store.keys()][n] ?? null; },
    getItem(k: string) { return store.get(k) ?? null; },
    setItem(k: string, v: string) { store.set(k, String(v)); },
    removeItem(k: string) { store.delete(k); },
    clear() { store.clear(); },
  };
}

if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeMemoryStorage(),
    writable: true,
    configurable: true,
  });
}

if (typeof globalThis.sessionStorage === 'undefined' || typeof globalThis.sessionStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: makeMemoryStorage(),
    writable: true,
    configurable: true,
  });
}
