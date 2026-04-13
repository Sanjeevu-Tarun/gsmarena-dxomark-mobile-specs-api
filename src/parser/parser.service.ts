/**
 * parser.service.ts
 *
 * Core HTTP fetcher + GSMArena list/search parsers.
 *
 * Fixes over original:
 *  - User-Agent pool (8 realistic UAs) rotated round-robin per request
 *  - Exponential-backoff retry on 429 / 5xx / network errors (up to 3 retries)
 *  - Shared keep-alive axios instance (reuses TCP connections)
 *  - Realistic browser headers (Accept, Accept-Language, Referer)
 *  - Import baseUrl from config (not server)
 */

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';
import { IPhoneListItem, ISearchResult } from '../types';
import { baseUrl } from '../config';
import { cacheGet, cacheSet } from '../cache';

// ── User-Agent pool ───────────────────────────────────────────────────────────
const USER_AGENTS: string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
];

let _uaIndex = 0;
function pickUserAgent(): string {
  const ua = USER_AGENTS[_uaIndex % USER_AGENTS.length];
  _uaIndex = (_uaIndex + 1) % USER_AGENTS.length;
  return ua;
}

// ── Shared keep-alive axios instance ─────────────────────────────────────────
const _http: AxiosInstance = axios.create({
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10 }),
  timeout: 15_000,
});

// ── Retry helper ─────────────────────────────────────────────────────────────
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Fetch a URL with automatic retry on transient failures.
 * Rotates the User-Agent on every attempt.
 */
export async function getHtml(url: string): Promise<string> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, status } = await _http.get<string>(url, {
        headers: {
          'User-Agent': pickUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Referer': 'https://www.gsmarena.com/',
        },
        validateStatus: (s) => s < 600,
      });

      if (RETRYABLE_STATUS.has(status)) {
        throw Object.assign(new Error(`HTTP ${status}`), { status });
      }

      return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (err: any) {
      lastErr = err;
      const isRetryable =
        RETRYABLE_STATUS.has(err?.status) ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNABORTED';

      if (!isRetryable || attempt === MAX_RETRIES) break;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 600ms → 1.2s → 2.4s
      console.warn(`[getHtml] attempt ${attempt + 1} failed (${err?.message}), retrying in ${delay}ms — ${url}`);
      await sleep(delay);
    }
  }

  throw lastErr;
}

// ── Image URL helpers ─────────────────────────────────────────────────────────

/** Convert a GSMArena slug to the HD bigpic image URL. */
function slugToBigpic(slug: string): string {
  return `https://fdn2.gsmarena.com/vv/bigpic/${slug
    .replace(/\.php$/, '')
    .replace(/_/g, '-')
    .toLowerCase()}.jpg`;
}

/**
 * Given an actual GSMArena thumbnail src, return the HD bigpic URL.
 * Falls back to slugToBigpic if extraction fails.
 */
function toBigpicFromImgSrc(src: string, fallbackSlug: string): string {
  if (!src) return slugToBigpic(fallbackSlug);
  if (src.includes('/vv/bigpic/')) return src;
  if (src.includes('/vv/pics/')) {
    const match = src.match(/\/vv\/pics\/[^/]+\/(.+)-\d+\.jpg$/);
    if (match) return `https://fdn2.gsmarena.com/vv/bigpic/${match[1]}.jpg`;
  }
  return slugToBigpic(fallbackSlug);
}

// ── ParserService ─────────────────────────────────────────────────────────────

export class ParserService {

  private async _parseStatsTable(captionText: string): Promise<IPhoneListItem[]> {
    const ck = `gsm:stats:v1:${captionText}`;
    const cached = await cacheGet<IPhoneListItem[]>(ck);
    if (cached) return cached;

    const html = await getHtml(`${baseUrl}/stats.php3`);
    const $ = cheerio.load(html);
    const topPhones: IPhoneListItem[] = [];

    const table = $(`table:has(caption:contains("${captionText}"))`);
    table.find('tbody tr').each((index, el) => {
      const link = $(el).find('th a');
      const href = link.attr('href');
      const hitsText = $(el).find('td').last().prev().text().replace(/,/g, '');
      if (href) {
        const slug = href.replace('.php', '');
        topPhones.push({
          rank: index + 1,
          name: link.text().trim(),
          slug,
          hits: parseInt(hitsText, 10) || 0,
          detail_url: `/${slug}`,
        });
      }
    });

    cacheSet(ck, topPhones);
    return topPhones;
  }

  async getPhonesByBrand(brandSlug: string): Promise<IPhoneListItem[]> {
    const ck = `gsm:brand:v1:${brandSlug}`;
    const cached = await cacheGet<IPhoneListItem[]>(ck);
    if (cached) return cached;

    const html = await getHtml(`${baseUrl}/${brandSlug}.php`);
    const $ = cheerio.load(html);
    const phones: IPhoneListItem[] = [];

    $('.makers ul li').each((_, el) => {
      const href = $(el).find('a').attr('href');
      if (href) {
        const listSlug = href.replace('.php', '');
        const rawSrc = $(el).find('img').attr('src') || '';
        phones.push({
          name: $(el).find('span').text().trim(),
          slug: listSlug,
          imageUrl: rawSrc ? toBigpicFromImgSrc(rawSrc, listSlug) : slugToBigpic(listSlug),
          thumbUrl: rawSrc || undefined,
          detail_url: `/${listSlug}`,
        });
      }
    });

    cacheSet(ck, phones);
    return phones;
  }

  async getLatestPhones(): Promise<IPhoneListItem[]> {
    const ck = `gsm:latest:v1`;
    const cached = await cacheGet<IPhoneListItem[]>(ck);
    if (cached) return cached;

    const html = await getHtml(`${baseUrl}/new.php3`);
    const $ = cheerio.load(html);
    const phones: IPhoneListItem[] = [];

    $('.makers ul li').each((_, el) => {
      const href = $(el).find('a').attr('href');
      if (href) {
        const listSlug = href.replace('.php', '');
        const rawSrc = $(el).find('img').attr('src') || '';
        phones.push({
          name: $(el).find('span').text().trim(),
          slug: listSlug,
          imageUrl: rawSrc ? toBigpicFromImgSrc(rawSrc, listSlug) : slugToBigpic(listSlug),
          thumbUrl: rawSrc || undefined,
          detail_url: `/${listSlug}`,
        });
      }
    });

    cacheSet(ck, phones);
    return phones;
  }

  async getTopByInterest(): Promise<IPhoneListItem[]> {
    return this._parseStatsTable('By daily hits');
  }

  async getTopByFans(): Promise<IPhoneListItem[]> {
    return this._parseStatsTable('By total favorites');
  }

  async search(query: string): Promise<ISearchResult[]> {
    const ck = `gsm:search:v1:${query.toLowerCase().trim()}`;
    const cached = await cacheGet<ISearchResult[]>(ck);
    if (cached) return cached;

    const html = await getHtml(
      `${baseUrl}/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(query)}`,
    );
    const $ = cheerio.load(html);
    const phones: ISearchResult[] = [];

    $('.makers ul li').each((_, el) => {
      const href = $(el).find('a').attr('href');
      if (href) {
        const name =
          $(el).find('span').html()?.split('<br>').join(' ').trim() ||
          $(el).find('span').text().trim();
        const searchSlug = href.replace('.php', '');
        const rawImgSrc = $(el).find('img').attr('src') || '';
        phones.push({
          name,
          slug: searchSlug,
          imageUrl: rawImgSrc ? toBigpicFromImgSrc(rawImgSrc, searchSlug) : slugToBigpic(searchSlug),
          thumbUrl: rawImgSrc || undefined,
          detail_url: `/${searchSlug}`,
        });
      }
    });

    // ── Relevance scoring ─────────────────────────────────────────────────────
    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');
    const queryWords = query.toLowerCase().trim().split(/\s+/).filter(w => w.length > 1);
    const VARIANTS = ['ultra', 'pro', 'plus', 'mini', 'lite', 'fe', 'max', 'standard', 'turbo', 'edge'];

    function scorePhone(name: string): number {
      const nameLower = name.toLowerCase();
      const nameNorm  = nameLower.replace(/[^a-z0-9]/g, '');

      if (nameNorm === normalizedQuery) return 10_000;

      const allMatch = queryWords.every(w => nameLower.includes(w));
      if (!allMatch) return -1;

      let penalty = 0;
      for (const v of VARIANTS) {
        if (nameLower.includes(v) && !query.toLowerCase().includes(v)) penalty += 2000;
      }

      const lengthBonus = Math.max(0, 300 - name.length * 4);
      return 5000 - penalty + lengthBonus;
    }

    const result = phones
      .map(p => ({ p, score: scorePhone(p.name) }))
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.p);

    cacheSet(ck, result);
    return result;
  }
}
