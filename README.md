<div align="center">

# 📡 GSMArena + DXOMark Mobile Specs API

### The only open-source API that fuses hardware specs, professional camera scores, and categorized camera samples

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.7-000000?logo=fastify)](https://fastify.dev/)
[![pnpm](https://img.shields.io/badge/pnpm-9.15-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Vercel](https://img.shields.io/badge/Deploy%20on-Vercel-black?logo=vercel)](https://vercel.com/)

[🚀 Deploy Now](#deploy-to-vercel) · [📖 API Reference](#api-reference) · [🐛 Report Bug](../../issues) · [💡 Request Feature](../../issues)

</div>

---

## Why This API?

Most GSMArena scrapers are **table-only tools** — they grab the spec sheet and stop. They return raw strings like `"200 MP, f/1.7"` with no signal on whether that sensor actually *performs* in the real world.

This API is different. It answers the question developers actually need to ask:

> *"How does this phone's hardware translate into real-world camera performance?"*

It does this by combining three things no other open-source scraper provides in one call:

1. **Full GSMArena specifications** — every field, clean structured JSON
2. **DXOMark professional scores** — overall, photo, video, zoom, bokeh, selfie, audio, display, battery, with `BEST` values per sub-score
3. **Intelligently categorized camera samples** — not a flat image dump, but samples sorted by shooting condition and sensor mode (including isolated high-resolution shots vs. standard pixel-binned output)

It also surfaces **official press renders per color variant**, **in-article review images**, and the **GSMArena 3D viewer URL** — everything a comparison app or review site needs in a single request.

---

## Features

| Feature | This API | Most others |
|---|---|---|
| DXOMark overall score | ✅ | ❌ |
| DXOMark sub-scores (photo, video, zoom, bokeh, selfie…) | ✅ | ❌ |
| DXOMark `BEST` values per sub-score | ✅ | ❌ |
| Camera samples by shooting condition | ✅ | ❌ |
| High-res (200MP) vs. binned sample isolation | ✅ | ❌ |
| Official press renders per color variant | ✅ | ❌ |
| GSMArena 3D viewer URL | ✅ | ❌ |
| Smart search with penalty scoring | ✅ | ❌ |
| In-memory LRU + Redis two-layer cache | ✅ | ❌ |
| Full DXOMark review (pros, cons, strengths, weaknesses) | ✅ | ❌ |
| Latest phones & top-by-interest/fans lists | ✅ | ❌ |
| Serverless-ready — zero infrastructure | ✅ | ❌ |

---

## Quick Start

**Prerequisites:** Node.js 18+ · pnpm

```bash
git clone https://github.com/Sanjeevu-Tarun/gsmarena-dxomark-mobile-specs-api
cd gsmarena-dxomark-mobile-specs-api
pnpm install
pnpm dev
# → http://localhost:4000
```

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Sanjeevu-Tarun/gsmarena-dxomark-mobile-specs-api)

Or via CLI:

```bash
npm install -g vercel
vercel deploy
```

`vercel.json` is pre-configured. Zero extra setup required.

---

## Environment Variables

Optional — the API works without Redis using the in-memory LRU cache only.

| Variable | Description |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |

Get a free Redis instance at [console.upstash.com](https://console.upstash.com).

---

## API Reference

### `/phone` — Full device data in one call ⭐

The primary endpoint. Returns specs + camera samples + press renders + DXOMark scores in a single request.

```bash
GET /phone?name=samsung+galaxy+s25+ultra
GET /phone?name=pixel+9+pro&nocache=1   # bypass cache
```

**Response shape:**

```jsonc
{
  "status": true,
  "matched": "Samsung Galaxy S25 Ultra",
  "_cache": "redis",           // "mem" | "redis" | "miss"
  "_cameraFound": true,
  "data": {
    "model": "...",
    "release_date": "...",
    "dimensions": "...",
    "os": "...",
    "storage": "...",
    "review_url": "https://www.gsmarena.com/...",
    "hdImageUrl": "https://fdn.gsmarena.com/imgroot/...",   // full-res review hero
    "specifications": { "Platform": { "Chipset": "..." }, ... },
    "device_images": [{ "color": "Titanium Black", "url": "..." }],
    "colorVariants": [{ "colorName": "...", "imageUrl": "...", "isDefault": true }],
    "officialImages": ["https://fdn2.gsmarena.com/vv/pics/..."],  // all press renders
    "picturesPageUrl": "https://www.gsmarena.com/...-pictures-NNNNN.php",
    "cameraSamples": [
      {
        "label": "Zoom — 5x",
        "images": [{ "category": "Zoom — 5x", "url": "...", "caption": "115mm, f/2.9, ISO 50, 1/466s" }]
      }
    ],
    "lensDetails": [{ "role": "Wide (main)", "detail": "50MP, f/1.7, OIS, 4K@120fps" }]
  }
}
```

---

### `/search` — Device search

```bash
GET /search?query=pixel+9+pro
```

Uses penalty scoring so `pixel 9` doesn't bleed into `pixel 9 pro` results. Returns name, slug, image URLs, and detail URL.

---

### `/:slug` — Specs by GSMArena slug

```bash
GET /samsung_galaxy_s25_ultra-12311
```

Returns raw GSMArena specifications + color images + review URL for a known slug. Get the slug from `/search`.

---

### `/brands` — All brands

```bash
GET /brands
```

Returns all brands with their slugs, brand IDs, device counts, and detail URLs.

---

### `/brands/:brandSlug` — Phones by brand

```bash
GET /brands/samsung-phones-9
GET /brands/apple
```

Returns all phones for a brand. Accepts either a full brand slug (`samsung-phones-9`) or just the brand name (`samsung`).

---

### `/latest` — Latest phones

```bash
GET /latest
```

Returns GSMArena's list of recently released devices.

---

### `/top-by-interest` · `/top-by-fans` — Trending devices

```bash
GET /top-by-interest
GET /top-by-fans
```

Returns GSMArena's current popularity rankings.

---

### `/review/:reviewSlug` — Full review

```bash
GET /review/samsung_galaxy_s25_ultra-review-2631
```

Returns hero images, all in-article images grouped by section heading, camera sample tabs, and parsed lens details.

---

### `/review/:reviewSlug/camera-samples` — Camera samples only

```bash
GET /review/samsung_galaxy_s25_ultra-review-2631/camera-samples
```

Returns only the camera sample tabs, pre-sorted into: `Main Camera`, `Night / Low Light`, `Zoom`, `Selfie`, `Ultra-Wide`, `Portrait`, `Macro`, `Video`, `Indoor`.

---

### `/review/:reviewSlug/images` — In-article images

```bash
GET /review/samsung_galaxy_s25_ultra-review-2631/images
```

Returns all images embedded in the review article, grouped by their nearest heading.

---

### DXOMark Endpoints

#### `/dxomark` — Scores + categorized samples

```bash
GET /dxomark?name=samsung+galaxy+s25+ultra
GET /dxomark?name=pixel+9+pro&nocache=1
```

Returns overall score, all sub-scores, pros/cons, ranking, strengths, weaknesses, and categorized camera samples in one response.

#### `/dxomark/review` — Full review with `BEST` values

```bash
GET /dxomark/review?name=samsung+galaxy+s25+ultra
```

Richer than `/dxomark` — includes all sub-scores with their `BEST` reference value, full methodology breakdown, and sample images.

#### `/dxomark/review/samples` — DXOMark samples only

```bash
GET /dxomark/review/samples?name=samsung+galaxy+s25+ultra
GET /dxomark/review/samples?url=https://www.dxomark.com/samsung-galaxy-s25-ultra-camera-test/
```

Returns only the `sampleImages` array from the camera review — fastest way to get all DXOMark test photos grouped by category (Main, Ultra-Wide, Tele, etc.).

#### `/dxomark/review/url` — Scrape a specific DXOMark URL

```bash
GET /dxomark/review/url?url=https://www.dxomark.com/samsung-galaxy-s25-ultra-camera-test/
```

Scrapes a specific DXOMark camera review page directly. Returns all sub-scores, sample images, and sample count.

#### `/dxomark/search` — Search DXOMark

```bash
GET /dxomark/search?query=pixel+9+pro
```

Searches DXOMark directly and returns matching device pages with their scores. Useful for discovery before hitting `/dxomark`.

#### `/dxomark/url` — Resolve DXOMark URL for a device

```bash
GET /dxomark/url?name=samsung+galaxy+s25+ultra
```

Returns the resolved DXOMark camera review URL for a device name without fetching the full review.

---

## Sample JSON Output

Real output from `/phone?name=samsung+galaxy+s26+ultra` (abbreviated — full response includes 14 camera sample categories):

```json
{
  "status": true,
  "matched": "Samsung Galaxy S26 Ultra",
  "_cache": "redis",
  "_cameraFound": true,
  "data": {
    "model": "Samsung Galaxy S26 Ultra",
    "release_date": "Released 2026, March 06",
    "dimensions": "214g, 7.9mm thickness",
    "os": "Android 16, up to 7 major upgrades",
    "storage": "256GB/512GB/1TB storage, no card slot",
    "review_url": "https://www.gsmarena.com/samsung_galaxy_s26_ultra-review-2939.php",
    "hdImageUrl": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/gsmarena_001.jpg",
    "specifications": {
      "Platform": {
        "Chipset": "Qualcomm SM8850-1-AD Snapdragon 8 Elite Gen 5 (3 nm)",
        "CPU": "Octa-core (2x4.74 GHz Oryon V3 Phoenix L + 6x3.62 GHz Oryon V3 Phoenix M)",
        "GPU": "Adreno 840 (1.3GHz)"
      },
      "Display": {
        "Type": "Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, 2600 nits (peak)",
        "Size": "6.9 inches (~90.7% screen-to-body ratio)",
        "Resolution": "1440 x 3120 pixels (~500 ppi density)"
      },
      "Main Camera": {
        "Quad": "200 MP, f/1.4, 23mm (wide), 1/1.3\", OIS\n10 MP, f/2.4, 67mm (telephoto), 3x optical zoom\n50 MP, f/2.9, 111mm (periscope telephoto), 5x optical zoom\n50 MP, f/1.9, 120° (ultrawide)",
        "Video": "8K@24/30fps, 4K@30/60/120fps, 10-bit HDR, HDR10+"
      }
    },
    "device_images": [
      { "color": "Titanium Silverblue", "url": "https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-s26-ultra.jpg" }
    ],
    "colorVariants": [
      { "colorName": "Titanium Silverblue", "imageUrl": "https://fdn2.gsmarena.com/vv/pics/samsung/...", "isDefault": true },
      { "colorName": "Titanium Black",      "imageUrl": "https://fdn2.gsmarena.com/vv/pics/samsung/...", "isDefault": false }
    ],
    "officialImages": [
      "https://fdn2.gsmarena.com/vv/pics/samsung/samsung-galaxy-s26-ultra-1.jpg",
      "https://fdn2.gsmarena.com/vv/pics/samsung/samsung-galaxy-s26-ultra-2.jpg"
    ],
    "picturesPageUrl": "https://www.gsmarena.com/samsung_galaxy_s26_ultra-pictures-12999.php",
    "cameraSamples": [
      {
        "label": "Zoom — 1x",
        "images": [
          {
            "category": "Zoom — 1x",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_1101.jpg",
            "caption": "Daylight samples, main camera (1x) - 23mm, f/1.4, ISO 64, 1/3889s (4000x3000px)"
          },
          {
            "category": "Zoom — 1x",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_1141.jpg",
            "caption": "Daylight samples, main camera (1x), 50MP - 23mm, f/1.4, ISO 40, 1/2390s (8160x6120px)"
          }
        ]
      },
      {
        "label": "Night / Low Light",
        "images": [
          {
            "category": "Night / Low Light",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_2101.jpg",
            "caption": "Low-light samples, main camera (1x) - 23mm, f/1.4, ISO 1000, 1/100s (4000x3000px)"
          }
        ]
      }
    ],
    "lensDetails": [
      { "role": "Wide (main)", "detail": "200MP, f/1.4, 23mm, 1/1.3\", OIS; 8K@30fps" },
      { "role": "Front camera", "detail": "12 MP, f/2.2, 26mm (wide), 1/3.2\", 1.12µm, dual pixel PDAF" }
    ]
  }
}
```

---

## Architecture

```
Client Request
      │
      ▼
  Vercel Edge
      │
      ▼
Fastify Router ──→ Route Handler
                        │
                 ┌──────┴──────┐
                 ▼             ▼
           LRU Cache      Redis Cache
           (in-memory)    (Upstash)
           300 entries     persistent
           30-day TTL     across cold starts
                 │             │
                 └──────┬──────┘
                        │ cache miss
                        ▼
              ┌─────────┴─────────┐
              ▼                   ▼
          GSMArena            DXOMark
         (specs, samples,    (scores, sub-scores,
          press renders)      review samples)
              │                   │
              └─────────┬─────────┘
                        ▼
                 Structured JSON
                → cached → returned
```

**Cache behaviour:** Layer 1 (in-memory LRU, 300 entries, 30-day TTL) has zero network overhead. Layer 2 (Redis via Upstash) survives Vercel cold starts, making repeat response times effectively indistinguishable from warm cache hits. The `_cache` field in every response tells you which layer served it: `mem`, `redis`, or `miss`.

A **transient cache-skip rule** prevents bad data from being persisted: if a device has a `review_url` but camera samples came back empty (scrape hiccup), the result is not written to Redis and will be retried fresh on the next request.

---

## Project Structure

```
├── api/
│   └── index.ts                     # All Fastify routes + Vercel handler + dev server
└── src/
    ├── cache.ts                     # Redis (Upstash) + in-memory LRU with cacheGetWithSource()
    ├── config.ts                    # Shared configuration constants
    ├── types.ts                     # All TypeScript interfaces
    ├── server.ts                    # Local dev entrypoint
    ├── parser.review.ts             # (legacy) superseded by src/parser/parser.review.ts
    └── parser/
        ├── parser.service.ts        # search(), latest(), top-by-interest/fans
        ├── parser.brands.ts         # getBrands() with multi-selector fallback
        ├── parser.phone-details.ts  # getPhoneDetails() — specs, colour images, press renders, 3D viewer URL
        ├── parser.review.ts         # getReviewDetails() — hero, article images, camera samples, lens details
        └── parser.dxomark.ts        # getDxoScores(), getDxoReview(), searchDxo(), scrapeDxoReview()
```

---

## Use Cases

- **Mobile comparison platforms** — side-by-side specs + DXOMark scores + camera samples in one API call
- **Tech review sites** — embed live specs and camera benchmarks without maintaining a database
- **AI assistants** — give your LLM clean, structured, up-to-date smartphone knowledge
- **Research tools** — analyse camera hardware vs. real-world performance correlations
- **Price trackers** — pair hardware specs with pricing data for richer context
- **Android apps** — power a device detail screen with press renders per colour variant and a 3D viewer

---

## Contributing

Issues and PRs are welcome. For major changes, open an issue first.

```bash
git checkout -b feature/your-feature
git commit -m "feat: describe your change"
git push origin feature/your-feature
```

---

## ⚠️ Disclaimer

This project scrapes publicly accessible pages for personal and educational use. It is not affiliated with GSMArena or DXOMark. Use responsibly and respect their terms of service.

---

## License

[MIT](./LICENSE) © 2026 — Made with ❤️ by [Sanjeevu-Tarun](https://github.com/Sanjeevu-Tarun)

<!-- SEO: GSMArena API, DXOMark API, phone specs API, mobile specs API, camera score API, smartphone scraper, camera sample categorization, 200MP sample extraction, night mode samples, zoom samples API, press renders API, color variants API, Fastify TypeScript API, Vercel serverless API, open source phone database, mobile comparison API -->
