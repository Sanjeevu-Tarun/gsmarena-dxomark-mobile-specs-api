<div align="center">

# 📡 GSMArena + DXOMark API
### The only open-source API that fuses hardware specs with professional camera scores

**Full GSMArena specs · DXOMark scores & sub-scores · Categorized camera samples · Smart search · Two-layer cache · Deploy in 2 minutes**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-000000?logo=fastify)](https://fastify.dev/)
[![Vercel](https://img.shields.io/badge/Deploy%20on-Vercel-black?logo=vercel)](https://vercel.com/)

[🚀 Deploy Now](#deploy-to-vercel) · [📖 API Reference](#api-reference) · [🐛 Report Bug](../../issues) · [💡 Request Feature](../../issues)

</div>

---

## Why This API?

Most GSMArena scrapers are **table-only tools** — they grab the spec sheet and stop there. They return raw strings like `"200 MP, f/1.7"` with no context on whether that sensor actually *performs* at 200MP or whether the night mode is any good.

This API is different. It answers the question developers actually need to ask:

> *"How does this phone's hardware translate into real-world camera performance?"*

It does this by combining three things no other open-source scraper provides together:

1. **Full GSMArena specifications** — every field, clean structured JSON
2. **DXOMark professional scores** — overall, photo, video, zoom, bokeh, selfie, audio, display, battery
3. **Intelligently categorized camera samples** — not a flat image dump, but samples sorted by shooting condition and sensor mode

The sample categorization is the key differentiator. Instead of a random gallery of URLs, you get samples organized into `daylight`, `night`, `zoom`, `ultrawide`, `portrait`, `video`, and — critically — **isolated high-resolution (200MP) shots** separated from standard pixel-binned output. This is the data layer you need to build a genuine comparison platform.

---

## Features

| Feature | This API | Most others |
|---|---|---|
| DXOMark overall score | ✅ | ❌ |
| DXOMark sub-scores (photo, video, zoom, bokeh) | ✅ | ❌ |
| Camera samples by shooting condition | ✅ | ❌ |
| High-res (200MP) vs. binned sample isolation | ✅ | ❌ |
| Device images per colour variant | ✅ | ❌ |
| Smart search with penalty scoring | ✅ | ❌ |
| Redis + in-memory LRU cache | ✅ | ❌ |
| Full review scraping (pros, cons, strengths, weaknesses) | ✅ | ❌ |
| Serverless — no infrastructure to manage | ✅ | ❌ |

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

## API Reference

### Search

```bash
GET /search?query=samsung+galaxy+s24+ultra
```

Uses penalty scoring so `pixel 9` doesn't bleed into `pixel 9 pro` results.

### Full specs

```bash
GET /samsung_galaxy_s24_ultra-12311
```

Returns GSMArena specs + device images per colour variant + review URL.

### DXOMark scores

```bash
GET /dxomark?name=samsung+galaxy+s24+ultra
```

Returns overall score, all sub-scores, pros/cons, rank, strengths, weaknesses, and categorized camera samples in a single response.

### Camera samples (from review)

```bash
GET /review/samsung_galaxy_s24_ultra-review-2631/camera-samples
```

Returns samples pre-sorted into: `Main Camera`, `Night / Low Light`, `Zoom`, `Selfie`, `Ultra-Wide`, `Portrait`, `Macro`, `Video`, `Indoor`.

### All brands

```bash
GET /brands
```

### Phones by brand

```bash
GET /brands/samsung-phones-9
```

---

## Sample JSON Output

This is real output from the API for the **Samsung Galaxy S26 Ultra**. Not mocked — not fabricated.

```json
{
  "status": true,
  "matched": "Samsung Galaxy S26 Ultra",
  "_cache": "redis",
  "data": {
    "model": "Samsung Galaxy S26 Ultra",
    "imageUrl": "https://fdn2.gsmarena.com/vv/pics/samsung/samsung-galaxy-s26-ultra-1.jpg",
    "release_date": "Released 2026, March 06",
    "dimensions": "214g, 7.9mm thickness",
    "os": "Android 16, up to 7 major upgrades",
    "storage": "256GB/512GB/1TB storage, no card slot",
    "review_url": "https://www.gsmarena.com/samsung_galaxy_s26_ultra-review-2939.php",
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
      },
      "Battery": {
        "Type": "Li-Ion 5000 mAh",
        "Charging": "60W wired · 25W wireless (Qi2.2) · 4.5W reverse wireless"
      }
    },
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
        "label": "Ultra-Wide",
        "images": [
          {
            "category": "Ultra-Wide",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_1001.jpg",
            "caption": "Daylight samples, ultrawide camera (0.6x) - 13mm, f/1.9, ISO 32, 1/1258s (4000x3000px)"
          },
          {
            "category": "Ultra-Wide",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_1041.jpg",
            "caption": "Daylight samples, ultrawide (0.6x), 50MP - 13mm, f/1.9, ISO 16, 1/585s (8160x6120px)"
          }
        ]
      },
      {
        "label": "Zoom — 3x",
        "images": [
          {
            "category": "Zoom — 3x",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_1301.jpg",
            "caption": "Daylight samples, telephoto camera (3x) - 69mm, f/2.4, ISO 25, 1/616s (4000x3000px)"
          }
        ]
      },
      {
        "label": "Zoom — 5x",
        "images": [
          {
            "category": "Zoom — 5x",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_1502.jpg",
            "caption": "Daylight samples, telephoto camera (5x) - 115mm, f/2.9, ISO 50, 1/466s (4000x3000px)"
          },
          {
            "category": "Zoom — 5x",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_1541.jpg",
            "caption": "Daylight samples, telephoto (5x), 50MP - 115mm, f/2.9, ISO 25, 1/293s (8160x6120px)"
          }
        ]
      },
      {
        "label": "Zoom — 10x",
        "images": [
          {
            "category": "Zoom — 10x",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_1901.jpg",
            "caption": "Daylight samples, telephoto camera (10x) - 230mm, f/2.9, ISO 25, 1/282s (4000x3000px)"
          }
        ]
      },
      {
        "label": "Zoom — 30x",
        "images": [
          {
            "category": "Zoom — 30x",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_1801.jpg",
            "caption": "Daylight comparison, telephoto (30x) - 690mm, f/2.9, ISO 25, 1/814s (4000x3000px)"
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
          },
          {
            "category": "Night / Low Light",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_2121.jpg",
            "caption": "Low-light, main camera (1x), max Night mode - 23mm, f/1.4, ISO 125, 1/13s (4000x3000px)"
          }
        ]
      },
      {
        "label": "Night / Low Light — 5x Zoom",
        "images": [
          {
            "category": "Night / Low Light — 5x Zoom",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_2501.jpg",
            "caption": "Low-light, telephoto (5x) - 115mm, f/2.9, ISO 1600, 1/33s (4000x3000px)"
          }
        ]
      },
      {
        "label": "Selfie",
        "images": [
          {
            "category": "Selfie",
            "url": "https://fdn.gsmarena.com/imgroot/reviews/26/samsung-galaxy-s26-ultra/camera/gsmarena_3001.jpg",
            "caption": "Selfie samples - 23mm, f/2.2, ISO 40, 1/1632s (4000x3000px)"
          }
        ]
      }
    ],
    "lensDetails": [
      {
        "role": "Front camera",
        "detail": "12 MP, f/2.2, 26mm (wide), 1/3.2\", 1.12µm, dual pixel PDAF."
      }
    ]
  }
}
```

> The full response for the S26 Ultra includes **14 camera sample categories** with hundreds of images across 1x, 2x, 3x, 5x, 10x, 30x daylight, and matching night/low-light sets per focal length. The snippet above is abbreviated for readability — every image includes its focal length, aperture, ISO, and shutter speed in the `caption` field.
```

---

## Environment Variables

Optional — the API works without Redis using in-memory cache only.

| Variable | Description |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |

Get a free Redis instance at [console.upstash.com](https://console.upstash.com).

---

## Architecture

```text
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
                 │             │
                 └──────┬──────┘
                        │ cache miss
                        ▼
                  GSMArena / DXOMark
                    (scrapers)
                        │
                        ▼
                  Structured JSON
                   → cached → returned
```

Cache layer 1 (in-memory LRU) holds up to 300 entries with a 30-day TTL and zero network overhead. Layer 2 (Redis via Upstash) survives Vercel cold starts, making repeat response times effectively indistinguishable from warm cache hits.

---

## Use Cases

- **Mobile comparison platforms** — side-by-side specs + DXOMark scores in one API call
- **Tech review sites** — embed live specs and camera benchmarks without maintaining a database
- **AI assistants** — give your LLM clean, structured smartphone knowledge
- **Research tools** — analyse smartphone trends, camera hardware vs. real-world performance correlation
- **Price trackers** — pair hardware specs with pricing data for richer context

---

## Project Structure

```text
├── api/
│   └── index.ts                     # Fastify routes + Vercel handler + local dev server
└── src/
    ├── cache.ts                     # Redis (Upstash) + in-memory LRU
    ├── types.ts                     # TypeScript interfaces
    └── parser/
        ├── parser.service.ts        # getHtml(), search, latest, top lists
        ├── parser.brands.ts         # getBrands() with multi-selector fallback
        ├── parser.phone-details.ts  # getPhoneDetails() + colour images + review URL
        ├── parser.review.ts         # getReviewDetails() — hero, article, camera samples
        └── parser.dxomark.ts        # DXOMark scores, sub-scores, search, rankings
```

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

<!-- SEO: GSMArena API, DXOMark API, phone specs API, mobile specs API, camera score API, smartphone scraper, camera sample categorization, 200MP sample extraction, night mode camera samples, zoom sample API, Fastify TypeScript API, Vercel serverless API, open source phone database, mobile comparison API -->
