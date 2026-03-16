import axios from 'axios';
import * as cheerio from 'cheerio';
import { IPhoneListItem, ISearchResult } from '../types';
import { baseUrl } from '../server';


/** Convert a GSMArena slug to the HD bigpic image URL.
 *  e.g. "samsung_galaxy_s26_ultra" → "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s26-ultra.jpg"
 *  This is the largest device image GSMArena publicly serves (~400px wide).
 */
function slugToBigpic(slug: string): string {
  return `https://fdn2.gsmarena.com/vv/bigpic/${slug.replace(/\.php$/, '').replace(/_/g, '-').toLowerCase()}.jpg`;
}

export async function getHtml(url: string): Promise<string> {
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  return data;
}

/**
 * Given an actual GSMArena thumbnail src from the page, extract the device name
 * and return the HD bigpic URL. Falls back to slugToBigpic if extraction fails.
 *
 * GSMArena thumbnail pattern:
 *   https://fdn2.gsmarena.com/vv/pics/samsung/samsung-galaxy-s26-ultra-1.jpg
 * Bigpic pattern:
 *   https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s26-ultra.jpg
 */
function toBigpicFromImgSrc(src: string, fallbackSlug: string): string {
  if (!src) return slugToBigpic(fallbackSlug);
  if (src.includes('/vv/bigpic/')) return src;  // already HD
  if (src.includes('/vv/pics/')) {
    // Extract filename: /vv/pics/samsung/samsung-galaxy-s26-ultra-1.jpg → samsung-galaxy-s26-ultra
    const match = src.match(/\/vv\/pics\/[^/]+\/(.+)-\d+\.jpg$/);
    if (match) {
      return `https://fdn2.gsmarena.com/vv/bigpic/${match[1]}.jpg`;
    }
  }
  // Can't derive bigpic — fall back to slug-based URL
  return slugToBigpic(fallbackSlug);
}

export class ParserService {

  private async _parseStatsTable(captionText: string): Promise<IPhoneListItem[]> {
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

    return topPhones;
  }

  async getPhonesByBrand(brandSlug: string): Promise<IPhoneListItem[]> {
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

    return phones;
  }

  async getLatestPhones(): Promise<IPhoneListItem[]> {
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

    return phones;
  }

  async getTopByInterest(): Promise<IPhoneListItem[]> {
    return this._parseStatsTable('By daily hits');
  }

  async getTopByFans(): Promise<IPhoneListItem[]> {
    return this._parseStatsTable('By total favorites');
  }

  async search(query: string): Promise<ISearchResult[]> {
    const html = await getHtml(`${baseUrl}/results.php3?sQuickSearch=yes&sName=${encodeURIComponent(query)}`);
    const $ = cheerio.load(html);
    const phones: ISearchResult[] = [];

    $('.makers ul li').each((_, el) => {
      const href = $(el).find('a').attr('href');
      if (href) {
        const name = $(el).find('span').html()?.split('<br>').join(' ').trim() || $(el).find('span').text().trim();
        const searchSlug = href.replace('.php', '');
        // Read the actual img src from the page (always valid) then upgrade to bigpic.
        // Fall back to slugToBigpic if no img found.
        const rawImgSrc = $(el).find('img').attr('src') || '';
        const bigpic = rawImgSrc ? toBigpicFromImgSrc(rawImgSrc, searchSlug) : slugToBigpic(searchSlug);
        phones.push({
          name: name,
          slug: searchSlug,
          imageUrl: bigpic,          // HD bigpic — may 404 for some phones
          thumbUrl: rawImgSrc || undefined, // original thumbnail — always valid
          detail_url: `/${searchSlug}`,
        });
      }
    });

    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');

    return phones.sort((a, b) => {
      const aName = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const bName = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (aName === normalizedQuery && bName !== normalizedQuery) return -1;
      if (aName !== normalizedQuery && bName === normalizedQuery) return 1;

      if (aName.startsWith(normalizedQuery) && !bName.startsWith(normalizedQuery)) return -1;
      if (!aName.startsWith(normalizedQuery) && bName.startsWith(normalizedQuery)) return 1;

      return 0;
    });
  }

}