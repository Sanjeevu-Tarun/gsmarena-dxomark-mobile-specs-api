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
    // Detailed photo sub-scores
    photoMain: number | null;
    photoUltraWide: number | null;
    photoTele: number | null;
    // Detailed video sub-scores
    videoMain: number | null;
    videoUltraWide: number | null;
    videoTele: number | null;
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
  // ── Multi-word sub-brands FIRST — prevents partial matches ───────────────────
  // These must appear before their single-word parent brands
  'Google Pixel',
  'Apple iPhone',
  'Samsung Galaxy',
  'Xiaomi Poco',
  'Xiaomi Redmi',
  'Vivo iQOO',
  'Asus ROG',          // ROG Phone series
  'Asus Zenfone',
  'Sony Xperia',
  'ZTE Nubia',
  'Lenovo Legion',     // Legion Phone series
  'Lenovo ThinkPhone',
  'Huawei Honor',      // before Huawei & Honor as standalone
  'Nothing Phone',
  'Motorola Moto',     // "Motorola Moto G / Edge / Razr"
  'Nokia G',
  'Nokia X',
  'Nokia C',
  'OnePlus Nord',
  'Realme GT',
  'Realme Narzo',
  'TCL Stylus',
  'TCL 30',
  'Oppo Reno',
  'Oppo Find',
  'Oppo A',

  // ── Single-word brands (alphabetical within tier) ────────────────────────────
  'Alcatel',
  'Apple',
  'Asus',
  'BlackBerry',
  'Blackview',
  'BLU',
  'CAT',               // Caterpillar rugged phones marketed as "Cat"
  'Coolpad',
  'Cubot',
  'Doogee',
  'Energizer',
  'Fairphone',
  'Google',
  'Honor',
  'HTC',
  'Huawei',
  'Infinix',
  'iQOO',
  'Itel',
  'Kyocera',
  'Lava',
  'Lenovo',
  'LG',
  'Meizu',
  'Motorola',
  'Nokia',
  'Nothing',
  'Nubia',
  'OnePlus',
  'Oppo',
  'Oukitel',
  'Pixel',             // standalone "Pixel 9" without "Google"
  'Poco',              // standalone "Poco F7"
  'Realme',
  'Redmi',             // standalone "Redmi Note 14"
  'Samsung',
  'Sharp',
  'Sony',
  'Tecno',
  'TCL',
  'Ulefone',
  'Umidigi',
  'Vivo',
  'Wiko',
  'Xiaomi',
  'ZTE',
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
  // ── Google / Pixel ───────────────────────────────────────────────────────────
  'Google Pixel': { brand: 'Google', modelPrefix: 'Pixel' }, // "google pixel 9 pro" → Google/Pixel-9-Pro
  'Pixel':        { brand: 'Google', modelPrefix: 'Pixel' }, // bare "pixel 9 pro"   → Google/Pixel-9-Pro

  // ── Apple ────────────────────────────────────────────────────────────────────
  'Apple iPhone': { brand: 'Apple', modelPrefix: 'iPhone' },

  // ── Samsung ──────────────────────────────────────────────────────────────────
  'Samsung Galaxy': { brand: 'Samsung', modelPrefix: 'Galaxy' },

  // ── Xiaomi sub-brands ────────────────────────────────────────────────────────
  'Xiaomi Poco':  { brand: 'Xiaomi', modelPrefix: 'Poco' },
  'Xiaomi Redmi': { brand: 'Xiaomi', modelPrefix: 'Redmi' },
  'Poco':         { brand: 'Xiaomi', modelPrefix: 'Poco' },   // bare "Poco F7"
  'Redmi':        { brand: 'Xiaomi', modelPrefix: 'Redmi' },  // bare "Redmi Note 14"

  // ── Vivo sub-brands ──────────────────────────────────────────────────────────
  'Vivo iQOO':  { brand: 'Vivo', modelPrefix: 'iQOO' },
  'iQOO':       { brand: 'Vivo', modelPrefix: 'iQOO' },       // bare "iQOO 13"

  // ── Asus sub-brands ──────────────────────────────────────────────────────────
  // DXOMark uses "Asus" as brand and keeps "ROG Phone" / "Zenfone" in the model
  'Asus ROG':     { brand: 'Asus', modelPrefix: 'ROG Phone' },
  'Asus Zenfone': { brand: 'Asus', modelPrefix: 'Zenfone' },

  // ── Sony ─────────────────────────────────────────────────────────────────────
  'Sony Xperia': { brand: 'Sony', modelPrefix: 'Xperia' },

  // ── ZTE / Nubia ──────────────────────────────────────────────────────────────
  'ZTE Nubia': { brand: 'ZTE', modelPrefix: 'Nubia' },
  'Nubia':     { brand: 'ZTE', modelPrefix: 'Nubia' },

  // ── Lenovo sub-brands ────────────────────────────────────────────────────────
  'Lenovo Legion':    { brand: 'Lenovo', modelPrefix: 'Legion Phone' },
  'Lenovo ThinkPhone': { brand: 'Lenovo', modelPrefix: 'ThinkPhone' },

  // ── Huawei / Honor ───────────────────────────────────────────────────────────
  // Honor is now independent, but some DXOMark pages still list it under Huawei
  'Huawei Honor': { brand: 'Huawei', modelPrefix: 'Honor' },

  // ── Motorola ─────────────────────────────────────────────────────────────────
  // DXOMark uses "Motorola" as brand; "Moto" prefix is kept in the model slug
  'Motorola Moto': { brand: 'Motorola', modelPrefix: 'Moto' },

  // ── OnePlus ──────────────────────────────────────────────────────────────────
  'OnePlus Nord': { brand: 'OnePlus', modelPrefix: 'Nord' },

  // ── Realme ───────────────────────────────────────────────────────────────────
  'Realme GT':    { brand: 'Realme', modelPrefix: 'GT' },
  'Realme Narzo': { brand: 'Realme', modelPrefix: 'Narzo' },

  // ── Nothing ──────────────────────────────────────────────────────────────────
  'Nothing Phone': { brand: 'Nothing', modelPrefix: 'Phone' },

  // ── Oppo sub-lines ───────────────────────────────────────────────────────────
  'Oppo Reno': { brand: 'Oppo', modelPrefix: 'Reno' },
  'Oppo Find': { brand: 'Oppo', modelPrefix: 'Find' },
  'Oppo A':    { brand: 'Oppo', modelPrefix: 'A' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Generic tokens — ignored during brand/model matching so they don't pollute
// slug generation or confuse sibling-device comparisons.
// Includes: all known brand names, sub-brands, form-factor descriptors,
// connectivity suffixes, and common marketing qualifiers.
// ─────────────────────────────────────────────────────────────────────────────

const GENERIC_TOKENS = new Set<string>([
  // ── Brand / sub-brand names (lowercase) ──────────────────────────────────
  'alcatel', 'apple', 'asus', 'blackberry', 'blackview', 'blu', 'cat',
  'coolpad', 'cubot', 'doogee', 'energizer', 'fairphone', 'google', 'honor',
  'htc', 'huawei', 'infinix', 'iqoo', 'itel', 'kyocera', 'lava', 'lenovo',
  'lg', 'meizu', 'motorola', 'nokia', 'nothing', 'nubia', 'oneplus', 'oppo',
  'oukitel', 'pixel', 'poco', 'realme', 'redmi', 'samsung', 'sharp', 'sony',
  'tecno', 'tcl', 'ulefone', 'umidigi', 'vivo', 'wiko', 'xiaomi', 'zte',
  // Sub-brand tokens that can appear standalone
  'rog', 'zenfone', 'xperia', 'legion', 'thinkphone', 'galaxy', 'iphone',
  'moto', 'nord', 'narzo', 'reno', 'find',

  // ── Form-factor / product-line descriptors ────────────────────────────────
  'fold', 'flip', 'tab', 'pad', 'go', 'play', 'power', 'zoom', 'active',
  'prime', 'classic', 'neo', 'lite', 'plus', 'max', 'mini', 'slim',
  'edge', 'note', 'ultra', 'pro', 'max', 'fe', 'se',

  // ── Connectivity / generation suffixes ────────────────────────────────────
  '5g', '4g', 'lte', 'wifi', 'nfc',

  // ── Common model-name qualifiers ─────────────────────────────────────────
  'new', 'official', 'global', 'india', 'china', 'europe', 'dual', 'sim',
  'review', 'test', 'score', 'camera',
]);



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

/**
 * Tokens that must be preserved in their exact casing when building slugs.
 * Evaluated BEFORE the generic title-case logic.
 */
const PRESERVE_CASE: Record<string, string> = {
  iphone:  'iPhone',
  '5g':    '5G',
  '4g':    '4G',
  lte:     'LTE',
  rog:     'ROG',
  iqoo:    'iQOO',
};

function buildDxoUrl(brand: string, model: string): string {
  // 1. Strip rogue parentheses and their contents — "()" or "(text)" break routing
  const cleanModel = model
    .replace(/\([^)]*\)/g, '')   // remove "(anything)" including empty "()"
    .replace(/[()]/g, '')         // strip any orphaned parens left over
    .trim();

  // 2. Title-case each token, preserving special cases
  const modelSlug = cleanModel
    .split(/\s+/)
    .filter(Boolean)
    .map(w => {
      const lower = w.toLowerCase();
      // Connectivity suffixes: /^[45]g$/i → "5G" / "4G"
      if (/^[45]g$/i.test(w)) return w.toUpperCase();
      // Lookup preserve-case map
      if (PRESERVE_CASE[lower]) return PRESERVE_CASE[lower];
      // Default: title-case
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
    portrait: null as number | null,
    photoMain: null as number | null,
    photoUltraWide: null as number | null,
    photoTele: null as number | null,
    videoMain: null as number | null,
    videoUltraWide: null as number | null,
    videoTele: null as number | null,
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
            portrait: null, photoMain: null, photoUltraWide: null, photoTele: null,
            videoMain: null, videoUltraWide: null, videoTele: null,
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
            portrait: null, photoMain: null, photoUltraWide: null, photoTele: null,
            videoMain: null, videoUltraWide: null, videoTele: null,
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

  // ── Detect score type — Camera vs Display-only ─────────────────────────────
  // Score badge text: "151\ncamera\n2025" or "158\ndisplay\n2024"
  // If page has no Camera tab, all scores are Display scores — flag this clearly.
  const pageText = $('body').text().toLowerCase();
  const hasCameraTab = pageText.includes('overall camera score') || 
                       $('a[href*="sort-camera"]').length > 0 ||
                       /\d+\s*\n?\s*camera/i.test($('body').text());
  const hasDisplayOnly = !hasCameraTab && (
    pageText.includes('overall display score') ||
    $('a[href*="sort-display"]').length > 0
  );

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

  // ── Sub-scores ────────────────────────────────────────────────────────────
  // Structure confirmed from live HTML fetch:
  // "Photo i\n152\n111 Xiaomi...\nBEST 180\nMain i\n155\n124...\nBEST 184\nBokeh i\n165..."
  // Pattern: label text → device score → worst score+name → BEST + best_score
  //
  // Use Case scores (Portrait 133, Lowlight 115, Zoom 137) are rendered in JS SVG circles
  // and are NOT present in static HTML. Only their BEST values appear.
  const scores = {
    photo: null as number | null,          // Photo overall
    video: null as number | null,          // Video overall
    audio: null as number | null,
    display: null as number | null,        // Display tab (separate, not scraped here)
    zoom: null as number | null,           // Photo > Tele
    bokeh: null as number | null,          // Photo > Bokeh
    lowLight: null as number | null,       // Use Case: Lowlight (JS-rendered, may be null)
    selfie: null as number | null,
    portrait: null as number | null,       // Use Case: Portrait (JS-rendered, may be null)
    // Detailed sub-scores
    photoMain: null as number | null,
    photoUltraWide: null as number | null,
    photoTele: null as number | null,
    videoMain: null as number | null,
    videoUltraWide: null as number | null,
    videoTele: null as number | null,
  };

  // Walk all text-bearing elements and build a flat list
  const allText: Array<{ text: string }> = [];
  $('h1,h2,h3,h4,h5,p,span,div,td,li,a').each((_: any, el: any) => {
    const txt = $(el).clone().children().remove().end().text().trim();
    if (txt.length > 0 && txt.length < 300) allText.push({ text: txt });
  });

  // Context-aware label matching
  // We track whether we're in Photo section or Video section
  // to correctly assign Tele/Main/Ultra-Wide to photo vs video
  type ScoreKey = keyof typeof scores;
  let photoSection = false;
  let videoSection = false;

  const TOP_LABELS: Array<[RegExp, ScoreKey]> = [
    [/^photo$/i, 'photo'],
    [/^video$/i, 'video'],
    [/^bokeh$/i, 'bokeh'],
  ];

  const SUB_LABELS: Array<[RegExp, 'main' | 'ultrawide' | 'tele']> = [
    [/^main$/i, 'main'],
    [/^(ultra.?wide|ultrawide)$/i, 'ultrawide'],
    [/^tele$/i, 'tele'],
  ];

  function nextScore(i: number): number | null {
    for (let j = i + 1; j < Math.min(i + 6, allText.length); j++) {
      // Skip "BEST" lines
      if (/best/i.test(allText[j].text)) continue;
      // Skip lines that are clearly device names (contain letters mixed with numbers)
      if (/[a-zA-Z]/.test(allText[j].text) && !/^\d+$/.test(allText[j].text.replace(/\D/g,''))) continue;
      const n = parseInt(allText[j].text.replace(/\D/g, ''), 10);
      if (!isNaN(n) && n >= 50 && n <= 200) return n;
    }
    return null;
  }

  for (let i = 0; i < allText.length; i++) {
    const raw = allText[i].text;
    const label = raw.replace(/\s*i\s*$/, '').trim(); // strip info icon "i"

    // Track section context
    if (/^photo$/i.test(label)) { photoSection = true; videoSection = false; }
    if (/^video$/i.test(label)) { videoSection = true; photoSection = false; }
    // Reset on new top-level sections
    if (/^(use cases|specifications|pricing|summary)$/i.test(label)) {
      photoSection = false; videoSection = false;
    }

    // Top-level scores
    for (const [regex, field] of TOP_LABELS) {
      if (regex.test(label) && scores[field] === null) {
        const v = nextScore(i);
        if (v) scores[field] = v;
        break;
      }
    }

    // Sub-label scores (Main, Ultra-Wide, Tele)
    for (const [regex, subKey] of SUB_LABELS) {
      if (regex.test(label)) {
        const v = nextScore(i);
        if (!v) break;
        if (subKey === 'main') {
          if (photoSection && !scores.photoMain) scores.photoMain = v;
          else if (videoSection && !scores.videoMain) scores.videoMain = v;
        } else if (subKey === 'ultrawide') {
          if (photoSection && !scores.photoUltraWide) scores.photoUltraWide = v;
          else if (videoSection && !scores.videoUltraWide) scores.videoUltraWide = v;
        } else if (subKey === 'tele') {
          if (photoSection && !scores.photoTele) { scores.photoTele = v; scores.zoom = v; }
          else if (videoSection && !scores.videoTele) scores.videoTele = v;
        }
        break;
      }
    }
  }

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
  // Real HTML structure (confirmed from live fetch):
  // The rank block text looks like: "29th\n\nin\n\nGlobal Ranking"
  // The "Global Ranking" and "Ultra-Premium Ranking" are anchor texts.
  // The ordinal "29th" is a text node in a preceding sibling div.
  // Strategy: grab the full text of the closest ancestor that contains
  // both the ordinal AND the ranking link text.
  let rankPosition: number | null = null;
  let rankLabel: string | null = null;
  let rankSegment: string | null = null;

  $('a[href*="sort-camera"]').each((_: any, el: any) => {
    const linkText = $(el).text().trim();
    const isGlobal = linkText.includes('Global Ranking');
    const isSegment = linkText.includes('Ranking') && !isGlobal;

    // Walk up to find the container that has the ordinal
    let ancestor = $(el).parent();
    for (let i = 0; i < 5; i++) {
      const ancestorText = ancestor.text().trim();
      const m = ancestorText.match(/(\d+)(st|nd|rd|th)/i);
      if (m) {
        const pos = parseInt(m[1], 10);
        if (isGlobal && !rankPosition) {
          rankPosition = pos;
          rankLabel = `#${pos} in Global Ranking`;
        }
        if (isSegment && !rankSegment) {
          rankSegment = `#${pos} in ${linkText}`;
        }
        break;
      }
      ancestor = ancestor.parent();
    }
  });

  // Fallback: scan full page text for "Nth in Global Ranking" pattern
  if (!rankPosition) {
    const fullText = $('body').text();
    const m = fullText.match(/(\d+)(st|nd|rd|th)\s+in\s+Global Ranking/i);
    if (m) {
      rankPosition = parseInt(m[1], 10);
      rankLabel = `#${rankPosition} in Global Ranking`;
    }
  }

  // ── Label (GOLD/SILVER etc.) + year ───────────────────────────────────────
  // GOLD appears as alt text on an img, or as text inside .label element
  // Year "2025" appears as a standalone text node near the score badge
  let labelYear: string | null = null;
  let labelType: string | null = null;

  // GOLD badge is rendered client-side via JS (SVG widget) — not in static HTML.
  // Infer label from score using DXOMark's published thresholds:
  // GOLD >= 140, SILVER >= 120, BRONZE >= 100, RECOMMENDED >= 80
  if (overallScore !== null) {
    if (overallScore >= 140) labelType = 'GOLD';
    else if (overallScore >= 120) labelType = 'SILVER';
    else if (overallScore >= 100) labelType = 'BRONZE';
    else if (overallScore >= 80)  labelType = 'RECOMMENDED';
  }

  // Year: find standalone 4-digit year near score section
  $('*').each((_: any, el: any) => {
    if ($(el).children().length > 0) return;
    const txt = $(el).text().trim();
    if (/^20\d\d$/.test(txt) && !labelYear) labelYear = txt;
  });

  return {
    device, url: pageUrl,
    // If display-only page, overallScore is the Display score, not Camera
    scoreType: hasCameraTab ? 'camera' : (hasDisplayOnly ? 'display' : 'unknown'),
    noCameraReview: !hasCameraTab,
    overallScore,
    scores,
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
// Review page scraper — /device-name-camera-test/ or -retested/
// Much richer than the /smartphones/ summary page.
// ─────────────────────────────────────────────────────────────────────────────

export interface IDxoSampleImage {
  /** Category heading — e.g. "Main Camera", "Ultra-Wide", "Zoom", "Selfie", "Video" */
  category: string;
  /** Full-resolution image URL */
  url: string;
  /** Caption text if present on the page */
  caption: string | null;
}

export interface IDxoReview {
  device: string;
  reviewUrl: string;
  overallScore: number | null;
  rankPosition: number | null;
  rankLabel: string | null;
  cameraSpecs: string[];
  scores: {
    photo: number | null;
    photoMain: number | null;
    photoBokeh: number | null;
    photoUltraWide: number | null;
    photoTele: number | null;
    video: number | null;
    videoMain: number | null;
    videoUltraWide: number | null;
    videoTele: number | null;
  };
  bestScores: {
    photo: number | null;
    photoMain: number | null;
    photoBokeh: number | null;
    photoUltraWide: number | null;
    photoTele: number | null;
    video: number | null;
    videoMain: number | null;
    videoUltraWide: number | null;
    videoTele: number | null;
  };
  pros: string[];
  cons: string[];
  /** Camera sample photos grouped by category */
  sampleImages: IDxoSampleImage[];
  /** Total number of sample photos scraped */
  sampleCount: number;
  scrapedAt: string;
}

/** Get the camera review URL from a /smartphones/ device page */
export async function getCameraReviewUrl(devicePageUrl: string): Promise<string | null> {
  const ck = `dxo:reviewurl:v1:${devicePageUrl}`;
  const cached = await cacheGet<string>(ck);
  if (cached) return cached;

  try {
    const html = await getDxoHtml(devicePageUrl);
    const $ = cheerio.load(html);

    // The review link text: "Read the test results {Device} camera"
    // href pattern: /device-name-camera-test/ or /device-name-camera-test-retested/
    let reviewUrl: string | null = null;
    $('a[href*="camera-test"]').each((_: any, el: any) => {
      if (reviewUrl) return false;
      const href = $(el).attr('href') || '';
      if (href.includes('camera-test')) {
        reviewUrl = href.startsWith('http') ? href : `${DXO_BASE}${href}`;
      }
    });

    if (reviewUrl) {
      cacheSet(ck, reviewUrl);
      return reviewUrl;
    }
  } catch { /* fall through */ }
  return null;
}

/** Scrape the full camera review page — scores, best-in-class, pros/cons, AND sample photos */
export async function scrapeDxoReview(reviewUrl: string, nocache = false): Promise<IDxoReview | null> {
  const ck = `dxo:review:v2:${reviewUrl}`;
  if (!nocache) {
    const cached = await cacheGet<IDxoReview>(ck);
    if (cached) return cached;
  }

  let html = '';
  try {
    html = await getDxoHtml(reviewUrl);
  } catch { return null; }

  const $ = cheerio.load(html);

  // ── Device name ─────────────────────────────────────────────────────────────
  const device =
    $('h1').first().text().replace(/\s*camera test.*/i, '').trim() ||
    $('title').first().text().replace(/camera test.*dxomark/i, '').replace(/[-–|]/g, '').trim();

  // ── Overall score ────────────────────────────────────────────────────────────
  let overallScore: number | null = null;
  $('*').each((_: any, el: any) => {
    if (overallScore) return false;
    if ($(el).children().length > 0) return;
    const txt = $(el).text().trim();
    const n = parseInt(txt, 10);
    if (!isNaN(n) && n >= 50 && n <= 200 && txt === String(n)) overallScore = n;
  });

  // ── Ranking ──────────────────────────────────────────────────────────────────
  // cheerio collapses whitespace between child spans so "16th\n\nRanking Position"
  // can render as "16thRanking Position" with NO gap — use \s* not \s+
  let rankPosition: number | null = null;
  let rankLabel: string | null = null;
  const bodyText = $('body').text();
  const rankMatch =
    bodyText.match(/(\d+)(st|nd|rd|th)\s*Ranking Position/i) ||
    bodyText.match(/#(\d+)\s+in\s+Global Ranking/i) ||
    bodyText.match(/(\d+)(st|nd|rd|th)\s+in\s+Global Ranking/i);
  if (rankMatch) {
    rankPosition = parseInt(rankMatch[1], 10);
    rankLabel = `#${rankPosition} in Global Ranking`;
  }

  // ── Camera specs ─────────────────────────────────────────────────────────────
  const cameraSpecs: string[] = [];
  let inSpecs = false;
  $('h6, h5, h4, h3, li, p').each((_: any, el: any) => {
    const txt = $(el).text().trim();
    if (/key camera spec/i.test(txt)) { inSpecs = true; return; }
    if (inSpecs && el.name === 'li' && txt.length > 3) cameraSpecs.push(txt);
    if (inSpecs && /^(scoring|overview|test summary|pros|cons)/i.test(txt)) inSpecs = false;
  });

  // ── Scores ────────────────────────────────────────────────────────────────────
  const allText: string[] = [];
  $('*').each((_: any, el: any) => {
    if ($(el).children().length > 0) return;
    const txt = $(el).text().trim();
    if (txt.length > 0 && txt.length < 200) allText.push(txt);
  });

  const scores = {
    photo: null as number | null, photoMain: null as number | null,
    photoBokeh: null as number | null, photoUltraWide: null as number | null,
    photoTele: null as number | null,
    video: null as number | null, videoMain: null as number | null,
    videoUltraWide: null as number | null, videoTele: null as number | null,
  };
  const bestScores = { ...scores };

  let ctx = '';
  const getScorePair = (
    i: number,
    field: keyof typeof scores,
    bestField: keyof typeof bestScores,
  ) => {
    let scoreFound = false;
    for (let j = i + 1; j < Math.min(i + 10, allText.length); j++) {
      const raw = allText[j];
      if (/^(photo|video|bokeh|main|ultra.?wide|tele|use cases|scoring|overview)$/i.test(raw.replace(/\s*i\s*$/, '').trim())) break;
      if (/best:/i.test(raw)) {
        const m = raw.match(/\((\d{2,3})\)/);
        if (m && bestScores[bestField] === null) bestScores[bestField] = parseInt(m[1], 10);
        break;
      }
      const v = parseInt(raw.replace(/\D/g, ''), 10);
      if (!isNaN(v) && v >= 50 && v <= 200 && /^\d+$/.test(raw.trim())) {
        if (!scoreFound && scores[field] === null) { scores[field] = v; scoreFound = true; }
        else if (scoreFound && bestScores[bestField] === null) { bestScores[bestField] = v; break; }
      }
    }
  };

  for (let i = 0; i < allText.length; i++) {
    const t = allText[i].replace(/\s*i\s*$/, '').trim();
    if (/^photo$/i.test(t)) ctx = 'photo';
    if (/^video$/i.test(t)) ctx = 'video';
    if (/^photo$/i.test(t) && scores.photo === null) getScorePair(i, 'photo', 'photo');
    else if (/^video$/i.test(t) && scores.video === null) getScorePair(i, 'video', 'video');
    else if (/^main$/i.test(t)) {
      if (ctx === 'photo' && scores.photoMain === null) getScorePair(i, 'photoMain', 'photoMain');
      else if (ctx === 'video' && scores.videoMain === null) getScorePair(i, 'videoMain', 'videoMain');
    } else if (/^bokeh$/i.test(t) && scores.photoBokeh === null) getScorePair(i, 'photoBokeh', 'photoBokeh');
    else if (/^ultra.?wide$/i.test(t)) {
      if (ctx === 'photo' && scores.photoUltraWide === null) getScorePair(i, 'photoUltraWide', 'photoUltraWide');
      else if (ctx === 'video' && scores.videoUltraWide === null) getScorePair(i, 'videoUltraWide', 'videoUltraWide');
    } else if (/^tele$/i.test(t)) {
      if (ctx === 'photo' && scores.photoTele === null) getScorePair(i, 'photoTele', 'photoTele');
      else if (ctx === 'video' && scores.videoTele === null) getScorePair(i, 'videoTele', 'videoTele');
    }
  }

  // ── Pros and Cons ─────────────────────────────────────────────────────────────
  const pros: string[] = [];
  const cons: string[] = [];
  let prosCons = '';

  $('h6, h5, h4, h3, li').each((_: any, el: any) => {
    const tag = el.name;
    const raw = $(el).text();
    const txt = raw.trim();
    if (/^pros$/i.test(txt)) { prosCons = 'pros'; return; }
    if (/^cons$/i.test(txt)) { prosCons = 'cons'; return; }
    if (/^(overview|test summary|use cases|scoring|conclusion|about dxomark)/i.test(txt)) { prosCons = ''; return; }
    if (tag === 'li' && txt.length > 5 && txt.length < 200) {
      // Skip nav/menu items (contain newlines or tabs from nested lists)
      if (/[\n\t]/.test(raw)) return;
      // Skip lux/unit-only labels
      if (/^\d+\s*(lux|k|ev|db|fps)$/i.test(txt)) return;
      // Skip all known nav/footer/glossary items (single short phrases without verbs)
      if (/^(our label|our company|our partners|smart choice label|expert committee|how we test|b2b solutions|contact us?|glossary|press relations|join us|rankings|reviews|about|articles|insights|smartphones|cameras|speakers|laptops|wireless speakers|camera sensors|camera lenses|test results|best of|tech articles|custom ranking|b2b|english|français|中文)$/i.test(txt)) return;
      // Skip spatial/temporal noise labels from chart axes
      if (/^(spatial|temporal)\s*noise$/i.test(txt)) return;
      // Must be a real sentence — needs a space and be longer than a nav label
      if (txt.split(' ').length < 3) return;
      if (prosCons === 'pros') pros.push(txt);
      else if (prosCons === 'cons') cons.push(txt);
    }
  });

  // ── Camera sample image scraping ──────────────────────────────────────────────
  //
  // DXOMark review page structure (confirmed from live HTML):
  //   <a href="FULLRES.jpg"><img src="THUMB-550x413.jpg"></a>
  //   Caption text appears as a text node / <em> / <p> immediately after the <a>
  //
  // Strategy:
  //   • Walk headings (h2–h6, #### use-case headings) to track current category
  //   • For every <a href*=".jpg/png/webp"> wrapping an <img>, use href = full-res
  //     and img src = thumbnail
  //   • Caption = next sibling text node or <em>/<p> immediately after the <a>
  //   • Filter out: site logos, SVG icons, score/widget images
  // ─────────────────────────────────────────────────────────────────────────────

  const CATEGORY_PATTERNS: Array<[RegExp, string]> = [
    [/\bselfie\b|front.?cam|facing/i,                  'Selfie'],
    [/main\s*camera|primary|rear\s*cam/i,              'Main Camera'],
    [/ultra.?wide|wide.?angle/i,                        'Ultra-Wide'],
    [/tele(photo)?|zoom|periscope/i,                   'Telephoto / Zoom'],
    [/bokeh|portrait|depth/i,                           'Bokeh / Portrait'],
    [/low.?light|night\s*(mode)?|lowlight/i,           'Low Light / Night'],
    [/outdoor|bright\s*light/i,                         'Outdoor'],
    [/indoor/i,                                         'Indoor'],
    [/video/i,                                          'Video'],
    [/sample|test\s*shot|example|camera/i,             'Sample Shots'],
  ];

  function detectCategory(text: string): string | null {
    for (const [re, label] of CATEGORY_PATTERNS) {
      if (re.test(text)) return label;
    }
    return null;
  }

  function resolveRelative(url: string): string {
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return 'https://www.dxomark.com' + url;
    return url;
  }

  function isValidDxoImage(url: string): boolean {
    if (!url || url.startsWith('data:')) return false;
    const lower = url.toLowerCase();

    // Hard-reject non-raster types
    if (lower.includes('.svg')) return false;
    if (lower.endsWith('.gif')) return false;   // pixel trackers / animated placeholders

    // Hard-reject known decoration/icon patterns
    if (/\b(icon|logo|badge|sprite|blank|placeholder|1x1|pixel|avatar|favicon|loading)\b/.test(lower)) return false;

    // Must carry a real raster extension (before query string)
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(lower)) return false;

    // For absolute URLs, whitelist known image-serving domains
    if (url.startsWith('http') || url.startsWith('//')) {
      return (
        lower.includes('dxomark.com')   ||
        lower.includes('imgix.net')     ||
        lower.includes('imgix.com')     ||
        lower.includes('imgproxy')      ||
        lower.includes('wp-content')    ||   // WordPress media CDN
        lower.includes('cloudfront.net')||   // AWS CloudFront (sometimes used)
        lower.includes('cloudinary.com')     // Cloudinary CDN
      );
    }

    // Relative URLs are fine (will be resolved later)
    return true;
  }

  const sampleImages: IDxoSampleImage[] = [];
  let currentCategory = 'Sample Shots';

  // Walk DOM: headings update category, <a><img></a> blocks yield photos
  const bodyEl = $('body');

  bodyEl.find('*').each((_: any, el: any) => {
    const tag = (el as any).name as string;

    // ── Category detection from headings ──
    if (/^h[1-6]$/.test(tag)) {
      const headText = $(el).text().trim();
      const detected = detectCategory(headText);
      if (detected) currentCategory = detected;
      return;
    }

    // ── Image links: <a href="full.jpg"><img src="thumb.jpg"></a> ──
    if (tag === 'a') {
      const href = $(el).attr('href') || '';
      if (!isValidDxoImage(href)) return;

      const imgEl = $(el).find('img').first();
      if (!imgEl.length) return;

      const fullResUrl = resolveRelative(href);

      // ── Caption extraction ──────────────────────────────────────────────────
      // DXOMark uses WordPress blocks. Known structures:
      //   A) <figure class="wp-block-image"><a href="full"><img></a><figcaption>text</figcaption></figure>
      //   B) <p><a href="full"><img></a></p>  <p>Caption text</p>
      //   C) <figure>…</figure><figcaption>text</figcaption>  (figcaption is figure sibling)
      //   D) <a><img></a><em>caption</em>  (inline em immediately after)
      //   E) <figure><img></figure><p class="caption">text</p>  (paragraph sibling)
      let caption: string | null = null;

      // Helper: clean and validate a candidate caption string
      const cleanCaption = (raw: string): string | null => {
        const t = raw.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').replace(/,\s*and\s*,/g, ' and').replace(/\(\s*\)/g, '').trim();
        // Must have letters, be non-trivially short, not be a heading-level phrase
        if (t.length < 5 || t.length > 300) return null;
        if (!/[a-zA-Z]/.test(t)) return null;
        if (/^\s*(best|top score|portrait|lowlight|zoom|outdoor|indoor|photo|video|main|bokeh|selfie|ultra.?wide|tele)\s*$/i.test(t)) return null;
        return t;
      };

      // A) figcaption inside closest figure ancestor
      const fig = $(el).closest('figure');
      if (fig.length) {
        const fc = fig.find('figcaption').first().text();
        caption = cleanCaption(fc);
      }

      // C) figcaption as a sibling of the figure (outside it)
      if (!caption && fig.length) {
        const siblingFigcaption = fig.next('figcaption');
        if (siblingFigcaption.length) caption = cleanCaption(siblingFigcaption.text());
      }

      // D) <em> immediately after the <a> (inline WordPress pattern)
      if (!caption) {
        const nextEm = $(el).next('em');
        if (nextEm.length) caption = cleanCaption(nextEm.text());
      }

      // B + E) next element sibling of parent <p> or grandparent
      if (!caption) {
        // Try parent's next sibling
        let next = $(el).parent().next();
        // If parent is also just <a> (no wrapper), go up one more
        if (!next.length || next.is('a')) next = $(el).parent().parent().next();

        if (next.length) {
          // E) explicit .caption class
          if (!caption && next.hasClass('caption')) {
            caption = cleanCaption(next.clone().find('a,img,figure').remove().end().text());
          }

          // B) plain <p> sibling
          if (!caption && (next.is('p') || next.is('div'))) {
            const nextTxt = next.clone().find('a,img,figure,h1,h2,h3,h4,h5,h6').remove().end().text();
            caption = cleanCaption(nextTxt);
          }

          // Fallback: any short text-bearing sibling
          if (!caption) {
            const nextTxt = next.clone().find('a,img,figure').remove().end().text();
            caption = cleanCaption(nextTxt);
          }
        }
      }

      sampleImages.push({
        category: currentCategory,
        url: fullResUrl,
        caption,
      });
    }
  });

  // Deduplicate by full-res URL
  const seen = new Set<string>();
  const dedupedImages = sampleImages.filter(img => {
    if (seen.has(img.url)) return false;
    seen.add(img.url);
    return true;
  });

  const result: IDxoReview = {
    device, reviewUrl, overallScore, rankPosition, rankLabel,
    cameraSpecs: [...new Set(cameraSpecs)].slice(0, 12),
    scores,
    bestScores,
    pros:  [...new Set(pros)].slice(0, 15),
    cons:  [...new Set(cons)].slice(0, 15),
    sampleImages: dedupedImages,
    sampleCount:  dedupedImages.length,
    scrapedAt: new Date().toISOString(),
  };

  cacheSet(ck, result);
  return result;
}

/** One-shot: get review data by device name */
/**
 * Build the DXOMark camera review URL directly from a device name.
 * Pattern: https://www.dxomark.com/{brand}-{model-slug}-camera-test[-retested]/
 * e.g. "Samsung Galaxy S25 Ultra" → "samsung-galaxy-s25-ultra-camera-test-retested/"
 * Tries retested first, then plain, then falls back to scraping device page.
 */
async function buildReviewUrl(brand: string, model: string): Promise<string | null> {
  // Build slug: strip parens, lowercase, collapse spaces to hyphens, remove non-slug chars
  const rawSlug = `${brand} ${model}`
    .replace(/\([^)]*\)/g, '')           // strip "(anything)"
    .replace(/[()]/g, '')                 // orphaned parens
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const candidates = [
    `${DXO_BASE}/${rawSlug}-camera-test-retested/`,
    `${DXO_BASE}/${rawSlug}-camera-test/`,
  ];

  for (const url of candidates) {
    try {
      const resp = await axios.head(url, {
        headers: HEADERS,
        timeout: 8000,
        maxRedirects: 3,
        validateStatus: (s) => s < 400,
      });
      if (resp.status < 400) return url;
    } catch { /* try next */ }
  }

  // Fallback: fetch device page and scrape the link
  try {
    const devicePageUrl = buildDxoUrl(brand, model);
    const html = await getDxoHtml(devicePageUrl);
    const $ = cheerio.load(html);
    let found: string | null = null;
    $('a[href*="camera-test"]').each((_: any, el: any) => {
      if (found) return false;
      const href = $(el).attr('href') || '';
      if (href.includes('camera-test')) {
        found = href.startsWith('http') ? href : `${DXO_BASE}${href}`;
      }
    });
    return found;
  } catch { return null; }
}

/** One-shot: get review data by device name — builds review URL directly, no extra device-page fetch */
export async function getDxoReview(deviceName: string, nocache = false): Promise<IDxoReview | null> {
  const { brand, model } = splitBrandModel(deviceName);
  if (!model) return null;

  // Cache the resolved review URL so repeated calls don't HEAD-check twice
  const urlCk = `dxo:reviewurl:v2:${brand}:${model}`.toLowerCase();
  let reviewUrl: string | null = nocache ? null : (await cacheGet<string>(urlCk));

  if (!reviewUrl) {
    reviewUrl = await buildReviewUrl(brand, model);
    if (reviewUrl) cacheSet(urlCk, reviewUrl);
  }

  if (!reviewUrl) return null;
  return scrapeDxoReview(reviewUrl, nocache);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: search (for /dxomark/search endpoint)
// ─────────────────────────────────────────────────────────────────────────────

export async function searchDxo(query: string): Promise<IDxoSearchResult[]> {
  const ck = `dxo:search:v7:${query.toLowerCase().trim()}`;
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

export async function scrapeDxoPage(pageUrl: string, nocache = false): Promise<IDxoScore> {
  const ck = `dxo:page:v7:${pageUrl}`;
  if (!nocache) {
    const cached = await cacheGet<IDxoScore>(ck);
    if (cached) return cached;
  }

  const FAILED: IDxoScore = {
    device: '', url: pageUrl, overallScore: null,
    scores: { photo: null, video: null, audio: null, display: null, zoom: null, bokeh: null, lowLight: null, selfie: null, portrait: null, photoMain: null, photoUltraWide: null, photoTele: null, videoMain: null, videoUltraWide: null, videoTele: null },
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

  // Extract brand/model from URL for fallbacks!
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

export async function getDxoScores(deviceName: string, nocache = false): Promise<IDxoScore | null> {
  const ck = `dxo:result:v7:${deviceName.toLowerCase().trim()}`;
  if (!nocache) {
    const cached = await cacheGet<IDxoScore>(ck);
    if (cached) return cached;
  }

  const { brand, model } = splitBrandModel(deviceName);
  if (!model) return null;

  const url = buildDxoUrl(brand, model);
  const result = await scrapeDxoPage(url, nocache);

  if (result._source !== 'failed') {
    cacheSet(ck, result); // always overwrite cache with fresh data
  }
  return result;
}
