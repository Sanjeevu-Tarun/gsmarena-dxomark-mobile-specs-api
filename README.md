<div align="center">

# 📱 Mobile Specs API

**A blazing-fast GSMArena + DXOMark scraper API — TypeScript, Fastify, Vercel**

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5.x-000000?logo=fastify)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel)
![Last Commit](https://img.shields.io/github/last-commit/Sanjeevu-Tarun/mobile-specs-api)

[Report Bug](https://github.com/Sanjeevu-Tarun/mobile-specs-api/issues) · [Request Feature](https://github.com/Sanjeevu-Tarun/mobile-specs-api/issues)

</div>

---

## What is this?

A production-ready REST API that scrapes **GSMArena** and **DXOMark** and returns clean JSON — no API key, no signup, just hit the endpoint.

Built as a **Vercel serverless function** with a two-layer **Redis (Upstash) + in-memory LRU cache** so repeat requests are sub-millisecond.

### Why this over other GSMArena scrapers?

| Feature | This API | Most others |
|---------|----------|-------------|
| DXOMark scores + sub-scores | ✅ | ❌ |
| Camera samples by category | ✅ | ❌ |
| Device images per colour | ✅ | ❌ |
| Smart search (penalty scoring) | ✅ | ❌ |
| Redis + mem cache | ✅ | ❌ |
| Serverless (no server to maintain) | ✅ | ❌ |
| Full review scraping | ✅ | ❌ |

---

## Try it now

Deploy your own instance first — it's free and takes 2 minutes:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Sanjeevu-Tarun/mobile-specs-api)

Then hit your own deployment:

```bash
# All brands
curl https://YOUR-DEPLOYMENT.vercel.app/brands

# Search a phone
curl "https://YOUR-DEPLOYMENT.vercel.app/search?query=samsung+s25+ultra"

# Full specs
curl https://YOUR-DEPLOYMENT.vercel.app/samsung_galaxy_s25_ultra-12552

# DXOMark score
curl https://YOUR-DEPLOYMENT.vercel.app/dxomark/samsung-galaxy-s25-ultra
```

> Each user runs on their own free Vercel account — no shared quota, no rate limit surprises.

---

## Quick Start

**Prerequisites:** [Node.js 18+](https://nodejs.org) and pnpm

```bash
# Install pnpm if you don't have it
npm install -g pnpm

# Clone and run
git clone https://github.com/Sanjeevu-Tarun/mobile-specs-api
cd mobile-specs-api
pnpm install
pnpm dev
# → http://localhost:4000
```

> **How it works locally:** The project is a Vercel serverless function — `api/index.ts` only exports a handler. `pnpm dev` starts a local Fastify server on port 4000 purely for development. On Vercel, the handler is called directly.

### Deploy to Vercel

```bash
npm install -g vercel
vercel deploy
```

`vercel.json` is already configured — no extra setup needed. Or use the one-click button at the top.

---

## Environment Variables

Optional — the API works without Redis using in-memory cache only.

| Variable | Description |
|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |

Get free Redis at [console.upstash.com](https://console.upstash.com) → create database → copy REST URL + token → add to Vercel project settings.

---

## API Reference

<details>
<summary><b>🏷️ Brands</b></summary>

### Get all brands
```
GET /brands
```
```bash
curl https://YOUR-DEPLOYMENT.vercel.app/brands
```
```json
{
  "status": true,
  "data": {
    "Samsung": {
      "brand_id": 9,
      "brand_slug": "samsung-phones-9",
      "device_count": 2108,
      "detail_url": "/brands/samsung-phones-9"
    }
  }
}
```

### Get phones by brand
```
GET /brands/:brandSlug
```
```bash
curl https://YOUR-DEPLOYMENT.vercel.app/brands/samsung-phones-9
```

</details>

<details>
<summary><b>🔍 Discovery & Search</b></summary>

| Endpoint | Description |
|----------|-------------|
| `GET /latest` | Latest released phones |
| `GET /top-by-interest` | Top phones by daily hits |
| `GET /top-by-fans` | Top phones by total favorites |
| `GET /search?query=<q>` | Search by device name |

```bash
curl "https://YOUR-DEPLOYMENT.vercel.app/search?query=pixel+9+pro"
```
```json
{
  "status": true,
  "data": [
    {
      "name": "Google Pixel 9 Pro",
      "slug": "google_pixel_9_pro-12445",
      "imageUrl": "https://fdn2.gsmarena.com/vv/bigpic/google-pixel-9-pro.jpg",
      "detail_url": "/google_pixel_9_pro-12445"
    }
  ]
}
```

> Search uses a **penalty scoring system** — querying `pixel 9` won't return `pixel 9 pro` or `pixel 9 xl` unless explicitly asked.

</details>

<details>
<summary><b>📋 Device Specs</b></summary>

```
GET /:slug
```

Returns full GSMArena specs plus two enhanced fields:
- `device_images` — `{ color, url }` for every colour variant
- `review_url` — link to the GSMArena review if one exists

```bash
curl https://YOUR-DEPLOYMENT.vercel.app/samsung_galaxy_s25_ultra-12552
```
```json
{
  "status": true,
  "data": {
    "name": "Samsung Galaxy S25 Ultra",
    "slug": "samsung_galaxy_s25_ultra-12552",
    "review_url": "https://www.gsmarena.com/samsung_galaxy_s25_ultra-review-2631.php",
    "device_images": [
      { "color": "Titanium Black", "url": "https://fdn2.gsmarena.com/…/titanium-black.jpg" }
    ],
    "specs": { "...": "..." }
  }
}
```

</details>

<details>
<summary><b>📸 Reviews & Camera Samples</b></summary>

`reviewSlug` = review URL slug without `.php`  
e.g. `gsmarena.com/samsung_galaxy_s25_ultra-review-2631.php` → `samsung_galaxy_s25_ultra-review-2631`

| Endpoint | Description |
|----------|-------------|
| `GET /review/:reviewSlug` | Full review — hero images, article images, camera samples |
| `GET /review/:reviewSlug/camera-samples` | Camera samples only |
| `GET /review/:reviewSlug/images` | Hero + article images only |

```bash
curl https://YOUR-DEPLOYMENT.vercel.app/review/samsung_galaxy_s25_ultra-review-2631
```
```json
{
  "status": true,
  "data": {
    "device": "Samsung Galaxy S25 Ultra",
    "reviewUrl": "https://www.gsmarena.com/…",
    "heroImages": ["https://…/img.jpg"],
    "cameraSamples": [
      { "label": "Main Camera",       "images": ["…"] },
      { "label": "Night / Low Light", "images": ["…"] },
      { "label": "Zoom",              "images": ["…"] },
      { "label": "Selfie",            "images": ["…"] },
      { "label": "Ultra-Wide",        "images": ["…"] },
      { "label": "Video",             "images": ["…"] }
    ]
  }
}
```

**Camera sample categories:**

| Label | Matched by |
|-------|-----------|
| Main Camera | main, daylight, outdoor |
| Night / Low Light | night, low light |
| Zoom | zoom, tele |
| Selfie | selfie, front |
| Ultra-Wide | wide, ultra-wide |
| Portrait | portrait |
| Macro | macro |
| Video | video |
| Indoor | indoor |

</details>

<details>
<summary><b>🎯 DXOMark</b></summary>

| Endpoint | Description |
|----------|-------------|
| `GET /dxomark/:slug` | Overall score, sub-scores, pros/cons, ranking |
| `GET /dxomark/search?query=<q>` | Search DXOMark by device name |
| `GET /dxomark/url?url=<dxomark-url>` | Scrape any DXOMark page by URL |

```bash
curl https://YOUR-DEPLOYMENT.vercel.app/dxomark/samsung-galaxy-s25-ultra
```
```json
{
  "status": true,
  "data": {
    "device": "Samsung Galaxy S25 Ultra",
    "overall": 163,
    "scores": {
      "photo": 158,
      "video": 148,
      "zoom": 166,
      "bokeh": 68,
      "preview": 107
    },
    "ranking": 3,
    "pros": ["Excellent zoom range", "Outstanding low-light photo"],
    "cons": ["Average bokeh rendering"]
  }
}
```

</details>

---

## Caching

| Layer | Storage | TTL | Behaviour |
|-------|---------|-----|-----------|
| 1st | In-memory LRU (300 entries) | 30 days | Always checked first, zero latency |
| 2nd | Redis via Upstash | Indefinite | Checked on memory miss, persists across cold starts |

Cache keys are versioned (`gsm:phone-full:v3`) — bumping the version in code instantly invalidates stale data with no manual flush needed.

---

## Project Structure

```
├── api/
│   └── index.ts                    # Fastify routes + Vercel handler + local dev server
└── src/
    ├── server.ts                   # baseUrl constant
    ├── cache.ts                    # Redis (Upstash) + in-memory LRU cache
    ├── types.ts                    # TypeScript interfaces
    └── parser/
        ├── parser.service.ts       # getHtml(), search, latest, top lists
        ├── parser.brands.ts        # getBrands() with multi-selector fallback
        ├── parser.phone-details.ts # getPhoneDetails() + device_images + review_url
        ├── parser.review.ts        # getReviewDetails() — hero, article, camera samples
        └── parser.dxomark.ts       # DXOMark scores, sub-scores, search, rankings
```

---

## Contributing

Issues and PRs are welcome! For major changes please open an issue first.

```bash
git checkout -b feature/your-feature
# make changes
git commit -m "feat: your feature"
git push origin feature/your-feature
# open a PR
```

---

## ⚠️ Disclaimer

This project scrapes publicly accessible pages for personal and educational use. It is not affiliated with GSMArena or DXOMark. Use responsibly and respect their terms of service.

---

## ⭐ Support

If this project helped you, consider giving it a star — it helps others discover it!

[![Star this repo](https://img.shields.io/github/stars/Sanjeevu-Tarun/mobile-specs-api?style=social)](https://github.com/Sanjeevu-Tarun/mobile-specs-api)

- 🐛 [Report a bug](https://github.com/Sanjeevu-Tarun/mobile-specs-api/issues)
- 💡 [Request a feature](https://github.com/Sanjeevu-Tarun/mobile-specs-api/issues)
- 👤 [Follow me on GitHub](https://github.com/Sanjeevu-Tarun) for more projects like this ❤️!
- ❤️ Thanks for your support 
---

## 📄 License

[MIT](./LICENSE) © 2026 — Made with ❤️ by [Sanjeevu-Tarun](https://github.com/Sanjeevu-Tarun)
