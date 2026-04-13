import { IBrandDetails } from "../types";
import { getHtml } from "./parser.service";
import * as cheerio from 'cheerio';
import { baseUrl } from "../server";

export async function getBrands(): Promise<Record<string, IBrandDetails>> {
    const html = await getHtml(`${baseUrl}/makers.php3`);
    const $ = cheerio.load(html);

    const brands: Record<string, IBrandDetails> = {};

    // GSMArena has changed its markup a few times.
    // Try selectors in order of specificity; use the first that yields results.
    const SELECTORS = [
      '.st-text table td',   // original — works on older layout
      '#body table td',      // alternate wrapper id
      '.brandlist-5col td',  // seen on some GSMArena mirrors / layouts
      'table.makers td',     // another variant
      'td',                  // last-resort: grab every <td> and filter by href
    ];

    let foundSelector = '';

    for (const sel of SELECTORS) {
      const els = $(sel).toArray();
      // A valid hit must have an <a href="...-.php"> inside
      const valid = els.filter(el => {
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

      // Brand name: text node before the <span>, e.g. "Samsung  <span>(1234 devices)</span>"
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

    return brands;
}
