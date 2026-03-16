/**
 * parser.review.ts
 */

import * as cheerio from 'cheerio';
import { baseUrl } from '../server';
import { getHtml } from './parser.service';
import {
  IReviewResult,
  ICameraSampleCategory,
  ICameraSample,
  IReviewGallerySection,
} from '../types';

function absoluteUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  return `${baseUrl}/${href.replace(/^\//, '')}`;
}

function cleanImgUrl(src: string | undefined): string {
  if (!src) return '';
  return absoluteUrl(src.trim());
}

function thumbToFullRes(thumbUrl: string): string {
  if (!thumbUrl) return '';
  // Strip the size token: /-160/ or /-216/ etc → /
  // Thumbnail: .../camera/-160/gsmarena_1101.jpg
  // Full-res:  .../camera/gsmarena_1101.jpg
  return thumbUrl.replace(/\/-[0-9]+w?[0-9]*\//, '/');
}

function isContentImage(src: string): boolean {
  if (!src || src === '#' || src.includes('www.gsmarena.com/#')) return false;
  if (/\/static\/stores\//.test(src)) return false;
  if (/icon|logo|spacer|blank|pixel\.gif|arrow/.test(src)) return false;
  if (!src.includes('gsmarena.com') && !src.includes('fdn.gsmarena') && !src.includes('fdn2.gsmarena')) return false;
  return true;
}

function isCameraSampleImage(src: string): boolean {
  return src.includes('/imgroot/reviews/') && src.includes('/camera/');
}

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
  const stripped = s.replace(/^\d+\.\s*/, '');
  return stripped.replace(/\b\w/g, c => c.toUpperCase());
}

function isComparisonShot(caption: string): boolean {
  if (!/comparison/i.test(caption)) return false;
  const colonIdx = caption.lastIndexOf(':');
  if (colonIdx === -1) return false;
  const afterColon = caption.slice(colonIdx + 1);
  const dashIdx = afterColon.indexOf(' - ');
  const subject = (dashIdx !== -1 ? afterColon.slice(0, dashIdx) : afterColon).toLowerCase().trim();
  return !subject.includes('s26 ultra');
}

function categoryFromCaption(caption: string): string {
  const c = caption.toLowerCase();

  if (/selfie/.test(c)) return 'Selfie';
  if (/\bvideo\b/.test(c)) return 'Video';

  if (/low.?light|night/.test(c)) {
    if (/ultrawide|ultra.?wide/.test(c)) return 'Night / Low Light — Ultra-Wide';
    if (/front|selfie/.test(c))          return 'Night / Low Light — Selfie';
    if (/\b10x\b/.test(c)) return 'Night / Low Light — 10x Zoom';
    if (/\b5x\b/.test(c))  return 'Night / Low Light — 5x Zoom';
    if (/\b3x\b/.test(c))  return 'Night / Low Light — 3x Zoom';
    if (/\b2x\b/.test(c))  return 'Night / Low Light — 2x';
    return 'Night / Low Light';
  }

  if (/ultrawide|ultra.?wide/.test(c)) return 'Ultra-Wide';

  if (/\b30x\b/.test(c)) return 'Zoom — 30x';
  if (/\b10x\b/.test(c)) return 'Zoom — 10x';
  if (/\b5x\b/.test(c))  return 'Zoom — 5x';
  if (/\b3x\b/.test(c))  return 'Zoom — 3x';
  if (/\b2x\b/.test(c))  return 'Main Camera — 2x';

  if (/telephoto/.test(c)) return 'Zoom';
  if (/main.*camera|main.*cam|daylight/.test(c)) return 'Main Camera';

  return 'Camera Samples';
}

async function findCameraPageNumber(baseReviewSlug: string, reviewId: string): Promise<number | null> {
  const reviewUrl = `${baseUrl}/${baseReviewSlug}.php`;
  let html: string;
  try {
    html = await getHtml(reviewUrl);
  } catch {
    return null;
  }

  const $ = cheerio.load(html);
  let cameraPage: number | null = null;

  $(`a[href*="-review-${reviewId}p"]`).each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().toLowerCase();
    const match = href.match(/-review-\d+p(\d+)\.php/);
    if (!match) return;
    const pageNum = parseInt(match[1], 10);
    if (/camera|photo|sample/.test(text)) {
      cameraPage = pageNum;
    }
  });

  if (cameraPage === null) {
    for (let p = 2; p <= 8; p++) {
      const url = `${baseUrl}/${baseReviewSlug}p${p}.php`;
      try {
        const pageHtml = await getHtml(url);
        const $p = cheerio.load(pageHtml);
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

async function scrapeCameraPage(url: string): Promise<ICameraSampleCategory[]> {
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
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (!isCameraSampleImage(src)) return;

    const thumbUrl = cleanImgUrl(src);
    const fullUrl = thumbToFullRes(thumbUrl);
    if (!fullUrl || seen.has(fullUrl)) return;
    seen.add(fullUrl);

    const caption = $(el).attr('alt') || '';
    if (isComparisonShot(caption)) return;

    const label = categoryFromCaption(caption);

    if (!categoryMap.has(label)) categoryMap.set(label, []);
    categoryMap.get(label)!.push({
      category: label,
      url: fullUrl,
      thumbnailUrl: thumbUrl,
      caption: caption || undefined,
    });
  });

  const order = [
    'Main Camera', 'Main Camera — 2x',
    'Ultra-Wide',
    'Zoom — 3x', 'Zoom — 5x', 'Zoom — 10x', 'Zoom — 30x', 'Zoom',
    'Portrait',
    'Night / Low Light', 'Night / Low Light — 2x',
    'Night / Low Light — 3x Zoom', 'Night / Low Light — 5x Zoom',
    'Night / Low Light — 10x Zoom', 'Night / Low Light — Ultra-Wide',
    'Night / Low Light — Selfie',
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
    if (/\/bigpic\/|\/static\/|\/vv\/bigpic\//.test(src)) return;
    if (seen.has(src)) return;
    seen.add(src);

    const caption = $(el).attr('alt') || $(el).attr('title') || '';
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

export async function getReviewDetails(reviewSlug: string): Promise<IReviewResult> {
  const baseReviewSlug = reviewSlug.replace(/-review-(\d+)p\d+$/, '-review-$1');
  const reviewUrl = `${baseUrl}/${baseReviewSlug}.php`;

  const reviewIdMatch = baseReviewSlug.match(/-review-(\d+)$/);
  const reviewId = reviewIdMatch ? reviewIdMatch[1] : '';

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

  const heroImages: string[] = [];
  const heroSeen = new Set<string>();
  $('.article-info-top img, .review-header img, .article-header img').each((_, el) => {
    const src = cleanImgUrl($(el).attr('src') || $(el).attr('data-src'));
    if (src && isContentImage(src) && !heroSeen.has(src)) {
      heroSeen.add(src);
      heroImages.push(src);
    }
  });

  const cameraPageNum = await findCameraPageNumber(baseReviewSlug, reviewId);

  let cameraSamples: ICameraSampleCategory[] = [];
  if (cameraPageNum) {
    const cameraUrl = `${baseUrl}/${baseReviewSlug}p${cameraPageNum}.php`;
    cameraSamples = await scrapeCameraPage(cameraUrl);
  }

  const articleImages: IReviewGallerySection[] = [];
  const p1Sections = await scrapeArticleImages(baseReviewSlug, 1);
  articleImages.push(...p1Sections);

  return {
    device,
    reviewSlug: baseReviewSlug,
    reviewUrl,
    heroImages,
    articleImages,
    cameraSamples,
  };
}