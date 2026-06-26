# Uma Tools Webhook Proxy Worker

Cloudflare Worker that acts as a secure proxy for Discord webhook submissions from Uma Tools v2.

### Routes

- `POST /` — Discord webhook proxy (feedback submissions). Adds IP/location/browser metadata, forwards to `env.DISCORD_WEBHOOK`.
- `POST /gemini/*` — **Gemini OCR reverse proxy.** Forwards `/gemini/v1beta/models/<model>:generateContent` to `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`, injecting the `env.GEMINI_API_KEY` secret as the `x-goog-api-key` header (any client-sent key is ignored). Model-agnostic — only the `:generateContent` / `:streamGenerateContent` inference paths are allowed. The `@google/genai` SDK is pointed here via `httpOptions.baseUrl = <worker-url>/gemini`. CORS is open (`*`) and allows the `Content-Type` and `x-goog-api-key` headers.

Set the OCR secret with: `wrangler secret put GEMINI_API_KEY`

## Why Use This?

- **Security**: Hides the real Discord webhook URL from client-side code
- **Tracking**: Adds IP, location, and browser metadata to feedback submissions
- **Rate Limiting**: Can easily add rate limiting to prevent spam (optional)
- **Abuse Prevention**: Block malicious IPs at the edge

## Setup

### 1. Install Wrangler (if not already installed)

```bash
npm install -g wrangler
# Or use npx without installing: npx wrangler <command>
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

This opens your browser to authenticate with Cloudflare.

### 3. Deploy the Worker

From this directory:

```bash
npx wrangler deploy
```

You'll get a URL like:
```
https://uma-tools-webhook-proxy.YOUR-SUBDOMAIN.workers.dev
```

**Save this URL** - you'll need it for the next step.

### 4. Add Discord Webhook Secret

Set your Discord webhook URL as an encrypted secret:

```bash
npx wrangler secret put DISCORD_WEBHOOK
```

When prompted, paste your **new** Discord webhook URL (the one you created after deleting the compromised webhook).

### 5. Update Environment Variables

**In Cloudflare Pages (uma-tools project):**

1. Go to Cloudflare Dashboard → Pages → uma-tools
2. Settings → Environment variables
3. Add variable:
   - Name: `VITE_DISCORD_WEBHOOK`
   - Value: `https://uma-tools-webhook-proxy.YOUR-SUBDOMAIN.workers.dev`
   - Environment: Production (and/or Preview)

**For local development (.env.local):**

```bash
# In umalator-global/v2/.env.local
VITE_DISCORD_WEBHOOK=https://uma-tools-webhook-proxy.YOUR-SUBDOMAIN.workers.dev
```

### 6. Redeploy Your Site

Cloudflare Pages should auto-redeploy when you push to GitHub. If not, trigger a manual deployment.

## Testing

Test the worker directly:

```bash
curl -X POST https://uma-tools-webhook-proxy.YOUR-SUBDOMAIN.workers.dev \\
  -H "Content-Type: application/json" \\
  -d '{
    "embeds": [{
      "title": "Test Message",
      "description": "Testing webhook proxy",
      "color": 3447003,
      "footer": {"text": "Test"}
    }]
  }'
```

Check your Discord channel - you should see the message with added metadata (IP, location, browser).

## What Metadata is Added?

The worker automatically adds these fields to every Discord embed:

- **🌍 Location**: City and country (from Cloudflare's geolocation)
- **🔗 IP**: Client IP address
- **📱 Browser**: Browser type and version
- **🔗 Source**: Referring URL

## Monitoring

View worker logs in real-time:

```bash
npx wrangler tail
```

Or view logs in Cloudflare Dashboard:
- Workers & Pages → Your worker → Logs

## Updating the Worker

After making changes to `webhook-proxy.js`:

```bash
npx wrangler deploy
```

Changes are live immediately (no need to update environment variables).

## Optional: Add Rate Limiting

To prevent spam, you can add KV-based rate limiting. See [Cloudflare KV documentation](https://developers.cloudflare.com/kv/) for setup.

## Security Notes

- ✅ Real Discord webhook URL is never exposed to clients
- ✅ CORS is restricted (can be tightened to specific domains)
- ✅ Only POST requests are allowed
- ✅ Payload validation prevents malformed requests
- ✅ Encrypted secrets via Cloudflare

## Troubleshooting

**Worker not receiving requests:**
- Check CORS settings in `webhook-proxy.js`
- Verify `VITE_DISCORD_WEBHOOK` env var is set correctly
- Check browser console for CORS errors

**Discord not receiving messages:**
- Verify `DISCORD_WEBHOOK` secret is set: `npx wrangler secret list`
- Check worker logs: `npx wrangler tail`
- Test Discord webhook directly with curl

**"Method not allowed" error:**
- Ensure you're sending POST requests, not GET

## Costs

Cloudflare Workers Free Tier:
- ✅ 100,000 requests per day
- ✅ 10ms CPU time per request

This is more than enough for feedback submissions. Paid plans start at $5/month for 10 million requests.
