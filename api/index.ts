import Fastify from 'fastify';
import { ParserService } from '../src/parser/parser.service';
import { getPhoneDetails } from '../src/parser/parser.phone-details';
import { getBrands } from '../src/parser/parser.brands';
import { getReviewDetails } from '../src/parser/parser.review';
import type { IncomingMessage, ServerResponse } from 'http';

const app = Fastify({ logger: false });
const parserService = new ParserService();

// Debug route
app.get('/debug', async (request) => {
  return { ok: true, url: request.url, method: request.method };
});

app.get('/brands', async () => {
  const data = await getBrands();
  return { status: true, data };
});

app.get('/brands/:brandSlug', async (request) => {
  const { brandSlug } = request.params as { brandSlug: string };
  const data = await parserService.getPhonesByBrand(brandSlug);
  return { status: true, data };
});

app.get('/latest', async () => {
  const data = await parserService.getLatestPhones();
  return { status: true, data };
});

app.get('/top-by-interest', async () => {
  const data = await parserService.getTopByInterest();
  return { status: true, data };
});

app.get('/top-by-fans', async () => {
  const data = await parserService.getTopByFans();
  return { status: true, data };
});

app.get('/search', async (request, reply) => {
  const query = (request.query as any).query;
  if (!query) {
    return reply.status(400).send({ error: 'Query parameter is required' });
  }
  const data = await parserService.search(query);
  return data;
});

// ─────────────────────────────────────────────────────────────────────────────
// Review endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /review/:reviewSlug
 *
 * Scrapes a GSMArena review page and ALL camera-sample tabs.
 * reviewSlug can be:
 *   - The full slug:  samsung_galaxy_s26_ultra-review-2939p5
 *   - Without page:  samsung_galaxy_s26_ultra-review-2939
 *
 * Response contains:
 *   heroImages        – header / top-of-page images
 *   articleImages     – in-body images grouped by nearest section heading
 *   cameraSamples     – all tabs (Main Camera, Night, Zoom, Selfie, Video …)
 *                       each with classified images
 *
 * Example:
 *   GET /review/samsung_galaxy_s26_ultra-review-2939p5
 */
app.get('/review/:reviewSlug', async (request, reply) => {
  const { reviewSlug } = request.params as { reviewSlug: string };
  try {
    const data = await getReviewDetails(reviewSlug);
    return { status: true, data };
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: err?.message || String(err) });
  }
});

/**
 * GET /review/:reviewSlug/camera-samples
 *
 * Returns only the camera samples section (all tabs) for quick access.
 */
app.get('/review/:reviewSlug/camera-samples', async (request, reply) => {
  const { reviewSlug } = request.params as { reviewSlug: string };
  try {
    const data = await getReviewDetails(reviewSlug);
    return {
      status: true,
      data: {
        device: data.device,
        reviewUrl: data.reviewUrl,
        cameraSamples: data.cameraSamples,
      },
    };
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: err?.message || String(err) });
  }
});

/**
 * GET /review/:reviewSlug/images
 *
 * Returns only the article + hero images (non-camera-sample).
 */
app.get('/review/:reviewSlug/images', async (request, reply) => {
  const { reviewSlug } = request.params as { reviewSlug: string };
  try {
    const data = await getReviewDetails(reviewSlug);
    return {
      status: true,
      data: {
        device: data.device,
        reviewUrl: data.reviewUrl,
        heroImages: data.heroImages,
        articleImages: data.articleImages,
      },
    };
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: err?.message || String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Unified endpoint: search by name → specs + camera samples in one shot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /phone?name=samsung galaxy s26 ultra
 *
 * One endpoint to rule them all. You just type the phone name.
 * Internally it:
 *   1. Searches GSMArena for the best match
 *   2. Fetches full specifications (including device_images)
 *   3. Follows the review_url and scrapes ALL camera sample categories
 *
 * Response shape:
 * {
 *   status: true,
 *   data: {
 *     // ── from specs page ──
 *     brand, model, imageUrl, device_images,
 *     release_date, dimensions, os, storage, specifications,
 *     review_url,
 *     // ── from review/camera page ──
 *     cameraSamples: [
 *       { label: "Main Camera", images: [...] },
 *       { label: "Night / Low Light", images: [...] },
 *       { label: "Zoom", images: [...] },
 *       { label: "Selfie", images: [...] },
 *       { label: "Video", images: [...] },
 *       ...
 *     ]
 *   }
 * }
 */
app.get('/phone', async (request, reply) => {
  const name = (request.query as any).name;
  if (!name) {
    return reply.status(400).send({ status: false, error: 'Query param "name" is required. e.g. /phone?name=samsung galaxy s26 ultra' });
  }

  // Step 1 – search for best match
  let searchResults;
  try {
    searchResults = await parserService.search(name);
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: `Search failed: ${err?.message}` });
  }

  if (!searchResults || searchResults.length === 0) {
    return reply.status(404).send({ status: false, error: `No device found matching "${name}"` });
  }

  const bestMatch = searchResults[0];
  // slug from detail_url is like "/samsung_galaxy_s26_ultra-12548"
  const deviceSlug = bestMatch.slug.replace(/^\//, '');

  // Step 2 – fetch full specs (includes review_url + device_images)
  let specs;
  try {
    specs = await getPhoneDetails(deviceSlug);
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: `Specs fetch failed: ${err?.message}` });
  }

  // Step 3 – scrape camera samples from review/camera page
  let cameraSamples: any[] = [];
  let lensDetails: any[] = [];
  let hdImageUrl: string | null = specs.imageUrl || null;

  // Helper: try scraping camera samples from a given page URL
  const tryCameraUrl = async (url: string): Promise<boolean> => {
    try {
      const slug = url.replace(/^https?:\/\/[^/]+\//, '').replace(/\.php$/, '');
      const reviewData = await getReviewDetails(slug);
      if (reviewData.cameraSamples.length > 0) {
        cameraSamples = reviewData.cameraSamples;
        lensDetails = reviewData.lensDetails ?? [];
        return true;
      }
    } catch { /* ignore */ }
    return false;
  };

  // Attempt 1: use review_url from specs page (flagship phones with full reviews)
  if (specs.review_url) {
    await tryCameraUrl(specs.review_url);
  }

  // Attempt 2: scrape the device's GSMArena opinions/articles page.
  // GSMArena has a dedicated page for every device at:
  //   {base}-opinions-{id}.php   (same ID as the specs page slug)
  // This page lists ALL articles, news, and camera-samples posts for the device.
  // This is the universal fix — works for any phone, not just iQOO Z7 Pro.
  if (cameraSamples.length === 0) {
    try {
      const { getHtml } = await import('../src/parser/parser.service');
      const { load } = await import('cheerio');

      // Derive opinions page URL from device slug: "vivo_iqoo_z7_pro_5g-11843"
      const slugMatch = deviceSlug.match(/^(.+)-(\d+)$/);
      if (slugMatch) {
        const opinionsUrl = `https://www.gsmarena.com/${slugMatch[1]}-opinions-${slugMatch[2]}.php`;
        const html = await getHtml(opinionsUrl);
        const $ = load(html);
        const links: string[] = [];
        $('a[href]').each((_: number, el: any) => {
          const href: string = $(el).attr('href') || '';
          const lower = href.toLowerCase();
          if (!lower.endsWith('.php')) return;
          if (lower.includes('camera_samples') || lower.includes('camera-samples') ||
              (lower.includes('-news-') && lower.includes('camera'))) {
            const full = href.startsWith('http') ? href : ('https://www.gsmarena.com/' + href);
            if (!links.includes(full)) links.push(full);
          }
        });
        for (const link of links) {
          if (await tryCameraUrl(link)) break;
        }
      }
    } catch { /* opinions page failed */ }
  }

  return {
    status: true,
    matched: bestMatch.name,
    data: {
      ...specs,
      hdImageUrl,        // 1200px lifestyle/hero image from review page
      cameraSamples,
      lensDetails,
    },
  };
});

// ── /:slug must be LAST – it's a catch-all for device specs ──────────────────
app.get('/:slug', async (request) => {
  const slug = (request.params as any).slug;
  const data = await getPhoneDetails(slug);
  return data;
});

let ready = false;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!ready) {
    await app.ready();
    ready = true;
  }

  const url = req.url || '/';
  console.log('[handler] method:', req.method, 'url:', url);

  const response = await app.inject({
    method: (req.method || 'GET') as any,
    url,
    headers: req.headers as any,
  });

  console.log('[handler] fastify response status:', response.statusCode, 'body:', response.body.slice(0, 200));

  res.writeHead(response.statusCode, response.headers as any);
  res.end(response.body);
}
