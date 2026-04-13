import { IPhoneDetails, IDeviceImage, IColorVariant, IPicturesPageData, TSpecCategory } from "../types";
import * as cheerio from 'cheerio';
<<<<<<< HEAD
import { baseUrl } from "../config";
=======
import { baseUrl } from "../server";
import { TSpecCategory } from "../types";
>>>>>>> parent of e29b6b7 (fixed)
import { getHtml } from "./parser.service";
import { cacheGet, cacheSet } from "../cache";

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
    const ck = `gsm:phone-full:v1:${slug}`;
    const cached = await cacheGet<IPhoneDetails>(ck);
    if (cached) return cached;

    const html = await getHtml(`${baseUrl}/${slug}.php`);
    const $ = cheerio.load(html);

    const brand = $('h1.specs-phone-name-title a').text().trim();
    const model = $('h1.specs-phone-name-title').contents().filter(function () {
        return this.type === 'text';
      }).text().trim();
      
    // Primary device image from the specs page.
    // GSMArena serves this as bigpic (~300px) — we keep whatever URL the page gives us
    // and let the pictures-page scraper below upgrade it to full-res.
    const imageUrl = $('.specs-photo-main a img').attr('src')
      || $('.specs-photo-main img').attr('src')
      || $('.specs-photo img').attr('src');

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
    

    // Sort by: related first, then by score
    candidates.sort((a, b) => {
      if (a.isRelated !== b.isRelated) return a.isRelated ? -1 : 1;
      return b.score - a.score;
    });

    // Take the best match
    if (candidates.length > 0 && candidates[0].isRelated) {
      review_url = candidates[0].href;
    } else if (candidates.length > 0) {
      // Fallback: if no "related" match, take highest scoring link anyway
      // (some phones might have unusual naming)
      const bestUnrelated = candidates[0];
      if (bestUnrelated.score >= 70) { // Only if it's review or camera_samples
        review_url = bestUnrelated.href;
      } else {
      }
    } else {
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

    // ── Scrape pictures page: ALL official images + color variants ────────────
    //
    // GSMArena pictures pages have:
    //   1. "Official images" — fdn2.gsmarena.com/vv/pics/<brand>/<model>-N.jpg
    //      Full-resolution press renders (front, back, side, angle shots).
    //      We collect ALL of them, not just the first.
    //   2. 3D model viewer — color variant <li> chips with data-seo-image="URL"
    //      Each chip has the color name and a representative full-res image URL.
    //      We collect these for the color picker UI.
    //   3. Review sidebar thumbnails (imgroot) — small cropped stills, skipped.
    //
    let hdImageUrl: string | undefined;
    let officialImages: string[] = [];
    let colorVariants: IColorVariant[] = [];

    if (picturesPageUrl) {
      try {
        const picHtml = await getHtml(picturesPageUrl);
        const $pic = cheerio.load(picHtml);

        // ── DEBUG: dump script content to understand GSMArena's page structure ──
        const scriptBlob = $pic('script').map((_, el) => $pic(el).html() || '').get().join('\n');
        // Log any script lines that look image-related so we can see the real var names
        const imageScriptLines = scriptBlob.split('\n').filter(l =>
          /imgroot|bigpic|pics\s*=|photos\s*=|images\s*=|fdn2|vv\/|\.jpg/i.test(l)
        ).slice(0, 30);

        // Log a sample of all <li> elements with data- attrs to find color variant pattern
        const liAttrs: string[] = [];
        $pic('li').each((_, el) => {
          const attrs = Object.keys((el as any).attribs || {})
            .filter(a => a.startsWith('data-') || a === 'class' || a === 'title')
            .map(a => `${a}="${$pic(el).attr(a)}"`)
            .join(' ');
          if (attrs) liAttrs.push(`<li ${attrs}>`);
        });

        // ── Pass 0A: extract full gallery from inline JS — multiple patterns ──
        // GSMArena uses various variable names across different page versions.
        // We try all known patterns.

        // Pattern 1: var imgroot + var pics (older pages)
        const imgrootMatch = scriptBlob.match(/var\s+imgroot\s*=\s*["']([^"']+)["']/);
        const rawImgroot = imgrootMatch?.[1] || '';
        const imgroot = rawImgroot.startsWith('//')
          ? `https:${rawImgroot}`
          : rawImgroot;

        // Try several known array variable names
        const arrayVarPatterns = [
          /var\s+pics\s*=\s*\[([^\]]+)\]/,
          /var\s+photos\s*=\s*\[([^\]]+)\]/,
          /var\s+images\s*=\s*\[([^\]]+)\]/,
          /"pics"\s*:\s*\[([^\]]+)\]/,
          /"photos"\s*:\s*\[([^\]]+)\]/,
        ];

        for (const pattern of arrayVarPatterns) {
          const arrayMatch = scriptBlob.match(pattern);
          if (!arrayMatch) continue;
          const inner = arrayMatch[1];

          // Sub-case A: relative filenames + imgroot base
          if (imgroot) {
            const filenames = Array.from(inner.matchAll(/"([^"]+\.jpe?g)"/gi)).map(m => m[1]);
            for (const filename of filenames) {
              if (!filename.startsWith('http')) {
                const fullUrl = `${imgroot}${filename}`;
                if (!officialImages.includes(fullUrl)) officialImages.push(fullUrl);
              }
            }
          }
          // Sub-case B: full URLs in the array
          const fullUrls = Array.from(inner.matchAll(/"((?:https?:)?\/\/[^"]+\.jpe?g)"/gi)).map(m => {
            const u = m[1];
            return u.startsWith('//') ? `https:${u}` : u;
          });
          for (const url of fullUrls) {
            if (!officialImages.includes(url)) officialImages.push(url);
          }
          if (officialImages.length > 0) break; // stop if we found images
        }

        // ── Pass 0B: scan ALL <a href> for full-res image links ───────────────
        // GSMArena wraps gallery thumbnails in <a href="full-res-url">.
        // This catches images the JS approach misses.
        $pic('a[href]').each((_, el) => {
          const href = ($pic(el).attr('href') || '').trim();
          const fullHref = href.startsWith('//') ? `https:${href}` : href;
          if (
            fullHref.match(/\.jpe?g$/i) &&
            (fullHref.includes('gsmarena.com') || fullHref.includes('fdn2.') || fullHref.includes('fdn.')) &&
            !fullHref.includes('/reviews/') &&
            !fullHref.includes('/lifestyle/') &&
            !officialImages.includes(fullHref)
          ) {
            officialImages.push(fullHref);
          }
        });

        // ── Pass 1: scan <img> tags for /vv/pics/ images not already captured ─
        $pic('img').each((_, el) => {
          const src = $pic(el).attr('src') || $pic(el).attr('data-src') || '';
          const fullSrc = src.startsWith('//') ? `https:${src}` : src;
          if (fullSrc.includes('/vv/pics/') && fullSrc.includes('gsmarena.com') && fullSrc.match(/\.jpe?g$/i)) {
            if (!officialImages.includes(fullSrc)) officialImages.push(fullSrc);
          }
        });
        // First official image is the hero
        if (officialImages.length > 0) hdImageUrl = officialImages[0];

        // ── Pass 2: color variants from the 3D model section ───────────────────
        // Try all known attribute/selector patterns GSMArena has used
        const colorSelectors = [
          'ul.color-list li',
          '#model-3d li',
          '.model-3d li',
          '[class*="color-list"] li',
          '[class*="model-3d"] li',
          'ul[class*="colors"] li',
          '.pictures-colors li',
          '.color-buttons li',
        ];
        $pic(colorSelectors.join(', ')).each((idx, el) => {
          const $li = $pic(el);
          const imgUrl = (
            $li.attr('data-seo-image') ||
            $li.attr('data-image') ||
            $li.attr('data-image-url') ||
            $li.attr('data-src') ||
            $li.find('img').attr('src') ||
            $li.find('img').attr('data-src') ||
            ''
          ).trim();
          const rawUrl = imgUrl.startsWith('//') ? `https:${imgUrl}` : imgUrl;
          const colorName = (
            $li.attr('title') ||
            $li.attr('data-color') ||
            $li.find('span').text() ||
            $li.text()
          ).trim();
          if (colorName && rawUrl && (rawUrl.startsWith('http') || rawUrl.startsWith('//'))) {
            colorVariants.push({ colorName, imageUrl: rawUrl, isDefault: idx === 0 });
          }
        });

        // ── Fallback: infer color names from inline JS color/colors array ──────
        // scriptBlob already built above — reuse it here.
        if (colorVariants.length === 0 && officialImages.length > 0) {
          const colorsMatch = scriptBlob.match(/(?:var\s+colors?|"colors?")\s*[=:]\s*\[([^\]]+)\]/);
          if (colorsMatch) {
            const names = Array.from(colorsMatch[1].matchAll(/"([^"]+)"/g)).map(m => m[1]);
            names.forEach((name, idx) => {
              const imgUrl = officialImages[idx] || officialImages[0];
              if (name && imgUrl) colorVariants.push({ colorName: name, imageUrl: imgUrl, isDefault: idx === 0 });
            });
          }
        }

        // ── Pass 3: imgroot fallback if no /vv/pics/ found ─────────────────
        if (!hdImageUrl) {
          const isCleanImgroot = (src: string) =>
            src.includes('/imgroot/') && src.includes('gsmarena.com') &&
            !src.includes('/reviews/') && !src.includes('/camera') &&
            !src.includes('/lifestyle/') && !src.includes('/inline/');

          let foundThumb: string | undefined;
          $pic('img').each((_, el) => {
            const src = $pic(el).attr('src') || $pic(el).attr('data-src') || '';
            if (isCleanImgroot(src) && (src.includes('/photos/') || src.includes('/design/'))) {
              foundThumb = src; return false;
            }
          });
          if (!foundThumb) {
            $pic('img').each((_, el) => {
              const src = $pic(el).attr('src') || $pic(el).attr('data-src') || '';
              if (isCleanImgroot(src)) { foundThumb = src; return false; }
            });
          }
          if (foundThumb) {
            hdImageUrl = foundThumb.replace(/\/-[^/]+\/(?=[^/]+\.jpe?g$)/i, '/-/-/');
          }
        }
      } catch {
        // pictures page failed — hdImageUrl stays undefined, falls back to bigpic
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
    // Collect links to OTHER device spec pages that are variants of this device.
    // Strip brand prefix and generic words — only match on SPECIFIC model tokens.
    // e.g. "vivo_iqoo_z7_pro" → specific tokens: ["iqoo", "z7"]
    // "vivo_x300_pro_5g" shares only "pro" (generic) → NOT a sibling
    // "vivo_iqoo_z7_pro_5g" shares "iqoo" + "z7" → IS a sibling
    const GENERIC_TOKENS = new Set(['pro', 'plus', 'ultra', 'mini', 'lite', 'max', '5g', '4g', 'fe', 'se', 'neo', 'edge', 'vivo', 'iqoo', 'xiaomi', 'samsung', 'apple', 'google', 'oppo', 'realme', 'oneplus', 'nothing', 'nokia', 'motorola', 'honor', 'huawei']);
    // Brand token = first part of slug
    const brandToken = slug.split('_')[0];
    const slugBase = slug.toLowerCase().replace(/-\d+$/, '');
    // Specific tokens: exclude brand and generic words, keep model-specific identifiers
    const specificTokens = slugBase.split('_').filter((t: string) => 
      t.length > 1 && !GENERIC_TOKENS.has(t) && t !== brandToken
    );
    // If no specific tokens found (e.g. slug is just "vivo_pro"), fall back to all non-brand tokens
    const matchTokens = specificTokens.length > 0 
      ? specificTokens 
      : slugBase.split('_').filter((t: string) => t.length > 1 && t !== brandToken);

    const siblingDeviceSlugs: string[] = [];
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').replace(/\.php$/, '').replace(/^\//, '');
      if (!/^[a-z0-9_]+-\d+$/.test(href)) return;
      if (href === slug) return;
      // ALL specific tokens must appear in the sibling slug
      const hrefBase = href.replace(/-\d+$/, '').toLowerCase();
      const allMatch = matchTokens.every((t: string) => hrefBase.includes(t));
      if (allMatch && !siblingDeviceSlugs.includes(href)) {
        siblingDeviceSlugs.push(href);
      }
    });

    // Build picturesPageData bundle
    const picturesPageData: IPicturesPageData | undefined = picturesPageUrl ? {
      officialImages,
      colorVariants,
      picturesPageUrl,
    } : undefined;

    const result: IPhoneDetails = {
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
      picturesPageData,
    };

    cacheSet(ck, result);
    return result;
  }