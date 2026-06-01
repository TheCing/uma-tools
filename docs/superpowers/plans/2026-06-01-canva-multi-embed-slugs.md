# Canva Multi-Embed Slug System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve multiple Canva guides by numbered slug (e.g. `/14-yasuda`) on both `canva.umalator.app/<slug>` and `umalator.app/canva/<slug>`, from a one-line-per-guide registry, with the bare root redirecting to the newest.

**Architecture:** All canva routing lives in the existing `functions/[[catchall]].ts` Cloudflare Pages Function — which already houses a `RESPONSES` registry + HTML renderers for `does.redshift.work`, so an `EMBEDS` registry + `renderEmbedPage()` follow the same in-file pattern. The function serves rendered HTML directly (no `next()` re-chaining). The old single-embed `canva/index.html` static page is removed.

**Tech Stack:** TypeScript Cloudflare Pages Function; verified with `wrangler pages dev` + `Host` headers (the repo has no unit-test harness for Pages Functions — same verification approach as the prior canva routing fix).

---

## File Structure

| Path | Responsibility |
|---|---|
| `functions/[[catchall]].ts` | MODIFY — add `EMBEDS` registry, `slugNumber`/`newestEmbed` helpers, `canvaUrls`/`renderEmbedPage`/`renderCanva404`, and the canva routing block (replaces the old canva-host branch; also handles apex `/canva/*`). |
| `canva/index.html` | DELETE — the function renders embed pages now. |
| `CLAUDE.md` | MODIFY — replace the single-embed "update the Canva embed" guidance with the registry + "add a guide" procedure; note the routing lives in the Function. |

---

## Task 1: Multi-embed canva routing in the Pages Function

**Files:**
- Modify: `functions/[[catchall]].ts`

This task adds the registry + renderers and replaces the existing canva-host
branch with full slug routing for both hosts.

- [ ] **Step 1: Add the registry, helpers, and renderers**

In `functions/[[catchall]].ts`, immediately AFTER the host-constants block (the
`const APEX_HOST = 'umalator.app';` line, currently line 19), insert:

```ts

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
```

- [ ] **Step 2: Replace the old canva-host branch with full slug routing**

In `functions/[[catchall]].ts`, find this block (currently lines ~290-304):

```ts
  // canva.umalator.app → serve the static Tachyon Guide at /canva/ for page
  // navigations. Asset requests (e.g. the favicon under /uma-tools/*) and direct
  // /canva/* hits pass through untouched so they resolve normally.
  if (url.hostname === CANVA_HOST) {
    const accept = context.request.headers.get('Accept') || '';
    const isNavigation =
      context.request.headers.get('Sec-Fetch-Mode') === 'navigate' ||
      accept.includes('text/html');
    if (isNavigation && !url.pathname.startsWith('/canva/')) {
      const guide = new URL(url);
      guide.pathname = '/canva/';
      return context.next(new Request(guide.toString(), context.request));
    }
    return context.next();
  }
```

Replace it ENTIRELY with:

```ts
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
```

(The surrounding `{ }` block scopes the local consts so they don't collide with
the `const path = …` declared later in `onRequest`.)

- [ ] **Step 3: Parse-check the function (TypeScript syntax)**

Run:
```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
npx esbuild 'functions/[[catchall]].ts' --loader:.ts=ts --bundle=false >/dev/null && echo "parses OK"
```
Expected: `parses OK` (no esbuild errors).

- [ ] **Step 4: Build an isolated wrangler test project**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
T=/tmp/canva-multi
rm -rf "$T"; mkdir -p "$T/functions" "$T/uma-tools/umalator-global"
cp 'functions/[[catchall]].ts' "$T/functions/[[catchall]].ts"
printf '<!doctype html><title>MAIN APP</title>main' > "$T/index.html"
printf 'svg-favicon' > "$T/uma-tools/umalator-global/favicon.svg"
echo "scaffold ready:"; find "$T" -type f | sed "s|$T/||"
```

- [ ] **Step 5: Start `wrangler pages dev`**

```bash
cd /tmp/canva-multi
npx --yes wrangler@4 pages dev . --port 8788 --ip 127.0.0.1 --compatibility-date 2024-01-01 >/tmp/wrangler-canva.log 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8788/ 2>/dev/null && { echo "up after ${i}s"; break; }; sleep 1; done
tail -3 /tmp/wrangler-canva.log
```
Expected: `[wrangler:info] Ready on http://127.0.0.1:8788`.

- [ ] **Step 6: Run all routing cases**

```bash
B=http://127.0.0.1:8788
echo "1) subdomain root → 302 /14-yasuda"
curl -s -o /dev/null -D - -H "Host: canva.umalator.app" -H "Accept: text/html" "$B/" | grep -iE "^HTTP|^location"
echo "2) subdomain slug → 200, title + canvaId"
curl -s -H "Host: canva.umalator.app" -H "Accept: text/html" "$B/14-yasuda" | grep -oE "<title>[^<]*</title>|DAHKQU64nsg" | head -2
echo "3) subdomain number-only → 302 /14-yasuda"
curl -s -o /dev/null -D - -H "Host: canva.umalator.app" -H "Accept: text/html" "$B/14" | grep -iE "^HTTP|^location"
echo "4) subdomain favicon (Accept image) → passes through to svg"
curl -s -H "Host: canva.umalator.app" -H "Accept: image/svg+xml" "$B/uma-tools/umalator-global/favicon.svg"; echo
echo "5) subdomain unknown slug → 404 + link to /14-yasuda"
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: canva.umalator.app" -H "Accept: text/html" "$B/99-nope"
curl -s -H "Host: canva.umalator.app" -H "Accept: text/html" "$B/99-nope" | grep -oE 'href="[^"]*14-yasuda"'
echo "6) apex /canva/ → 302 /canva/14-yasuda"
curl -s -o /dev/null -D - -H "Host: umalator.app" -H "Accept: text/html" "$B/canva/" | grep -iE "^HTTP|^location"
echo "7) apex /canva/14-yasuda → 200"
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: umalator.app" -H "Accept: text/html" "$B/canva/14-yasuda"
echo "8) apex /canva/14 → 302 /canva/14-yasuda"
curl -s -o /dev/null -D - -H "Host: umalator.app" -H "Accept: text/html" "$B/canva/14" | grep -iE "^HTTP|^location"
echo "9) apex unrelated path → MAIN APP (not intercepted)"
curl -s -H "Host: umalator.app" -H "Accept: text/html" "$B/other" | grep -oE "<title>[^<]*</title>"
```
Expected:
1. `302` + `location: /14-yasuda`
2. `<title>CM 14 Guide — Yasuda Kinen</title>` and `DAHKQU64nsg`
3. `302` + `location: /14-yasuda`
4. `svg-favicon`
5. `404` then `href="/14-yasuda"`
6. `302` + `location: /canva/14-yasuda`
7. `200`
8. `302` + `location: /canva/14-yasuda`
9. `<title>MAIN APP</title>`

- [ ] **Step 7: Stop wrangler and clean up**

```bash
lsof -ti:8788 | xargs kill 2>/dev/null
rm -rf /tmp/canva-multi /tmp/wrangler-canva.log
echo "cleaned up"
```

- [ ] **Step 8: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add 'functions/[[catchall]].ts'
git commit -m "Add multi-embed Canva slug routing (registry + per-slug render)"
```

---

## Task 2: Remove the static page and update docs

**Files:**
- Delete: `canva/index.html`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Delete the obsolete static embed page**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git rm canva/index.html
```

- [ ] **Step 2: Confirm nothing references it**

```bash
grep -rn "canva/index.html\|/canva/index" . --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.sh' --include='*.md' --include='*.html' 2>/dev/null | grep -v "docs/superpowers" | grep -v "_redirects"
```
Expected: no output (the only references are in the design/plan docs and the
historical `_redirects` note, which are fine).

- [ ] **Step 3: Update the CLAUDE.md Canva section**

Open `CLAUDE.md`, find the `### Tachyon Guide (Canva embed) — \`canva.umalator.app\``
section. Replace its body (keep the heading, optionally rename to
`### Canva guides — \`canva.umalator.app\``) with:

```markdown
### Canva guides — `canva.umalator.app`

Community guides are Canva embeds addressed by a numbered slug, reachable at both
`canva.umalator.app/<slug>` and `umalator.app/canva/<slug>`:

- `/14-yasuda`, `/15-takarazuka`, … (`<number>-<name>`)
- bare root (`canva.umalator.app/` or `umalator.app/canva/`) → 302 to the
  highest-numbered (newest) guide
- number-only (`/14`) → 302 to the full slug

**Routing + registry live in `functions/[[catchall]].ts`** (a Pages Function),
NOT `_redirects` — Cloudflare Pages `_redirects` matches on the request path only,
so hostname-scoped rules there are silently ignored. The function renders each
guide page from the `EMBEDS` array.

**To add a guide:** add one entry to the `EMBEDS` array near the top of
`functions/[[catchall]].ts`:

```ts
{ slug: '15-takarazuka', title: 'CM 15 Guide — Takarazuka Kinen',
  canvaId: 'XXXX', viewToken: 'YYYY' },
```

Get `canvaId` + `viewToken` from Canva › Share › More › Embed — the embed URL is
`https://www.canva.com/design/<canvaId>/<viewToken>/view?embed`. The newest entry
automatically becomes the root redirect target. Changes ship with `master`
(`canva.umalator.app` maps to the production deployment), so merge `dev` → master
to publish.
```

- [ ] **Step 4: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add canva/index.html CLAUDE.md
git commit -m "Remove static canva page; document the Canva guide registry"
```

---

## Self-Review

**Spec coverage:**
- Slugs on both hosts → Task 1 Step 2 (subdomain + apex branches) ✓
- Registry, one-line add → Task 1 Step 1 (`EMBEDS`) + Task 2 Step 3 (docs) ✓
- Root → newest (302) → Task 1 Step 2 (`slug === ''`) ✓
- `14-yasuda` seeded live with `DAHKQU64nsg` → Task 1 Step 1 ✓
- Number-only redirect → Task 1 Step 2 (`/^\d+$/`) ✓
- Styled 404 → `renderCanva404` (Task 1 Step 1) + routing fallback ✓
- Subdomain asset pass-through → Task 1 Step 2 (navigation check) ✓
- Canonical `og:url` → `renderEmbedPage` (Task 1 Step 1) ✓
- Remove `canva/index.html` → Task 2 Step 1 ✓
- CLAUDE.md update → Task 2 Step 3 ✓
- Verification via `wrangler pages dev` + Host headers → Task 1 Steps 4-6 ✓
- XSS: `title` HTML-escaped in `renderEmbedPage` → Task 1 Step 1 ✓

**Placeholder scan:** The commented `15-takarazuka` line is an intentional
template (documented), not an unfinished step. No TBD/TODO; all code is complete.

**Type consistency:** `CanvaEmbed`, `EMBEDS`, `slugNumber`, `newestEmbed`,
`canvaUrls`, `renderEmbedPage`, `renderCanva404` are used with identical names and
signatures across Steps 1-2. `escapeHtml` is the existing function in the file
(hoisted function declaration — callable from `renderEmbedPage` regardless of
order). The routing block references only symbols defined in Step 1.
