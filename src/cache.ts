/**
 * cache.ts — shared Redis + in-memory cache
 *
 * Layer 1 : In-process LRU map  (bounded to MEM_CACHE_MAX entries, NO TTL — infinite)
 * Layer 2 : Upstash Redis REST  (no EX — persist indefinitely)
 *
 * Cache invalidation is handled by bumping the version in the cache key
 * (e.g. gsm:phone-full:v2 → v3) whenever scraping logic changes.
 * Old versioned keys are simply never read again.
 *
 * Env vars required for Redis:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 * Falls back silently to mem-only if they are missing.
 */

import axios from 'axios';
import https from 'https';

const MEM_CACHE_MAX = 500; // max entries kept in process memory

// ── In-process LRU map ────────────────────────────────────────────────────────
// NO TTL — entries live until evicted by capacity.
const _mem = new Map<string, { data: unknown }>();

function _memEvict(): void {
  if (_mem.size < MEM_CACHE_MAX) return;
  // Evict oldest 20% (Map preserves insertion order → first entries are oldest).
  const evict = Math.ceil(MEM_CACHE_MAX * 0.2);
  const keys = _mem.keys();
  for (let i = 0; i < evict; i++) {
    const next = keys.next();
    if (next.done) break;
    _mem.delete(next.value);
  }
}

function _memGet(k: string): unknown | null {
  const h = _mem.get(k);
  if (!h) return null;
  // LRU touch: delete then re-insert so it moves to the tail (most recently used).
  _mem.delete(k);
  _mem.set(k, h);
  return h.data;
}

function _memSet(k: string, d: unknown): void {
  _memEvict();
  // Delete first so re-inserted key lands at the tail.
  _mem.delete(k);
  _mem.set(k, { data: d });
}

// ── Shared axios instance for Upstash REST calls ──────────────────────────────
const _redisAxios = axios.create({
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 20 }),
});

function _redisCredentials(): { url: string; token: string } | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function _redisGet(k: string): Promise<unknown | null> {
  const creds = _redisCredentials();
  if (!creds) return null;
  try {
    const resp = await _redisAxios.get(
      `${creds.url}/get/${encodeURIComponent(k)}`,
      { headers: { Authorization: `Bearer ${creds.token}` }, timeout: 10_000 },
    );
    const val = resp.data?.result;
    return val != null ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function _redisSet(k: string, d: unknown): Promise<void> {
  const creds = _redisCredentials();
  if (!creds) return;
  try {
    // No EX flag — persist indefinitely.
    await _redisAxios.post(
      `${creds.url}/pipeline`,
      [['SET', k, JSON.stringify(d)]],
      {
        headers: {
          Authorization: `Bearer ${creds.token}`,
          'Content-Type': 'application/json',
        },
        timeout: 25_000,
      },
    );
  } catch {
    /* non-fatal — Redis write failures must never crash the request */
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export type CacheSource = 'mem' | 'redis' | 'miss';

export interface CacheResult<T> {
  data: T | null;
  source: CacheSource;
}

/** Read with source info: mem → Redis → null */
export async function cacheGetWithSource<T>(k: string): Promise<CacheResult<T>> {
  const mem = _memGet(k);
  if (mem !== null) return { data: mem as T, source: 'mem' };

  const red = await _redisGet(k);
  if (red !== null) {
    _memSet(k, red);
    return { data: red as T, source: 'redis' };
  }

  return { data: null, source: 'miss' };
}

/** Read: mem → Redis → null (convenience wrapper) */
export async function cacheGet<T>(k: string): Promise<T | null> {
  return (await cacheGetWithSource<T>(k)).data;
}

/** Write: mem (sync) + Redis (fire-and-forget, non-fatal) */
export function cacheSet(k: string, d: unknown): void {
  _memSet(k, d);
  _redisSet(k, d).catch(() => { /* non-fatal */ });
}
