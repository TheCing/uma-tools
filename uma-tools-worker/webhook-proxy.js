/**
 * Cloudflare Worker: Uma Tools API Proxy
 *
 * Routes:
 *   POST /         - Discord webhook proxy (feedback submissions)
 *   POST /gemini/* - Gemini OCR reverse proxy (model-agnostic; injects server key)
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

// Only allow the (stream)generateContent inference paths through the proxy, so the
// server key can't be used to hit arbitrary Google API endpoints.
const ALLOWED_GEMINI_PATH = /^\/v1(beta)?\/models\/[^/]+:(streamGenerateContent|generateContent)$/;

// Origins allowed to use the OCR proxy. localhost/127.0.0.1 (any port) for dev.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (origin === 'https://umalator.app' || origin === 'https://dev.umalator.app') return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// Per-request CORS: echo the Origin when allowed (so credentials/headers work), else omit.
function corsHeadersFor(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key, X-Turnstile-Token',
    'Vary': 'Origin',
  };
  if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeadersFor(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // /gemini/* — transparent reverse proxy to the Gemini API (model-agnostic).
    // The @google/genai SDK is configured with baseUrl = <worker>/gemini and
    // appends /v1beta/models/<model>:generateContent itself.
    if (url.pathname === '/gemini' || url.pathname.startsWith('/gemini/')) {
      return handleGemini(request, env, url, origin, cors);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    return handleWebhook(request, env, cors);
  },
};

async function verifyTurnstile(token, secret, ip) {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await resp.json();
  return data.success === true;
}

async function handleGemini(request, env, url, origin, cors) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }
  // Gate 1: Origin allowlist — cheap first filter.
  if (!isAllowedOrigin(origin)) {
    return new Response('Forbidden', { status: 403, headers: cors });
  }
  // Fail closed if secrets are missing.
  if (!env.GEMINI_API_KEY) {
    return new Response('Gemini API key not configured', { status: 503, headers: cors });
  }
  if (!env.TURNSTILE_SECRET) {
    return new Response('Turnstile not configured', { status: 503, headers: cors });
  }
  // Gate 2: Turnstile — proves a verified browser session.
  const token = request.headers.get('X-Turnstile-Token');
  if (!token) {
    return new Response('Missing Turnstile token', { status: 403, headers: cors });
  }
  const ip = request.headers.get('CF-Connecting-IP') || undefined;
  let ok;
  try {
    ok = await verifyTurnstile(token, env.TURNSTILE_SECRET, ip);
  } catch (err) {
    console.error('Turnstile verify error:', err);
    return new Response('Turnstile verification failed', { status: 502, headers: cors });
  }
  if (!ok) {
    return new Response('Turnstile verification failed', { status: 403, headers: cors });
  }

  // Strip the /gemini prefix to recover the upstream Gemini path.
  const upstreamPath = url.pathname.replace(/^\/gemini/, '');
  if (!ALLOWED_GEMINI_PATH.test(upstreamPath)) {
    return new Response('Not found', { status: 404, headers: cors });
  }

  try {
    const body = await request.text();
    const geminiResponse = await fetch(`${GEMINI_BASE}${upstreamPath}${url.search}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Inject the server key; ignore any key the client sent.
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body,
    });

    const responseBody = await geminiResponse.text();
    return new Response(responseBody, {
      status: geminiResponse.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Gemini proxy error:', err);
    return new Response(`Internal server error: ${err.message}`, { status: 500, headers: cors });
  }
}

async function handleWebhook(request, env, cors) {
  try {
    const body = await request.json();

    if (!body.embeds || !Array.isArray(body.embeds) || body.embeds.length === 0) {
      return new Response('Invalid payload: missing embeds', { status: 400, headers: cors });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'Unknown';
    const country = request.cf?.country || 'Unknown';
    const city = request.cf?.city || 'Unknown';
    const userAgent = request.headers.get('User-Agent') || 'Unknown';
    const referer = request.headers.get('Referer') || 'Direct';

    const browserMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge)\/[\d.]+/);
    const browser = browserMatch ? browserMatch[0] : userAgent.split(' ').slice(-2).join(' ');

    body.embeds[0].fields = body.embeds[0].fields || [];
    body.embeds[0].fields.push(
      { name: '🌍 Location', value: `${city}, ${country}`, inline: true },
      { name: '🔗 IP', value: ip, inline: true },
      { name: '📱 Browser', value: browser, inline: true },
      { name: '🔗 Source', value: referer, inline: false }
    );

    body.embeds[0].footer = {
      text: `${body.embeds[0].footer?.text || 'Uma Tools Feedback'} • Via Worker Proxy`
    };

    const discordResponse = await fetch(env.DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!discordResponse.ok) {
      console.error('Discord API error:', discordResponse.status, await discordResponse.text());
      throw new Error(`Discord API returned ${discordResponse.status}`);
    }

    return new Response('Feedback sent successfully', { status: 200, headers: cors });
  } catch (err) {
    console.error('Webhook proxy error:', err);
    return new Response(`Internal server error: ${err.message}`, { status: 500, headers: cors });
  }
}
