# Multi-embed Canva slug system — Design Spec

**Date:** 2026-06-01
**Status:** Approved (design)

## Purpose

Today `canva.umalator.app` (and `umalator.app/canva/`) serves a single hardcoded
Canva embed (the Tachyon/CM guide, design `DAHKQU64nsg`). We want **multiple
active guides**, each addressed by a numbered slug:

- `/14-yasuda`
- `/15-takarazuka`
- `/16-sprinters`

…reachable at **both** `canva.umalator.app/<slug>` and `umalator.app/canva/<slug>`.
Adding a new guide should be a one-line edit.

## User-confirmed decisions

- **Root (no slug)** → 302 redirect to the **newest** (highest-numbered) guide.
- **Embeds defined** in a registry + rendered by a Pages Function (not build-time static files).
- **Current embed** (`DAHKQU64nsg`) becomes slug **`14-yasuda`**, title **"CM 14 Guide — Yasuda Kinen"** — it goes live immediately (it's the newest, so root points at it).
- `15-takarazuka` / `16-sprinters` are **not** seeded (no Canva URLs yet); they appear as a commented copy-paste template. Adding one = paste its Canva embed URL into the registry.

## Architecture

All canva routing lives in the **existing `functions/[[catchall]].ts`**, which
already houses the `does.redshift.work` registry (`RESPONSES`) and HTML page
renderers (`buildPage`, `build404`). The embed registry + renderer follow that
same in-file pattern. This is deliberate:

- A Pages Function's `context.next()` forwards to **static assets**, not to a
  *different* function route. Splitting "subdomain handler" and "apex `/canva`
  handler" into two functions and delegating between them is unreliable. Handling
  both inside the one root catch-all — which serves the rendered HTML **directly**
  (`return new Response(html)`) — sidesteps all re-chaining/asset-fallback ambiguity.
- Keeping it in `[[catchall]].ts` co-locates all hostname/path edge routing
  (redshift, www, canva) in one place, matching the existing structure.

### Dual-host model

| Public URL | `url.hostname` | `url.pathname` the function sees | slug |
|---|---|---|---|
| `canva.umalator.app/14-yasuda` | `canva.umalator.app` | `/14-yasuda` | `14-yasuda` |
| `umalator.app/canva/14-yasuda` | `umalator.app` | `/canva/14-yasuda` | `14-yasuda` |
| `canva.umalator.app/` | `canva.umalator.app` | `/` | _(empty → newest)_ |
| `umalator.app/canva/` | `umalator.app` | `/canva/` or `/canva` | _(empty → newest)_ |

The function computes a **`prefix`** for building correct same-host redirect
`Location`s: `''` on the subdomain, `'/canva'` on the apex. `og:url` is always the
canonical pretty form `https://canva.umalator.app/<slug>` regardless of host.

### Files

| Path | Action | Purpose |
|---|---|---|
| `functions/[[catchall]].ts` | MODIFY | Add the `EMBEDS` registry, `renderEmbedPage()`, `renderCanva404()`, and canva routing (subdomain + apex `/canva`). Replace the old "rewrite canva host → `/canva/`" branch. |
| `canva/index.html` | DELETE | The function renders embed pages now; the static single-embed page is obsolete. |
| `CLAUDE.md` | MODIFY | Replace the single-embed "update the Canva embed" section with the registry + "add a guide" procedure. |
| `_redirects` | (no change) | Already free of canva rules; the note there stays accurate. |

## The registry

Near the top of `functions/[[catchall]].ts`, prominently marked:

```ts
interface CanvaEmbed {
  slug: string;       // "<number>-<name>", e.g. "14-yasuda"
  title: string;      // display + <title> + og:title
  canvaId: string;    // Canva design ID  (Share › More › Embed)
  viewToken: string;  // Canva view token (the segment after the design ID)
}

// ── ACTIVE CANVA GUIDES ───────────────────────────────────────────────
// To add a guide: copy a line, bump the slug number + name, and paste the
// Canva design ID + view token from Canva › Share › More › Embed.
// The highest-numbered slug is "newest" — the bare root redirects to it.
const EMBEDS: CanvaEmbed[] = [
  { slug: '14-yasuda', title: 'CM 14 Guide — Yasuda Kinen',
    canvaId: 'DAHKQU64nsg', viewToken: 'BvXGiL0N1rLjUgNRP5KQPw' },
  // { slug: '15-takarazuka', title: 'CM 15 Guide — Takarazuka Kinen',
  //   canvaId: 'XXXX', viewToken: 'YYYY' },
];
```

Helpers (pure):
- `slugNumber(slug)` → `parseInt(slug, 10)` (leading digits).
- `newestEmbed()` → entry with the max `slugNumber` (reduce; deterministic).
- lookups by exact slug and by number-only.

## Routing behavior (function)

For a canva request (host is `canva.umalator.app`, **or** apex path is `/canva`
or under `/canva/`):

1. **Subdomain asset pass-through:** on `canva.umalator.app`, if the request is
   **not a navigation** (no `Sec-Fetch-Mode: navigate` and `Accept` lacks
   `text/html`) → `context.next()` (lets `/uma-tools/*` favicon etc. resolve via
   the existing `_redirects` path rewrite). Apex `/canva/*` is always a navigation
   (the embed page has no same-origin sub-assets), so no pass-through needed there.
2. Compute `slug` (strip the `/canva` prefix on apex; strip leading/trailing
   slashes; `decodeURIComponent`) and `prefix` (`''` subdomain / `'/canva'` apex).
3. **Empty slug** → `302` to `` `${prefix}/${newestEmbed().slug}` `` (resolved
   absolute via `new URL(rel, url)`).
4. **Exact slug match** → `200` rendered embed page (`Cache-Control: public, max-age=300`).
5. **Number-only** (`/^\d+$/`) matching an entry's number → `302` to its full slug.
6. **Unknown** → `404` styled page with a link to the newest guide.
7. Trailing slashes tolerated throughout.

Non-canva requests fall through to the existing redshift / `context.next()` logic
unchanged.

## Rendered embed page

`renderEmbedPage(embed, canonicalUrl)` returns the **current `canva/index.html`
template**, parameterized — same dark full-viewport iframe, same top-right
"Open on Canva ↗" link, same `<noscript>` fallback, same favicon and Canva
`preconnect`. Substituted per embed (all user-controlled text HTML-escaped):

- `<title>` / `og:title` / `twitter:title` ← `embed.title`
- `description` / `og:description` / `twitter:description` ← `"<title> — Uma Musume guide, hosted on Canva."`
- `og:url` ← `https://canva.umalator.app/<slug>` (canonical)
- iframe `src` ← `https://www.canva.com/design/<canvaId>/<viewToken>/view?embed`
- fallback link ← `…/view?utm_content=<canvaId>&utm_campaign=designshare&utm_medium=embeds&utm_source=link`
- `<noscript>` link ← `…/view`
- loading hint text ← `"Loading <title>…"`

`renderCanva404(prefix)` returns a minimal styled page ("Guide not found") with a
link to `` `${prefix}/${newestEmbed().slug}` ``.

## Edge cases

1. **Newest changes when a guide is added** — root uses **302** (not 301) so the
   redirect is never permanently cached; adding `15-…` instantly moves root to it.
2. **Subdomain favicon / assets** — handled by the navigation check (step 1);
   `/uma-tools/*` still resolves via `_redirects`.
3. **`/canva/14` (number only)** → 302 → `/canva/14-yasuda` (and `/14` on the subdomain).
4. **Empty registry** — not a real state (we ship with `14-yasuda`); `newestEmbed`
   assumes ≥1 entry. A guard returns a plain 404 if the array is ever emptied.
5. **Slug with stray path depth** (`/canva/14-yasuda/extra`) — only the first
   segment is treated as the slug; extra segments are ignored (slug match still works).
6. **XSS** — `title` is the only author-controlled string injected into HTML; it's
   HTML-escaped. `canvaId`/`viewToken` are placed in URLs (alphanumeric Canva tokens).

## Verification

1. **Local runtime test** (mirrors the prior canva fix): isolated `wrangler pages
   dev` project containing the function + a dummy apex `index.html` + a
   `/uma-tools/.../favicon.svg`, exercised with `Host` headers:
   - `Host: canva.umalator.app` `/` → 302 `Location: /14-yasuda`
   - `Host: canva.umalator.app` `/14-yasuda` (Accept text/html) → 200, title contains "CM 14 Guide — Yasuda Kinen", iframe src has `DAHKQU64nsg`
   - `Host: canva.umalator.app` `/14` → 302 `/14-yasuda`
   - `Host: canva.umalator.app` `/uma-tools/umalator-global/favicon.svg` (Accept image) → passes through (200, svg)
   - `Host: canva.umalator.app` `/99-nope` → 404, body links to `/14-yasuda`
   - `Host: umalator.app` `/canva/` → 302 `Location: /canva/14-yasuda`
   - `Host: umalator.app` `/canva/14-yasuda` → 200 rendered
   - `Host: umalator.app` `/canva/14` → 302 `/canva/14-yasuda`
   - `Host: umalator.app` `/other` → not intercepted (reaches `context.next()`)
2. **Function parse check** via esbuild (`--loader:.ts=ts`), as before.
3. Confirm `canva/index.html` removal doesn't break any remaining reference
   (grep repo for `canva/index.html`, `/canva/index`).

## Out of scope (follow-ups)

- An index/list landing page (we chose redirect-to-newest).
- Per-guide social preview images (`og:image`).
- Extracting the canva registry/renderer out of `[[catchall]].ts` into a shared
  module — fine to inline now (matches the file's existing redshift pattern);
  revisit if the file grows unwieldy.
- Analytics / view counts per guide.
