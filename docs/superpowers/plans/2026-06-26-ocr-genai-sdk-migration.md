# OCR `@google/genai` SDK Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the OCR pipeline (browser client, Cloudflare Worker proxy, Discord bot) from hand-rolled REST calls on the no-free-tier `gemini-flash-latest` to the `@google/genai` SDK on the free-tier `gemini-2.5-flash`, using structured output, and document it.

**Architecture:** The SDK builds/sends requests internally, so the browser→proxy combo is expressed via the SDK's `httpOptions.baseUrl`, and the worker `/gemini` route becomes a transparent reverse proxy that injects the server key. Structured output (`responseSchema`) makes Gemini return guaranteed-valid JSON, removing the fragile markdown-stripping/truncation parsing. The model name lives in 2 files (browser + bot); the worker is model-agnostic.

**Tech Stack:** `@google/genai`, TypeScript, Preact (browser), Cloudflare Workers (`wrangler`), Node (bot). No automated test harness for OCR (browser + live API) — verification is by build/typecheck + worker dry-run/`wrangler dev` + manual smoke test, matching the repo's existing pattern.

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json` (root) | Add `@google/genai` (browser apps bundle it) |
| `uma-tools-bot/package.json` | Add `@google/genai` (Node bot) |
| `components/GeminiOCR.ts` | MODIFY — SDK client, structured output, proxy/direct via `baseUrl`; keep all name→ID matching + helpers |
| `uma-tools-worker/webhook-proxy.js` | MODIFY — `/gemini` becomes a path-restricted reverse proxy; Discord route untouched |
| `uma-tools-worker/README.md` | MODIFY — document the reverse-proxy `/gemini` route |
| `uma-tools-bot/src/gemini-ocr.ts` | MODIFY — SDK call + structured output; keep matching helpers |
| `CLAUDE.md` | MODIFY — add an OCR Pipeline section |

---

## Task 1: Add the `@google/genai` dependency

**Files:**
- Modify: `package.json`
- Modify: `uma-tools-bot/package.json`

- [ ] **Step 1: Install in the root (browser apps)**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
npm install @google/genai
```
Expected: `package.json` gains `"@google/genai": "^1.x.x"` under `dependencies`; `node_modules/@google/genai` exists.

- [ ] **Step 2: Install in the bot**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/uma-tools-bot
npm install @google/genai
```
Expected: `uma-tools-bot/package.json` gains `"@google/genai"` under `dependencies`.

- [ ] **Step 3: Verify it resolves**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
node -e "const {GoogleGenAI, Type} = require('@google/genai'); console.log(typeof GoogleGenAI, typeof Type.OBJECT)"
```
Expected: prints `function string` (the class and the `Type` enum exist).

- [ ] **Step 4: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add package.json package-lock.json uma-tools-bot/package.json uma-tools-bot/package-lock.json
git commit -m "Add @google/genai SDK dependency for OCR migration"
```
(If a lockfile doesn't exist for the bot, omit it from the `git add`.)

---

## Task 2: Worker `/gemini` reverse proxy

**Files:**
- Modify: `uma-tools-worker/webhook-proxy.js`
- Modify: `uma-tools-worker/README.md`

- [ ] **Step 1: Replace the routing + Gemini handler**

In `uma-tools-worker/webhook-proxy.js`, replace the top constants, the `export default`, and `handleGemini` (everything from `const GEMINI_API_URL = ...` through the end of `handleGemini`, i.e. lines 9–68) with:

```js
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
```

Leave `handleWebhook` (the Discord route) exactly as-is.

- [ ] **Step 2: Validate the worker bundles/typechecks**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/uma-tools-worker
npx wrangler deploy --dry-run --outdir /tmp/worker-dryrun 2>&1 | tail -5
```
Expected: a successful dry-run (`Total Upload` / compiled output, no syntax errors). It does **not** deploy.

- [ ] **Step 3: Smoke-test routing locally with `wrangler dev`**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/uma-tools-worker
npx wrangler dev --port 8799 > /tmp/wdev.log 2>&1 &
for i in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:8799/ 2>/dev/null && break; sleep 1; done
echo "1) OPTIONS preflight (expect 204 + CORS allow-headers incl x-goog-api-key):"
curl -s -o /dev/null -D - -X OPTIONS http://127.0.0.1:8799/gemini/v1beta/models/gemini-2.5-flash:generateContent | grep -iE "^HTTP|access-control-allow-headers"
echo "2) disallowed path (expect 404):"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8799/gemini/v1beta/models/x:countTokens
echo "3) allowed path, no secret set locally (expect 503 'not configured'):"
curl -s -X POST http://127.0.0.1:8799/gemini/v1beta/models/gemini-2.5-flash:generateContent -H 'Content-Type: application/json' -d '{}' -w " [%{http_code}]\n"
lsof -ti:8799 | xargs kill 2>/dev/null
```
Expected: (1) `HTTP/1.1 204` and `Access-Control-Allow-Headers: Content-Type, x-goog-api-key`; (2) `404`; (3) `Gemini API key not configured [503]` (local `wrangler dev` has no `GEMINI_API_KEY` secret unless a `.dev.vars` provides one — 503 confirms the guard + routing work). Free port 8799 afterward.

- [ ] **Step 4: Update the worker README**

In `uma-tools-worker/README.md`, find the routes/description near the top (the `## ` overview or a "Routes" list). Add/replace the Gemini route description with:

```markdown
### Routes

- `POST /` — Discord webhook proxy (feedback submissions). Adds IP/location/browser metadata, forwards to `env.DISCORD_WEBHOOK`.
- `POST /gemini/*` — **Gemini OCR reverse proxy.** Forwards `/gemini/v1beta/models/<model>:generateContent` to `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`, injecting the `env.GEMINI_API_KEY` secret as the `x-goog-api-key` header (any client-sent key is ignored). Model-agnostic — only the `:generateContent` / `:streamGenerateContent` inference paths are allowed. The `@google/genai` SDK is pointed here via `httpOptions.baseUrl = <worker-url>/gemini`. CORS is open (`*`) and allows the `Content-Type` and `x-goog-api-key` headers.

Set the OCR secret with: `wrangler secret put GEMINI_API_KEY`
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add uma-tools-worker/webhook-proxy.js uma-tools-worker/README.md
git commit -m "Make worker /gemini a model-agnostic reverse proxy for the genai SDK"
```

---

## Task 3: Browser client — `components/GeminiOCR.ts`

**Files:**
- Modify: `components/GeminiOCR.ts`

All name→ID matching, the `OCRHorseData`/`OCRResult` types, `fileToBase64`, and the localStorage helpers stay. Only the Gemini call path changes.

- [ ] **Step 1: Add the SDK import**

In `components/GeminiOCR.ts`, directly after the three data imports (the `import umas from '../umalator-global/umas.json';` line, ~line 13), add:

```ts
import { GoogleGenAI, Type } from '@google/genai';
```

- [ ] **Step 2: Replace the model URL constant with the model name + schema/config**

Replace this line (~line 15):
```ts
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';
```
with:
```ts
// gemini-2.5-flash: current GA model with a free tier (gemini-flash-latest / 2.0-flash
// have no guaranteed free tier). To change the model, edit this constant here and in
// uma-tools-bot/src/gemini-ocr.ts.
const MODEL = 'gemini-2.5-flash';

// Structured-output schema → Gemini returns guaranteed-valid JSON (no markdown fences).
const RESPONSE_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		name:             { type: Type.STRING },
		outfit:           { type: Type.STRING },
		speed:            { type: Type.INTEGER },
		stamina:          { type: Type.INTEGER },
		power:            { type: Type.INTEGER },
		guts:             { type: Type.INTEGER },
		wisdom:           { type: Type.INTEGER },
		surfaceAptitude:  { type: Type.STRING, enum: ['S','A','B','C','D','E','F','G'] },
		distanceAptitude: { type: Type.STRING, enum: ['S','A','B','C','D','E','F','G'] },
		strategyAptitude: { type: Type.STRING, enum: ['S','A','B','C','D','E','F','G'] },
		strategy:         { type: Type.STRING, enum: ['Nige','Senkou','Sasi','Oikomi','Oonige'] },
		skills:           { type: Type.ARRAY, items: { type: Type.STRING } },
	},
	required: ['speed','stamina','power','guts','wisdom','skills'],
	propertyOrdering: ['name','outfit','speed','stamina','power','guts','wisdom',
		'surfaceAptitude','distanceAptitude','strategyAptitude','strategy','skills'],
};

const GENERATION_CONFIG = {
	temperature: 0.1,
	topK: 1,
	topP: 0.8,
	maxOutputTokens: 4096,
	responseMimeType: 'application/json',
	responseSchema: RESPONSE_SCHEMA,
};
```

- [ ] **Step 3: Trim the prompt (schema now enforces structure)**

Replace the entire `EXTRACTION_PROMPT` constant (the ``const EXTRACTION_PROMPT = `...`;`` block, ~lines 244–276) with:

```ts
const EXTRACTION_PROMPT = `Analyze this Uma Musume game screenshot and extract the horse's data into the provided JSON schema.

Field guidance:
- name: character name (e.g., 'El Condor Pasa', 'Taiki Shuttle')
- outfit: outfit name in brackets (e.g., '[El☆Número 1]', '[Wild Frontier]')
- speed / stamina / power / guts / wisdom: the numeric stat values (wisdom = the Wit stat)
- surfaceAptitude: the letter grade for Turf (S–G)
- distanceAptitude: the BEST grade among Sprint / Mile / Medium / Long
- strategyAptitude: the BEST grade among Front / Pace / Late / End styles
- strategy: the style name with the best grade, mapped as:
    Front / Front Runner = "Nige"
    Pace / Pace Chaser = "Senkou"
    Late / Late Surger = "Sasi"
    End / End Closer = "Oikomi"

Extract ALL visible skill names from the Skills tab, exactly as shown, including:
- Any circle/cross symbols (○, ◎, ×) after the name — these indicate the skill grade and are part of the name.
- The level indicator (Lvl 1–4) if present — CRITICAL for telling UNIQUE skills (which DISPLAY "Lvl X", usually Lvl 4) apart from INHERITED skills (which do NOT show a level).

Examples:
- "Dancing in the Leaves Lvl 4" (HAS level) = unique skill
- "Dancing in the Leaves" (NO level) = inherited skill`;
```

- [ ] **Step 4: Replace the request/parse/call functions with SDK calls**

Replace everything from `function buildRequestBody(` through the end of `extractHorseDataFromImage` (i.e. `buildRequestBody`, `parseGeminiResponse`, `callGeminiDirect`, `callGeminiProxy`, and `extractHorseDataFromImage` — ~lines 278–402) with:

```ts
// SDK baseUrl for the proxy path. The SDK appends /v1beta/models/<model>:generateContent.
function proxyBaseUrl(): string {
	return OCR_PROXY_URL.replace(/\/+$/, '') + '/gemini';
}

function buildContents(imageBase64: string, mimeType: string) {
	return [{
		role: 'user',
		parts: [
			{ inlineData: { mimeType, data: imageBase64 } },
			{ text: EXTRACTION_PROMPT },
		],
	}];
}

async function runExtraction(ai: GoogleGenAI, imageBase64: string, mimeType: string): Promise<OCRResult> {
	const resp = await ai.models.generateContent({
		model: MODEL,
		contents: buildContents(imageBase64, mimeType),
		config: GENERATION_CONFIG,
	});

	const text = resp.text;
	if (!text) {
		throw new Error('No response content from Gemini');
	}

	let data: OCRHorseData;
	try {
		data = JSON.parse(text);
	} catch (parseError) {
		throw new Error(`Invalid JSON from AI: ${parseError instanceof Error ? parseError.message : 'Parse error'}`);
	}

	if (typeof data.speed !== 'number' ||
		typeof data.stamina !== 'number' ||
		typeof data.power !== 'number' ||
		typeof data.guts !== 'number' ||
		typeof data.wisdom !== 'number') {
		throw new Error('Invalid stat values in response');
	}

	return { success: true, data, rawResponse: text };
}

export async function extractHorseDataFromImage(
	imageBase64: string,
	mimeType: string,
	apiKey: string
): Promise<OCRResult> {
	// Try the server proxy first (no user key needed). 'proxy' is a placeholder the
	// worker ignores — it injects the real server key.
	if (OCR_PROXY_URL) {
		try {
			const ai = new GoogleGenAI({ apiKey: 'proxy', httpOptions: { baseUrl: proxyBaseUrl() } });
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

- [ ] **Step 5: Build the v1 app (esbuild) — confirms the SDK bundles for the browser**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global
node build.mjs --debug 2>&1 | tail -5
```
Expected: builds with no errors. If esbuild reports unresolved Node built-ins from `@google/genai`, the SDK pulled a Node-only path — add the browser condition by passing `conditions: ['browser']` / `mainFields` to the esbuild `buildOptions` in `umalator-global/build.mjs`, or mark the offending built-in `external`. Re-run until clean; report if unresolved.

- [ ] **Step 6: Build the v2 app (vite)**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/umalator-global/v2
npx vite build 2>&1 | tail -8
```
Expected: `✓ built` with no resolution errors. (Vite resolves the `browser` export condition by default, so the SDK should bundle cleanly.)

- [ ] **Step 7: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add components/GeminiOCR.ts
git commit -m "Migrate browser OCR client to @google/genai SDK + gemini-2.5-flash with structured output"
```

---

## Task 4: Discord bot — `uma-tools-bot/src/gemini-ocr.ts`

**Files:**
- Modify: `uma-tools-bot/src/gemini-ocr.ts`

Keep all the matching helpers, types, and getters. Only the model URL, prompt, and `extractHorseDataFromImage` change.

- [ ] **Step 1: Add the SDK import + model/schema**

At the top of `uma-tools-bot/src/gemini-ocr.ts`, after the existing `import { join } from 'path';` line, add:

```ts
import { GoogleGenAI, Type } from '@google/genai';
```

Then replace this line:
```ts
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';
```
with:
```ts
// gemini-2.5-flash: free-tier GA model. Keep in sync with components/GeminiOCR.ts.
const MODEL = 'gemini-2.5-flash';

const RESPONSE_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		name:             { type: Type.STRING },
		outfit:           { type: Type.STRING },
		speed:            { type: Type.INTEGER },
		stamina:          { type: Type.INTEGER },
		power:            { type: Type.INTEGER },
		guts:             { type: Type.INTEGER },
		wisdom:           { type: Type.INTEGER },
		surfaceAptitude:  { type: Type.STRING, enum: ['S','A','B','C','D','E','F','G'] },
		distanceAptitude: { type: Type.STRING, enum: ['S','A','B','C','D','E','F','G'] },
		strategyAptitude: { type: Type.STRING, enum: ['S','A','B','C','D','E','F','G'] },
		strategy:         { type: Type.STRING, enum: ['Nige','Senkou','Sasi','Oikomi','Oonige'] },
		skills:           { type: Type.ARRAY, items: { type: Type.STRING } },
	},
	required: ['speed','stamina','power','guts','wisdom','skills'],
	propertyOrdering: ['name','outfit','speed','stamina','power','guts','wisdom',
		'surfaceAptitude','distanceAptitude','strategyAptitude','strategy','skills'],
};
```

- [ ] **Step 2: Trim the prompt**

Replace the bot's `EXTRACTION_PROMPT` constant (the ``const EXTRACTION_PROMPT = `...`;`` block) with the same trimmed prompt used in the browser client:

```ts
const EXTRACTION_PROMPT = `Analyze this Uma Musume game screenshot and extract the horse's data into the provided JSON schema.

Field guidance:
- name: character name (e.g., 'El Condor Pasa', 'Taiki Shuttle')
- outfit: outfit name in brackets (e.g., '[El☆Número 1]', '[Wild Frontier]')
- speed / stamina / power / guts / wisdom: the numeric stat values (wisdom = the Wit stat)
- surfaceAptitude: the letter grade for Turf (S–G)
- distanceAptitude: the BEST grade among Sprint / Mile / Medium / Long
- strategyAptitude: the BEST grade among Front / Pace / Late / End styles
- strategy: the style name with the best grade, mapped as:
    Front / Front Runner = "Nige"
    Pace / Pace Chaser = "Senkou"
    Late / Late Surger = "Sasi"
    End / End Closer = "Oikomi"

Extract ALL visible skill names from the Skills tab, exactly as shown, including:
- Any circle/cross symbols (○, ◎, ×) after the name — these indicate the skill grade and are part of the name.
- The level indicator (Lvl 1–4) if present — CRITICAL for telling UNIQUE skills (which DISPLAY "Lvl X", usually Lvl 4) apart from INHERITED skills (which do NOT show a level).

Examples:
- "Dancing in the Leaves Lvl 4" (HAS level) = unique skill
- "Dancing in the Leaves" (NO level) = inherited skill`;
```

- [ ] **Step 3: Replace `extractHorseDataFromImage`**

Replace the entire `export async function extractHorseDataFromImage(...) { ... }` (the last function in the file) with:

```ts
export async function extractHorseDataFromImage(
	imageBase64: string,
	mimeType: string,
	apiKey: string
): Promise<OCRResult> {
	try {
		const ai = new GoogleGenAI({ apiKey });
		const resp = await ai.models.generateContent({
			model: MODEL,
			contents: [{
				role: 'user',
				parts: [
					{ inlineData: { mimeType, data: imageBase64 } },
					{ text: EXTRACTION_PROMPT },
				],
			}],
			config: {
				temperature: 0.1,
				topK: 1,
				topP: 0.8,
				maxOutputTokens: 4096,
				responseMimeType: 'application/json',
				responseSchema: RESPONSE_SCHEMA,
			},
		});

		const text = resp.text;
		if (!text) {
			throw new Error('No response content from Gemini');
		}

		const horseData: OCRHorseData = JSON.parse(text);

		if (typeof horseData.speed !== 'number' ||
			typeof horseData.stamina !== 'number' ||
			typeof horseData.power !== 'number' ||
			typeof horseData.guts !== 'number' ||
			typeof horseData.wisdom !== 'number') {
			throw new Error('Invalid stat values in response');
		}

		return { success: true, data: horseData };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
}
```

- [ ] **Step 4: Typecheck the bot**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1/uma-tools-bot
npx tsc --noEmit 2>&1 | tail -10 && echo "tsc OK"
```
Expected: `tsc OK` with no errors. If `tsc` complains that `@google/genai`'s ESM types don't resolve under the bot's CommonJS config, set `"moduleResolution": "node16"` (or `"bundler"`) in `uma-tools-bot/tsconfig.json` and re-run.

- [ ] **Step 5: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add uma-tools-bot/src/gemini-ocr.ts uma-tools-bot/tsconfig.json
git commit -m "Migrate Discord bot OCR to @google/genai SDK + gemini-2.5-flash"
```
(Only include `tsconfig.json` if Step 4 required changing it.)

---

## Task 5: Document the OCR pipeline in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add an OCR Pipeline section**

In `CLAUDE.md`, after the "OCR Screenshot Import" bullet under the Horse Data section (search for `OCR Screenshot Import`), add a new subsection. Place it as a `### OCR Pipeline` under the nearest `##` heading (or right after the existing OCR bullets):

```markdown
### OCR Pipeline (screenshot → uma)

Imports a uma from a game screenshot via Google Gemini. Three consumers share the
flow across two environments:

| Consumer | File | Env | Auth |
|---|---|---|---|
| v2 + v1 web modals | `components/GeminiOCR.ts` (shared lib) | Browser | Proxy (no key) → user-key fallback |
| OCR proxy | `uma-tools-worker/webhook-proxy.js` | Cloudflare Worker | Server `GEMINI_API_KEY` secret |
| Discord bot | `uma-tools-bot/src/gemini-ocr.ts` | Node | Server key |

**SDK + model:** uses the unified **`@google/genai`** SDK against **`gemini-2.5-flash`**
— a GA model with a **free tier**. Do **not** use `gemini-flash-latest` (floating alias,
no guaranteed free tier) or `gemini-2.0-flash*` (shut down 2026-06-01). The model is a
`MODEL` constant in `components/GeminiOCR.ts` and `uma-tools-bot/src/gemini-ocr.ts`
(2 places); the worker is model-agnostic.

**Structured output:** the call sets `responseMimeType: 'application/json'` +
`responseSchema` (the `OCRHorseData` shape, with `enum`s for aptitude/strategy), so
Gemini returns guaranteed-valid JSON — no markdown-fence stripping needed.

**Proxy:** the browser points the SDK at the worker via
`httpOptions.baseUrl = OCR_PROXY_URL + '/gemini'`. The worker's `/gemini/*` route is a
transparent reverse proxy: it forwards `/v1beta/models/<model>:generateContent` to
Google, injecting `env.GEMINI_API_KEY` as `x-goog-api-key` (only inference paths are
allowed). Most users never need a key; if the proxy fails, the client falls back to a
user-supplied key (entered in the modal, optionally saved to `localStorage`).
`OCR_PROXY_URL` is provided to the build via the `CC_OCR_PROXY` esbuild/vite define
(from `OCR_PROXY_URL` in `.env.local`). After deploying the worker, set the secret with
`wrangler secret put GEMINI_API_KEY`.

**To change the model:** edit the `MODEL` constant in the two files above (and confirm
the new model has a free tier if you rely on the proxy).
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jptyndalljr/Dev/uma-tools-1
git add CLAUDE.md
git commit -m "Document the OCR pipeline (genai SDK, gemini-2.5-flash, reverse proxy)"
```

---

## Self-Review

**Spec coverage:**
- Add `@google/genai` (browser + bot) → Task 1 ✓
- Browser SDK client + proxy/direct via `baseUrl` + placeholder key → Task 3 Steps 1–4 ✓
- Structured output (`responseSchema`, deletes fence/truncation parsing) → Task 3 Steps 2,4 + Task 4 ✓
- `gemini-2.5-flash` model in 2 places → Task 3 Step 2, Task 4 Step 1 ✓
- Worker reverse proxy + `x-goog-api-key` injection + CORS header + path restriction + Discord route untouched → Task 2 ✓
- Worker README → Task 2 Step 4 ✓
- Bot SDK migration → Task 4 ✓
- CLAUDE.md OCR section → Task 5 ✓
- Verification (builds v1/v2, bot tsc, worker dry-run + `wrangler dev`, CORS/path checks) → Task 2 Steps 2–3, Task 3 Steps 5–6, Task 4 Step 4 ✓

**Placeholder scan:** No TBD/TODO. The `'proxy'` apiKey is an intentional documented placeholder. Build-fallback notes (esbuild browser conditions, bot moduleResolution) are conditional remediations with exact actions, not vague "handle errors."

**Type consistency:** `MODEL`, `RESPONSE_SCHEMA`, `GENERATION_CONFIG`, `proxyBaseUrl`, `buildContents`, `runExtraction`, `extractHorseDataFromImage` are used with identical names/signatures within and across tasks. `OCRHorseData`/`OCRResult` shapes are unchanged from the existing files (`rawResponse` kept in the browser `OCRResult`, absent in the bot's — matching each file's existing interface). `Type` and `GoogleGenAI` come from the same import in every file. Worker `ALLOWED_GEMINI_PATH` / `GEMINI_BASE` / `corsHeaders` are self-consistent.
