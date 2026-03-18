/**
 * parser.dxomark.ts
 *
 * DXOMark scraper — three-tier strategy:
 *
 *  Tier 1 — __NEXT_DATA__ JSON blob (SSR data embedded in the HTML page).
 *            DXOMark is a Next.js app. All scores, pros/cons, rankings are
 *            server-rendered inside <script id="__NEXT_DATA__"> as JSON.
 *            No JS execution needed — cheerio extracts the tag, JSON.parse gives us everything.
 *
 *  Tier 2 — DXOMark GraphQL API (https://www.dxomark.com/graphql).
 *            If __NEXT_DATA__ parsing fails or returns nulls, hit their
 *            internal GraphQL endpoint which the React app uses at runtime.
 *
 *  Tier 3 — Heuristic cheerio scraping of visible HTML text as last resort.
 *
 * URL resolution:
 *  1. Build canonical slug: "samsung galaxy s25 ultra" -> "samsung-galaxy-s25-ultra-test"
 *  2. HEAD-check that URL - if 200, use it directly.
 *  3. Fall back to DXOMark WP REST API: /wp-json/wp/v2/test?search=...
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { cacheGet, cacheSet } from '../cache';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface IDxoScore {
  device: string;
  url: string;
  /** Overall DXOMARK smartphone score */
  overallScore: number | null;
  scores: {
    photo: number | null;
    video: number | null;
    audio: number | null;
    display: number | null;
    zoom: number | null;
    bokeh: number | null;
    lowLight: number | null;
    selfie: number | null;
  };
  /** Camera strengths (pros) from DXOMark verdict */
  strengths: string[];
  /** Camera weaknesses (cons) from DXOMark verdict */
  weaknesses: string[];
  /** e.g. "#3 Best Smartphone Camera" */
  rankLabel: string | null;
  rankPosition: number | null;
  scrapedAt: string;
  /** Which tier successfully extracted data */
  _source: 'next_data' | 'graphql' | 'html' | 'failed';
}

export interface IDxoSearchResult {
  name: string;
  url: string;
  score: number | null;
  slug: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DXO_BASE = 'https://www.dxomark.com';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

const JSON_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.dxomark.com',
  'Referer': 'https://www.dxomark.com/',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getDxoHtml(url: string): Promise<string> {
  const { data } = await axios.get(url, {
    headers: HEADERS,
    timeout: 15000,
    maxRedirects: 5,
  });
  return typeof data === 'string' ? data : JSON.stringify(data);
}

function safeInt(val: any): number | null {
  if (val === null || val === undefined) return null;
  const n = typeof val === 'number' ? val : parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function deepFind(obj: any, key: string, maxDepth = 8): any {
  if (maxDepth <= 0 || obj === null || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const found = deepFind(v, key, maxDepth - 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function deepCollect(obj: any, key: string, maxDepth = 8): any[] {
  if (maxDepth <= 0 || obj === null || typeof obj !== 'object') return [];
  const results: any[] = [];
  if (key in obj) results.push(obj[key]);
  for (const v of Object.values(obj)) {
    results.push(...deepCollect(v, key, maxDepth - 1));
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1 — Parse __NEXT_DATA__ JSON blob
// DXOMark is Next.js SSR — all data is embedded in <script id="__NEXT_DATA__">
// ─────────────────────────────────────────────────────────────────────────────

function parseNextData(html: string, pageUrl: string): IDxoScore | null {
  const $ = cheerio.load(html);
  const scriptContent = $('script#__NEXT_DATA__').html();
  if (!scriptContent) return null;

  let nextData: any;
  try {
    nextData = JSON.parse(scriptContent);
  } catch {
    return null;
  }

  const pageProps = nextData?.props?.pageProps ?? {};

  // --- Overall score ---
  const scoreKeys = ['score', 'totalScore', 'overallScore', 'dxomarkScore', 'rankingScore', 'global_score'];
  let overallScore: number | null = null;
  for (const k of scoreKeys) {
    const v = safeInt(deepFind(pageProps, k));
    if (v !== null && v >= 50 && v <= 200) { overallScore = v; break; }
  }

  // --- Device name ---
  const device =
    deepFind(pageProps, 'title') ||
    deepFind(pageProps, 'name') ||
    deepFind(pageProps, 'deviceName') ||
    deepFind(pageProps, 'productName') ||
    $('meta[property="og:title"]').attr('content') ||
    '';

  // --- Sub-scores ---
  const scores = {
    photo: null as number | null,
    video: null as number | null,
    audio: null as number | null,
    display: null as number | null,
    zoom: null as number | null,
    bokeh: null as number | null,
    lowLight: null as number | null,
    selfie: null as number | null,
  };

  const scoreMapping: Record<string, string[]> = {
    photo:    ['photo', 'photoScore', 'photo_score', 'image'],
    video:    ['video', 'videoScore', 'video_score'],
    audio:    ['audio', 'audioScore', 'audio_score', 'sound'],
    display:  ['display', 'displayScore', 'display_score', 'screen'],
    zoom:     ['zoom', 'zoomScore', 'telephoto'],
    bokeh:    ['bokeh', 'bokehScore', 'portrait'],
    lowLight: ['lowlight', 'low_light', 'lowLight', 'night', 'nightScore'],
    selfie:   ['selfie', 'selfieScore', 'front', 'frontCamera'],
  };

  for (const [field, aliases] of Object.entries(scoreMapping)) {
    for (const alias of aliases) {
      const raw = deepFind(pageProps, alias);
      const v = safeInt(typeof raw === 'object' && raw !== null ? (raw?.value ?? raw?.score ?? null) : raw);
      if (v !== null && v >= 20 && v <= 200) {
        (scores as any)[field] = v;
        break;
      }
    }
  }

  // --- Strengths & Weaknesses ---
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  const prosKeys = ['pros', 'strengths', 'advantages', 'positives', 'highlights'];
  const consKeys = ['cons', 'weaknesses', 'disadvantages', 'negatives', 'drawbacks'];

  const extractStrings = (vals: any[]): string[] => {
    const out: string[] = [];
    for (const v of vals) {
      if (Array.isArray(v)) {
        v.forEach((item: any) => {
          const txt = typeof item === 'string' ? item : (item?.text || item?.content || item?.title || '');
          if (txt && txt.length > 3) out.push(txt.trim());
        });
      } else if (typeof v === 'string' && v.length > 3) {
        out.push(v.trim());
      }
    }
    return out;
  };

  for (const k of prosKeys) strengths.push(...extractStrings(deepCollect(pageProps, k)));
  for (const k of consKeys) weaknesses.push(...extractStrings(deepCollect(pageProps, k)));

  // --- Ranking ---
  let rankLabel: string | null = null;
  let rankPosition: number | null = null;
  const rankRaw = deepFind(pageProps, 'rank') ?? deepFind(pageProps, 'ranking') ?? deepFind(pageProps, 'rankingPosition');
  if (rankRaw !== undefined) {
    rankPosition = safeInt(typeof rankRaw === 'object' && rankRaw !== null ? rankRaw?.position : rankRaw);
    if (rankPosition) rankLabel = `#${rankPosition} Best Smartphone Camera`;
  }

  if (!overallScore && !scores.photo && !scores.video && strengths.length === 0) return null;

  return {
    device: String(device).replace(/\s*[\|\-\u2013]\s*DXO.*$/i, '').trim(),
    url: pageUrl,
    overallScore,
    scores,
    strengths: [...new Set(strengths)].slice(0, 12),
    weaknesses: [...new Set(weaknesses)].slice(0, 12),
    rankLabel,
    rankPosition,
    scrapedAt: new Date().toISOString(),
    _source: 'next_data',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2 — DXOMark GraphQL API
// ─────────────────────────────────────────────────────────────────────────────

const GRAPHQL_URL = `${DXO_BASE}/graphql`;

const GQL_DEVICE_SCORES = `
query GetDeviceScores($slug: String!) {
  post(id: $slug, idType: SLUG) {
    title
    slug
    dxomarkFields {
      score
      photoScore
      videoScore
      audioScore
      displayScore
      rankingPosition
      pros { content }
      cons { content }
    }
  }
}`;

const GQL_DEVICE_FULL = `
query GetDeviceFull($slug: String!) {
  deviceBySlug(slug: $slug) {
    name
    score
    scores { photo video zoom bokeh lowlight selfie }
    pros
    cons
    rankingPosition
  }
}`;

async function queryGraphQL(slug: string, pageUrl: string): Promise<IDxoScore | null> {
  const cleanSlug = slug.replace(/\/$/, '').replace(/.*\//, '');

  for (const query of [GQL_DEVICE_SCORES, GQL_DEVICE_FULL]) {
    try {
      const resp = await axios.post(
        GRAPHQL_URL,
        { query, variables: { slug: cleanSlug } },
        { headers: { ...JSON_HEADERS, 'Content-Type': 'application/json' }, timeout: 12000 }
      );

      const data = resp.data?.data;
      if (!data) continue;

      const post = data.post;
      if (post) {
        const f = post.dxomarkFields ?? {};
        const pros: string[] = (f.pros ?? []).map((p: any) => p?.content || p).filter(Boolean);
        const cons: string[] = (f.cons ?? []).map((c: any) => c?.content || c).filter(Boolean);
        const rank = safeInt(f.rankingPosition);
        return {
          device: post.title || cleanSlug,
          url: pageUrl,
          overallScore: safeInt(f.score),
          scores: {
            photo: safeInt(f.photoScore), video: safeInt(f.videoScore),
            audio: safeInt(f.audioScore), display: safeInt(f.displayScore),
            zoom: null, bokeh: null, lowLight: null, selfie: null,
          },
          strengths: pros.slice(0, 12),
          weaknesses: cons.slice(0, 12),
          rankLabel: rank ? `#${rank} Best Smartphone Camera` : null,
          rankPosition: rank,
          scrapedAt: new Date().toISOString(),
          _source: 'graphql',
        };
      }

      const device = data.deviceBySlug;
      if (device) {
        const s = device.scores ?? {};
        const rank = safeInt(device.rankingPosition);
        const toStrings = (arr: any[]) =>
          Array.isArray(arr) ? arr.map((x: any) => (typeof x === 'string' ? x : x?.content || '')).filter(Boolean) : [];
        return {
          device: device.name || cleanSlug,
          url: pageUrl,
          overallScore: safeInt(device.score),
          scores: {
            photo: safeInt(s.photo), video: safeInt(s.video),
            audio: null, display: null,
            zoom: safeInt(s.zoom), bokeh: safeInt(s.bokeh),
            lowLight: safeInt(s.lowlight), selfie: safeInt(s.selfie),
          },
          strengths: toStrings(device.pros).slice(0, 12),
          weaknesses: toStrings(device.cons).slice(0, 12),
          rankLabel: rank ? `#${rank} Best Smartphone Camera` : null,
          rankPosition: rank,
          scrapedAt: new Date().toISOString(),
          _source: 'graphql',
        };
      }
    } catch { /* try next query */ }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 3 — Heuristic HTML scraping (last resort)
// ─────────────────────────────────────────────────────────────────────────────

function parseHtmlFallback(html: string, pageUrl: string): IDxoScore {
  const $ = cheerio.load(html);

  const device =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.replace(/\s*[\|\-]\s*DXO.*$/i, '').trim() ||
    '';

  let overallScore: number | null = null;
  $('[class*="score"],[class*="Score"],[class*="rank"],[class*="Rank"]').each((_, el) => {
    if (overallScore) return false;
    if ($(el).children('[class*="score"],[class*="Score"]').length > 0) return;
    const txt = $(el).text().replace(/\D/g, '').trim();
    const n = parseInt(txt, 10);
    if (!isNaN(n) && n >= 50 && n <= 200) overallScore = n;
  });

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  $('li').each((_, el) => {
    const txt = $(el).text().trim();
    const cls = ($(el).attr('class') || '').toLowerCase();
    if (cls.includes('pro') || cls.includes('strength') || txt.startsWith('+')) {
      if (txt.length > 4) strengths.push(txt.replace(/^\+\s*/, ''));
    } else if (cls.includes('con') || cls.includes('weakness') || txt.startsWith('-') || txt.startsWith('\u2212')) {
      if (txt.length > 4) weaknesses.push(txt.replace(/^[\-\u2212]\s*/, ''));
    }
  });

  return {
    device: device.trim(),
    url: pageUrl,
    overallScore,
    scores: { photo: null, video: null, audio: null, display: null, zoom: null, bokeh: null, lowLight: null, selfie: null },
    strengths: [...new Set(strengths)].slice(0, 12),
    weaknesses: [...new Set(weaknesses)].slice(0, 12),
    rankLabel: null,
    rankPosition: null,
    scrapedAt: new Date().toISOString(),
    _source: 'html',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// URL resolution
// ─────────────────────────────────────────────────────────────────────────────

function buildDxoSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '-') + '-test';
}

export async function searchDxo(query: string): Promise<IDxoSearchResult[]> {
  const ck = `dxo:search:v2:${query.toLowerCase().trim()}`;
  const cached = await cacheGet<IDxoSearchResult[]>(ck);
  if (cached) return cached;

  // Strategy A: WP REST API (JSON, no scraping needed)
  try {
    const resp = await axios.get(`${DXO_BASE}/wp-json/wp/v2/test`, {
      params: { search: query, per_page: 10, _fields: 'id,slug,title,link,dxomark_score' },
      headers: JSON_HEADERS,
      timeout: 10000,
    });
    if (Array.isArray(resp.data) && resp.data.length > 0) {
      const results: IDxoSearchResult[] = resp.data.map((post: any) => ({
        name: post.title?.rendered || post.slug,
        url: post.link || `${DXO_BASE}/${post.slug}/`,
        slug: post.slug,
        score: safeInt(post.dxomark_score ?? post.acf?.score ?? null),
      }));
      cacheSet(ck, results, 3600);
      return results;
    }
  } catch { /* fall through */ }

  // Strategy B: HTML search page
  try {
    const html = await getDxoHtml(`${DXO_BASE}/?s=${encodeURIComponent(query)}&post_type=test`);
    const $ = cheerio.load(html);
    const results: IDxoSearchResult[] = [];
    $('article, .search-item, .post').each((_, el) => {
      const a = $(el).find('a[href*="dxomark.com"]').first();
      const href = a.attr('href') || '';
      if (!href.includes('dxomark.com') || href === DXO_BASE + '/') return;
      const name = $(el).find('h2, h3, .entry-title, .title').first().text().trim() || a.text().trim();
      const slug = href.replace(/^https?:\/\/www\.dxomark\.com\//, '').replace(/\/$/, '');
      results.push({ name, url: href, slug, score: null });
    });
    const unique = [...new Map(results.map(r => [r.url, r])).values()];
    if (unique.length > 0) cacheSet(ck, unique, 3600);
    return unique;
  } catch {
    return [];
  }
}

export async function findDxoUrl(deviceName: string): Promise<string | null> {
  const ck = `dxo:url:v2:${deviceName.toLowerCase().trim()}`;
  const cached = await cacheGet<string>(ck);
  if (cached) return cached;

  // 1. Canonical slug direct hit
  const slug = buildDxoSlug(deviceName);
  const candidateUrl = `${DXO_BASE}/${slug}/`;
  try {
    const resp = await axios.head(candidateUrl, { headers: HEADERS, timeout: 8000, maxRedirects: 3 });
    if (resp.status < 400) {
      cacheSet(ck, candidateUrl, 86400);
      return candidateUrl;
    }
  } catch { /* fall through */ }

  // 2. Search-based resolution with trigram similarity
  const results = await searchDxo(deviceName);
  if (results.length === 0) return null;

  const normalQuery = deviceName.toLowerCase().replace(/[^a-z0-9]/g, '');
  let best: IDxoSearchResult | null = null;
  let bestRatio = -1;

  for (const r of results) {
    const normalName = r.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const queryTri = new Set<string>();
    const nameTri = new Set<string>();
    for (let i = 0; i < normalQuery.length - 2; i++) queryTri.add(normalQuery.slice(i, i + 3));
    for (let i = 0; i < normalName.length - 2; i++) nameTri.add(normalName.slice(i, i + 3));
    const intersection = [...queryTri].filter(t => nameTri.has(t)).length;
    const union = new Set([...queryTri, ...nameTri]).size;
    const ratio = union > 0 ? intersection / union : 0;
    if (ratio > bestRatio) { bestRatio = ratio; best = r; }
  }

  const winner = (best && bestRatio > 0.3) ? best : results[0];
  if (winner) { cacheSet(ck, winner.url, 86400); return winner.url; }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scrape — tries all 3 tiers
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeDxoPage(pageUrl: string): Promise<IDxoScore> {
  const ck = `dxo:page:v2:${pageUrl}`;
  const cached = await cacheGet<IDxoScore>(ck);
  if (cached) return cached;

  let html = '';
  try {
    html = await getDxoHtml(pageUrl);
  } catch {
    const failed: IDxoScore = {
      device: '', url: pageUrl, overallScore: null,
      scores: { photo: null, video: null, audio: null, display: null, zoom: null, bokeh: null, lowLight: null, selfie: null },
      strengths: [], weaknesses: [], rankLabel: null, rankPosition: null,
      scrapedAt: new Date().toISOString(), _source: 'failed',
    };
    return failed;
  }

  // TIER 1: __NEXT_DATA__
  const tier1 = parseNextData(html, pageUrl);
  if (tier1 && (tier1.overallScore || tier1.strengths.length > 0)) {
    cacheSet(ck, tier1, 21600);
    return tier1;
  }

  // TIER 2: GraphQL
  const slug = pageUrl.replace(/^https?:\/\/www\.dxomark\.com\//, '').replace(/\/$/, '');
  const tier2 = await queryGraphQL(slug, pageUrl);
  if (tier2 && (tier2.overallScore || tier2.strengths.length > 0)) {
    cacheSet(ck, tier2, 21600);
    return tier2;
  }

  // TIER 3: HTML heuristics
  const tier3 = parseHtmlFallback(html, pageUrl);
  cacheSet(ck, tier3, 7200);
  return tier3;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported function
// ─────────────────────────────────────────────────────────────────────────────

export async function getDxoScores(deviceName: string): Promise<IDxoScore | null> {
  const url = await findDxoUrl(deviceName);
  if (!url) return null;
  return scrapeDxoPage(url);
}