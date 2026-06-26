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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // /gemini/* — transparent reverse proxy to the Gemini API (model-agnostic).
    // The @google/genai SDK is configured with baseUrl = <worker>/gemini and
    // appends /v1beta/models/<model>:generateContent itself.
    if (url.pathname === '/gemini' || url.pathname.startsWith('/gemini/')) {
      return handleGemini(request, env, url);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    return handleWebhook(request, env);
  },
};

async function handleGemini(request, env, url) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }
  if (!env.GEMINI_API_KEY) {
    return new Response('Gemini API key not configured', { status: 503, headers: corsHeaders });
  }

  // Strip the /gemini prefix to recover the upstream Gemini path.
  const upstreamPath = url.pathname.replace(/^\/gemini/, '');
  if (!ALLOWED_GEMINI_PATH.test(upstreamPath)) {
    return new Response('Not found', { status: 404, headers: corsHeaders });
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Gemini proxy error:', err);
    return new Response(`Internal server error: ${err.message}`, { status: 500, headers: corsHeaders });
  }
}

async function handleWebhook(request, env) {
  try {
    const body = await request.json();

    if (!body.embeds || !Array.isArray(body.embeds) || body.embeds.length === 0) {
      return new Response('Invalid payload: missing embeds', { status: 400, headers: corsHeaders });
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

    return new Response('Feedback sent successfully', { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error('Webhook proxy error:', err);
    return new Response(`Internal server error: ${err.message}`, { status: 500, headers: corsHeaders });
  }
}
