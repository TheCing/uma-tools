/**
 * Cloudflare Pages Function: edge routing for special hostnames + paths.
 *
 * Handles, before the request reaches the static site:
 *  - does.redshift.work/[id] — "Does Red Shift?" CM-preset viability pages
 *    (April Fools 2026: Maruzensky takeover)
 *  - www.umalator.app/*       — canonical 301 to the apex
 *  - Canva guides             — multi-embed slug routing on canva.umalator.app
 *    and umalator.app/canva/* (see the EMBEDS registry below)
 * All other requests pass through to the static site.
 */

const REDIRECT_HOST = 'does.redshift.work';
const ASSETS_HOST = 'https://umalator.app';

// Hostname routing handled below. Cloudflare Pages `_redirects` matches on the
// request PATH only — rules whose `from` includes a scheme/host are silently
// ignored — so per-subdomain routing must live here in the Function.
const CANVA_HOST = 'canva.umalator.app';
const WWW_HOST = 'www.umalator.app';
const APEX_HOST = 'umalator.app';

// ─── ACTIVE CANVA GUIDES ──────────────────────────────────────────────────
// Each guide is a Canva embed addressed by a "<number>-<name>" slug, reachable
// at canva.umalator.app/<slug> and umalator.app/canva/<slug>. The bare root
// redirects to the highest-numbered (newest) guide.
//
// To ADD a guide: copy a line below, bump the slug number + name, and paste the
// Canva design ID + view token from Canva › Share › More › Embed (the embed URL
// looks like https://www.canva.com/design/<canvaId>/<viewToken>/view?embed).
interface CanvaEmbed {
  slug: string;       // "14-yasuda"
  title: string;      // "CM 14 Guide — Yasuda Kinen"
  canvaId: string;    // "DAHKQU64nsg"
  viewToken: string;  // "BvXGiL0N1rLjUgNRP5KQPw"
}

const EMBEDS: CanvaEmbed[] = [
  { slug: '14-yasuda', title: 'CM 14 Guide — Yasuda Kinen',
    canvaId: 'DAHKQU64nsg', viewToken: 'BvXGiL0N1rLjUgNRP5KQPw' },
  // { slug: '15-takarazuka', title: 'CM 15 Guide — Takarazuka Kinen',
  //   canvaId: 'XXXX', viewToken: 'YYYY' },
];

function slugNumber(slug: string): number {
  return parseInt(slug, 10);
}

function newestEmbed(): CanvaEmbed {
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

function renderEmbedPage(e: CanvaEmbed): string {
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

function renderCanva404(prefix: string): string {
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

// April Fools: check if it's April 1st in any timezone that's currently April 1st
// (generous window: UTC Mar 31 12:00 through UTC Apr 2 12:00 to cover all timezones)
function isAprilFools(): boolean {
  const now = new Date();
  const month = now.getUTCMonth(); // 0-indexed, so March=2, April=3
  const day = now.getUTCDate();
  const hour = now.getUTCHours();
  return (month === 2 && day === 31 && hour >= 12) ||
         (month === 3 && day === 1) ||
         (month === 3 && day === 2 && hour < 12);
}

function buildAprilFools(): string {
  const base = ASSETS_HOST + '/icons/april-fools';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Does Maruzensky?</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      background: #1a0a2e;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .center-wrap {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      z-index: 10;
    }
    .center-wrap img {
      max-width: min(80vw, 500px);
      max-height: 60vh;
      border-radius: 12px;
      box-shadow: 0 0 60px rgba(255, 0, 128, 0.6), 0 0 120px rgba(128, 0, 255, 0.4);
    }
    .title {
      font-size: clamp(2rem, 8vw, 5rem);
      font-weight: 900;
      background: linear-gradient(135deg, #ff0080, #ff8c00, #ff0080);
      background-size: 200% 200%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gradient-shift 2s ease infinite;
      margin-top: 1rem;
      text-shadow: none;
    }
    @keyframes gradient-shift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    .bouncer {
      position: absolute;
      width: 150px;
      z-index: 5;
    }
    .bouncer img {
      width: 100%;
      border-radius: 8px;
    }
    .sparkle {
      position: absolute;
      width: 6px;
      height: 6px;
      background: #fff;
      border-radius: 50%;
      pointer-events: none;
      animation: sparkle-fade 1.5s ease-out forwards;
    }
    @keyframes sparkle-fade {
      0% { opacity: 1; transform: scale(1); }
      100% { opacity: 0; transform: scale(0); }
    }
  </style>
</head>
<body>
  <div class="center-wrap">
    <img src="${base}/maruzensky.gif" alt="Maruzensky" />
    <p class="title">ABSOLUTE SUPERCAR</p>
  </div>

  <div class="bouncer" id="b1"><img src="${base}/maru_fan.gif" alt="" /></div>
  <div class="bouncer" id="b2"><img src="${base}/maru_fan_dance.gif" alt="" /></div>
  <div class="bouncer" id="b3"><img src="${base}/uma-musume-maruzensky.gif" alt="" /></div>

  <script>
    // DVD bouncing logic
    function makeBouncer(el, speedX, speedY) {
      let x = Math.random() * (window.innerWidth - 150);
      let y = Math.random() * (window.innerHeight - 150);
      let vx = speedX;
      let vy = speedY;
      const w = 150;
      const h = 150;

      function step() {
        x += vx;
        y += vy;

        if (x <= 0 || x + w >= window.innerWidth) {
          vx = -vx;
          x = Math.max(0, Math.min(x, window.innerWidth - w));
        }
        if (y <= 0 || y + h >= window.innerHeight) {
          vy = -vy;
          y = Math.max(0, Math.min(y, window.innerHeight - h));
        }

        el.style.left = x + 'px';
        el.style.top = y + 'px';
        requestAnimationFrame(step);
      }
      step();
    }

    makeBouncer(document.getElementById('b1'), 2.5, 1.8);
    makeBouncer(document.getElementById('b2'), -2.0, 2.3);
    makeBouncer(document.getElementById('b3'), 1.7, -2.6);

    // Random sparkles
    setInterval(() => {
      const s = document.createElement('div');
      s.className = 'sparkle';
      s.style.left = Math.random() * window.innerWidth + 'px';
      s.style.top = Math.random() * window.innerHeight + 'px';
      s.style.width = s.style.height = (3 + Math.random() * 6) + 'px';
      s.style.background = ['#ff0080','#ff8c00','#8000ff','#00ffff','#fff'][Math.floor(Math.random()*5)];
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1500);
    }, 100);
  </script>
</body>
</html>`;
}

interface CmResponse {
  answer: string;
  detail: string;
}

// CM preset ID → Red Shift viability
const RESPONSES: Record<number, CmResponse> = {
  1:  { answer: 'Yes', detail: 'Taurus Cup — Tokyo 2400m Turf' },
  2:  { answer: 'Glue', detail: 'Gemini Cup — Kyoto 3200m Turf' },
  3:  { answer: 'Yes, but delayed', detail: 'Cancer Cup — Tokyo 1600m Turf' },
  4:  { answer: 'Yes', detail: 'Leo Cup — Hanshin 2200m Turf' },
  5:  { answer: 'Yes, but delayed', detail: 'Virgo Cup — Hanshin 1600m Turf' },
  6:  { answer: 'Glue', detail: 'Libra Cup — Kyoto 3000m Turf' },
  7:  { answer: 'Yes', detail: 'Scorpio Cup — Tokyo 2000m Turf' },
  8:  { answer: 'Yes', detail: 'Sagittarius Cup — Nakayama 2500m Turf' },
  9:  { answer: 'Yes', detail: 'Capricorn Cup — Chukyo 1200m Turf' },
  10: { answer: 'Yes, but delayed', detail: 'Aquarius Cup — Tokyo 1600m Dirt' },
  11: { answer: 'Glue', detail: 'Pisces Cup — Hanshin 3200m Turf' },
  12: { answer: 'Glue', detail: 'Aries Cup — Nakayama 2000m Turf' },
  13: { answer: 'Mandatory 😠', detail: 'Taurus Cup — Tokyo 2400m Turf' },
  14: { answer: 'Glue - Credit/Blame @FalooslessFukuFan', detail: 'Gemini Cup — Tokyo 1600m Turf' },
  15: { answer: 'Glue - Credit/Blame @FalooslessFukuFan', detail: 'Cancer Cup — Hanshin 2200m Turf' },
  16: { answer: 'Glue - Credit/Blame @FalooslessFukuFan', detail: 'Leo Cup — Nakayama 1200m Turf' },
  17: { answer: 'Yes - Credit/Blame @FalooslessFukuFan', detail: 'Virgo Cup — Ooi 2000m Dirt' },
  18: { answer: 'Glue - Credit/Blame @FalooslessFukuFan', detail: 'Libra Cup — Tokyo 2000m Turf' },
  19: { answer: 'Yes - Credit/Blame @FalooslessFukuFan', detail: 'Scorpio Cup — Kyoto 2400m Turf' },
  20: { answer: 'Yes - Credit/Blame @FalooslessFukuFan', detail: 'Sagittarius Cup — Hanshin 1600m Turf' },
};

function buildPage(answer: string, detail: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Does Red Shift?</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .answer {
      font-size: clamp(4rem, 15vw, 10rem);
      font-weight: 700;
      line-height: 1;
      margin: 0;
    }
    .detail {
      font-size: clamp(0.9rem, 2.5vw, 1.2rem);
      color: #888;
      margin-top: 1rem;
    }
    .attr {
      position: fixed;
      bottom: 0.75rem;
      right: 1rem;
      font-size: 0.8rem;
      color: #bbb;
    }
  </style>
</head>
<body>
  <p class="answer">${escapeHtml(answer)}</p>
  <p class="detail">${escapeHtml(detail)}</p>
  <span class="attr">@cing</span>
</body>
</html>`;
}

function build404(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Does Red Shift?</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .answer {
      font-size: clamp(2rem, 8vw, 4rem);
      font-weight: 700;
      color: #ccc;
    }
    .attr {
      position: fixed;
      bottom: 0.75rem;
      right: 1rem;
      font-size: 0.8rem;
      color: #bbb;
    }
  </style>
</head>
<body>
  <p class="answer">Unknown CM</p>
  <span class="attr">@cing</span>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  // www.umalator.app → apex (canonical), preserving path + query.
  if (url.hostname === WWW_HOST) {
    const dest = new URL(url);
    dest.hostname = APEX_HOST;
    return Response.redirect(dest.toString(), 301);
  }

  // Canva guides — multi-embed by slug (see EMBEDS above). Served on the
  // canva.umalator.app subdomain (slug at root) and at umalator.app/canva/<slug>.
  {
    const isCanvaHost = url.hostname === CANVA_HOST;
    const isCanvaPath = url.pathname === '/canva' || url.pathname.startsWith('/canva/');
    if (isCanvaHost || isCanvaPath) {
      // On the subdomain, let non-navigation asset requests (the favicon under
      // /uma-tools/*, etc.) fall through to normal asset handling.
      if (isCanvaHost) {
        const accept = context.request.headers.get('Accept') || '';
        const isNavigation =
          context.request.headers.get('Sec-Fetch-Mode') === 'navigate' ||
          accept.includes('text/html');
        if (!isNavigation) return context.next();
      }

      const prefix = isCanvaHost ? '' : '/canva';
      const rawPath = isCanvaHost ? url.pathname : url.pathname.replace(/^\/canva/, '');
      const slug = decodeURIComponent(rawPath.replace(/^\/+|\/+$/g, '')).split('/')[0];

      if (EMBEDS.length === 0) {
        return new Response('No guides configured.', { status: 404 });
      }
      if (slug === '') {
        return Response.redirect(new URL(`${prefix}/${newestEmbed().slug}`, url).toString(), 302);
      }
      const bySlug = EMBEDS.find((e) => e.slug === slug);
      if (bySlug) {
        return new Response(renderEmbedPage(bySlug), {
          headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'public, max-age=300' },
        });
      }
      if (/^\d+$/.test(slug)) {
        const byNum = EMBEDS.find((e) => slugNumber(e.slug) === parseInt(slug, 10));
        if (byNum) {
          return Response.redirect(new URL(`${prefix}/${byNum.slug}`, url).toString(), 302);
        }
      }
      return new Response(renderCanva404(prefix), {
        status: 404,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }
  }

  if (url.hostname !== REDIRECT_HOST) {
    return context.next();
  }

  // April Fools takeover — every route gets Maruzensky'd
  if (isAprilFools()) {
    return new Response(buildAprilFools(), {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  const path = url.pathname.replace(/^\/+|\/+$/g, '');

  if (!path) {
    return context.next();
  }

  const id = parseInt(path, 10);

  if (isNaN(id)) {
    return new Response(build404(), {
      status: 404,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  const entry = RESPONSES[id];

  if (!entry) {
    return new Response(build404(), {
      status: 404,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  return new Response(buildPage(entry.answer, entry.detail), {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
