/**
 * parser.dxomark.ts
 *
 * URL pattern (found by Tarun):
 *   https://www.dxomark.com/smartphones/{Brand}/{Model-With-Dashes}
 *   e.g. https://www.dxomark.com/smartphones/Huawei/Pura-80-Ultra
 *        https://www.dxomark.com/smartphones/Samsung/Galaxy-S25-Ultra
 *
 * Strategy:
 *   1. Split device name into brand + model using known brand list
 *   2. Build the /smartphones/Brand/Model URL directly — no search needed
 *   3. Parse __NEXT_DATA__ JSON blob from the SSR page (Next.js)
 *   4. GraphQL fallback if __NEXT_DATA__ is empty
 *   5. HTML heuristic fallback as last resort
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
    portrait: number | null;
  };
  /** Pros from DXOMark verdict */
  strengths: string[];
  /** Cons from DXOMark verdict */
  weaknesses: string[];
  rankLabel: string | null;
  rankPosition: number | null;
  rankSegment: string | null;
  labelType: string | null;
  labelYear: string | null;
  scrapedAt: string;
  _source: 'next_data' | 'graphql' | 'html' | 'failed';
}

export interface IDxoSearchResult {
  name: string;
  url: string;
  score: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Known brands — mirrors brandPrefixes from parser.phone-details.ts
// Order matters: longer/multi-word entries first so "Google Pixel" matches
// before "Google", and "Xiaomi Poco" before "Xiaomi".
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_BRANDS = [
  // Multi-word first — must come before their single-word prefixes
  'Google Pixel', 'Xiaomi Poco', 'Xiaomi Redmi', 'Vivo iQOO',
  'Samsung Galaxy', 'Apple iPhone',
  // Single-word
  'Nothing', 'OnePlus', 'BlackBerry', 'HTC', 'ZTE', 'TCL', 'LG',
  'Samsung', 'Apple', 'Google', 'Huawei', 'Xiaomi', 'Oppo', 'Vivo',
  'Sony', 'Nokia', 'Motorola', 'Realme', 'Honor', 'Asus', 'Meizu',
  'Pixel', 'iQOO', 'Poco', 'Redmi', 'Tecno', 'Infinix', 'Lava', 'Sharp',
];

/**
 * DXOMark uses different brand slugs than what users type.
 * e.g. "Google Pixel 9 Pro" → DXOMark brand is "Pixel", not "Google"
 *      "Apple iPhone 16"    → DXOMark brand is "Apple", model is "iPhone-16"
 *      "Xiaomi Poco F7"     → DXOMark brand is "Poco"
 *      "Vivo iQOO 13"       → DXOMark brand is "iQOO"
 *      "Xiaomi Redmi Note 14"→ DXOMark brand is "Redmi"
 */
const DXO_BRAND_MAP: Record<string, { brand: string; modelPrefix?: string }> = {
  'Google Pixel': { brand: 'Google', modelPrefix: 'Pixel' }, // "google pixel 9 pro" → Google/Pixel-9-Pro
  'Pixel':        { brand: 'Google', modelPrefix: 'Pixel' }, // "pixel 9 pro" → Google/Pixel-9-Pro
  'Xiaomi Poco':  { brand: 'Xiaomi', modelPrefix: 'Poco' },
  'Xiaomi Redmi': { brand: 'Xiaomi', modelPrefix: 'Redmi' },
  'Vivo iQOO':    { brand: 'Vivo',   modelPrefix: 'iQOO' },
  'Samsung Galaxy': { brand: 'Samsung', modelPrefix: 'Galaxy' },
  'Apple iPhone':   { brand: 'Apple',   modelPrefix: 'iPhone' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DXO_BASE = 'https://www.dxomark.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

const JSON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'Origin': DXO_BASE,
  'Referer': DXO_BASE + '/',
};

async function getDxoHtml(url: string): Promise<string> {
  const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000, maxRedirects: 5 });
  return typeof data === 'string' ? data : JSON.stringify(data);
}

function safeInt(val: any): number | null {
  if (val === null || val === undefined) return null;
  const n = typeof val === 'number' ? val : parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function deepFind(obj: any, key: string, depth = 10): any {
  if (depth <= 0 || !obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const r = deepFind(v, key, depth - 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

function deepCollect(obj: any, key: string, depth = 10): any[] {
  if (depth <= 0 || !obj || typeof obj !== 'object') return [];
  const out: any[] = [];
  if (key in obj) out.push(obj[key]);
  for (const v of Object.values(obj)) out.push(...deepCollect(v, key, depth - 1));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand + model splitter → produces DXOMark-correct brand and model slugs
// ─────────────────────────────────────────────────────────────────────────────

function splitBrandModel(deviceName: string): { brand: string; model: string } {
  const name = deviceName.trim();
  const lower = name.toLowerCase();

  // Sort known brands longest-first so "Google Pixel" matches before "Google"
  const sorted = [...KNOWN_BRANDS].sort((a, b) => b.length - a.length);

  for (const knownBrand of sorted) {
    if (!lower.startsWith(knownBrand.toLowerCase())) continue;

    // Remaining part after stripping the known brand
    const rest = name.slice(knownBrand.length).trim();
    if (!rest) continue; // brand only, no model — skip

    // Check if there's a DXOMark-specific mapping for this brand
    const mapping = DXO_BRAND_MAP[knownBrand];
    if (mapping) {
      // Some brands need the modelPrefix prepended back
      // e.g. "Samsung Galaxy" brand → DXO brand="Samsung", model="Galaxy-S25-Ultra"
      const model = mapping.modelPrefix ? `${mapping.modelPrefix} ${rest}` : rest;
      return { brand: mapping.brand, model };
    }

    // No special mapping — use the known brand as-is
    return { brand: knownBrand, model: rest };
  }

  // Fallback: first word = brand, rest = model
  const parts = name.split(' ');
  const brand = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return { brand, model: parts.slice(1).join(' ') };
}

// ─────────────────────────────────────────────────────────────────────────────
// URL builder — /smartphones/{Brand}/{Model-Slug}
// ─────────────────────────────────────────────────────────────────────────────

function buildDxoUrl(brand: string, model: string): string {
  // DXOMark uses title case: "9 pro" → "9-Pro", "Galaxy S25 Ultra" → "Galaxy-S25-Ultra"
  // Special case: "iPhone" must stay as "iPhone" not become "IPhone"
  const modelSlug = model
    .trim()
    .split(/\s+/)
    .map(w => {
      if (w.toLowerCase() === 'iphone') return 'iPhone';
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join('-');
  return `${DXO_BASE}/smartphones/${brand}/${modelSlug}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1 — __NEXT_DATA__ JSON (SSR, embedded in HTML)
// ─────────────────────────────────────────────────────────────────────────────

function parseNextData(html: string, pageUrl: string): IDxoScore | null {
  const $ = cheerio.load(html);
  const raw = $('script#__NEXT_DATA__').html();
  if (!raw) return null;

  let nd: any;
  try { nd = JSON.parse(raw); } catch { return null; }

  const pp = nd?.props?.pageProps ?? {};

  // Overall score
  const scoreKeys = ['score', 'totalScore', 'overallScore', 'dxomarkScore', 'global_score', 'rankingScore'];
  let overallScore: number | null = null;
  for (const k of scoreKeys) {
    const v = safeInt(deepFind(pp, k));
    if (v && v >= 50 && v <= 200) { overallScore = v; break; }
  }

  // Device name
  const device = String(
    deepFind(pp, 'deviceName') ||
    deepFind(pp, 'productName') ||
    deepFind(pp, 'name') ||
    deepFind(pp, 'title') ||
    $('meta[property="og:title"]').attr('content') ||
    ''
  ).replace(/\s*[\|–\-]\s*DXO.*$/i, '').trim();

  // Sub-scores
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

  const scoreMap: Record<string, string[]> = {
    photo:    ['photo', 'photoScore', 'photo_score'],
    video:    ['video', 'videoScore', 'video_score'],
    audio:    ['audio', 'audioScore', 'audio_score'],
    display:  ['display', 'displayScore', 'display_score'],
    zoom:     ['zoom', 'zoomScore', 'telephoto', 'telephotoScore'],
    bokeh:    ['bokeh', 'bokehScore', 'portrait'],
    lowLight: ['lowlight', 'low_light', 'lowLight', 'night', 'nightScore'],
    selfie:   ['selfie', 'selfieScore', 'front', 'frontScore'],
  };

  for (const [field, aliases] of Object.entries(scoreMap)) {
    for (const alias of aliases) {
      const raw = deepFind(pp, alias);
      const v = safeInt(typeof raw === 'object' && raw !== null ? (raw?.value ?? raw?.score ?? null) : raw);
      if (v && v >= 10 && v <= 200) { (scores as any)[field] = v; break; }
    }
  }

  // Strengths / weaknesses
  const toStrArr = (vals: any[]): string[] => {
    const out: string[] = [];
    for (const v of vals) {
      if (Array.isArray(v)) {
        v.forEach((x: any) => {
          const t = typeof x === 'string' ? x : (x?.text || x?.content || x?.title || x?.label || '');
          if (t?.length > 3) out.push(t.trim());
        });
      } else if (typeof v === 'string' && v.length > 3) {
        out.push(v.trim());
      }
    }
    return out;
  };

  const prosKeys = ['pros', 'strengths', 'advantages', 'positives', 'highlights', 'good'];
  const consKeys = ['cons', 'weaknesses', 'disadvantages', 'negatives', 'drawbacks', 'bad'];

  const strengths = toStrArr(prosKeys.flatMap(k => deepCollect(pp, k)));
  const weaknesses = toStrArr(consKeys.flatMap(k => deepCollect(pp, k)));

  // Rank
  let rankPosition: number | null = null;
  let rankLabel: string | null = null;
  const rankRaw = deepFind(pp, 'rankingPosition') ?? deepFind(pp, 'rank') ?? deepFind(pp, 'ranking');
  if (rankRaw !== undefined) {
    rankPosition = safeInt(typeof rankRaw === 'object' ? rankRaw?.position ?? rankRaw?.value : rankRaw);
    if (rankPosition) rankLabel = `#${rankPosition} Best Smartphone Camera`;
  }

  if (!overallScore && !scores.photo && !scores.video && strengths.length === 0) return null;

  return {
    device, url: pageUrl, overallScore, scores,
    strengths: [...new Set(strengths)].slice(0, 12),
    weaknesses: [...new Set(weaknesses)].slice(0, 12),
    rankLabel, rankPosition,
    scrapedAt: new Date().toISOString(),
    _source: 'next_data',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2 — GraphQL
// ─────────────────────────────────────────────────────────────────────────────

async function queryGraphQL(brand: string, model: string, pageUrl: string): Promise<IDxoScore | null> {
  const queries = [
    // Query shape 1 — WordPress post by slug
    {
      query: `query($slug:String!){post(id:$slug,idType:SLUG){title dxomarkFields{score photoScore videoScore audioScore displayScore rankingPosition pros{content} cons{content}}}}`,
      vars: { slug: `${brand.toLowerCase()}-${model.toLowerCase().replace(/\s+/g, '-')}` },
    },
    // Query shape 2 — device by brand+model
    {
      query: `query($brand:String!,$model:String!){device(brand:$brand,model:$model){name score scores{photo video zoom bokeh lowlight selfie} pros cons rankingPosition}}`,
      vars: { brand, model },
    },
  ];

  for (const { query, vars } of queries) {
    try {
      const resp = await axios.post(
        `${DXO_BASE}/graphql`,
        { query, variables: vars },
        { headers: { ...JSON_HEADERS, 'Content-Type': 'application/json' }, timeout: 10000 }
      );
      const data = resp.data?.data;
      if (!data) continue;

      const post = data.post;
      if (post?.dxomarkFields) {
        const f = post.dxomarkFields;
        const rank = safeInt(f.rankingPosition);
        return {
          device: post.title || `${brand} ${model}`,
          url: pageUrl,
          overallScore: safeInt(f.score),
          scores: {
            photo: safeInt(f.photoScore), video: safeInt(f.videoScore),
            audio: safeInt(f.audioScore), display: safeInt(f.displayScore),
            zoom: null, bokeh: null, lowLight: null, selfie: null,
          },
          strengths: (f.pros ?? []).map((p: any) => p?.content || p).filter(Boolean).slice(0, 12),
          weaknesses: (f.cons ?? []).map((c: any) => c?.content || c).filter(Boolean).slice(0, 12),
          rankLabel: rank ? `#${rank} Best Smartphone Camera` : null,
          rankPosition: rank,
          scrapedAt: new Date().toISOString(),
          _source: 'graphql',
        };
      }

      const dev = data.device;
      if (dev) {
        const s = dev.scores ?? {};
        const rank = safeInt(dev.rankingPosition);
        const toArr = (a: any[]) => (Array.isArray(a) ? a.map((x: any) => typeof x === 'string' ? x : x?.content || '').filter(Boolean) : []);
        return {
          device: dev.name || `${brand} ${model}`,
          url: pageUrl,
          overallScore: safeInt(dev.score),
          scores: {
            photo: safeInt(s.photo), video: safeInt(s.video),
            audio: null, display: null,
            zoom: safeInt(s.zoom), bokeh: safeInt(s.bokeh),
            lowLight: safeInt(s.lowlight), selfie: safeInt(s.selfie),
          },
          strengths: toArr(dev.pros).slice(0, 12),
          weaknesses: toArr(dev.cons).slice(0, 12),
          rankLabel: rank ? `#${rank} Best Smartphone Camera` : null,
          rankPosition: rank,
          scrapedAt: new Date().toISOString(),
          _source: 'graphql',
        };
      }
    } catch { /* try next */ }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 3 — HTML scraping (PRIMARY — DXOMark is classic server-rendered HTML)
// Structure confirmed from live page fetch.
// ─────────────────────────────────────────────────────────────────────────────

function parseHtmlFallback(html: string, pageUrl: string, brand: string, model: string): IDxoScore {
  const $ = cheerio.load(html);

  // ── Device name ────────────────────────────────────────────────────────────
  // Title: "Samsung Galaxy S25 Ultra - DXOMARK"
  const device =
    $('title').first().text().replace(/\s*[-–|]\s*DXOMARK\s*$/i, '').trim() ||
    $('h1').first().text().trim() ||
    `${brand} ${model}`;

  // ── Scores section — only look inside #scores or the Scores section ────────
  // The page has Camera and Display tabs. We want Camera scores.
  // Overall score appears as a standalone number "151" in the scores block.
  // Strategy: find all standalone integers 50-200, first one is overall camera score.
  let overallScore: number | null = null;
  let displayScore: number | null = null;

  // "Overall Camera Score" block — the score is a direct text child
  // Structure: "Overall Camera Score i\n\n151\n\n45\nXiaomi Redmi A3\n\nBEST 175"
  // Find the paragraph/div containing "Overall Camera Score"
  let inCameraSection = false;
  $('*').each((_: any, el: any) => {
    if (overallScore && displayScore) return false;
    const txt = $(el).clone().children().remove().end().text().trim();
    if (txt === 'Overall Camera Score') inCameraSection = true;
    if (txt === 'Overall Display Score') inCameraSection = false;
    if (inCameraSection && !overallScore) {
      const n = parseInt(txt, 10);
      if (!isNaN(n) && n >= 50 && n <= 200 && txt === String(n)) overallScore = n;
    }
    if (!inCameraSection && txt === 'Overall Display Score') {
      // next number sibling is display score
    }
  });

  // Simpler fallback: the FIRST standalone 2-3 digit number (50-200) in page
  if (!overallScore) {
    $('*').each((_: any, el: any) => {
      if (overallScore) return false;
      if ($(el).children().length > 0) return;
      const txt = $(el).text().trim();
      const n = parseInt(txt, 10);
      if (!isNaN(n) && n >= 50 && n <= 200 && txt === String(n)) overallScore = n;
    });
  }

  // ── Sub-scores — parse from h4 headings + adjacent score numbers ───────────
  // Structure in markdown: "Photo i\n\n152\n\n111\nXiaomi..."
  // h4 text = score category, next number = score value
  const scores = {
    photo: null as number | null,
    video: null as number | null,
    audio: null as number | null,
    display: null as number | null,
    zoom: null as number | null,
    bokeh: null as number | null,
    lowLight: null as number | null,
    selfie: null as number | null,
    portrait: null as number | null,
  };

  // Collect all text nodes that are standalone numbers, paired with nearby label
  // Walk the DOM collecting (label, score) pairs from "Sub-scores" section
  const allText: Array<{ text: string; tag: string }> = [];
  $('h1,h2,h3,h4,h5,p,span,div,td,li').each((_: any, el: any) => {
    const txt = $(el).clone().children().remove().end().text().trim();
    if (txt.length > 0 && txt.length < 200) {
      allText.push({ text: txt, tag: el.name });
    }
  });

  // Find score labels and extract the FIRST number after each label
  const LABEL_MAP: Array<[RegExp, keyof typeof scores]> = [
    [/^photo$/i,      'photo'],
    [/^video$/i,      'video'],
    [/^audio$/i,      'audio'],
    [/^display$/i,    'display'],
    [/^(zoom|tele)$/i,'zoom'],
    [/^bokeh$/i,      'bokeh'],
    [/^(lowlight|low.?light|night)$/i, 'lowLight'],
    [/^(selfie|front)$/i, 'selfie'],
    [/^portrait$/i,   'portrait'],
    [/^(ultra.?wide|ultrawide)$/i, 'selfie'], // re-map ultrawide → skip
  ];

  for (let i = 0; i < allText.length; i++) {
    const labelText = allText[i].text.replace(/\s*i\s*$/, '').trim(); // strip trailing "i" (info icon)
    for (const [regex, field] of LABEL_MAP) {
      if (regex.test(labelText) && (scores as any)[field] === null) {
        // Look ahead for the first number in range
        for (let j = i + 1; j < Math.min(i + 5, allText.length); j++) {
          const n = parseInt(allText[j].text.replace(/\D/g, ''), 10);
          if (!isNaN(n) && n >= 50 && n <= 200) {
            (scores as any)[field] = n;
            break;
          }
        }
        break;
      }
    }
  }

  // Use case scores (Portrait, Lowlight, Zoom) — shown in "Use Cases" section
  // These appear as numbers in circle elements after "#### Portrait", "#### Lowlight" etc.
  // They're already captured above via LABEL_MAP matching on h4/h5 text

  // ── Pros and Cons ──────────────────────────────────────────────────────────
  // Structure: h4 "Pros" → ul > li items, h4 "Cons" → ul > li items
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  let currentSection = '';
  $('h4, li').each((_: any, el: any) => {
    const tag = el.name;
    const txt = $(el).text().trim();
    if (tag === 'h4') {
      if (/^pros$/i.test(txt)) currentSection = 'pros';
      else if (/^cons$/i.test(txt)) currentSection = 'cons';
      else currentSection = '';
    } else if (tag === 'li' && txt.length > 5) {
      if (currentSection === 'pros') strengths.push(txt);
      else if (currentSection === 'cons') weaknesses.push(txt);
    }
  });

  // ── Rankings ───────────────────────────────────────────────────────────────
  // "29th\nin\nGlobal Ranking" — rank number appears before "in\n[Global Ranking]"
  let rankPosition: number | null = null;
  let rankLabel: string | null = null;
  let rankSegment: string | null = null;

  // Find all links with "Global Ranking" or "Ultra-Premium Ranking" text
  $('a').each((_: any, el: any) => {
    const txt = $(el).text().trim();
    if (txt.includes('Global Ranking') || txt.includes('Ultra-Premium Ranking')) {
      // The rank number is in the preceding sibling text nodes
      const parent = $(el).parent();
      const parentText = parent.text().trim();
      const m = parentText.match(/(\d+)(st|nd|rd|th)/i);
      if (m) {
        const pos = parseInt(m[1], 10);
        if (!rankPosition || txt.includes('Global')) {
          rankPosition = pos;
          rankLabel = `#${pos} in ${txt}`;
          if (txt.includes('Ultra-Premium')) rankSegment = txt;
        }
      }
    }
  });

  // ── Label (GOLD/SILVER etc.) + year ───────────────────────────────────────
  // "2025" appears near the score badge
  let labelYear: string | null = null;
  let labelType: string | null = null;
  $('*').each((_: any, el: any) => {
    if ($(el).children().length > 0) return;
    const txt = $(el).text().trim();
    if (/^20\d\d$/.test(txt)) labelYear = txt;
    if (/^(gold|silver|bronze|recommended)$/i.test(txt)) labelType = txt.toUpperCase();
  });

  return {
    device, url: pageUrl, overallScore, scores,
    strengths: [...new Set(strengths)].slice(0, 15),
    weaknesses: [...new Set(weaknesses)].slice(0, 15),
    rankLabel,
    rankPosition,
    rankSegment,
    labelYear,
    labelType,
    scrapedAt: new Date().toISOString(),
    _source: 'html',
  } as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: search (for /dxomark/search endpoint)
// ─────────────────────────────────────────────────────────────────────────────

export async function searchDxo(query: string): Promise<IDxoSearchResult[]> {
  const ck = `dxo:search:v3:${query.toLowerCase().trim()}`;
  const cached = await cacheGet<IDxoSearchResult[]>(ck);
  if (cached) return cached;

  // Try WP REST first (JSON, bypasses Cloudflare more reliably)
  try {
    const resp = await axios.get(`${DXO_BASE}/wp-json/wp/v2/test`, {
      params: { search: query, per_page: 10, _fields: 'slug,title,link' },
      headers: JSON_HEADERS,
      timeout: 10000,
    });
    if (Array.isArray(resp.data) && resp.data.length > 0) {
      const results: IDxoSearchResult[] = resp.data.map((p: any) => ({
        name: p.title?.rendered || p.slug,
        url: p.link || `${DXO_BASE}/${p.slug}/`,
        score: null,
      }));
      cacheSet(ck, results);
      return results;
    }
  } catch { /* fall through */ }

  // Build candidate URLs from the device name pattern
  const { brand, model } = splitBrandModel(query);
  const candidateUrl = buildDxoUrl(brand, model);
  const result: IDxoSearchResult = { name: query, url: candidateUrl, score: null };
  cacheSet(ck, [result]);
  return [result];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: scrape a specific DXOMark URL
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeDxoPage(pageUrl: string): Promise<IDxoScore> {
  const ck = `dxo:page:v3:${pageUrl}`;
  const cached = await cacheGet<IDxoScore>(ck);
  if (cached) return cached;

  const FAILED: IDxoScore = {
    device: '', url: pageUrl, overallScore: null,
    scores: { photo: null, video: null, audio: null, display: null, zoom: null, bokeh: null, lowLight: null, selfie: null, portrait: null },
    strengths: [], weaknesses: [], rankLabel: null, rankPosition: null, rankSegment: null, labelType: null, labelYear: null,
    scrapedAt: new Date().toISOString(), _source: 'failed',
  };

  let html = '';
  let fetchError = '';
  try {
    html = await getDxoHtml(pageUrl);
  } catch (err: any) {
    fetchError = err?.message || String(err);
    // Expose fetch error in the failed result so caller can debug
    return { ...FAILED, _fetchError: fetchError } as any;
  }

  // Extract brand/model from URL for fallbacks
  // URL shape: /smartphones/Samsung/Galaxy-S25-Ultra
  const urlMatch = pageUrl.match(/\/smartphones\/([^/]+)\/([^/?]+)/);
  const brand = urlMatch ? decodeURIComponent(urlMatch[1]) : '';
  const model = urlMatch ? decodeURIComponent(urlMatch[2]).replace(/-/g, ' ') : '';

  // Tier 1
  const t1 = parseNextData(html, pageUrl);
  if (t1 && (t1.overallScore || t1.strengths.length > 0)) {
    cacheSet(ck, t1);
    return t1;
  }

  // Tier 2
  const t2 = await queryGraphQL(brand, model, pageUrl);
  if (t2 && (t2.overallScore || t2.strengths.length > 0)) {
    cacheSet(ck, t2);
    return t2;
  }

  // Tier 3
  const t3 = parseHtmlFallback(html, pageUrl, brand, model);
  cacheSet(ck, t3);
  return t3;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: main entry point — get DXOMark scores by device name
// ─────────────────────────────────────────────────────────────────────────────

export async function getDxoScores(deviceName: string): Promise<IDxoScore | null> {
  const ck = `dxo:result:v3:${deviceName.toLowerCase().trim()}`;
  const cached = await cacheGet<IDxoScore>(ck);
  if (cached) return cached;

  const { brand, model } = splitBrandModel(deviceName);
  if (!model) return null;

  const url = buildDxoUrl(brand, model);
  const result = await scrapeDxoPage(url);

  // Always cache and return — even failed results show the attempted URL
  // so the caller knows what URL was tried and can debug
  if (result._source !== 'failed') {
    cacheSet(ck, result);
  }
  return result; // never return null — always return what we got
}