/**
 * Cloudflare Worker: Discord Webhook Proxy for Uma Tools
 *
 * Forwards feedback submissions to Discord while adding request metadata
 * (IP, country, browser) for better tracking and abuse prevention.
 */

export default {
  async fetch(request, env, ctx) {
    // CORS headers to allow requests from uma tools domains
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight CORS request
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders,
      });
    }

    try {
      // Parse incoming payload
      const body = await request.json();

      // Validate payload structure
      if (!body.embeds || !Array.isArray(body.embeds) || body.embeds.length === 0) {
        return new Response('Invalid payload: missing embeds', {
          status: 400,
          headers: corsHeaders,
        });
      }

      // Extract request metadata from Cloudflare
      const ip = request.headers.get('CF-Connecting-IP') || 'Unknown';
      const country = request.cf?.country || 'Unknown';
      const city = request.cf?.city || 'Unknown';
      const userAgent = request.headers.get('User-Agent') || 'Unknown';
      const referer = request.headers.get('Referer') || 'Direct';

      // Extract browser info (simplified)
      const browserMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge)\/[\d.]+/);
      const browser = browserMatch ? browserMatch[0] : userAgent.split(' ').slice(-2).join(' ');

      // Add metadata fields to the Discord embed
      body.embeds[0].fields = body.embeds[0].fields || [];
      body.embeds[0].fields.push(
        { name: '🌍 Location', value: `${city}, ${country}`, inline: true },
        { name: '🔗 IP', value: ip, inline: true },
        { name: '📱 Browser', value: browser, inline: true },
        { name: '🔗 Source', value: referer, inline: false }
      );

      // Add footer note about proxy
      body.embeds[0].footer = {
        text: `${body.embeds[0].footer?.text || 'Uma Tools Feedback'} • Via Worker Proxy`
      };

      // Forward to Discord webhook
      const discordResponse = await fetch(env.DISCORD_WEBHOOK, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      // Check Discord API response
      if (!discordResponse.ok) {
        console.error('Discord API error:', discordResponse.status, await discordResponse.text());
        throw new Error(`Discord API returned ${discordResponse.status}`);
      }

      // Success
      return new Response('Feedback sent successfully', {
        status: 200,
        headers: corsHeaders,
      });

    } catch (err) {
      console.error('Webhook proxy error:', err);
      return new Response(`Internal server error: ${err.message}`, {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};
