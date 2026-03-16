import { IPhoneDetails, IDeviceImage } from "../types";
import * as cheerio from 'cheerio';
import { baseUrl } from "../server";
import { TSpecCategory } from "../types";
import { getHtml } from "./parser.service";

export async function getPhoneDetails(slug: string): Promise<IPhoneDetails> {
    const html = await getHtml(`${baseUrl}/${slug}.php`);
    const $ = cheerio.load(html);

    const brand = $('h1.specs-phone-name-title a').text().trim();
    const model = $('h1.specs-phone-name-title').contents().filter(function () {
        return this.type === 'text';
      }).text().trim();
    // Primary device image — GSMArena specs pages serve this as the bigpic URL directly
    // e.g. https://fdn2.gsmarena.com/vv/bigpic/apple-iphone-17-pro-max.jpg
    let imageUrl = $('.specs-photo-main a img').attr('src')
      || $('.specs-photo-main img').attr('src')
      || $('.specs-photo img').attr('src');
    // Ensure it is the bigpic version — upgrade any small /vv/pics/ URLs
    if (imageUrl && imageUrl.includes('/vv/pics/')) {
      // /vv/pics/apple/apple-iphone-17-pro-max-1.jpg → /vv/bigpic/apple-iphone-17-pro-max.jpg
      imageUrl = imageUrl
        .replace(/\/vv\/pics\/[^/]+\//, '/vv/bigpic/')
        .replace(/-\d+\.jpg$/, '.jpg');
    }

    // ── Device colour images ──────────────────────────────────────────────────
    const device_images: IDeviceImage[] = [];

    // Primary image (already captured above)
    if (imageUrl) {
      const primaryColor = $('.specs-photo-main').next('.specs-photo-colors, .color-list')
        .find('li.selected, li:first-child').attr('title') || 'Default';
      device_images.push({ color: primaryColor, url: imageUrl });
    }

    // Colour-variant thumbnails rendered as <li data-color="…"> or similar
    $('li[data-image-url]').each((_, el) => {
      const url = $(el).attr('data-image-url') || '';
      const color = $(el).attr('title') || $(el).attr('data-color') || $(el).text().trim() || 'Unknown';
      if (url && !device_images.find(i => i.url === url)) {
        device_images.push({ color, url });
      }
    });

    // Alternative pattern: img inside .specs-photo-colors
    $('.specs-photo-colors li, .color-list li').each((_, el) => {
      const img = $(el).find('img');
      const url = img.attr('src') || img.attr('data-src') || '';
      const color = $(el).attr('title') || img.attr('alt') || $(el).text().trim() || 'Unknown';
      if (url && !device_images.find(i => i.url === url)) {
        device_images.push({ color, url });
      }
    });

    // ── Review link ────────────────────────────────────────────────────────────
    // Strategy: find the review link whose slug matches the phone's own slug.
    // GSMArena specs pages can have "related article" links (e.g. "best sounding phones")
    // which also contain "-review-" — we must prefer the phone's own review.
    // The phone's review slug always starts with the device slug prefix.
    let review_url: string | undefined;
    // Build a loose match prefix from the page slug (e.g. "apple_iphone_17_pro_max")
    const slugPrefix = slug.replace(/\.php$/, '').split('_').slice(0, 3).join('_').toLowerCase();
    $('a').each((_, el) => {
      const href = ($(el).attr('href') || '').toLowerCase();
      if (!href.includes('-review-') || !href.endsWith('.php')) return;
      const candidate = href.startsWith('http') ? href : `${baseUrl}/${href}`;
      if (!review_url) {
        // Accept the first review link we find as a fallback
        review_url = candidate;
      }
      // Prefer a link whose slug starts with the phone slug prefix (best match)
      const linkSlug = href.replace(/^.*\//, '').replace(/-review-.*$/, '');
      if (linkSlug.startsWith(slugPrefix)) {
        review_url = candidate;
        return false; // break — found the phone's own review
      }
    });

    const release_date = $('span[data-spec="released-hl"]').text().trim();
    const dimensions = $('span[data-spec="body-hl"]').text().trim();
    const os = $('span[data-spec="os-hl"]').text().trim();
    const storage = $('span[data-spec="storage-hl"]').text().trim();
    
    const specifications: Record<string, TSpecCategory> = {};

    $('#specs-list table').each((_, table) => {
      const categoryName = $(table).find('th').text().trim();
      if (!categoryName) return;

      const categorySpecs: TSpecCategory = {};
      const additionalFeatures: string[] = [];

      $(table).find('tr').each((_, row) => {
        const title = $(row).find('td.ttl').text().trim();
        const value = $(row).find('td.nfo').html()?.replace(/<br\s*\/?>/gi, '\n').trim() || '';

        if (title && title !== '\u00a0') {
          categorySpecs[title] = value;
        } else if (value) {
          additionalFeatures.push(value);
        }
      });
      
      if (additionalFeatures.length > 0) {
        categorySpecs['Features'] = additionalFeatures.join('\n');
      }

      if (Object.keys(categorySpecs).length > 0) {
        specifications[categoryName] = categorySpecs;
      }
    });
    
    return { 
      brand, 
      model, 
      imageUrl,
      device_images,
      review_url,
      release_date, 
      dimensions, 
      os, 
      storage, 
      specifications,
    };
  }