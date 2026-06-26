# OCR Proxy Abuse Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the `/gemini` OCR proxy behind an Origin allowlist + Cloudflare Turnstile so only the real apps, driven by a verified browser session, can spend the server Gemini key.

**Architecture:** The worker rejects requests whose `Origin` isn't ours and whose `X-Turnstile-Token` header doesn't pass Cloudflare `siteverify`. The browser obtains a single-use Turnstile token from a shared `components/turnstile.ts` helper and sends it via the SDK's `httpOptions.headers`. No token / any 403 → the existing user-key fallback handles it.

**Tech Stack:** Cloudflare Worker (plain JS), Cloudflare Turnstile, `@google/genai` SDK (browser), Preact modals, esbuild (v1) + vite (v2) builds.

**Spec:** `docs/superpowers/specs/2026-06-26-ocr-proxy-abuse-protection-design.md`

**No automated test harness exists for the worker or browser OCR (matches the repo pattern — only `uma-skill-tools` has unit tests). Verification is via `wrangler dev` + `curl`, typecheck, and builds, with concrete commands + expected output per task.**

---

## Files

- Modify: `uma-tools-worker/webhook-proxy.js` — Origin + Turnstile gates, per-origin CORS (Task 1)
- Modify: `umalator-global/build.mjs` — `CC_TURNSTILE_SITEKEY` define ×2 (Task 2)
- Modify: `umalator-global/v2/vite.config.ts` — `CC_TURNSTILE_SITEKEY` define (Task 2)
- Modify: `umalator-global/v2/.env.local`, `umalator-global/v2/.env.example` — `TURNSTILE_SITEKEY` (Task 2)
- Create: `components/turnstile.ts` — shared token helper (Task 3)
- Modify: `components/GeminiOCR.ts` — `turnstileToken` param + proxy header (Task 3)
- Modify: `components/OCRModal.tsx` — token acquisition + proxy-aware gate (Task 4)
- Modify: `umalator-global/v2/ocr-modal.tsx` — token acquisition (Task 4)
- Modify: `CLAUDE.md`, `uma-tools-worker/README.md` — document the gates + dashboard setup (Task 5)

---

## Task 1: Worker — Origin allowlist + Turnstile verification

**Files:**
- Modify: `uma-tools-worker/webhook-proxy.js`

- [ ] **Step 1: Replace the static CORS block with per-origin helpers**

In `uma-tools-worker/webhook-proxy.js`, replace this block (lines ~15-19):

```js
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key',
};
```

with:

```js
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
```

- [ ] **Step 2: Use per-origin CORS in the top-level fetch handler**

Replace the `fetch` handler body (lines ~22-41) so it computes CORS from the request Origin and passes it down. New `export default`:

```js
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
```

- [ ] **Step 3: Add the Origin + Turnstile gates to handleGemini**

Replace the whole `handleGemini` function (lines ~44-79) with:

```js
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
```

- [ ] **Step 4: Thread `cors` into handleWebhook**

Change the `handleWebhook` signature and replace its internal `corsHeaders` references with the passed `cors`. Update line ~81:

```js
async function handleWebhook(request, env, cors) {
```

Then in that function replace every `headers: corsHeaders` with `headers: cors` (3 occurrences: the 400 invalid-payload, the 200 success, and the 500 catch). After this change, the identifier `corsHeaders` must not appear anywhere in the file (Step 1 removed the const; Steps 2-4 replace all its uses with the per-request `cors`).

- [ ] **Step 5: Verify with wrangler dev + curl (dummy Turnstile pass secret)**

Run the worker locally with the always-pass test secret and a dummy Gemini key:

```bash
cd uma-tools-worker
npx wrangler dev --var GEMINI_API_KEY:dummy --var TURNSTILE_SECRET:1x0000000000000000000000000000000AA --port 8799 &
sleep 6
B=http://localhost:8799
echo -n "preflight allowed origin: "; curl -s -o /dev/null -D - -X OPTIONS "$B/gemini/v1beta/models/gemini-2.5-flash:generateContent" -H 'Origin: https://umalator.app' | grep -i "access-control-allow-origin\|x-turnstile"
echo -n "foreign origin POST (expect 403): "; curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/gemini/v1beta/models/gemini-2.5-flash:generateContent" -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{}'
echo -n "allowed origin, no token (expect 403): "; curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/gemini/v1beta/models/gemini-2.5-flash:generateContent" -H 'Origin: https://umalator.app' -H 'Content-Type: application/json' -d '{}'
echo -n "allowed origin + dummy token, bad upstream path (expect 404 after Turnstile passes): "; curl -s -o /dev/null -w "%{http_code}\n" -X POST "$B/gemini/v1beta/models/x:countTokens" -H 'Origin: https://umalator.app' -H 'X-Turnstile-Token: XXXX.DUMMY.TOKEN.XXXX' -H 'Content-Type: application/json' -d '{}'
kill %1 2>/dev/null
```

Expected:
- preflight prints `Access-Control-Allow-Origin: https://umalator.app` and the allow-headers line includes `X-Turnstile-Token`.
- foreign origin → `403`.
- allowed origin, no token → `403`.
- allowed origin + dummy token, disallowed path → `404` (proves Turnstile passed with the always-pass secret, then the path allowlist rejected).

(The always-pass test secret `1x0000…AA` makes `siteverify` return `success:true` for any token string.)

- [ ] **Step 6: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add uma-tools-worker/webhook-proxy.js
git commit -m "Worker: gate /gemini behind Origin allowlist + Turnstile verification"
```

---

## Task 2: Build wiring — `CC_TURNSTILE_SITEKEY` define

**Files:**
- Modify: `umalator-global/build.mjs`
- Modify: `umalator-global/v2/vite.config.ts`
- Modify: `umalator-global/v2/.env.local`
- Modify: `umalator-global/v2/.env.example`

- [ ] **Step 1: Add the define to both esbuild blocks in build.mjs**

In `umalator-global/build.mjs` there are two `define:` objects (the v1 and v2 esbuild configs, lines ~333 and ~348). In **each**, add `CC_TURNSTILE_SITEKEY` after the `CC_OCR_PROXY` entry. The `define` object currently ends with:

```js
CC_OCR_PROXY: JSON.stringify(process.env.OCR_PROXY_URL || ''), CC_COW_SKIN: JSON.stringify(process.env.COW_SKIN || '')},
```

Change **both** occurrences to:

```js
CC_OCR_PROXY: JSON.stringify(process.env.OCR_PROXY_URL || ''), CC_TURNSTILE_SITEKEY: JSON.stringify(process.env.TURNSTILE_SITEKEY || ''), CC_COW_SKIN: JSON.stringify(process.env.COW_SKIN || '')},
```

- [ ] **Step 2: Add the define to vite.config.ts**

In `umalator-global/v2/vite.config.ts`, the `define:` block (line ~112) has:

```js
    CC_OCR_PROXY: JSON.stringify(env.OCR_PROXY_URL || ''),
```

Add immediately below it:

```js
    CC_TURNSTILE_SITEKEY: JSON.stringify(env.TURNSTILE_SITEKEY || ''),
```

- [ ] **Step 3: Add the env var to .env.local and .env.example**

Append to `umalator-global/v2/.env.local` (real value comes from the Cloudflare Turnstile widget; the always-pass test key is fine for local dev):

```
TURNSTILE_SITEKEY=1x00000000000000000000AA
```

Append to `umalator-global/v2/.env.example`:

```
# Cloudflare Turnstile sitekey (public) for the OCR proxy abuse gate.
# Get from Cloudflare dashboard → Turnstile. Local dev: 1x00000000000000000000AA (always passes).
TURNSTILE_SITEKEY=
```

- [ ] **Step 4: Verify the define is wired (no build error, value embedded)**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global
TURNSTILE_SITEKEY=1x00000000000000000000AA OCR_PROXY_URL=https://proxy.umalator.app node build.mjs 2>&1 | tail -3
grep -c "1x00000000000000000000AA" bundle.js
```

Expected: build completes (no errors); the grep prints a count `>= 1` (the sitekey string is embedded in the v1 bundle). Note: this requires Task 3's helper to reference the define; if run before Task 3, the count may be `0` — in that case just confirm the build completed without error, and re-check the grep after Task 3.

- [ ] **Step 5: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add umalator-global/build.mjs umalator-global/v2/vite.config.ts umalator-global/v2/.env.local umalator-global/v2/.env.example
git commit -m "Build: add CC_TURNSTILE_SITEKEY define + TURNSTILE_SITEKEY env"
```

---

## Task 3: Browser — `turnstile.ts` helper + GeminiOCR token plumbing

**Files:**
- Create: `components/turnstile.ts`
- Modify: `components/GeminiOCR.ts`

- [ ] **Step 1: Create the shared Turnstile helper**

Create `components/turnstile.ts` with exactly:

```ts
/**
 * Cloudflare Turnstile token helper for the OCR proxy abuse gate.
 *
 * Renders a single hidden Turnstile widget in "execute" mode (Managed appearance —
 * invisible unless a challenge is required) and hands out single-use tokens on demand.
 * Never throws: returns undefined when Turnstile is unconfigured or unavailable, so the
 * caller can fall back to the user-key path.
 */

// Public sitekey, injected by the build (CC_TURNSTILE_SITEKEY). Empty when unset.
declare const CC_TURNSTILE_SITEKEY: string;
export const TURNSTILE_SITEKEY: string =
	typeof CC_TURNSTILE_SITEKEY !== 'undefined' ? CC_TURNSTILE_SITEKEY : '';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TOKEN_TIMEOUT_MS = 30000;

declare global {
	interface Window { turnstile?: any; }
}

let scriptPromise: Promise<void> | null = null;
let widgetReady: Promise<void> | null = null;
let widgetId: string | null = null;
let pending: ((token: string | undefined) => void) | null = null;

function loadScript(): Promise<void> {
	if (scriptPromise) return scriptPromise;
	scriptPromise = new Promise<void>((resolve, reject) => {
		if (typeof window !== 'undefined' && window.turnstile) { resolve(); return; }
		const s = document.createElement('script');
		s.src = SCRIPT_SRC;
		s.async = true;
		s.defer = true;
		s.onload = () => resolve();
		s.onerror = () => reject(new Error('Turnstile script failed to load'));
		document.head.appendChild(s);
	});
	return scriptPromise;
}

function ensureWidget(): Promise<void> {
	if (widgetReady) return widgetReady;
	widgetReady = new Promise<void>((resolve, reject) => {
		window.turnstile.ready(() => {
			try {
				const container = document.createElement('div');
				container.style.position = 'fixed';
				container.style.bottom = '0';
				container.style.left = '0';
				container.style.zIndex = '2147483647';
				document.body.appendChild(container);
				widgetId = window.turnstile.render(container, {
					sitekey: TURNSTILE_SITEKEY,
					appearance: 'execute',
					execution: 'execute',
					callback: (token: string) => { const p = pending; pending = null; p?.(token); },
					'error-callback': () => { const p = pending; pending = null; p?.(undefined); },
					'expired-callback': () => { const p = pending; pending = null; p?.(undefined); },
				});
				resolve();
			} catch (e) {
				reject(e instanceof Error ? e : new Error('Turnstile render failed'));
			}
		});
	});
	return widgetReady;
}

/**
 * Resolve to a fresh single-use Turnstile token, or undefined if Turnstile is
 * unconfigured/unavailable/challenged-out. Never rejects.
 */
export async function getTurnstileToken(): Promise<string | undefined> {
	if (!TURNSTILE_SITEKEY || typeof window === 'undefined') return undefined;
	try {
		await loadScript();
		await ensureWidget();
	} catch {
		return undefined;
	}
	return new Promise<string | undefined>((resolve) => {
		const timer = setTimeout(() => finish(undefined), TOKEN_TIMEOUT_MS);
		function finish(token: string | undefined) {
			clearTimeout(timer);
			if (pending === finish) pending = null;
			resolve(token);
		}
		pending = finish;
		try {
			window.turnstile.reset(widgetId);
			window.turnstile.execute(widgetId);
		} catch {
			finish(undefined);
		}
	});
}
```

- [ ] **Step 2: Add the `turnstileToken` param + proxy header in GeminiOCR.ts**

In `components/GeminiOCR.ts`, change `runExtraction` to accept the SDK client only (unchanged) and update `extractHorseDataFromImage` (lines ~348-383). Replace the function with:

```ts
export async function extractHorseDataFromImage(
	imageBase64: string,
	mimeType: string,
	apiKey: string,
	turnstileToken?: string
): Promise<OCRResult> {
	// Try the server proxy first (no user key needed). 'proxy' is a placeholder the
	// worker ignores — it injects the real server key. The proxy requires a Turnstile
	// token; without one the worker would 403, so skip straight to the user-key path.
	if (OCR_PROXY_URL && turnstileToken) {
		try {
			const ai = new GoogleGenAI({
				apiKey: 'proxy',
				httpOptions: {
					baseUrl: proxyBaseUrl(),
					headers: { 'X-Turnstile-Token': turnstileToken },
				},
			});
			return await runExtraction(ai, imageBase64, mimeType);
		} catch (err) {
			console.warn('OCR proxy failed — falling back to user key:', err instanceof Error ? err.message : err);
		}
	}

	// Fall back to a direct call with the user's key.
	if (!apiKey) {
		return {
			success: false,
			error: OCR_PROXY_URL
				? 'OCR server is temporarily unavailable. Please try again later or provide your own Gemini API key.'
				: 'Please enter your Gemini API key.',
		};
	}

	try {
		const ai = new GoogleGenAI({ apiKey });
		return await runExtraction(ai, imageBase64, mimeType);
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
}
```

- [ ] **Step 3: Typecheck GeminiOCR + helper against the SDK types**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
npx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target es2018 --jsx react-jsx --lib es2018,dom components/turnstile.ts components/GeminiOCR.ts 2>&1 | grep -E "turnstile.ts|GeminiOCR.ts|error TS" | head
echo "exit: clean if empty above"
```

Expected: no errors referencing `turnstile.ts` or `GeminiOCR.ts`. (Pre-existing errors in *other* imported files, if any surface, are out of scope — only the two target files must be clean.)

- [ ] **Step 4: Verify the v1 build embeds the sitekey + builds clean**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global
TURNSTILE_SITEKEY=1x00000000000000000000AA OCR_PROXY_URL=https://proxy.umalator.app node build.mjs 2>&1 | tail -3
grep -c "1x00000000000000000000AA" bundle.js
grep -c "challenges.cloudflare.com" bundle.js
```

Expected: build completes; both greps print `>= 1` (sitekey embedded + Turnstile script URL bundled).

- [ ] **Step 5: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add components/turnstile.ts components/GeminiOCR.ts
git commit -m "OCR client: acquire Turnstile token + send via proxy X-Turnstile-Token header"
```

---

## Task 4: Wire Turnstile into both OCR modals

**Files:**
- Modify: `components/OCRModal.tsx`
- Modify: `umalator-global/v2/ocr-modal.tsx`

- [ ] **Step 1: v1 modal — import the helper**

In `components/OCRModal.tsx`, the existing import block pulls from `./GeminiOCR` (lines ~10-18). Add a new import directly after it:

```ts
import { getTurnstileToken } from './turnstile';
```

Also confirm `OCR_PROXY_URL` is imported from `./GeminiOCR` in that block; if it is **not** already imported, add `OCR_PROXY_URL` to the named imports from `./GeminiOCR`.

- [ ] **Step 2: v1 modal — proxy-aware gate + token in handleExtract**

In `components/OCRModal.tsx` `handleExtract` (lines ~124-164), replace the key-required gate:

```ts
		if (!apiKey.trim()) {
			setError('Please enter your Gemini API key');
			return;
		}
```

with the proxy-aware gate (matches v2):

```ts
		if (!OCR_PROXY_URL && !apiKey.trim()) {
			setError('Please enter your Gemini API key');
			return;
		}
```

Then replace the extraction call:

```ts
			const { base64, mimeType } = await fileToBase64(imageFile);
			const result = await extractHorseDataFromImage(base64, mimeType, apiKey.trim());
```

with:

```ts
			const { base64, mimeType } = await fileToBase64(imageFile);
			const turnstileToken = await getTurnstileToken();
			const result = await extractHorseDataFromImage(base64, mimeType, apiKey.trim(), turnstileToken);
```

- [ ] **Step 3: v2 modal — import the helper**

In `umalator-global/v2/ocr-modal.tsx`, the import block pulls from `../../components/GeminiOCR` (around line 15). Add after that import:

```ts
import { getTurnstileToken } from '../../components/turnstile';
```

- [ ] **Step 4: v2 modal — token in handleExtract**

In `umalator-global/v2/ocr-modal.tsx` `handleExtract` (lines ~175-209), replace:

```ts
			const { base64, mimeType } = await fileToBase64(imageFile);
			const result = await extractHorseDataFromImage(base64, mimeType, apiKey.trim());
```

with:

```ts
			const { base64, mimeType } = await fileToBase64(imageFile);
			const turnstileToken = await getTurnstileToken();
			const result = await extractHorseDataFromImage(base64, mimeType, apiKey.trim(), turnstileToken);
```

(The v2 gate at line ~181 is already proxy-aware — leave it.)

- [ ] **Step 5: Build both v1 and v2**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global
TURNSTILE_SITEKEY=1x00000000000000000000AA OCR_PROXY_URL=https://proxy.umalator.app node build.mjs 2>&1 | tail -3
cd v2 && TURNSTILE_SITEKEY=1x00000000000000000000AA OCR_PROXY_URL=https://proxy.umalator.app npx vite build 2>&1 | tail -4
```

Expected: both builds succeed with no errors (v1 esbuild prints its done line; v2 vite prints `✓ built in ...`).

- [ ] **Step 6: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add components/OCRModal.tsx umalator-global/v2/ocr-modal.tsx
git commit -m "OCR modals: fetch Turnstile token before extraction (both v1 + v2)"
```

---

## Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `uma-tools-worker/README.md`

- [ ] **Step 1: Extend the CLAUDE.md OCR Pipeline section**

In `CLAUDE.md`, find the `### OCR Pipeline (screenshot → uma)` section. Immediately before its `**To change the model:**` line, insert this paragraph:

```markdown
**Abuse protection:** the `/gemini` proxy is gated so only the real apps can spend the
server key. The worker enforces (1) an **Origin allowlist** (`umalator.app`,
`dev.umalator.app`, `localhost`) and (2) a **Cloudflare Turnstile** token — the browser
gets a single-use token from `components/turnstile.ts` (a hidden Managed-mode widget) and
sends it as the `X-Turnstile-Token` header; the worker verifies it via Turnstile
`siteverify` before proxying. No token / failed check → `403` → the client's user-key
fallback. Setup: create a Turnstile widget in the Cloudflare dashboard, put its **sitekey**
in the Pages build env `TURNSTILE_SITEKEY` (public; baked in via `CC_TURNSTILE_SITEKEY`)
and its **secret** in the worker via `wrangler secret put TURNSTILE_SECRET`. The worker
fails closed (`503`) until `TURNSTILE_SECRET` is set. Local dev: Cloudflare's always-pass
test pair (sitekey `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`).

```

- [ ] **Step 2: Update the worker README routes section**

In `uma-tools-worker/README.md`, find the `/gemini` route description (the "### Routes" section added in the prior migration). Append to the `/gemini` route's description:

```markdown

The `/gemini` route is gated: requests must carry an allowed `Origin`
(`umalator.app` / `dev.umalator.app` / `localhost`) and a valid Cloudflare Turnstile
token in the `X-Turnstile-Token` header (verified server-side via `siteverify` using the
`TURNSTILE_SECRET` secret). Missing/invalid → `403`; missing `TURNSTILE_SECRET` → `503`.
Set it with `npx wrangler secret put TURNSTILE_SECRET`.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add CLAUDE.md uma-tools-worker/README.md
git commit -m "Docs: OCR proxy Origin + Turnstile abuse gate"
```

---

## Done criteria

- Worker rejects foreign-Origin and tokenless `/gemini` requests (`403`), fails closed without `TURNSTILE_SECRET` (`503`), and forwards allowed-Origin + verified-token requests.
- Both OCR modals fetch a Turnstile token and pass it through; no token → user-key fallback (no hard block).
- v1 + v2 builds embed `CC_TURNSTILE_SITEKEY` and bundle the Turnstile helper.
- Docs describe the gates + the dashboard/secret setup.
- Operator follow-up (not code): create the Turnstile widget, set `TURNSTILE_SITEKEY` (Pages) + `TURNSTILE_SECRET` (worker), redeploy worker + Pages.
