/**
 * parser.brands.ts
 *
 * Scrapes the GSMArena makers page to produce a brand directory.
 *
 * Fixes over original:
 *  - Result is now cached (original had zero caching)
 *  - Uses shared getHtml() which provides UA rotation + retry
 *  - Imports baseUrl from config, not from server
 */

import { IBrandDetails } from '../types';
import { getHtml } from './parser.service';
import * as cheerio from 'cheerio';
import { baseUrl } from '../config';
import { cacheGet, cacheSet } from '../cache';

const CACHE_KEY = 'gsm:brands:v1';

export async function getBrands(): Promise<Record<string, IBrandDetails>> {
  const cached = await cacheGet<Record<string, IBrandDetails>>(CACHE_KEY);
  if (cached) return cached;

  const html = await getHtml(`${baseUrl}/makers.php3`);
  const $ = cheerio.load(html);

  const brands: Record<string, IBrandDetails> = {};

  const SELECTORS = [
    '.st-text table td',
    '#body table td',
    '.brandlist-5col td',
    'table.makers td',
    'td',
  ];

  let foundSelector = '';

  for (const sel of SELECTORS) {
    const valid = $(sel)
      .toArray()
      .filter(el => {
        const href = $(el).find('a').attr('href') || '';
        return href.endsWith('.php') && href.includes('-');
      });

    if (valid.length > 0) {
      foundSelector = sel;
      console.log(`[getBrands] using selector "${sel}" — found ${valid.length} brand cells`);
      break;
    }
  }

  if (!foundSelector) {
    console.warn('[getBrands] No selector matched. HTML snippet:', html.slice(0, 500));
    return brands;
  }

  $(foundSelector).each((_, el) => {
    const link = $(el).find('a');
    const href = link.attr('href');

    if (!href || !href.endsWith('.php') || !href.includes('-')) return;

    const brandName = link.clone().children('span').remove().end().text().trim();
    if (!brandName) return;

    const deviceCountText = link.find('span').text();
    const deviceCountMatch = deviceCountText.match(/\d+/);
    const deviceCount = deviceCountMatch ? parseInt(deviceCountMatch[0], 10) : 0;

    const brandIdMatch = href.match(/-(\d+)\.php$/);
    const brandId = brandIdMatch ? parseInt(brandIdMatch[1], 10) : 0;

    const brandSlug = href.replace('.php', '');

    brands[brandName] = {
      brand_id: brandId,
      brand_slug: brandSlug,
      device_count: deviceCount,
      detail_url: `/brands/${brandSlug}`,
    };
  });

  if (Object.keys(brands).length > 0) {
    cacheSet(CACHE_KEY, brands);
  }

  return brands;
}
