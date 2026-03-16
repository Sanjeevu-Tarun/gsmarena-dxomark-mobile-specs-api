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
        phones.push({
          name: $(el).find('span').text().trim(),
          slug: listSlug,
          imageUrl: slugToBigpic(listSlug),
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
        phones.push({
          name: $(el).find('span').text().trim(),
          slug: listSlug,
          imageUrl: slugToBigpic(listSlug),
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
        phones.push({
          name: name,
          slug: searchSlug,
          imageUrl: slugToBigpic(searchSlug),
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