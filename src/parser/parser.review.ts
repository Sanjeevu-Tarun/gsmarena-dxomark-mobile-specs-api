/**
 * parser.review.ts
 *
 * Scrapes GSMArena review pages and camera sample sub-pages.
 *
 * GSMArena review structure for e.g. Samsung Galaxy S26 Ultra:
 *   Page 1 (base):  samsung_galaxy_s26_ultra-review-2939.php       ← overview / TOC
 *   Page 2:         samsung_galaxy_s26_ultra-review-2939p2.php      ← Design
 *   Page 3:         samsung_galaxy_s26_ultra-review-2939p3.php      ← Lab Tests
 *   Page 4:         samsung_galaxy_s26_ultra-review-2939p4.php      ← Software & Performance
 *   Page 5:         samsung_galaxy_s26_ultra-review-2939p5.php      ← Camera (samples!)
 *   Page 6:         samsung_galaxy_s26_ultra-review-2939p6.php      ← Verdict
 *
 * Camera samples live ONLY on the camera page (p5 in this case).
 * Within that page, each category (Main, Zoom, Night, Selfie, Video…) is a
 * separate <section> or <div> identified by a heading/tab label.
 *
 * Images on camera sample pages use this pattern:
 *   <li>
 *     <img src="…/thumb_small.jpg" data-src="…/thumb.jpg" alt="caption …">
 *   </li>
 * The full-resolution image URL is derived by replacing the thumb size token
 * in the CDN path:  /-160/  →  /-/-  (original) or /-1200/
 *
 * The lightbox href on camera sample pages is always "#" — we MUST derive
 * the full-res URL from the thumbnail src, not the anchor href.
 */

import * as cheerio from 'cheerio';
import { baseUrl } from '../server';
import { getHtml } from './parser.service';
import {
  IReviewResult,
  ICameraSampleCategory,
  ICameraSample,
  IReviewGallerySection,
  ILensDetail,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function absoluteUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  return `${baseUrl}/${href.replace(/^\//, '')}`;
}

function cleanImgUrl(src: string | undefined): string {
  if (!src) return '';
  return absoluteUrl(src.trim());
}

/**
 * Derive full-resolution image URL from a GSMArena thumbnail URL.
 *
 * GSMArena CDN pattern (confirmed from live page):
 *   thumb:    https://fdn.gsmarena.com/imgroot/reviews/26/<device>/camera/-160/gsmarena_1101.jpg
 *   full-res: https://fdn.gsmarena.com/imgroot/reviews/26/<device>/camera/-/-/gsmarena_1101.jpg
 *
 *   The size token (/-160/, /-216/, /-320/, /-1200/, /-1200w5/) is replaced with /-/-/
 */
/**
 * Universal full-resolution URL extractor.
 *
 * Instead of regex on size tokens (fragile, breaks on new formats like -x120),
 * we use path structure: GSMArena always stores full-res images at:
 *   /imgroot/reviews/<year>/<device>/camera/<filename>
 * Thumbnails add a size segment before the filename:
 *   /imgroot/reviews/<year>/<device>/camera/-160/<filename>
 *   /imgroot/reviews/<year>/<device>/camera/-x120/<filename>
 *
 * By splitting on the section path and keeping only the filename,
 * we get the full-res URL regardless of what size token was used.
 */
function thumbToFullRes(thumbUrl: string): string {
  if (!thumbUrl) return '';
  if (!thumbUrl.includes('/imgroot/reviews/')) return thumbUrl;

  // Extract filename (gsmarena_NNNN.jpg or similar number-based filename)
  const filenameMatch = thumbUrl.match(/(gsmarena_\d+\.\w+)$/);
  if (!filenameMatch) return thumbUrl;
  const filename = filenameMatch[1];

  // Find the section path (/camera/, /lifestyle/, /design/, /photos/)
  const sections = ['/camera/', '/lifestyle/', '/design/', '/photos/'];
  for (const section of sections) {
    const idx = thumbUrl.indexOf(section);
    if (idx !== -1) {
      return thumbUrl.slice(0, idx + section.length) + filename;
    }
  }

  // Fallback: strip any /-token/ segment before the filename
  return thumbUrl.replace(/\/-[^/]+\/(?=gsmarena_)/, '/');
}

/** Return true if the URL still has a size token (shouldn't happen with new extractor) */
function isThumbnailUrl(url: string): boolean {
  // Check for any path segment that looks like a size token: /-NNN/ or /-xNNN/
  return /\/-(\d|x\d)[^/]*\//.test(url);
}

/**
 * Decide whether a URL is a real content image (not a store badge, logo, icon,
 * competitor thumbnail from a comparison widget, spacer, etc.).
 */
function isContentImage(src: string): boolean {
  if (!src || src === '#' || src.includes('www.gsmarena.com/#')) return false;
  // Store/shop logos
  if (/\/static\/stores\//.test(src)) return false;
  // Tiny icons / spacers
  if (/icon|logo|spacer|blank|pixel\.gif|arrow/.test(src)) return false;
  // Must be from the GSMArena CDN or fdn domain
  if (!src.includes('gsmarena.com') && !src.includes('fdn.gsmarena') && !src.includes('fdn2.gsmarena')) return false;
  return true;
}

/**
 * Is this image URL a camera sample (lives under /imgroot/reviews/…/camera/)?
 * These are the real camera samples — lifestyle/phone/sshots are article images.
 */
function isCameraSampleImage(src: string): boolean {
  // Match: /imgroot/reviews/ AND /camera OR /camera1 OR /camera2 etc
  return src.includes('/imgroot/reviews/') && /\/camera\d*\//.test(src);
}

/**
 * For GSMArena news/article camera pages (e.g. vivo_iqoo_z7_pro_5g_camera_samples_specs-news-59639.php),
 * images are stored on different CDN paths than standard review pages:
 *   - /vv/pics/...
 *   - /imgroot/news/...
 *   - /imgroot/articles/...
 * We accept any real content image from the GSMArena CDN that isn't a UI chrome element.
 */
function isNewsPageCameraImage(src: string): boolean {
  if (!src) return false;
  if (!isContentImage(src)) return false;
  // Skip obvious non-sample images
  if (/icon|logo|spacer|blank|pixel\.gif|arrow/.test(src)) return false;
  // Must be from GSMArena CDN
  if (!src.includes('gsmarena.com')) return false;
  // Accept standard review camera images
  if (isCameraSampleImage(src)) return true;
  // Accept news/article CDN paths
  if (src.includes('/vv/pics/')) return true;
  if (src.includes('/imgroot/news/')) return true;
  if (src.includes('/imgroot/articles/')) return true;
  return false;
}

/**
 * Derive full-res URL for news-page images (e.g. /vv/pics/...).
 * These may have size suffixes like -NN appended before the extension.
 * Strip trailing -NNN size suffix from the base filename if present.
 * e.g. /vv/pics/vivo/iqoo-z7-pro/photo-640.jpg -> /vv/pics/vivo/iqoo-z7-pro/photo.jpg
 */
function newsImageToFullRes(src: string): string {
  // If it's a standard review image, use the existing extractor
  if (src.includes('/imgroot/reviews/')) return thumbToFullRes(src);
  // For /vv/pics/ and similar: strip size suffix like -640, -1200 before extension
  return src.replace(/-\d+(\.[a-z]+)$/i, '$1');
}

/**
 * Normalise a raw tab / heading label into a canonical category string.
 */
function normaliseCategory(raw: string): string {
  const s = raw.trim();
  if (!s) return 'Unknown';
  const lower = s.toLowerCase();
  if (/selfie|front.?cam/.test(lower)) return 'Selfie';
  if (/night|low.?light/.test(lower)) return 'Night / Low Light';
  if (/\bzoom\b|tele/.test(lower)) return 'Zoom';
  if (/\bvideo\b/.test(lower)) return 'Video';
  if (/portrait/.test(lower)) return 'Portrait';
  if (/ultra.?wide|ultrawide/.test(lower)) return 'Ultra-Wide';
  if (/\bwide\b/.test(lower)) return 'Wide';
  if (/daylight|main.?cam|main camera/.test(lower)) return 'Main Camera';
  if (/\bindoor\b/.test(lower)) return 'Indoor';
  if (/\bmacro\b/.test(lower)) return 'Macro';
  if (/sample/.test(lower)) return 'Camera Samples';
  // Numbered headings like "5. Camera" → "Camera"
  const stripped = s.replace(/^\d+\.\s*/, '');
  return stripped.replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Find the camera page number
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the base review page and find the page number of the camera/samples section.
 * Returns the page number (e.g. 5) or null if not found.
 */
async function findCameraPageNumber(baseReviewSlug: string, reviewId: string): Promise<number | null> {
  const reviewUrl = `${baseUrl}/${baseReviewSlug}.php`;
  let html: string;
  try {
    html = await getHtml(reviewUrl);
  } catch {
    console.error(`[findCameraPageNumber] Failed to fetch ${reviewUrl}`);
    return null;
  }

  const $ = cheerio.load(html);

  // Look for nav links pointing to pN pages and find the one labelled "camera"
  let cameraPage: number | null = null;
  
  console.log(`[findCameraPageNumber] Searching for camera page in ${baseReviewSlug}, reviewId=${reviewId}`);

  // Strategy 1: Look for nav links with camera/photo keywords
  const navLinks: Array<{href: string, text: string, pageNum: number}> = [];
  $(`a[href*="-review-${reviewId}p"]`).each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().toLowerCase();
    const match = href.match(/-review-\d+p(\d+)\.php/);
    if (!match) return;
    const pageNum = parseInt(match[1], 10);
    navLinks.push({ href, text, pageNum });
    
    // Match: camera, photo, sample, or "video" + "quality" (allows words between)
    if (/camera|photo|sample/.test(text) || (text.includes('video') && text.includes('quality'))) {
      console.log(`[findCameraPageNumber] MATCHED: "${text}" -> page ${pageNum}`);
      cameraPage = pageNum;
    }
  });
  
  console.log(`[findCameraPageNumber] Found ${navLinks.length} nav links:`, navLinks.map(l => `p${l.pageNum}: "${l.text}"`));
  console.log(`[findCameraPageNumber] Camera page from Strategy 1: ${cameraPage}`);
  
  // Strategy 2: If not found, look for ANY links containing camera/photo
  if (cameraPage === null) {
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim().toLowerCase();
      if (!href.includes(`-review-${reviewId}p`)) return;
      const match = href.match(/-review-\d+p(\d+)\.php/);
      if (!match) return;
      const pageNum = parseInt(match[1], 10);
      if (text.includes('camera') || text.includes('photo') || text.includes('video quality')) {
        cameraPage = pageNum;
      }
    });
  }

  // Fallback: probe pages 2–8 and return the first one that has camera sample images
  if (cameraPage === null) {
    for (let p = 2; p <= 8; p++) {
      const url = `${baseUrl}/${baseReviewSlug}p${p}.php`;
      try {
        const pageHtml = await getHtml(url);
        const $p = cheerio.load(pageHtml);
        // Camera sample pages have images under /camera/ path
        let hasCameraSamples = false;
        $p('img').each((_, img) => {
          const src = $p(img).attr('src') || $p(img).attr('data-src') || '';
          if (isCameraSampleImage(src)) { hasCameraSamples = true; }
        });
        if (hasCameraSamples) {
          cameraPage = p;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  return cameraPage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scrape camera samples from the camera page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract camera category from alt/caption text.
 *
 * GSMArena captions follow this pattern (confirmed from live page):
 *   "Daylight samples, main camera (1x) - 23mm, f/1.4, ISO 64, 1/3889s ..."
 *   "Daylight samples, main camera (2x) - ..."
 *   "Daylight samples, telephoto camera (3x) - ..."
 *   "Daylight samples, telephoto camera (5x) - ..."
 *   "Low-light samples, main camera (1x) - ..."
 *   "Low-light samples, telephoto camera (3x) - ..."
 *   "Selfie camera samples - ..."
 *   "Video samples - ..."
 *   "Ultrawide samples - ..."
 *   "Human subjects, main camera (1x): Photo mode - ..."
 *   "Daylight comparison, main camera (1x): Galaxy S26 Ultra - ..."
 *
 * We parse these to produce clean category labels.
 */
/**
 * Returns true if this caption belongs to a comparison shot from a DIFFERENT device.
 * e.g. "Daylight comparison, main camera (1x): Galaxy S25 Ultra - ..."
 * These should be excluded from the primary device's samples.
 */
function isComparisonShot(caption: string): boolean {
  if (!/comparison/i.test(caption)) return false;
  // Find text after the last colon, up to the first dash
  const colonIdx = caption.lastIndexOf(':');
  if (colonIdx === -1) return false;
  const afterColon = caption.slice(colonIdx + 1);
  const dashIdx = afterColon.indexOf(' - ');
  const subject = (dashIdx !== -1 ? afterColon.slice(0, dashIdx) : afterColon).toLowerCase().trim();
  // Keep only S26 Ultra own comparison shots; drop all others
  return !subject.includes('s26 ultra');
}

function categoryFromCaption(caption: string): string {
  const c = caption.toLowerCase();

  // ── Selfie ────────────────────────────────────────────────────────────────
  if (/selfie/.test(c)) return 'Selfie';

  // ── Video ─────────────────────────────────────────────────────────────────
  if (/\bvideo\b/.test(c)) return 'Video';

  // ── Ultra-wide (daylight) ─────────────────────────────────────────────────
  if (/ultrawide|ultra.?wide/.test(c) && !/low.?light|night/.test(c)) return 'Ultra-Wide';

  // ── Night / Low Light ─────────────────────────────────────────────────────
  if (/low.?light|night/.test(c)) {
    if (/ultrawide|ultra.?wide/.test(c)) return 'Night / Low Light — Ultra-Wide';
    if (/front|selfie/.test(c))          return 'Night / Low Light — Selfie';
    // Nx multiplier e.g. "telephoto camera (10x)"
    if (/\b10x\b/.test(c)) return 'Night / Low Light — 10x Zoom';
    if (/\b5x\b/.test(c))  return 'Night / Low Light — 5x Zoom';
    if (/\b3x\b/.test(c))  return 'Night / Low Light — 3x Zoom';
    if (/\b2x\b/.test(c))  return 'Night / Low Light — 2x';
    // Focal-length e.g. "telephoto extender, 400mm" — extract mm and use as label
    const mmNight = c.match(/,\s*(\d+)mm/);
    if (mmNight) return `Night / Low Light — ${mmNight[1]}mm`;
    return 'Night / Low Light';
  }

  // ── Daylight Zoom ─────────────────────────────────────────────────────────
  // Priority 1: explicit Nx multiplier in caption (most phones)
  if (/\b30x\b/.test(c)) return 'Zoom — 30x';
  if (/\b10x\b/.test(c)) return 'Zoom — 10x';
  if (/\b5x\b/.test(c))  return 'Zoom — 5x';
  if (/\b3x\b/.test(c))  return 'Zoom — 3x';
  if (/\b2x\b/.test(c))  return 'Main Camera — 2x';

  // Priority 2: any other Nx pattern not caught above (e.g. 4x, 6x, 7x…)
  const mxMatch = c.match(/\b(\d+(?:\.\d+)?)x\b/);
  if (mxMatch) return `Zoom — ${mxMatch[1]}x`;

  // Priority 3: focal-length in mm (e.g. vivo X300 Pro "telephoto extender, 200mm")
  // Only applies when the caption also hints at telephoto/zoom context
  if (/tele|extender|zoom/.test(c)) {
    const mmMatch = c.match(/,\s*(\d+)mm/);
    if (mmMatch) return `Zoom — ${mmMatch[1]}mm`;
  }

  // ── Main camera daylight ──────────────────────────────────────────────────
  if (/main.*camera|main.*cam|daylight/.test(c)) return 'Main Camera';

  // ── Generic telephoto (no multiplier or mm info) ──────────────────────────
  if (/tele|zoom/.test(c)) return 'Zoom';

  // ── Absolute fallback: treat as main camera ───────────────────────────────
  return 'Main Camera';
}

/**
 * Scrape all classified camera samples from the camera review sub-page.
 *
 * Key facts (confirmed from live GSMArena p5 page):
 * - All <a> hrefs are "#" (lightbox) — NEVER use the anchor href as image URL
 * - Thumbnail src pattern: /imgroot/reviews/26/<device>/camera/-160/gsmarena_XXXX.jpg
 * - Full-res pattern:       /imgroot/reviews/26/<device>/camera/-/-/gsmarena_XXXX.jpg
 * - Category is determined from the <img alt="..."> caption text
 */
async function scrapeCameraPage(url: string, isNewsPage = false): Promise<ICameraSampleCategory[]> {
  let html: string;
  try {
    html = await getHtml(url);
  } catch {
    return [];
  }

  const $ = cheerio.load(html);
  const categoryMap = new Map<string, ICameraSample[]>();
  const seen = new Set<string>();

  $('img').each((_, el) => {
    // Check both src and data-src (news pages lazy-load via data-src)
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    // Use relaxed detection for news/article pages; strict for standard review pages
    const isValid = isNewsPage ? isNewsPageCameraImage(src) : isCameraSampleImage(src);
    if (!isValid) return;

    const thumbUrl = cleanImgUrl(src);

    // For news pages: prefer the parent <a href> as the full-res URL when available
    // (GSMArena news articles wrap camera sample thumbs in a link to the original photo)
    let fullUrl: string;
    if (isNewsPage) {
      const parentHref = $(el).closest('a').attr('href') || '';
      const absHref = cleanImgUrl(parentHref);
      // Use parent href only if it looks like a real image URL (not "#" or a page link)
      if (absHref && absHref !== '#' && /\.(jpe?g|png|webp)$/i.test(absHref) && isContentImage(absHref)) {
        fullUrl = absHref;
      } else {
        fullUrl = newsImageToFullRes(thumbUrl);
      }
    } else {
      fullUrl = thumbToFullRes(thumbUrl);
    }

    if (!fullUrl || seen.has(fullUrl)) return;
    // For standard review pages only: skip if size token still present (blurry thumbnail)
    if (!isNewsPage && isThumbnailUrl(fullUrl)) return;
    seen.add(fullUrl);

    const caption = $(el).attr('alt') || '';

    // Skip comparison shots from OTHER devices (S25 Ultra, iPhone, Pixel, etc.)
    if (isComparisonShot(caption)) return;

    const label = categoryFromCaption(caption);

    if (!categoryMap.has(label)) categoryMap.set(label, []);
    categoryMap.get(label)!.push({
      category: label,
      url: fullUrl,
      caption: caption || undefined,
    });
  });

  // Convert map to array and sort in a logical order
  const order = [
    'Main Camera', 'Main Camera — 2x',
    'Ultra-Wide',
    'Zoom — 2x', 'Zoom — 3x', 'Zoom — 4x', 'Zoom — 5x', 'Zoom — 6x', 'Zoom — 10x', 'Zoom — 30x', 'Zoom',
    'Portrait',
    'Night / Low Light', 'Night / Low Light — 2x',
    'Night / Low Light — 3x Zoom', 'Night / Low Light — 5x Zoom',
    'Night / Low Light — 10x Zoom', 'Night / Low Light — Ultra-Wide',
    'Night / Low Light — Selfie',
    // mm-based night labels (e.g. 'Night / Low Light — 200mm') sort after Selfie automatically
    'Selfie',
    'Video',
    'Camera Samples',
  ];

  const categories: ICameraSampleCategory[] = [];
  for (const [label, images] of categoryMap.entries()) {
    categories.push({ label, images });
  }
  categories.sort((a, b) => {
    const ai = order.indexOf(a.label), bi = order.indexOf(b.label);
    if (ai === -1 && bi === -1) return a.label.localeCompare(b.label);
    if (ai === -1) return 1; if (bi === -1) return -1;
    return ai - bi;
  });

  return categories;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scrape article images (non-camera-sample pages)
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeArticleImages(slug: string, pageNum: number): Promise<IReviewGallerySection[]> {
  const url = pageNum === 1
    ? `${baseUrl}/${slug}.php`
    : `${baseUrl}/${slug}p${pageNum}.php`;

  let html: string;
  try { html = await getHtml(url); } catch { return []; }

  const $ = cheerio.load(html);
  const sections: IReviewGallerySection[] = [];
  const seen = new Set<string>();
  let currentSection = 'Introduction';

  $('article *, .review-container *, .gsmarena-article *').each((_, el) => {
    const tag = ((el as any).tagName || '').toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const text = $(el).text().trim();
      if (text) currentSection = text;
      return;
    }
    if (tag !== 'img') return;

    const src = cleanImgUrl($(el).attr('src') || $(el).attr('data-src'));
    if (!isContentImage(src)) return;
    if (isCameraSampleImage(src)) return;
    // Skip competitor device images (bigpic), store logos, static assets
    if (/\/bigpic\/|\/static\/|\/vv\/bigpic\//.test(src)) return;
    if (seen.has(src)) return;
    seen.add(src);

    const caption = $(el).attr('alt') || $(el).attr('title') || '';
    // Never use "#" as URL — use the img src itself as the full URL
    const parentHref = $(el).parent('a').attr('href');
    const fullUrl = (parentHref && !parentHref.includes('#') && parentHref.startsWith('http'))
      ? parentHref
      : src;

    let section = sections.find(s => s.section === currentSection);
    if (!section) { section = { section: currentSection, images: [] }; sections.push(section); }
    section.images.push({
      category: normaliseCategory(currentSection),
      url: fullUrl,
      thumbnailUrl: src !== fullUrl ? src : undefined,
      caption: caption || undefined,
    });
  });

  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported function
// ─────────────────────────────────────────────────────────────────────────────


/**
 * Scrape lens details from the camera review page.
 *
 * GSMArena's camera page has two things we want:
 *
 * 1. <ul class="article-blurb article-blurb-findings">
 *      <li><b>Wide (main):</b> 50MP Sony Lytia LYT-828 ...</li>
 *      <li><b>Telephoto 3.5x:</b> 200MP Samsung ...</li>
 *    </ul>
 *
 * 2. <img class="inline-image" src="...lifestyle/...jpg"> — section representative photos
 *    These appear *above* the findings list and represent the camera setup.
 */
async function scrapeLensDetails(cameraPageUrl: string): Promise<ILensDetail[]> {
  let html: string;
  try { html = await getHtml(cameraPageUrl); } catch { return []; }

  const $ = cheerio.load(html);
  const lenses: ILensDetail[] = [];

  // Collect all inline-image URLs from the page (lifestyle/representative shots)
  // We'll assign the first one per logical section to the matching lens
  const inlineImages: string[] = [];
  $('img.inline-image').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (src && !inlineImages.includes(src)) inlineImages.push(src);
  });

  // Parse ALL article-blurb-findings lists on this page.
  // GSMArena sometimes has multiple <ul class="article-blurb article-blurb-findings">
  // blocks on the same page — one for main camera, one for selfie, etc.
  // We collect every <li> from every matching list.
  const cameraRoleRx = /^(wide|telephoto|ultrawide|ultra-wide|front|selfie|periscope|main)/i;

  // Collect <li> items from every findings list on the page
  const allLiItems: any[] = [];

  // Strategy 1: explicit class selectors — collect from ALL matching <ul>s
  $('ul.article-blurb-findings, ul.article-blurb.article-blurb-findings').each((_, ul) => {
    $(ul).find('li').each((_, li) => allLiItems.push(li));
  });

  // Strategy 2: if nothing found, scan every <ul> whose first <li> starts with a role <b>
  if (allLiItems.length === 0) {
    $('ul').each((_, ul) => {
      const firstB = $(ul).find('li').first().find('b').first().text().trim();
      if (cameraRoleRx.test(firstB)) {
        $(ul).find('li').each((_, li) => allLiItems.push(li));
      }
    });
  }

  allLiItems.forEach((el, idx) => {
    const $li = $(el);
    const roleRaw = $li.find('b').first().text().replace(/:$/, '').trim();
    if (!roleRaw || !cameraRoleRx.test(roleRaw)) return;

    const fullText = $li.text().trim();
    const detail = fullText.replace(roleRaw + ':', '').trim();
    const sectionImageUrl = inlineImages[idx] ?? inlineImages[inlineImages.length - 1];

    lenses.push({ role: roleRaw, detail, sectionImageUrl });
  });

  return lenses;
}

export async function getReviewDetails(reviewSlug: string): Promise<IReviewResult> {
  // Detect if this is a news/camera-samples page (not a standard multi-page review)
  // e.g. vivo_iqoo_z7_pro_5g_camera_samples_specs-news-59639
  const isNewsPage = reviewSlug.includes('-news-') || reviewSlug.includes('camera_samples');

  // For news/camera-samples pages, the page itself IS the camera page — no sub-pages
  if (isNewsPage) {
    const newsUrl = `${baseUrl}/${reviewSlug}.php`;
    let newsHtml = '';
    try { newsHtml = await getHtml(newsUrl); } catch { newsHtml = ''; }
    const cameraSamples = newsHtml ? await scrapeCameraPage(newsUrl, true) : [];
    const lensDetails = newsHtml ? await scrapeLensDetails(newsUrl) : [];
    const firstLifestyle = lensDetails.find(l => l.sectionImageUrl)?.sectionImageUrl;
    return {
      device: reviewSlug,
      reviewSlug,
      reviewUrl: newsUrl,
      heroImages: firstLifestyle ? [firstLifestyle] : [],
      articleImages: [],
      cameraSamples,
      lensDetails,
    };
  }

  // Standard review — normalise to base slug (strip trailing pN)
  const baseReviewSlug = reviewSlug.replace(/-review-(\d+)p\d+$/, '-review-$1');
  const reviewUrl = `${baseUrl}/${baseReviewSlug}.php`;

  const reviewIdMatch = baseReviewSlug.match(/-review-(\d+)$/);
  const reviewId = reviewIdMatch ? reviewIdMatch[1] : '';

  // Fetch base page for device name + hero images
  let html: string;
  try {
    html = await getHtml(reviewUrl);
  } catch (err) {
    throw new Error(`Failed to fetch review page: ${reviewUrl}. ${err}`);
  }

  const $ = cheerio.load(html);

  const device =
    $('h1.article-info-name, h1.review-header-title, h1').first().text().trim() ||
    baseReviewSlug;

  // Hero images — only from header area, not article body
  const heroImages: string[] = [];
  const heroSeen = new Set<string>();
  $('.article-info-top img, .review-header img, .article-header img').each((_, el) => {
    const src = cleanImgUrl($(el).attr('src') || $(el).attr('data-src'));
    if (src && isContentImage(src) && !heroSeen.has(src)) {
      heroSeen.add(src);
      heroImages.push(src);
    }
  });

  // Find which page has camera samples
  const cameraPageNum = await findCameraPageNumber(baseReviewSlug, reviewId);
  console.log(`[getReviewDetails] ${baseReviewSlug}: cameraPageNum = ${cameraPageNum}`);

  // Scrape camera samples from camera page
  let cameraSamples: ICameraSampleCategory[] = [];
  if (cameraPageNum) {
    const cameraUrl = `${baseUrl}/${baseReviewSlug}p${cameraPageNum}.php`;
    console.log(`[getReviewDetails] Scraping camera samples from: ${cameraUrl}`);
    cameraSamples = await scrapeCameraPage(cameraUrl);
    console.log(`[getReviewDetails] Got ${cameraSamples.length} categories, ${cameraSamples.reduce((sum, cat) => sum + cat.images.length, 0)} total images`);
  } else {
    console.log(`[getReviewDetails] No camera page found for ${baseReviewSlug}`);
  }
  // Scrape lens details — try pages in order until we find 2+ lens entries.
  // GSMArena puts the article-blurb-findings list on p1, p2, or p3 depending on the review.
  // We need at least 2 entries to be confident we have the full camera breakdown.
  let lensDetails: ILensDetail[] = [];
  const pagesToTry = [reviewUrl];
  for (let pn = 2; pn <= 4; pn++) {
    pagesToTry.push(`${baseUrl}/${baseReviewSlug}p${pn}.php`);
  }
  for (const pageUrl of pagesToTry) {
    const found = await scrapeLensDetails(pageUrl);
    if (found.length > lensDetails.length) lensDetails = found;
    if (lensDetails.length >= 2) break; // found a real camera list
  }

  // Scrape article images from non-camera pages (p1, p2, p3, p4 etc.)
  const articleImages: IReviewGallerySection[] = [];
  // Just scrape p1 (overview) for article images to keep response lean
  const p1Sections = await scrapeArticleImages(baseReviewSlug, 1);
  articleImages.push(...p1Sections);

  return {
    device,
    reviewSlug: baseReviewSlug,
    reviewUrl,
    heroImages,
    articleImages,
    cameraSamples,
    lensDetails,
  };
}