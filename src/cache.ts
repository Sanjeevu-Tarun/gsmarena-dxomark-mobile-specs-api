/**
 * cache.ts — shared Redis + in-memory cache for mobile-specs-enhanced
 *
 * Pattern: mem-first → Redis fallback (same as notebookchecker project).
 * Uses UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env vars.
 * Falls back silently to mem-only if env vars are missing.
 */

import axios from 'axios';

const CACHE_TTL_MS  = 48 * 60 * 60 * 1000; // 48 h (mem TTL check)
const CACHE_TTL_SEC = 48 * 60 * 60;         // 48 h (Redis EX param)
const MEM_CACHE_MAX = 300;

// ── In-process LRU map ────────────────────────────────────────────────────────
const _mem = new Map<string, { data: unknown; time: number }>();

function _memEvict() {
  if (_mem.size < MEM_CACHE_MAX) return;
  const evict = Math.floor(MEM_CACHE_MAX * 0.2);
  const keys = [..._mem.keys()];
  for (let i = 0; i < evict; i++) _mem.delete(keys[i]);
}

function _memGet(k: string): unknown | null {
  const h = _mem.get(k);
  if (!h) return null;
  if (Date.now() - h.time >= CACHE_TTL_MS) { _mem.delete(k); return null; }
  _mem.delete(k); _mem.set(k, h); // move to end (LRU)
  return h.data;
}

function _memSet(k: string, d: unknown) {
  _memEvict();
  _mem.set(k, { data: d, time: Date.now() });
}

// ── Shared axios for Upstash REST calls ───────────────────────────────────────
const _redisAxios = axios.create({
  httpsAgent: new (require('https').Agent)({ keepAlive: true, maxSockets: 20 }),
});

async function _redisGet(k: string): Promise<unknown | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const resp = await _redisAxios.get(`${url}/get/${encodeURIComponent(k)}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const val = resp.data?.result;
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function _redisSet(k: string, d: unknown): Promise<void> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    await _redisAxios.post(
      `${url}/pipeline`,
      [['SET', k, JSON.stringify(d), 'EX', CACHE_TTL_SEC]],
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 25000 },
    );
  } catch { /* non-fatal */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Read: mem → Redis → null */
export async function cacheGet<T>(k: string): Promise<T | null> {
  const mem = _memGet(k);
  if (mem !== null) return mem as T;
  const red = await _redisGet(k);
  if (red !== null) { _memSet(k, red); return red as T; }
  return null;
}

/** Write: mem (sync) + Redis (fire-and-forget) */
export function cacheSet(k: string, d: unknown): void {
  _memSet(k, d);
  _redisSet(k, d).catch(() => { /* non-fatal */ });
}