import Fastify from 'fastify';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ParserService, getHtml } from '../src/parser/parser.service';
import { cacheGetWithSource, cacheSet } from '../src/cache';
import { getPhoneDetails } from '../src/parser/parser.phone-details';
import { getBrands } from '../src/parser/parser.brands';
import { getReviewDetails } from '../src/parser/parser.review';
import { getDxoScores, searchDxo, scrapeDxoPage, getDxoReview, scrapeDxoReview, getCameraReviewUrl } from '../src/parser/parser.dxomark';
import { CAMERA_URL_OVERRIDES, CAMERA_URL_OVERRIDE_ALIASES } from '../src/data/camera-overrides';
import type { IncomingMessage, ServerResponse } from 'http';

const app = Fastify({ logger: false });
const parserService = new ParserService();

// ── CORS ─────────────────────────────────────────────────────────────────────
app.addHook('onSend', async (_request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
});
app.options('/*', async (_request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  reply.status(204).send();
});

// ── Debug route guard ──────────────────────────────────────────────────────
// Protect destructive debug routes with a shared secret.
// Set DEBUG_SECRET env var; pass ?secret=<value> on each request.
// If the env var is NOT set, the route is CLOSED — security-by-default.
function requireDebugSecret(request: any, reply: any): boolean {
  const secret = process.env.DEBUG_SECRET;
  if (!secret) {
    reply.status(403).send({ status: false, error: 'Forbidden: DEBUG_SECRET env var is not configured on this deployment.' });
    return false;
  }
  if ((request.query as any)?.secret === secret) return true;
  reply.status(403).send({ status: false, error: 'Forbidden: missing or invalid secret' });
  return false;
}

// Landing page — HTML inlined to avoid Vercel serverless filesystem issues
const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mobile Specs API</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0a0f;
    --surface: #111118;
    --border: #1e1e2e;
    --accent: #00e5ff;
    --accent2: #7c3aed;
    --green: #00ff94;
    --yellow: #ffd60a;
    --red: #ff4757;
    --text: #e2e8f0;
    --muted: #64748b;
    --mono: 'JetBrains Mono', monospace;
    --display: 'Syne', sans-serif;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--mono);
    font-size: 13px;
    min-height: 100vh;
    overflow-x: hidden;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0,229,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,229,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  .wrap {
    position: relative;
    z-index: 1;
    max-width: 860px;
    margin: 0 auto;
    padding: 60px 24px 100px;
  }

  header { margin-bottom: 56px; animation: fadeUp 0.6s ease both; }

  .tag {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--accent);
    border: 1px solid rgba(0,229,255,0.3);
    padding: 4px 10px;
    border-radius: 2px;
    margin-bottom: 20px;
    background: rgba(0,229,255,0.05);
  }

  h1 {
    font-family: var(--display);
    font-size: clamp(36px, 6vw, 64px);
    font-weight: 800;
    line-height: 1.0;
    letter-spacing: -0.02em;
    color: #fff;
    margin-bottom: 16px;
  }

  h1 span { color: var(--accent); }

  .subtitle {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.6;
    max-width: 500px;
  }

  .base-url {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 14px;
    font-size: 12px;
    color: var(--green);
  }

  .base-url .label {
    color: var(--muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .section { margin-bottom: 48px; animation: fadeUp 0.6s ease both; }
  .section:nth-child(2) { animation-delay: 0.1s; }
  .section:nth-child(3) { animation-delay: 0.2s; }
  .section:nth-child(4) { animation-delay: 0.3s; }
  .section:nth-child(5) { animation-delay: 0.4s; }

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }

  .section-title {
    font-family: var(--display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .section-line { flex: 1; height: 1px; background: var(--border); }

  .endpoint {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 10px;
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .endpoint:hover { border-color: rgba(0,229,255,0.2); }

  .endpoint-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    cursor: pointer;
    user-select: none;
  }

  .method {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    border-radius: 3px;
    flex-shrink: 0;
    background: rgba(0,229,255,0.1);
    color: var(--accent);
    border: 1px solid rgba(0,229,255,0.2);
  }

  .path { flex: 1; color: #fff; font-size: 13px; font-weight: 600; }
  .path .param { color: var(--yellow); }
  .path .query { color: var(--muted); }

  .desc-short {
    color: var(--muted);
    font-size: 11px;
    flex-shrink: 0;
    max-width: 200px;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chevron { color: var(--muted); font-size: 10px; transition: transform 0.2s; flex-shrink: 0; }
  .endpoint.open .chevron { transform: rotate(180deg); }

  .endpoint-body {
    display: none;
    padding: 0 16px 16px;
    border-top: 1px solid var(--border);
  }

  .endpoint.open .endpoint-body { display: block; }

  .desc-full { color: var(--muted); font-size: 12px; line-height: 1.7; margin: 12px 0; }

  .params-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    margin: 14px 0 6px;
  }

  .param-row {
    display: grid;
    grid-template-columns: 140px 80px 1fr;
    gap: 12px;
    padding: 7px 0;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    align-items: start;
  }

  .param-row:last-child { border-bottom: none; }
  .param-name { color: var(--yellow); }
  .param-type { color: var(--accent2); }
  .param-desc { color: var(--muted); line-height: 1.5; }

  .example-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    margin: 16px 0 6px;
  }

  .example-url {
    background: #0d0d16;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 10px 14px;
    color: var(--green);
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    transition: border-color 0.2s;
    word-break: break-all;
  }

  .example-url:hover { border-color: var(--green); }
  .example-url .copy-icon { color: var(--muted); flex-shrink: 0; font-size: 11px; margin-left: auto; }
  .example-url:hover .copy-icon { color: var(--green); }

  .badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .badge-star { background: rgba(255,214,10,0.1); color: var(--yellow); border: 1px solid rgba(255,214,10,0.25); }
  .badge-debug { background: rgba(100,116,139,0.1); color: var(--muted); border: 1px solid rgba(100,116,139,0.2); }

  .response-block {
    background: #0d0d16;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px 14px;
    margin-top: 6px;
    font-size: 11px;
    line-height: 1.8;
    color: var(--muted);
    white-space: pre;
    overflow-x: auto;
  }
  .response-block .k { color: #7dd3fc; }
  .response-block .v { color: var(--green); }
  .response-block .s { color: var(--yellow); }
  .response-block .c { color: #475569; }

  footer {
    margin-top: 60px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 11px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .status-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
    margin-right: 6px;
    animation: pulse 2s infinite;
  }

  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--surface);
    border: 1px solid var(--green);
    color: var(--green);
    padding: 10px 18px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    opacity: 0;
    transform: translateY(8px);
    transition: all 0.2s;
    pointer-events: none;
  }
  .toast.show { opacity: 1; transform: translateY(0); }

  @media (max-width: 600px) {
    .desc-short { display: none; }
    .param-row { grid-template-columns: 120px 70px 1fr; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="tag">REST API &middot; GSMArena Scraper</div>
    <h1>Mobile<br><span>Specs</span> API</h1>
    <div class="base-url">
      <span class="label">Base URL</span>
      <span id="baseUrl">https://your-deployment.vercel.app</span>
    </div>
  </header>

  <div class="section">
    <div class="section-header">
      <span class="section-title">Discovery</span>
      <div class="section-line"></div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/brands</span>
        <span class="desc-short">List all brands</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Returns all device brands available on GSMArena with their slugs and phone counts.</p>
        <div class="example-label">Example</div>
        <div class="example-url" onclick="copyUrl(this)"><span>/brands</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/brands/<span class="param">:brandSlug</span></span>
        <span class="desc-short">Phones by brand</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Returns all phones listed under a specific brand on GSMArena.</p>
        <div class="params-label">Path Parameters</div>
        <div class="param-row">
          <span class="param-name">brandSlug</span>
          <span class="param-type">string</span>
          <span class="param-desc">Brand slug from <code>/brands</code> e.g. <code>samsung</code>, <code>apple</code>, <code>xiaomi</code></span>
        </div>
        <div class="example-label">Example</div>
        <div class="example-url" onclick="copyUrl(this)"><span>/brands/samsung</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/latest</span>
        <span class="desc-short">Latest releases</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Returns the most recently released phones from GSMArena's latest devices listing.</p>
        <div class="example-label">Example</div>
        <div class="example-url" onclick="copyUrl(this)"><span>/latest</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/top-by-interest</span>
        <span class="desc-short">Top by user interest</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Returns phones ranked by current user interest / search traffic on GSMArena.</p>
        <div class="example-label">Example</div>
        <div class="example-url" onclick="copyUrl(this)"><span>/top-by-interest</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/top-by-fans</span>
        <span class="desc-short">Top by fan count</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Returns phones ranked by the number of fans/followers on GSMArena.</p>
        <div class="example-label">Example</div>
        <div class="example-url" onclick="copyUrl(this)"><span>/top-by-fans</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <span class="section-title">Search &amp; Specs</span>
      <div class="section-line"></div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/search<span class="query">?query=</span><span class="param">:q</span></span>
        <span class="desc-short">Search devices</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Searches GSMArena for devices matching the query. Returns a list of matches with slugs you can pass to other endpoints.</p>
        <div class="params-label">Query Parameters</div>
        <div class="param-row">
          <span class="param-name">query</span>
          <span class="param-type">string &middot; required</span>
          <span class="param-desc">Device name to search for</span>
        </div>
        <div class="example-label">Example</div>
        <div class="example-url" onclick="copyUrl(this)"><span>/search?query=pixel 9 pro</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/<span class="param">:slug</span></span>
        <span class="desc-short">Device specs by slug</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Returns full specifications for a device by its GSMArena slug. Obtain the slug from <code>/search</code> results.</p>
        <div class="params-label">Path Parameters</div>
        <div class="param-row">
          <span class="param-name">slug</span>
          <span class="param-type">string</span>
          <span class="param-desc">GSMArena device slug e.g. <code>samsung_galaxy_s25_ultra-12559</code></span>
        </div>
        <div class="example-label">Example</div>
        <div class="example-url" onclick="copyUrl(this)"><span>/samsung_galaxy_s25_ultra-12559</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/phone<span class="query">?name=</span><span class="param">:name</span></span>
        <span class="badge badge-star">&#9733; MAIN</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">One endpoint for everything. Pass a plain device name — it searches, fetches full specs, and scrapes all camera samples in one shot. Best starting point for any integration.</p>
        <div class="params-label">Query Parameters</div>
        <div class="param-row">
          <span class="param-name">name</span>
          <span class="param-type">string &middot; required</span>
          <span class="param-desc">Plain device name e.g. <code>samsung galaxy s25 ultra</code>, <code>iphone 16 pro max</code></span>
        </div>
        <div class="params-label">Response Fields</div>
        <div class="param-row"><span class="param-name">brand, model</span><span class="param-type"></span><span class="param-desc">Device identity</span></div>
        <div class="param-row"><span class="param-name">specifications</span><span class="param-type">object</span><span class="param-desc">Full specs table — chipset, display, battery, connectivity&hellip;</span></div>
        <div class="param-row"><span class="param-name">device_images</span><span class="param-type">string[]</span><span class="param-desc">Official press images from the specs page</span></div>
        <div class="param-row"><span class="param-name">hdImageUrl</span><span class="param-type">string</span><span class="param-desc">High-res hero image from review page (1200px)</span></div>
        <div class="param-row"><span class="param-name">cameraSamples</span><span class="param-type">array</span><span class="param-desc">All tabs — Main, Night, Zoom, Selfie, Video with classified images</span></div>
        <div class="param-row"><span class="param-name">lensDetails</span><span class="param-type">array</span><span class="param-desc">Per-lens metadata from review page</span></div>
        <div class="param-row"><span class="param-name">review_url</span><span class="param-type">string</span><span class="param-desc">GSMArena review page URL if available</span></div>
        <div class="example-label">Example</div>
        <div class="example-url" onclick="copyUrl(this)"><span>/phone?name=samsung galaxy s25 ultra</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <span class="section-title">Reviews &amp; Camera Samples</span>
      <div class="section-line"></div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/review/<span class="param">:reviewSlug</span></span>
        <span class="desc-short">Full review data</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Scrapes a GSMArena review page and all camera-sample tabs. Returns hero images, article images grouped by section heading, and all camera sample categories.</p>
        <div class="params-label">Path Parameters</div>
        <div class="param-row">
          <span class="param-name">reviewSlug</span>
          <span class="param-type">string</span>
          <span class="param-desc">Review slug e.g. <code>samsung_galaxy_s25_ultra-review-2939p5</code> — page suffix optional</span>
        </div>
        <div class="params-label">Response Fields</div>
        <div class="param-row"><span class="param-name">heroImages</span><span class="param-type">string[]</span><span class="param-desc">Header / top-of-page images</span></div>
        <div class="param-row"><span class="param-name">articleImages</span><span class="param-type">object</span><span class="param-desc">In-body images grouped by nearest section heading</span></div>
        <div class="param-row"><span class="param-name">cameraSamples</span><span class="param-type">array</span><span class="param-desc">All tabs (Main Camera, Night, Zoom, Selfie, Video&hellip;) with images</span></div>
        <div class="example-label">Example</div>
        <div class="example-url" onclick="copyUrl(this)"><span>/review/samsung_galaxy_s25_ultra-review-2939p5</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/review/<span class="param">:reviewSlug</span>/camera-samples</span>
        <span class="desc-short">Camera samples only</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Returns only the camera samples section — all tabs with classified images. Lighter response than the full review endpoint.</p>
        <div class="params-label">Path Parameters</div>
        <div class="param-row"><span class="param-name">reviewSlug</span><span class="param-type">string</span><span class="param-desc">GSMArena review slug</span></div>
        <div class="example-label">Example</div>
        <div class="example-url" onclick="copyUrl(this)"><span>/review/samsung_galaxy_s25_ultra-review-2939p5/camera-samples</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/review/<span class="param">:reviewSlug</span>/images</span>
        <span class="desc-short">Hero + article images</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Returns only hero and article images for a review page — excludes camera samples. Useful for fetching high-res editorial photos.</p>
        <div class="params-label">Path Parameters</div>
        <div class="param-row"><span class="param-name">reviewSlug</span><span class="param-type">string</span><span class="param-desc">GSMArena review slug</span></div>
        <div class="example-label">Example</div>
        <div class="example-url" onclick="copyUrl(this)"><span>/review/samsung_galaxy_s25_ultra-review-2939p5/images</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <span class="section-title">Debug</span>
      <div class="section-line"></div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/debug</span>
        <span class="badge badge-debug">DEV</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Health check — confirms the serverless function is alive and routing correctly.</p>
        <div class="example-label">Response</div>
        <div class="response-block"><span class="c">{</span>
  <span class="k">"ok"</span><span class="c">:</span>     <span class="v">true</span><span class="c">,</span>
  <span class="k">"url"</span><span class="c">:</span>    <span class="s">"/debug"</span><span class="c">,</span>
  <span class="k">"method"</span><span class="c">:</span> <span class="s">"GET"</span>
<span class="c">}</span></div>
        <div class="example-url" onclick="copyUrl(this)" style="margin-top:10px"><span>/debug</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>

    <div class="endpoint">
      <div class="endpoint-header" onclick="toggle(this)">
        <span class="method">GET</span>
        <span class="path">/debug-camera</span>
        <span class="badge badge-debug">DEV</span>
        <span class="chevron">&#9660;</span>
      </div>
      <div class="endpoint-body">
        <p class="desc-full">Diagnostic for camera sample link detection on the iQOO Z7 Pro opinions page. Returns link counts and matched camera URLs.</p>
        <div class="example-url" onclick="copyUrl(this)" style="margin-top:10px"><span>/debug-camera</span><span class="copy-icon">&#8856; copy</span></div>
      </div>
    </div>
  </div>

  <footer>
    <span><span class="status-dot"></span>GSMArena + DXOMark Scraper &middot; Vercel Serverless</span>
    <span>20+ endpoints</span>
  </footer>
</div>

<div class="toast" id="toast">Copied to clipboard</div>
<script>
  const base = window.location.origin;
  document.getElementById('baseUrl').textContent =
    (base === 'null' || base.startsWith('file')) ? 'https://your-deployment.vercel.app' : base;

  function toggle(header) { header.parentElement.classList.toggle('open'); }

  function copyUrl(el) {
    const path = el.querySelector('span:first-child').textContent.trim();
    const full = document.getElementById('baseUrl').textContent + path;
    navigator.clipboard.writeText(full).then(() => {
      const t = document.getElementById('toast');
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 1800);
    });
  }
</script>
</body>
</html>`;

app.get('/', async (_request, reply) => {
  reply.type('text/html').send(LANDING_HTML);
});

// Debug route
app.get('/debug', async (request) => {
  return { ok: true, url: request.url, method: request.method };
});

// Flush stale search cache keys (gsm:search:* and gsm:phone-full:*)
app.get('/debug/flush-search', async (_request: any, reply: any) => {
  if (!requireDebugSecret(_request, reply)) return;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return reply.status(500).send({ ok: false, error: 'Env vars missing' });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const patterns = ['gsm:search:*', 'gsm:phone-full:*'];
  let totalDeleted = 0;

  for (const pattern of patterns) {
    let cursor = '0';
    do {
      const scanResp = await axios.post(`${url}/pipeline`, [
        ['SCAN', cursor, 'MATCH', pattern, 'COUNT', '100']
      ], { headers, timeout: 15000 });
      const [nextCursor, keys] = scanResp.data[0].result;
      cursor = nextCursor;
      if (keys.length > 0) {
        await axios.post(`${url}/pipeline`, keys.map((k: string) => ['DEL', k]), { headers, timeout: 15000 });
        totalDeleted += keys.length;
      }
    } while (cursor !== '0');
  }

  return { ok: true, deleted: totalDeleted };
});

// Flush all gsm:html:* keys from Redis (one-time cleanup)
app.get('/debug/flush-html', async (_request: any, reply: any) => {
  if (!requireDebugSecret(_request, reply)) return;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return reply.status(500).send({ ok: false, error: 'Env vars missing' });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let cursor = '0';
  let deleted = 0;
  let scanned = 0;

  do {
    // SCAN for gsm:html:* keys in batches
    const scanResp = await axios.post(`${url}/pipeline`, [
      ['SCAN', cursor, 'MATCH', 'gsm:html:*', 'COUNT', '100']
    ], { headers, timeout: 15000 });

    const [nextCursor, keys] = scanResp.data[0].result;
    cursor = nextCursor;
    scanned += keys.length;

    if (keys.length > 0) {
      await axios.post(`${url}/pipeline`,
        keys.map((k: string) => ['DEL', k]),
        { headers, timeout: 15000 }
      );
      deleted += keys.length;
    }
  } while (cursor !== '0');

  return { ok: true, scanned, deleted };
});

// Full cache cycle test for /phone endpoint
app.get('/debug/cache-test', async (request, reply) => {
  if (!requireDebugSecret(request, reply)) return;
  const name = (request.query as any).name || 'samsung galaxy s25 ultra';
  const normName = name.toLowerCase().trim().replace(/\s+/g, ' ');
  const fullCk = `gsm:phone-full:v2:${normName}`;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Step 1: check if key exists in Redis directly
  let redisRaw: any = null;
  let redisError: any = null;
  try {
    const resp = await axios.get(`${url}/get/${encodeURIComponent(fullCk)}`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 10000,
    });
    redisRaw = resp.data;
  } catch (e: any) {
    redisError = e.message;
  }

  // Step 2: check mem cache
  const memResult = await cacheGetWithSource<any>(fullCk);

  return {
    key: fullCk,
    memCache: memResult.source,
    redisResult: redisRaw?.result ? 'HIT (value length: ' + redisRaw.result.length + ')' : 'MISS',
    redisError,
    envVars: {
      url: url ? url.slice(0, 40) + '...' : 'MISSING',
      token: token ? token.slice(0, 8) + '...' : 'MISSING',
    }
  };
});

// Redis connectivity test
app.get('/debug/redis', async (_request: any, reply: any) => {
  if (!requireDebugSecret(_request, reply)) return;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return reply.status(500).send({
      ok: false,
      error: 'Env vars missing',
      UPSTASH_REDIS_REST_URL: url ? '✅ set' : '❌ missing',
      UPSTASH_REDIS_REST_TOKEN: token ? '✅ set' : '❌ missing',
    });
  }

  const testKey = 'gsm:debug:ping';
  const testVal = { ping: 'pong', ts: Date.now() };
  const results: any = {
    UPSTASH_REDIS_REST_URL: url.slice(0, 40) + '...',
    UPSTASH_REDIS_REST_TOKEN: token.slice(0, 8) + '...',
  };

  // Test SET
  try {
    const setResp = await axios.post(
      `${url}/pipeline`,
      [['SET', testKey, JSON.stringify(testVal), 'EX', 60]],
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    results.set = { status: setResp.status, data: setResp.data };
  } catch (e: any) {
    results.set = { error: e.message, code: e.code, response: e.response?.data };
  }

  // Test GET
  try {
    const getResp = await axios.get(
      `${url}/get/${encodeURIComponent(testKey)}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    );
    const parsed = getResp.data?.result ? JSON.parse(getResp.data.result) : null;
    results.get = { status: getResp.status, value: parsed };
    results.ok = parsed?.ping === 'pong';
  } catch (e: any) {
    results.get = { error: e.message, code: e.code, response: e.response?.data };
    results.ok = false;
  }

  return results;
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
    return reply.status(400).send({ status: false, error: 'Query parameter "query" is required.' });
  }
  if (typeof query !== 'string' || query.length > 200) {
    return reply.status(400).send({ status: false, error: 'Query parameter "query" must be a string of 200 characters or fewer.' });
  }
  const data = await parserService.search(query);
  return { status: true, count: data.length, data };
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

// Temporary debug endpoint for iQOO Z7 Pro camera samples investigation
app.get('/debug-camera', async (request: any, reply: any) => {
  if (!requireDebugSecret(request, reply)) return;
  const results: any = {};

  // Step 1: fetch opinions page
  const opinionsUrl = 'https://www.gsmarena.com/vivo_iqoo_z7_pro_5g-opinions-11843.php';
  try {
    const html = await getHtml(opinionsUrl);
    results.opinionsPageSize = html.length;
    const $ = cheerio.load(html);
    const links: string[] = [];
    $('a[href]').each((_: number, el: any) => {
      const href: string = $(el).attr('href') || '';
      links.push(href);
    });
    results.totalLinks = links.length;
    results.cameraLinks = links.filter(h => 
      h.toLowerCase().includes('camera') || h.toLowerCase().includes('news')
    ).slice(0, 20);
  } catch (e: any) {
    results.opinionsError = e.message;
  }

  // Step 2: fetch camera page directly
  const cameraUrl = 'https://www.gsmarena.com/vivo_iqoo_z7_pro_5g_camera_samples_specs-news-59639.php';
  try {
    const html = await getHtml(cameraUrl);
    results.cameraPageSize = html.length;
    const $ = cheerio.load(html);
    const imgs = $('img[src*="imgroot"]').toArray().map((el: any) => $(el).attr('src')).slice(0, 5);
    results.cameraImages = imgs;
  } catch (e: any) {
    results.cameraPageError = e.message;
  }

  return results;
});

// ─────────────────────────────────────────────────────────────────────────────
// Known camera URL overrides
// Some devices have camera articles that GSMArena never links from the specs page
// and are unreachable via any search/scrape method. Add them here by device slug.
// Format: 'device-slug-id': 'https://www.gsmarena.com/full-camera-article-url.php'
// ─────────────────────────────────────────────────────────────────────────────
app.get('/phone', async (request, reply) => {
  const name = (request.query as any).name;
  const nocache = (request.query as any).nocache === '1'; // Add ?nocache=1 to bypass cache
  
  if (!name) {
    return reply.status(400).send({ status: false, error: 'Query param "name" is required. e.g. /phone?name=samsung galaxy s26 ultra' });
  }

  if (typeof name !== 'string' || name.length > 200) {
    return reply.status(400).send({ status: false, error: 'Query param "name" must be a string of 200 characters or fewer.' });
  }

  // Normalise name: lowercase + collapse whitespace (handles URL encoding quirks)
  const normName = name.toLowerCase().trim().replace(/\s+/g, ' ');
  const fullCk = `gsm:phone-full:v2:${normName}`;
  
  // Skip cache if nocache param is present
  const fullCached = nocache ? { data: null, source: 'miss' as const } : await cacheGetWithSource<any>(fullCk);

  if (fullCached.data) {
    const cached = fullCached.data;
    reply.header('X-Cache', fullCached.source);
    return {
      status: cached.status,
      matched: cached.matched,
      _cache: fullCached.source,
      data: cached.data,
    };
  }

  // Step 1 – search
  let searchResults: any[];
  try {
    searchResults = await parserService.search(name);
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: `Search failed: ${err?.message}` });
  }

  if (!searchResults || searchResults.length === 0) {
    return reply.status(404).send({ status: false, error: `No device found matching "${name}"` });
  }

  const bestMatch = searchResults[0];
  const deviceSlug = bestMatch.slug.replace(/^\//, '');

  // Debug tracing — only collected and returned when ?debug=1 is passed.
  // Never exposed in production responses by default.
  const includeDebug = (request.query as any).debug === '1';
  const debug: any = includeDebug ? { review_url: null, steps: [] } : null;

  // Step 2 – fetch full specs
  let specs: any;
  try {
    specs = await getPhoneDetails(deviceSlug);
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: `Specs fetch failed: ${err?.message}` });
  }

  // Step 3 – scrape camera samples
  let cameraSamples: any[] = [];
  let lensDetails: any[] = [];
  // hdImageUrl = a genuine HD photo from the pictures gallery page (set by parser.phone-details).
  // Do NOT fall back to specs.imageUrl here — that's just the bigpic (~300px), same as
  // device_images[0].url. The app already has that. Only set hdImageUrl when we have
  // something meaningfully better (full-res imgroot from pictures page).
  let hdImageUrl: string | null = null;
  // If parser already found an HD image (from pictures page), use it.
  if (specs.imageUrl && specs.imageUrl.includes('/imgroot/') && !specs.imageUrl.includes('/lifestyle/') && !specs.imageUrl.includes('/inline/') && !specs.imageUrl.includes('/camera')) {
    hdImageUrl = specs.imageUrl;
  }

  if (debug) debug.review_url = specs.review_url || null;

  const tryCameraUrl = async (url: string): Promise<boolean> => {
    try {
      const slug = url.replace(/^https?:\/\/[^/]+\//, '').replace(/\.php$/, '');
      if (debug) debug.steps.push({ action: 'tryCameraUrl', url, slug });
      const reviewData = await getReviewDetails(slug);
      if (debug) debug.steps.push({ 
        action: 'reviewData', 
        cameraSamplesCount: reviewData.cameraSamples.length,
        lensDetailsCount: reviewData.lensDetails?.length || 0,
        categories: reviewData.cameraSamples.map((c: { label: string; images: any[] }) => ({ label: c.label, count: c.images.length }))
      });
      if (reviewData.cameraSamples.length > 0) {
        cameraSamples = reviewData.cameraSamples;
        lensDetails = reviewData.lensDetails ?? [];
        return true;
      }
    } catch (err: any) { 
      if (debug) debug.steps.push({ action: 'error', message: err?.message });
    }
    return false;
  };

  if (specs.review_url) {
    await tryCameraUrl(specs.review_url);
  }

  // Apply known override if still no samples (checks primary map, aliases, and ID-agnostic prefix match)
  if (cameraSamples.length === 0) {
    const _allOverrides = { ...CAMERA_URL_OVERRIDES, ...CAMERA_URL_OVERRIDE_ALIASES };
    const overrideUrl: string | undefined =
      _allOverrides[deviceSlug] ??
      (() => {
        // Strip the numeric GSMArena ID suffix and match on slug name alone.
        // This means you don't need to know the exact GSMArena ID when adding
        // a new override — just use any placeholder ID (e.g. -00000).
        const slugBase = deviceSlug.replace(/-\d+$/, '');
        for (const [key, url] of Object.entries(_allOverrides)) {
          if (key.replace(/-\d+$/, '') === slugBase) return url;
        }
        return undefined;
      })();

    if (overrideUrl) {
      if (debug) debug.steps.push({ action: 'override_attempt', url: overrideUrl });
      if (await tryCameraUrl(overrideUrl)) {
        specs.review_url = overrideUrl;
        if (debug) debug.review_url = overrideUrl;
        if (debug) debug.steps.push({ action: 'override_found', url: overrideUrl });
      }
    }
  }
  
  if (cameraSamples.length === 0) {
    // Fallback 1: Try the device's own opinions page for camera/review links
    try {
      const slugMatch = deviceSlug.match(/^(.+)-(\d+)$/);
      if (slugMatch) {
        const opinionsUrl = `https://www.gsmarena.com/${slugMatch[1]}-opinions-${slugMatch[2]}.php`;
        if (debug) debug.steps.push({ action: 'opinions_attempt', url: opinionsUrl });
        const html = await getHtml(opinionsUrl);
        const $ = cheerio.load(html);
        const links: string[] = [];
        $('a[href]').each((_: number, el: any) => {
          const href: string = $(el).attr('href') || '';
          const lower = href.toLowerCase();
          if (!lower.endsWith('.php')) return;
          if (lower.includes('camera_samples') || lower.includes('camera-samples') ||
              lower.includes('camera_test') || lower.includes('camera-test') ||
              lower.includes('photo_samples') || lower.includes('photo-samples') ||
              lower.includes('camera_review') || lower.includes('camera-review') ||
              (lower.includes('-news-') && (lower.includes('camera') || lower.includes('photo') || lower.includes('sample'))) ||
              lower.includes('-review-')) {
            const full = href.startsWith('http') ? href : ('https://www.gsmarena.com/' + href);
            if (!links.includes(full)) links.push(full);
          }
        });
        if (debug) debug.steps.push({ action: 'opinions_links', count: links.length, links });
        for (const link of links) {
          if (await tryCameraUrl(link)) {
            specs.review_url = link;
            if (debug) debug.review_url = link;
            if (debug) debug.steps.push({ action: 'opinions_found', url: link });
            break;
          }
        }
      }
    } catch (e: any) {
      if (debug) debug.steps.push({ action: 'opinions_error', error: e?.message });
    }
  }

  if (cameraSamples.length === 0) {
    // Fallback 2: Use sibling device slugs found directly on the specs page.
    // GSMArena specs pages often link to variant pages in "See also" / related sections.
    // e.g. vivo_iqoo_z7_pro specs page links to vivo_iqoo_z7_pro_5g.
    // We check those sibling opinions pages for camera/review links.
    const siblingDeviceSlugs: string[] = (specs as any).siblingDeviceSlugs || [];
    if (debug) debug.steps.push({ action: 'sibling_slugs', slugs: siblingDeviceSlugs });

    if (siblingDeviceSlugs.length > 0) {
      try {

        for (const sibSlug of siblingDeviceSlugs.slice(0, 5)) {
          const m = sibSlug.match(/^(.+)-(\d+)$/);
          if (!m) continue;
          const opinionsUrl = `https://www.gsmarena.com/${m[1]}-opinions-${m[2]}.php`;
          if (debug) debug.steps.push({ action: 'sibling_opinions_attempt', url: opinionsUrl });
          try {
            const html = await getHtml(opinionsUrl);
            const $ = cheerio.load(html);
            const links: string[] = [];
            $('a[href]').each((_: number, el: any) => {
              const href = $(el).attr('href') || '';
              const lower = href.toLowerCase();
              if (!lower.endsWith('.php')) return;
              if (lower.includes('camera_samples') || lower.includes('camera-samples') ||
                  lower.includes('camera_test') || lower.includes('camera-test') ||
                  lower.includes('photo_samples') || lower.includes('photo-samples') ||
                  lower.includes('camera_review') || lower.includes('camera-review') ||
                  (lower.includes('-news-') && (lower.includes('camera') || lower.includes('photo') || lower.includes('sample'))) ||
                  lower.includes('-review-')) {
                const full = href.startsWith('http') ? href : ('https://www.gsmarena.com/' + href);
                if (!links.includes(full)) links.push(full);
              }
            });
            if (debug) debug.steps.push({ action: 'sibling_opinions_links', slug: sibSlug, count: links.length, links });
            for (const link of links) {
              if (await tryCameraUrl(link)) {
                specs.review_url = link;
                if (debug) debug.review_url = link;
                if (debug) debug.steps.push({ action: 'sibling_found', url: link });
                break;
              }
            }
            if (cameraSamples.length > 0) break;
          } catch (e: any) {
            if (debug) debug.steps.push({ action: 'sibling_opinions_error', slug: sibSlug, error: e?.message });
          }
        }
      } catch (e: any) {
        if (debug) debug.steps.push({ action: 'sibling_fallback_error', error: e?.message });
      }
    }
  }

  // Final fallback: try the _5g variant of the slug directly.
  // For phones like iQOO Z7 Pro, the non-5G and 5G entries are separate GSMArena pages
  // with zero cross-links. We construct "{slugBase}_5g" and use GSMArena's autocomplete
  // JSON API to discover the numeric ID, then check that variant's opinions page.
  if (cameraSamples.length === 0) {
    try {

      const slugBase = deviceSlug.replace(/-\d+$/, '');
      // Only try if slug doesn't already end in _5g
      if (!slugBase.endsWith('_5g')) {
        const modelQuery = slugBase.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        const acUrl = `https://www.gsmarena.com/quicksearch-8.php?q=${encodeURIComponent(modelQuery + ' 5G')}`;
        if (debug) debug.steps.push({ action: '5g_autocomplete', url: acUrl });

        const acResp = await axios.get(acUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 8000,
        });

        // Autocomplete returns JSON array: [{id, name, img}]
        const acResults: Array<{id: string, name?: string}> = Array.isArray(acResp.data) ? acResp.data : [];
        if (debug) debug.steps.push({ action: '5g_autocomplete_results', results: acResults.slice(0, 5) });

        // Find the first result whose id starts with our slugBase + _5g
        const match5g = acResults.find((r: any) => {
          const id = (r.id || r.url || '').toLowerCase();
          return id.includes(slugBase + '_5g') || id.includes(slugBase.replace(/_/g, '-') + '-5g');
        });

        if (match5g) {
          const slug5g = (match5g.id || '').replace(/\.php$/, '').replace(/^\//, '');
          const m = slug5g.match(/^(.+)-(\d+)$/);
          if (m) {
            const opinionsUrl5g = `https://www.gsmarena.com/${m[1]}-opinions-${m[2]}.php`;
            if (debug) debug.steps.push({ action: '5g_opinions_attempt', url: opinionsUrl5g });
            const html5g = await getHtml(opinionsUrl5g);
            const $5g = cheerio.load(html5g);
            const links5g: string[] = [];
            $5g('a[href]').each((_: number, el: any) => {
              const href = ($5g(el).attr('href') || '');
              const lower = href.toLowerCase();
              if (!lower.endsWith('.php')) return;
              if (lower.includes('camera_samples') || lower.includes('camera-samples') ||
                  lower.includes('camera_test') || lower.includes('camera-test') ||
                  lower.includes('photo_samples') || lower.includes('photo-samples') ||
                  lower.includes('camera_review') || lower.includes('camera-review') ||
                  (lower.includes('-news-') && (lower.includes('camera') || lower.includes('photo') || lower.includes('sample'))) ||
                  lower.includes('-review-')) {
                const full = href.startsWith('http') ? href : ('https://www.gsmarena.com/' + href);
                if (!links5g.includes(full)) links5g.push(full);
              }
            });
            if (debug) debug.steps.push({ action: '5g_opinions_links', count: links5g.length, links: links5g });
            for (const link of links5g) {
              if (await tryCameraUrl(link)) {
                specs.review_url = link;
                if (debug) debug.review_url = link;
                if (debug) debug.steps.push({ action: '5g_final_found', url: link });
                break;
              }
            }
          }
        }
      }
    } catch (e: any) {
      if (debug) debug.steps.push({ action: '5g_autocomplete_error', error: e?.message });
    }
  }

  // ── Final universal fallback: GSMArena news search ───────────────────────
  // When all page-scraping strategies fail, query GSMArena's own search for
  // news articles about this device's camera samples. This catches phones where
  // the camera article is never linked from the specs/opinions page at all.
  if (cameraSamples.length === 0) {
    try {

      // Build a human-readable model name from the slug for the search query
      const slugBase = deviceSlug.replace(/-\d+$/, '');
      const modelName = slugBase.replace(/_/g, ' ');
      // Try two queries: specific "camera samples" first, then just "camera"
      const queries = [
        `${modelName} camera samples`,
        `${modelName} camera`,
      ];

      for (const query of queries) {
        if (cameraSamples.length > 0) break;
        const searchUrl = `https://www.gsmarena.com/search.php3?sQuickSearch=${encodeURIComponent(query)}&mode=news`;
        if (debug) debug.steps.push({ action: 'news_search_attempt', query, url: searchUrl });
        try {
          const resp = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 8000,
          });
          const $s = cheerio.load(resp.data);
          const newsLinks: string[] = [];
          $s('a[href]').each((_: number, el: any) => {
            const href: string = ($s(el).attr('href') || '');
            const lower = href.toLowerCase();
            if (!lower.endsWith('.php')) return;
            if (!lower.includes('-news-') && !lower.includes('camera_samples') && !lower.includes('photo_samples')) return;
            if (!lower.includes('camera') && !lower.includes('photo') && !lower.includes('sample')) return;
            const full = href.startsWith('http') ? href : ('https://www.gsmarena.com/' + href);
            if (!newsLinks.includes(full)) newsLinks.push(full);
          });
          if (debug) debug.steps.push({ action: 'news_search_links', query, count: newsLinks.length, links: newsLinks.slice(0, 5) });
          for (const link of newsLinks) {
            if (await tryCameraUrl(link)) {
              specs.review_url = link;
              if (debug) debug.review_url = link;
              if (debug) debug.steps.push({ action: 'news_search_found', url: link });
              break;
            }
          }
        } catch (e: any) {
          if (debug) debug.steps.push({ action: 'news_search_error', query, error: e?.message });
        }
      }
    } catch (e: any) {
      if (debug) debug.steps.push({ action: 'news_search_outer_error', error: e?.message });
    }
  }

  const result = {
    status: true,
    matched: bestMatch.name,
    _cache: 'miss' as const,
    _cameraFound: cameraSamples.length > 0,
    data: {
      ...specs,
      hdImageUrl,
      cameraSamples,
      lensDetails,
      // Pictures-page data: all official press images, color variants, and the
      // pictures page URL (used by the app to open the 3D WebView viewer)
      officialImages: specs.picturesPageData?.officialImages ?? [],
      colorVariants:  specs.picturesPageData?.colorVariants  ?? [],
      picturesPageUrl: specs.picturesPageData?.picturesPageUrl ?? null,
    },
    ...(includeDebug && debug ? { debug } : {}),
  };

  // Only persist to Redis when the result is complete.
  // If we have a review_url but zero cameraSamples, it was a transient scrape failure.
  // Caching an empty result would lock it out for 7 days — the exact bug we fixed.
  // Skip Redis so the next request re-scrapes and gets the real data.
  const shouldPersist = cameraSamples.length > 0 || !specs.review_url;
  if (shouldPersist) {
    cacheSet(fullCk, { status: result.status, matched: result.matched, data: result.data });
  } else {
    // review_url exists but 0 samples — transient scrape failure. Skip caching so next
    // request re-scrapes and has a chance to get the real data.
    console.warn(`[/phone] Cache skipped for "${normName}" — review_url present but 0 camera samples found. Will retry on next request.`);
  }

  return result;
});

// ─────────────────────────────────────────────────────────────────────────────
// DXOMark endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /dxomark/debug?name=pixel 9 pro
 * Self-contained debug — shows exactly what URL would be attempted,
 * then tries to fetch it and returns the HTTP status + first 500 chars of body.
 * No imports from parser.dxomark — useful to verify deployment is live.
 */
app.get('/dxomark/debug', async (request, reply) => {
  const name = ((request.query as any).name || 'pixel 9 pro') as string;

  const DXO_BRAND_MAP: Record<string, { brand: string; modelPrefix?: string }> = {
    'google pixel': { brand: 'Google', modelPrefix: 'Pixel' },
    'pixel':        { brand: 'Google', modelPrefix: 'Pixel' },
    'xiaomi poco':  { brand: 'Xiaomi', modelPrefix: 'Poco' },
    'xiaomi redmi': { brand: 'Xiaomi', modelPrefix: 'Redmi' },
    'vivo iqoo':    { brand: 'Vivo',   modelPrefix: 'iQOO' },
    'samsung galaxy': { brand: 'Samsung', modelPrefix: 'Galaxy' },
    'apple iphone':   { brand: 'Apple',   modelPrefix: 'iPhone' },
  };

  const lower = name.toLowerCase().trim();
  let brand = '';
  let model = '';

  const keys = Object.keys(DXO_BRAND_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (lower.startsWith(k)) {
      const map = DXO_BRAND_MAP[k];
      brand = map.brand;
      const rest = name.slice(k.length).trim();
      model = map.modelPrefix ? `${map.modelPrefix} ${rest}` : rest;
      break;
    }
  }

  if (!brand) {
    const parts = name.split(' ');
    brand = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    model = parts.slice(1).join(' ');
  }

  // Title-case model slug
  const modelSlug = model.trim().split(/\s+/)
    .map((w: string) => w.toLowerCase() === 'iphone' ? 'iPhone' : w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');
  const url = `https://www.dxomark.com/smartphones/${brand}/${modelSlug}`;
  let fetchStatus: number | null = null;
  let fetchError: string | null = null;
  let bodyPreview: string | null = null;
  let hasNextData = false;
  // What we can extract from the HTML
  let scoreFound: string | null = null;
  let classesWithScore: string[] = [];

  try {
    const resp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    fetchStatus = resp.status;
    const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    bodyPreview = body.slice(0, 2000); // more preview
    hasNextData = body.includes('__NEXT_DATA__');

    if (resp.status === 200) {
      const $ = cheerio.load(body);
      // Collect all elements that might contain scores
      $('[class]').each((_: any, el: any) => {
        const cls = $(el).attr('class') || '';
        const txt = $(el).clone().children().remove().end().text().trim();
        const n = parseInt(txt, 10);
        if (!isNaN(n) && n >= 50 && n <= 200 && txt === String(n)) {
          classesWithScore.push(`class="${cls}" text="${txt}"`);
        }
      });
      scoreFound = classesWithScore.slice(0, 10).join(' | ');
    }
  } catch (e: any) {
    fetchError = e?.message || String(e);
  }

  return { name, brand, model, modelSlug, url, fetchStatus, fetchError, hasNextData, scoreFound, bodyPreview };
});

/**
 * GET /dxomark?name=samsung galaxy s25 ultra
 *
 * All-in-one DXOMark endpoint. Returns everything in a single request:
 *   - Overall camera score + sub-scores (photo, video, bokeh, zoom…)
 *   - Best-in-class scores for comparison
 *   - Rank position + label
 *   - Strengths & weaknesses (verdict)
 *   - Detailed pros & cons from the full review
 *   - Camera specs bullet list
 *   - ALL camera sample photos grouped by category
 *
 * Add &nocache=1 to bypass cache and force fresh scrape.
 */
app.get('/dxomark', async (request, reply) => {
  const name = (request.query as any).name;
  const nocache = (request.query as any).nocache === '1';
  if (!name) {
    return reply.status(400).send({
      status: false,
      error: 'Query param "name" is required. e.g. /dxomark?name=samsung galaxy s25 ultra',
    });
  }
  if (typeof name !== 'string' || name.length > 200) {
    return reply.status(400).send({ status: false, error: 'Query param "name" must be 200 characters or fewer.' });
  }

  try {
    // Sequential — not parallel — to avoid hitting DXOMark with concurrent requests
    // which triggers Cloudflare rate limiting and causes the review fetch to return null.
    // getDxoScores fetches the /smartphones/ summary page.
    // getDxoReview now builds the review URL directly (HEAD check) — no overlap.
    const scoresData = await getDxoScores(name, nocache);
    const reviewData = await getDxoReview(name, nocache);

    if (!scoresData) {
      return reply.status(400).send({
        status: false,
        error: `Could not parse brand/model from "${name}". Try including the brand e.g. "samsung galaxy s25 ultra".`,
      });
    }

    // Merge everything into one flat response
    const categories = reviewData
      ? [...new Set(reviewData.sampleImages.map((s: any) => s.category))]
      : [];

    return {
      status: true,
      _cache: nocache ? 'bypassed' : 'hit',
      data: {
        // ── Identity ────────────────────────────────────────────────
        device:        reviewData?.device || scoresData.device,
        url:           scoresData.url,
        reviewUrl:     reviewData?.reviewUrl || null,

        // ── Scores ──────────────────────────────────────────────────
        overallScore:  scoresData.overallScore,
        scoreType:     (scoresData as any).scoreType || 'camera',
        scores: {
          // From summary page
          ...scoresData.scores,
          // Override/fill with review page scores (more reliable)
          ...(reviewData ? {
            photo:         reviewData.scores.photo         ?? scoresData.scores.photo,
            video:         reviewData.scores.video         ?? scoresData.scores.video,
            bokeh:         reviewData.scores.photoBokeh    ?? scoresData.scores.bokeh,
            zoom:          reviewData.scores.photoTele     ?? scoresData.scores.zoom,
            photoMain:     reviewData.scores.photoMain     ?? scoresData.scores.photoMain,
            photoUltraWide:reviewData.scores.photoUltraWide?? scoresData.scores.photoUltraWide,
            photoTele:     reviewData.scores.photoTele     ?? scoresData.scores.photoTele,
            videoMain:     reviewData.scores.videoMain     ?? scoresData.scores.videoMain,
            videoUltraWide:reviewData.scores.videoUltraWide?? scoresData.scores.videoUltraWide,
            videoTele:     reviewData.scores.videoTele     ?? scoresData.scores.videoTele,
          } : {}),
        },

        // ── Best-in-class (only from review page) ───────────────────
        bestScores: reviewData?.bestScores || null,

        // ── Rank — review page is more accurate (live rank) vs summary page ──
        rankPosition:  reviewData?.rankPosition  || scoresData.rankPosition  || null,
        rankLabel:     reviewData?.rankLabel      || scoresData.rankLabel     || null,
        rankSegment:   (scoresData as any).rankSegment || null,

        // ── Badge ───────────────────────────────────────────────────
        labelType:     (scoresData as any).labelType  || null,
        labelYear:     (scoresData as any).labelYear  || null,

        // ── Verdict (summary page) ──────────────────────────────────
        strengths:     scoresData.strengths,
        weaknesses:    scoresData.weaknesses,

        // ── Full review pros/cons ────────────────────────────────────
        pros:          reviewData?.pros  || [],
        cons:          reviewData?.cons  || [],

        // ── Camera specs ─────────────────────────────────────────────
        cameraSpecs:   reviewData?.cameraSpecs || [],

        // ── Sample photos ────────────────────────────────────────────
        sampleCount:   reviewData?.sampleCount  || 0,
        sampleCategories: categories,
        sampleImages:  reviewData?.sampleImages || [],

        scrapedAt: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: err?.message || String(err) });
  }
});

/**
 * GET /dxomark/search?query=pixel 9 pro
 *
 * Searches DXOMark directly and returns a list of matching device pages
 * with their scores. Useful for discovery.
 */
app.get('/dxomark/search', async (request, reply) => {
  const query = (request.query as any).query;
  if (!query) {
    return reply.status(400).send({
      status: false,
      error: 'Query param "query" is required. e.g. /dxomark/search?query=pixel 9',
    });
  }
  if (typeof query !== 'string' || query.length > 200) {
    return reply.status(400).send({ status: false, error: 'Query param "query" must be 200 characters or fewer.' });
  }

  try {
    const results = await searchDxo(query);
    return { status: true, count: results.length, data: results };
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: err?.message || String(err) });
  }
});

/**
 * GET /dxomark/review?name=samsung galaxy s25 ultra
 *
 * Fetches the full DXOMark camera test review page for a device.
 * Much richer than /dxomark — includes all sub-scores with BEST values,
 * camera specs, detailed pros/cons, and ranking position.
 * Add &nocache=1 to force a fresh scrape.
 */
app.get('/dxomark/review', async (request, reply) => {
  const name = (request.query as any).name;
  const nocache = (request.query as any).nocache === '1';
  if (!name) {
    return reply.status(400).send({
      status: false,
      error: 'Query param "name" is required. e.g. /dxomark/review?name=samsung galaxy s25 ultra',
    });
  }
  if (typeof name !== 'string' || name.length > 200) {
    return reply.status(400).send({ status: false, error: 'Query param "name" must be 200 characters or fewer.' });
  }
  try {
    const data = await getDxoReview(name, nocache);
    if (!data) {
      return reply.status(404).send({
        status: false,
        error: `No camera review found for "${name}" on DXOMark. The device may not have been reviewed yet.`,
      });
    }
    return { status: true, _cache: nocache ? 'bypassed' : 'hit', data };
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: err?.message || String(err) });
  }
});

/**
 * GET /dxomark/review/url?url=https://www.dxomark.com/samsung-galaxy-s25-ultra-camera-test/
 *
 * Scrape a specific DXOMark camera review URL directly.
 * Now also returns sampleImages[] and sampleCount.
 */
app.get('/dxomark/review/url', async (request, reply) => {
  const url = (request.query as any).url;
  const nocache = (request.query as any).nocache === '1';
  if (!url || !url.includes('dxomark.com')) {
    return reply.status(400).send({ status: false, error: 'Valid dxomark.com URL required.' });
  }
  try {
    const data = await scrapeDxoReview(url, nocache);
    if (!data) return reply.status(500).send({ status: false, error: 'Failed to scrape review page.' });
    return { status: true, data };
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: err?.message || String(err) });
  }
});

/**
 * GET /dxomark/review/samples?name=samsung galaxy s25 ultra
 *
 * Returns ONLY the sampleImages array from the camera review — fastest way
 * to get all camera test photos grouped by category (Main, Ultra-Wide, Tele, etc.)
 * Add &nocache=1 to bypass cache.
 *
 * Response shape:
 * {
 *   "device": "Samsung Galaxy S25 Ultra",
 *   "reviewUrl": "https://www.dxomark.com/...",
 *   "sampleCount": 42,
 *   "categories": ["Main Camera", "Ultra-Wide", "Telephoto / Zoom", "Selfie"],
 *   "sampleImages": [
 *     { "category": "Main Camera", "url": "https://...", "caption": "...", "thumbnail": null },
 *     ...
 *   ]
 * }
 */
app.get('/dxomark/review/samples', async (request, reply) => {
  const name = (request.query as any).name;
  const url  = (request.query as any).url;   // optional: use review URL directly
  const nocache = (request.query as any).nocache === '1';

  if (!name && !url) {
    return reply.status(400).send({
      status: false,
      error: 'Provide ?name=device name  OR  ?url=https://www.dxomark.com/device-camera-test/',
    });
  }

  try {
    let data: import('../src/parser/parser.dxomark').IDxoReview | null = null;

    if (url && url.includes('dxomark.com')) {
      data = await scrapeDxoReview(url, nocache);
    } else {
      data = await getDxoReview(name, nocache);
    }

    if (!data) {
      return reply.status(404).send({
        status: false,
        error: `No camera review found${name ? ` for "${name}"` : ''} on DXOMark.`,
      });
    }

    // Derive unique category list in order of appearance
    const categories = [...new Set(data.sampleImages.map(s => s.category))];

    return {
      status: true,
      _cache: nocache ? 'bypassed' : 'hit',
      data: {
        device: data.device,
        reviewUrl: data.reviewUrl,
        sampleCount: data.sampleCount,
        categories,
        sampleImages: data.sampleImages,
      },
    };
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: err?.message || String(err) });
  }
});

app.get('/dxomark/url', async (request, reply) => {
  const url = (request.query as any).url;
  if (!url || !url.includes('dxomark.com')) {
    return reply.status(400).send({
      status: false,
      error: 'Query param "url" must be a valid dxomark.com URL.',
    });
  }

  try {
    const data = await scrapeDxoPage(url);
    return { status: true, data };
  } catch (err: any) {
    return reply.status(500).send({ status: false, error: err?.message || String(err) });
  }
});

// ── /:slug must be LAST –it's a catch-all for device specs ──────────────────
app.get('/:slug', async (request, reply) => {
  const slug = (request.params as any).slug;

  // Validate slug format — only allow safe GSMArena slug characters
  if (!slug || !/^[a-z0-9_+()-]+-\d+$/i.test(slug)) {
    return reply.status(400).send({ status: false, error: 'Invalid slug format. Expected e.g. samsung_galaxy_s25_ultra-12559' });
  }

  try {
    const data = await getPhoneDetails(slug);
    if (!data || !data.brand) {
      return reply.status(404).send({ status: false, error: `Device not found: ${slug}` });
    }
    return { status: true, data };
  } catch (err: any) {
    const msg: string = err?.message || String(err);
    // GSMArena returns a 404 page (still HTTP 200) for unknown slugs;
    // getPhoneDetails throws when it finds no meaningful content.
    if (/not found|404|no device|empty/i.test(msg)) {
      return reply.status(404).send({ status: false, error: `Device not found: ${slug}` });
    }
    return reply.status(500).send({ status: false, error: msg });
  }
});

let ready = false;

// ── Local dev server (skipped on Vercel) ────────────────────────────────────
if (!process.env.VERCEL) {
  const PORT = parseInt(process.env.PORT || '4000', 10);
  app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(`\n🚀  Mobile Specs API running at ${address}`);
    console.log(`   Try: http://localhost:${PORT}/brands\n`);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!ready) {
    await app.ready();
    ready = true;
  }

  const url = req.url || '/';

  const response = await app.inject({
    method: (req.method || 'GET') as any,
    url,
    headers: req.headers as any,
  });

  res.writeHead(response.statusCode, response.headers as any);
  res.end(response.body);
}
