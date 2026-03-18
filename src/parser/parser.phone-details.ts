import { IPhoneDetails, IDeviceImage } from "../types";
import * as cheerio from 'cheerio';
import { baseUrl } from "../server";
import { TSpecCategory } from "../types";
import { getHtml } from "./parser.service";

/**
 * FIXED: parser.phone-details.ts
 * 
 * This version properly detects review and camera sample links for ALL phones,
 * including mid-range devices like iQoo Z7 Pro and Poco F7.
 */

/**
 * Normalize a device slug by removing common brand prefixes and suffixes.
 * GSMArena is inconsistent: specs might be "xiaomi_poco_f7" but review is "poco_f7".
 */
function normalizeBrand(slug: string): string {
  let normalized = slug.toLowerCase()
    .replace(/\.php$/, '')         // Remove .php
    .replace(/-\d+$/, '')          // Remove trailing ID like -12484
    .replace(/_5g$/, '');          // Remove _5g suffix

  // Remove brand prefixes that GSMArena sometimes includes/excludes
  // IMPORTANT: More specific prefixes MUST come first (xiaomi_poco_ before poco_ before xiaomi_)
  const brandPrefixes = [
    'xiaomi_poco_',
    'xiaomi_redmi_',
    'vivo_iqoo_', 
    'samsung_galaxy_', 
    'apple_iphone_', 
    'google_pixel_',
    'xiaomi_', 
    'vivo_', 
    'samsung_',
    'apple_',
    'google_',
    'poco_',  // Standalone poco_ for review links
    'iqoo_',  // Standalone iqoo_ for review links  
    'redmi_',
    'oneplus_', 'realme_', 'oppo_', 'honor_', 'motorola_', 'nokia_'
  ];
  
  for (const prefix of brandPrefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break; // Only remove the first matching prefix
    }
  }
  
  return normalized;
}

/**
 * Extract meaningful tokens from a slug for fuzzy matching.
 * Example: "vivo_iqoo_z7_pro" → ["iqoo", "z7", "pro"]
 */
function extractSlugTokens(slug: string): string[] {
  return slug
    .toLowerCase()
    .split(/[_\-\s]+/)
    .filter(token => 
      token.length > 1 &&           // Not too short
      !token.match(/^\d+$/) &&      // Not pure numbers (IDs)
      !token.match(/^5g$/)          // Not just "5g"
    );
}

/**
 * Check if a review/news link is related to this device.
 * Uses multiple strategies to handle GSMArena's inconsistent naming.
 */
function isLinkRelatedToDevice(
  href: string,
  specSlug: string,
  brand: string,
  model: string
): boolean {
  const hrefLower = href.toLowerCase().replace(/\.php$/, '');
  const specNormalized = normalizeBrand(specSlug);
  
  // Strategy 1: Direct normalized slug match
  // Example: both normalize to "poco_f7"
  const linkNormalized = normalizeBrand(hrefLower);
  if (linkNormalized.includes(specNormalized) || specNormalized.includes(linkNormalized)) {
    return true;
  }
  
  // Strategy 2: Match by model name parts
  // Example: model="iQOO Z7 Pro 5G" → check if link contains "iqoo", "z7", "pro"
  if (model) {
    const modelTokens = model
      .toLowerCase()
      .split(/\s+/)
      .filter(p => p.length > 2 && !p.match(/^5g$/));
    
    const matchedModelTokens = modelTokens.filter(token => hrefLower.includes(token));
    if (matchedModelTokens.length >= Math.min(2, modelTokens.length)) {
      return true;
    }
  }
  
  // Strategy 3: Fuzzy token matching
  // Count how many significant tokens from the spec slug appear in the link
  const specTokens = extractSlugTokens(specSlug);
  const hrefTokens = extractSlugTokens(hrefLower);
  
  let matchCount = 0;
  for (const token of specTokens) {
    if (hrefTokens.some(ht => ht.includes(token) || token.includes(ht))) {
      matchCount++;
    }
  }
  
  // Need at least 2 tokens matching (e.g., "iqoo" + "z7")
  // OR if spec has only 2 tokens, both must match
  const requiredMatches = specTokens.length <= 2 ? specTokens.length : 2;
  if (matchCount >= requiredMatches) {
    return true;
  }
  
  // Strategy 4: Check if link contains the exact spec slug (with or without brand)
  const specSlugClean = specSlug.toLowerCase().replace(/\.php$/, '').replace(/-\d+$/, '');
  if (hrefLower.includes(specSlugClean.replace(/^[a-z]+_/, ''))) {
    return true;
  }
  
  return false;
}

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

    // ── Review / camera-samples link (FIXED VERSION) ─────────────────────────
    // GSMArena uses several URL patterns for review/camera content:
    //   Standard review  : {device}-review-{id}.php
    //   Camera samples   : {device}_camera_samples_specs-news-{id}.php
    //   News article     : {device}-news-{id}.php  (some phones only have this)
    // We collect ALL candidates and rank them: review > camera_samples > news
    
    let review_url: string | undefined;
    
    // Score a href: higher = better
    function reviewScore(href: string): number {
      if (href.includes('-review-')) return 100;
      if (href.includes('camera_samples') || href.includes('camera-samples')) return 90;
      if (href.includes('-news-') && href.includes('camera')) return 70;
      if (href.includes('-news-')) return 30;
      return 0;
    }

    // Collect all potential review/news/camera-samples links
    interface LinkCandidate {
      href: string;
      score: number;
      isRelated: boolean;
    }
    
    const candidates: LinkCandidate[] = [];

    $('a').each((_, el) => {
      const href = ($(el).attr('href') || '').toLowerCase();
      if (!href.endsWith('.php')) return;
      
      const score = reviewScore(href);
      if (score === 0) return;
      
      // Check if this link is related to our device
      const isRelated = isLinkRelatedToDevice(href, slug, brand, model);
      
      const fullUrl = href.startsWith('http') ? href : `${baseUrl}/${href}`;
      candidates.push({ href: fullUrl, score, isRelated });
    });
    
    console.log(`[getPhoneDetails] Found ${candidates.length} link candidates for ${slug}`);
    console.log(`[getPhoneDetails] Candidates:`, candidates.slice(0, 5).map(c => ({ href: c.href, score: c.score, isRelated: c.isRelated })));

    // Sort by: related first, then by score
    candidates.sort((a, b) => {
      if (a.isRelated !== b.isRelated) return a.isRelated ? -1 : 1;
      return b.score - a.score;
    });

    // Take the best match
    if (candidates.length > 0 && candidates[0].isRelated) {
      review_url = candidates[0].href;
      console.log(`[getPhoneDetails] Selected review_url (related): ${review_url}`);
    } else if (candidates.length > 0) {
      // Fallback: if no "related" match, take highest scoring link anyway
      // (some phones might have unusual naming)
      const bestUnrelated = candidates[0];
      if (bestUnrelated.score >= 70) { // Only if it's review or camera_samples
        review_url = bestUnrelated.href;
        console.log(`[getPhoneDetails] Selected review_url (unrelated, high score): ${review_url}`);
      } else {
        console.log(`[getPhoneDetails] No review_url: best unrelated score was ${bestUnrelated.score} (need 70+)`);
      }
    } else {
      console.log(`[getPhoneDetails] No review_url: no candidates found`);
    }

    // Additional fallback: search in page text for links
    if (!review_url) {
      const pageText = $('body').text().toLowerCase();
      const possibleReviewTexts = [
        `${brand.toLowerCase()} ${model.toLowerCase()} review`,
        `${model.toLowerCase()} review`,
        `${brand.toLowerCase()} ${model.toLowerCase()} camera`,
        `${model.toLowerCase()} camera samples`
      ];
      
      for (const searchText of possibleReviewTexts) {
        if (pageText.includes(searchText)) {
          // Page mentions a review/camera - try one more aggressive search
          $('a').each((_, el) => {
            const href = ($(el).attr('href') || '').toLowerCase();
            const text = $(el).text().toLowerCase();
            if ((href.includes('review') || href.includes('camera') || href.includes('news')) &&
                (text.includes('review') || text.includes('camera'))) {
              const fullUrl = href.startsWith('http') ? href : `${baseUrl}/${href}`;
              if (!review_url) review_url = fullUrl;
            }
          });
          break;
        }
      }
    }
    
    // FINAL fallback: Search news section specifically (on-page links)
    if (!review_url) {
      $('a[href*="news"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().toLowerCase();
        if (href.includes('camera') || text.includes('camera')) {
          const fullUrl = href.startsWith('http') ? href : `${baseUrl}/${href}`;
          if (isLinkRelatedToDevice(fullUrl, slug, brand, model)) {
            review_url = fullUrl;
            return false; // break
          }
        }
      });
    }

    // ULTIMATE fallback: GSMArena NEWS LIST search
    // newslist.php3?sSearch= directly indexes news/camera articles — unlike search.php3
    // which only searches device pages. This finds articles like:
    //   "vivo_iqoo_z7_pro_5g_camera_samples_specs-news-59639.php"
    // even when the specs page has zero links to it.
    if (!review_url && model) {
      try {
        // Use just the model without brand prefix for better news search results
        // e.g. "vivo iQOO Z7 Pro" → search "iQOO Z7 Pro camera"
        const modelWords = model.replace(/^vivo\s+/i, '').replace(/^xiaomi\s+/i, '')
          .replace(/^samsung\s+/i, '').replace(/^apple\s+/i, '');
        const newsQuery = encodeURIComponent(modelWords + ' camera');
        const newsUrl = `${baseUrl}/newslist.php3?sSearch=${newsQuery}`;
        console.log(`[getPhoneDetails] Trying newslist fallback: ${newsUrl}`);
        const newsHtml = await getHtml(newsUrl);
        const $news = cheerio.load(newsHtml);

        // News list items are <li> with <a href="...news-NNN.php">
        const newsCandidates: LinkCandidate[] = [];
        $news('a[href]').each((_, el) => {
          const href = ($news(el).attr('href') || '').toLowerCase();
          if (!href.endsWith('.php')) return;
          if (!href.includes('camera') && !href.includes('review')) return;

          const score = reviewScore(href);
          if (score === 0) return;

          const isRelated = isLinkRelatedToDevice(href, slug, brand, modelWords);
          const fullUrl = href.startsWith('http') ? href : `${baseUrl}/${href}`;
          newsCandidates.push({ href: fullUrl, score, isRelated });
        });

        console.log(`[getPhoneDetails] Newslist fallback found ${newsCandidates.length} candidates:`, 
          newsCandidates.slice(0, 5).map(c => ({ href: c.href, score: c.score, isRelated: c.isRelated })));

        newsCandidates.sort((a, b) => {
          if (a.isRelated !== b.isRelated) return a.isRelated ? -1 : 1;
          return b.score - a.score;
        });

        if (newsCandidates.length > 0 && newsCandidates[0].isRelated) {
          review_url = newsCandidates[0].href;
          console.log(`[getPhoneDetails] Newslist fallback selected: ${review_url}`);
        } else if (newsCandidates.length > 0 && newsCandidates[0].score >= 70) {
          review_url = newsCandidates[0].href;
          console.log(`[getPhoneDetails] Newslist fallback selected (unrelated high-score): ${review_url}`);
        }
      } catch (e: any) {
        console.log(`[getPhoneDetails] Newslist fallback failed: ${e?.message}`);
      }
    }

    // ── HD pictures page link ────────────────────────────────────────────────
    // GSMArena specs pages link to a pictures gallery: {device}-pictures-{id}.php
    // These contain full-resolution press photos (much sharper than bigpic ~300px)
    let picturesPageUrl: string | undefined;
    $(`a[href*="-pictures-"]`).each((_, el) => {
      const href = ($(el).attr('href') || '');
      if (href.includes('-pictures-') && href.endsWith('.php')) {
        picturesPageUrl = href.startsWith('http') ? href : `${baseUrl}/${href}`;
        return false; // take first match
      }
    });

    // Scrape the first HD photo from the pictures gallery page
    let hdImageUrl: string | undefined;
    if (picturesPageUrl) {
      try {
        const picHtml = await getHtml(picturesPageUrl);
        const $pic = cheerio.load(picHtml);
        // Pictures pages have <div class="specs-photo-main"> with the full-res img
        // or a gallery grid of images
        const firstPic = $pic('.specs-photo-main a img, .gallery img, .photos-list img')
          .first().attr('src');
        if (firstPic && firstPic.includes('gsmarena.com')) {
          hdImageUrl = firstPic;
        }
      } catch {
        // pictures page failed — hdImageUrl stays undefined
      }
    }

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
    
    // ── Sibling device slugs ──────────────────────────────────────────────────
    // Collect links to OTHER device spec pages on this page (e.g. "Also check", related phones).
    // Used by the fallback in index.ts to find variant slugs (e.g. _5g) when all else fails.
    const siblingSlugTokens = slug.toLowerCase().replace(/-\d+$/, '').split('_')
      .filter((t: string) => t.length > 1);
    const siblingDeviceSlugs: string[] = [];
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').replace(/\.php$/, '').replace(/^\//, '');
      // Must look like a device slug: lowercase letters/numbers/underscores then dash then numbers
      if (!/^[a-z0-9_]+-\d+$/.test(href)) return;
      if (href === slug) return; // skip self
      // Must share at least 2 tokens with our slug (to avoid unrelated devices)
      const hrefTokens = href.replace(/-\d+$/, '').split('_');
      const shared = siblingSlugTokens.filter((t: string) => hrefTokens.includes(t)).length;
      if (shared >= 2 && !siblingDeviceSlugs.includes(href)) {
        siblingDeviceSlugs.push(href);
      }
    });
    console.log(`[getPhoneDetails] siblingDeviceSlugs for ${slug}:`, siblingDeviceSlugs);

    return { 
      brand, 
      model, 
      imageUrl: hdImageUrl || imageUrl,  // HD press photo if available, else bigpic
      device_images,
      review_url,
      siblingDeviceSlugs,
      release_date, 
      dimensions, 
      os, 
      storage, 
      specifications,
    };
  }