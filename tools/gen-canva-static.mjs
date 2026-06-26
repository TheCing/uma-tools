#!/usr/bin/env node
/**
 * Generate STATIC Canva guide pages from the canva-embeds.json registry.
 *
 * Why static? Cloudflare Pages Functions are not currently executing on the
 * production project (the [[catchall]] canva routing never runs in prod — see the
 * Canva section in CLAUDE.md). Static HTML files are always served, so this
 * guarantees umalator.app/canva/<slug> works regardless of Functions.
 *
 * Writes (at the repo root, which is the Pages build output dir):
 *   canva/<slug>/index.html   — the embed wrapper for each guide
 *   canva/index.html          — the newest guide (so bare /canva works)
 *
 * Run by build-all.sh on every deploy. Single source of truth: canva-embeds.json
 * (the [[catchall]] Function reads the same file).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EMBEDS = JSON.parse(readFileSync(join(ROOT, 'canva-embeds.json'), 'utf8'));

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function canvaUrls(e) {
  const base = `https://www.canva.com/design/${e.canvaId}/${e.viewToken}/view`;
  return {
    embed: `${base}?embed`,
    share: `${base}?utm_content=${e.canvaId}&utm_campaign=designshare&utm_medium=embeds&utm_source=link`,
    view: base,
  };
}

function renderEmbedPage(e) {
  const title = escapeHtml(e.title);
  const desc = escapeHtml(`${e.title} — Uma Musume guide, hosted on Canva.`);
  const ogUrl = escapeHtml(`https://umalator.app/canva/${e.slug}`);
  const u = canvaUrls(e);
  const embedSrc = escapeHtml(u.embed);
  const shareHref = escapeHtml(u.share);
  const viewHref = escapeHtml(u.view);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1a1a1a" />
    <title>${title}</title>
    <meta name="description" content="${desc}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Uma Musume Tools" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="${ogUrl}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />

    <link rel="icon" type="image/svg+xml" href="/uma-tools/umalator-global/favicon.svg" />
    <link rel="preconnect" href="https://www.canva.com" crossorigin />
    <link rel="dns-prefetch" href="https://www.canva.com" />

    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 100vw; height: 100vh; overflow: hidden;
        background: #1a1a1a; color: #d0d0d0;
        font-family: system-ui, -apple-system, "DM Sans", sans-serif;
      }
      .loading-hint {
        position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: 0.9rem; color: #666; letter-spacing: 0.04em; pointer-events: none;
        z-index: 0; animation: pulse 1.6s ease-in-out infinite;
      }
      @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.9; } }
      iframe {
        position: fixed; inset: 0; width: 100%; height: 100%;
        border: 0; background: transparent; z-index: 1;
      }
      .fallback {
        position: fixed; top: 0.5rem; right: 0.75rem; z-index: 2;
        font-size: 0.72rem; color: rgba(255, 255, 255, 0.55);
        background: rgba(0, 0, 0, 0.35); padding: 4px 8px; border-radius: 4px;
        text-decoration: none; transition: color 120ms ease, background 120ms ease;
        backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
      }
      .fallback:hover, .fallback:focus-visible {
        color: rgba(255, 255, 255, 0.95); background: rgba(0, 0, 0, 0.6); outline: none;
      }
      .no-js {
        position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        padding: 2rem; text-align: center; font-size: 1rem; color: #aaa; z-index: 3;
      }
    </style>
  </head>
  <body>
    <div class="loading-hint" aria-hidden="true">Loading ${title}…</div>

    <iframe
      src="${embedSrc}"
      title="${title}"
      loading="lazy"
      allowfullscreen
      allow="fullscreen"
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>

    <a class="fallback" href="${shareHref}" target="_blank" rel="noopener">Open on Canva ↗</a>

    <noscript>
      <div class="no-js">
        This guide embed requires JavaScript.<br />
        Open it directly at
        <a href="${viewHref}" target="_blank" rel="noopener" style="color: #7fbf7e">canva.com</a>.
      </div>
    </noscript>
  </body>
</html>`;
}

if (!Array.isArray(EMBEDS) || EMBEDS.length === 0) {
  console.error('gen-canva-static: canva-embeds.json is empty');
  process.exit(1);
}

const slugNumber = (slug) => parseInt(slug, 10);
const newest = EMBEDS.reduce((a, b) => (slugNumber(b.slug) > slugNumber(a.slug) ? b : a));

// Clean previous output so removed guides don't linger.
rmSync(join(ROOT, 'canva'), { recursive: true, force: true });

for (const e of EMBEDS) {
  const dir = join(ROOT, 'canva', e.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderEmbedPage(e));
}
// Bare /canva → newest guide.
mkdirSync(join(ROOT, 'canva'), { recursive: true });
writeFileSync(join(ROOT, 'canva', 'index.html'), renderEmbedPage(newest));

console.log(`gen-canva-static: wrote ${EMBEDS.length} guide page(s) + canva/index.html (newest: ${newest.slug})`);
