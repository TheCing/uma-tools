/**
 * Cloudflare Pages Function: dedicated route for umalator.app/canva/<slug>.
 *
 * Why a dedicated route in addition to the catchall? Cloudflare's auto-generated
 * _routes.json can shadow the root [[catchall]] for some paths (this project has many
 * static top-level paths). A dedicated function route — like functions/events/ — is
 * always honored, so /canva is guaranteed to resolve here even if the catchall's /*
 * route is excluded. The catchall still owns the canva.umalator.app subdomain.
 *
 * Registry + renderers are shared from ../../canva-embeds.ts (single source of truth).
 */

import { EMBEDS, newestEmbed, slugNumber, renderEmbedPage, renderCanva404 } from '../../canva-embeds';

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  // Strip the /canva prefix to recover the slug (this route only fires for /canva*).
  const rawPath = url.pathname.replace(/^\/canva/, '');
  const slug = decodeURIComponent(rawPath.replace(/^\/+|\/+$/g, '')).split('/')[0];

  if (EMBEDS.length === 0) {
    return new Response('No guides configured.', { status: 404 });
  }
  // Bare /canva → newest guide.
  if (slug === '') {
    return Response.redirect(new URL(`/canva/${newestEmbed().slug}`, url).toString(), 302);
  }
  // Exact slug match → render the embed page.
  const bySlug = EMBEDS.find((e) => e.slug === slug);
  if (bySlug) {
    return new Response(renderEmbedPage(bySlug), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8', 'Cache-Control': 'public, max-age=300' },
    });
  }
  // Number-only (e.g. /canva/15) → redirect to the full slug.
  if (/^\d+$/.test(slug)) {
    const byNum = EMBEDS.find((e) => slugNumber(e.slug) === parseInt(slug, 10));
    if (byNum) {
      return Response.redirect(new URL(`/canva/${byNum.slug}`, url).toString(), 302);
    }
  }
  return new Response(renderCanva404('/canva'), {
    status: 404,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
};
