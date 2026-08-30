import { ApiError } from "./errors.js";

const SUCCESS_TTL_MS = 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 2 * 60 * 1000;
const MAX_ENTRIES = 500;

type Entry = { value?: unknown; error?: ApiError; expiresAt: number };

const store = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

// two things happen here and they solve different problems. the store makes a repeated lookup
// instant. inFlight handles the case the store cannot, several requests for the same profile
// arriving while the first one is still in the air, which on a cold cache would otherwise be
// three calls to linkedin instead of one.
//
// failures are cached too but only PROFILE_NOT_FOUND and only briefly, so a client retrying a
// bad vanity in a loop stops reaching linkedin. a timeout or a dead session is temporary and
// caching it would keep the api broken after the real problem was already fixed.
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const entry = store.get(key);

  if (entry && entry.expiresAt > Date.now()) {
    if (entry.error) throw entry.error;
    return { value: entry.value as T, hit: true };
  }

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return { value: await existing, hit: false };

  const promise = load();
  inFlight.set(key, promise);

  try {
    const value = await promise;
    if (store.size >= MAX_ENTRIES) sweep();
    store.set(key, { value, expiresAt: Date.now() + SUCCESS_TTL_MS });

    return { value, hit: false };
  } catch (err) {
    if (err instanceof ApiError && err.code === "PROFILE_NOT_FOUND") {
      store.set(key, { error: err, expiresAt: Date.now() + NOT_FOUND_TTL_MS });
    }
    throw err;
  } finally {
    inFlight.delete(key);
  }
}

// drops one key so ?refresh=true can force a live fetch
export function invalidate(key: string) {
  store.delete(key);
}

// only runs when the cache grows past its cap, which keeps a long running process from
// leaking memory without needing a background timer
function sweep() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}
