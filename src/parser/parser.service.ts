import axios from 'axios';
import * as cheerio from 'cheerio';
import { IPhoneListItem, ISearchResult } from '../types';
import { baseUrl } from '../server';
import { cacheGet, cacheSet } from '../cache';

/** Convert a GSMArena slug to the HD bigpic image URL. */
function slugToBigpic(slug: string): string {
  return `https://fdn2.gsmarena.com/vv/bigpic/${slug.replace(/\.php$/, '').replace(/_/g, '-').toLowerCase()}.jpg`;
}

export async function getHtml(url: string): Promise<string> {
  // No HTML caching — raw HTML is large and wasteful to store.
  // Each calling function caches its own parsed output instead.
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    timeout: 10000,
  });
  return typeof data === 'string' ? data : JSON.stringify(data);
}

/**
 * Given an actual GSMArena thumbnail src from the page, extract the device name
 * and return the HD bigpic URL. Falls back to slugToBigpic if extraction fails.
 */
function toBigpicFromImgSrc(src: string, fallbackSlug: string): string {
  if (!src) return slugToBigpic(fallbackSlug);
  if (src.includes('/vv/bigpic/')) return src;
  if (src.includes('/vv/pics/')) {
    const match = src.match(/\/vv\/pics\/[^/]+\/(.+)-\d+\.jpg$/);
    if (match) {
      return `https://fdn2.gsmarena.com/vv/bigpic/${match[1]}.jpg`;
    }
  }
  return slugToBigpic(fallbackSlug);
}

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
          slug: slug,
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
        const listBigpic = rawSrc ? toBigpicFromImgSrc(rawSrc, listSlug) : slugToBigpic(listSlug);
        phones.push({
          name: $(el).find('span').text().trim(),
          slug: listSlug,
          imageUrl: listBigpic,
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
        const listBigpic = rawSrc ? toBigpicFromImgSrc(rawSrc, listSlug) : slugToBigpic(listSlug);
        phones.push({
          name: $(el).find('span').text().trim(),
          slug: listSlug,
          imageUrl: listBigpic,
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

    const html = await getHtml(`${baseUrl}/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(query)}`);
    const $ = cheerio.load(html);
    const phones: ISearchResult[] = [];

    $('.makers ul li').each((_, el) => {
      const href = $(el).find('a').attr('href');
      if (href) {
        const name = $(el).find('span').html()?.split('<br>').join(' ').trim() || $(el).find('span').text().trim();
        const searchSlug = href.replace('.php', '');
        const rawImgSrc = $(el).find('img').attr('src') || '';
        const bigpic = rawImgSrc ? toBigpicFromImgSrc(rawImgSrc, searchSlug) : slugToBigpic(searchSlug);
        phones.push({
          name: name,
          slug: searchSlug,
          imageUrl: bigpic,
          thumbUrl: rawImgSrc || undefined,
          detail_url: `/${searchSlug}`,
        });
      }
    });

    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');
    const queryWords = query.toLowerCase().trim().split(/\s+/).filter(w => w.length > 1);

    // Variant words that should be penalised if they appear in result but NOT in query
    const VARIANTS = ['ultra', 'pro', 'plus', 'mini', 'lite', 'fe', 'max', 'standard', 'turbo', 'edge'];

    function scorePhone(name: string): number {
      const nameLower = name.toLowerCase();
      const nameNorm  = nameLower.replace(/[^a-z0-9]/g, '');

      // Exact match — best possible
      if (nameNorm === normalizedQuery) return 10000;

      // All query words must appear in the name
      const allMatch = queryWords.every(w => nameLower.includes(w));
      if (!allMatch) return -1;

      // Penalise each variant word present in result but absent from query
      // e.g. query="samsung s26" → "s26 ultra" gets -2000 for "ultra"
      let penalty = 0;
      for (const v of VARIANTS) {
        if (nameLower.includes(v) && !query.toLowerCase().includes(v)) {
          penalty += 2000;
        }
      }

      // Bonus for shorter name (closer match to query)
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