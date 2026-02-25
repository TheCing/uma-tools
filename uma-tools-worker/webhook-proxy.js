/**
 * Cloudflare Worker: Uma Tools API Proxy
 *
 * Routes:
 *   POST /         - Discord webhook proxy (feedback submissions)
 *   POST /gemini   - Gemini OCR proxy (screenshot parsing)
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/gemini') {
      return handleGemini(request, env);
    }

    return handleWebhook(request, env);
  },
};

async function handleGemini(request, env) {
  if (!env.GEMINI_API_KEY) {
    return new Response('Gemini API key not configured', { status: 503, headers: corsHeaders });
  }

  try {
    const body = await request.json();

    if (!body.contents || !Array.isArray(body.contents)) {
      return new Response('Invalid payload', { status: 400, headers: corsHeaders });
    }

    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const responseBody = await geminiResponse.text();

    return new Response(responseBody, {
      status: geminiResponse.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
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
