/**
 * Shared Canva guide registry + renderers.
 *
 * Imported by BOTH Pages Functions that serve guides:
 *   - functions/[[catchall]].ts        — canva.umalator.app/<slug> (subdomain) + www/does.redshift.work
 *   - functions/canva/[[path]].ts      — umalator.app/canva/<slug> (apex path, dedicated route)
 *
 * Keeping the EMBEDS registry + renderers here means a new guide is added in ONE place.
 *
 * Each guide is a Canva embed addressed by a "<number>-<name>" slug. The bare root
 * redirects to the highest-numbered (newest) guide.
 *
 * To ADD a guide: copy a line in EMBEDS, bump the slug number + name, and paste the
 * Canva design ID + view token from Canva › Share › More › Embed (the embed URL
 * looks like https://www.canva.com/design/<canvaId>/<viewToken>/view?embed).
 */

const CANVA_HOST = 'canva.umalator.app';

export interface CanvaEmbed {
  slug: string;       // "14-yasuda"
  title: string;      // "CM 14 Guide — Yasuda Kinen"
  canvaId: string;    // "DAHKQU64nsg"
  viewToken: string;  // "BvXGiL0N1rLjUgNRP5KQPw"
}

export const EMBEDS: CanvaEmbed[] = [
  { slug: '14-yasuda', title: 'CM 14 Guide — Yasuda Kinen',
    canvaId: 'DAHKQU64nsg', viewToken: 'BvXGiL0N1rLjUgNRP5KQPw' },
  { slug: '15-takarazuka', title: 'CM 15 Guide — Takarazuka Kinen',
    canvaId: 'DAHLSXaH3go', viewToken: '0PTH2KUGR4-hcAtbV1RhJw' },
];

export function slugNumber(slug: string): number {
  return parseInt(slug, 10);
}

export function newestEmbed(): CanvaEmbed {
  return EMBEDS.reduce((a, b) => (slugNumber(b.slug) > slugNumber(a.slug) ? b : a));
}

function canvaUrls(e: CanvaEmbed) {
  const base = `https://www.canva.com/design/${e.canvaId}/${e.viewToken}/view`;
  return {
    embed: `${base}?embed`,
    share: `${base}?utm_content=${e.canvaId}&utm_campaign=designshare&utm_medium=embeds&utm_source=link`,
    view: base,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmbedPage(e: CanvaEmbed): string {
  const title = escapeHtml(e.title);
  const desc = escapeHtml(`${e.title} — Uma Musume guide, hosted on Canva.`);
  const ogUrl = escapeHtml(`https://${CANVA_HOST}/${e.slug}`);
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

export function renderCanva404(prefix: string): string {
  const newest = newestEmbed();
  const href = escapeHtml(`${prefix}/${newest.slug}`);
  const name = escapeHtml(newest.title);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Guide not found</title>
    <style>
      body {
        margin: 0; min-height: 100vh; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 1rem; padding: 2rem;
        background: #1a1a1a; color: #d0d0d0; text-align: center;
        font-family: system-ui, -apple-system, sans-serif;
      }
      h1 { font-size: 1.5rem; margin: 0; }
      a { color: #7fbf7e; }
    </style>
  </head>
  <body>
    <h1>Guide not found</h1>
    <p>That guide doesn't exist. <a href="${href}">Go to the latest → ${name}</a></p>
  </body>
</html>`;
}
