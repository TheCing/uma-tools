# OCR Migration to `@google/genai` SDK + gemini-2.5-flash — Design Spec

**Date:** 2026-06-26
**Status:** Approved (design)

## Purpose

The OCR "import from screenshot" feature calls Gemini three ways (browser client, Cloudflare Worker proxy, Discord bot), all via hand-rolled `fetch` to the model alias **`gemini-flash-latest`**. That alias has no guaranteed free tier (per the June 2026 pricing docs), so free usage breaks. This migration:

1. Adopts Google's unified **`@google/genai`** SDK (the legacy raw-REST approach still works, but the user opted for the official SDK for future-proofing).
2. Switches to **`gemini-2.5-flash`** — a current GA model with a **free tier** and strong multimodal/structured-output support (best fit for reading game-screenshot stats/skills).
3. Uses the SDK's **structured output** (`responseSchema`) so Gemini returns guaranteed-valid JSON, deleting the fragile markdown-stripping + truncation-guard parsing.
4. Documents the pipeline.

### Facts behind the model choice (June 2026 docs)

- `gemini-2.5-flash`, `gemini-2.5-flash-lite` → **free tier** (input + output free of charge).
- `gemini-2.0-flash` / `2.0-flash-lite` → **deprecated, shut down 2026-06-01**.
- `gemini-flash-latest` → **not in the pricing table** (floating alias, no guaranteed free tier) — the cause of the breakage.

## Architecture

Three consumers of the shared OCR logic, two environments:

| Consumer | File | Env | Auth |
|---|---|---|---|
| v2 + v1 web modals | `components/GeminiOCR.ts` (shared lib) | Browser | Proxy (no key) → user key fallback |
| OCR proxy | `uma-tools-worker/webhook-proxy.js` | Cloudflare Worker | Server `GEMINI_API_KEY` secret |
| Discord bot | `uma-tools-bot/src/gemini-ocr.ts` | Node | Server key |

The SDK builds and sends requests internally, so the browser→proxy combination is expressed through the SDK's **`httpOptions.baseUrl`**, and the worker becomes a transparent reverse proxy. Net effect: the model name lives in **2 places** (browser + bot); the worker is **model-agnostic**.

## Component designs

### 1. Dependency

Add **`@google/genai`** to the relevant `package.json`s:
- Root `package.json` (the browser apps — esbuild/vite bundle it for `components/GeminiOCR.ts`).
- `uma-tools-bot/package.json` (Node).
- The worker does **not** need it (plain `fetch` reverse proxy).

The SDK defaults to the **Gemini Developer API** (the `generativelanguage.googleapis.com` endpoint) when constructed with `{ apiKey }` and no `vertexai` flag — which is what we want.

### 2. Browser client — `components/GeminiOCR.ts`

Replace `buildRequestBody`, `callGeminiDirect`, `callGeminiProxy`, and `parseGeminiResponse` with SDK calls. Keep all the **name→ID matching** code (skills/outfit/character) and the `OCRHorseData`/`OCRResult` types and `fileToBase64`/localStorage helpers unchanged.

```ts
import { GoogleGenAI, Type } from '@google/genai';

const MODEL = 'gemini-2.5-flash';

// Structured-output schema → guaranteed valid JSON
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

`extractHorseDataFromImage(imageBase64, mimeType, apiKey)` becomes:

1. **Proxy path** (when `OCR_PROXY_URL` is set): build a client pointed at the worker, with a placeholder key the worker ignores:
   ```ts
   const ai = new GoogleGenAI({ apiKey: 'proxy', httpOptions: { baseUrl: proxyBaseUrl() } });
   ```
   where `proxyBaseUrl()` is `OCR_PROXY_URL` with a trailing `/gemini` ensured (the SDK appends `/v1beta/models/<model>:generateContent`).
   On any failure (network, non-OK), fall through to:
2. **Direct path** (user key): `new GoogleGenAI({ apiKey: userKey })` (default Google base URL). If no key, return the existing "OCR server unavailable / enter your key" error.

Both paths call:
```ts
const resp = await ai.models.generateContent({
  model: MODEL,
  contents: [{ role: 'user', parts: [
    { inlineData: { mimeType, data: imageBase64 } },
    { text: EXTRACTION_PROMPT },
  ]}],
  config: {
    temperature: 0.1, topK: 1, topP: 0.8, maxOutputTokens: 4096,
    responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA,
  },
});
const data = JSON.parse(resp.text) as OCRHorseData;
```
Then validate the five stats are numbers (kept) and return `{ success: true, data, rawResponse: resp.text }`.

**Prompt:** keep `EXTRACTION_PROMPT` essentially as-is (it still guides content: the Front/Pace/Late/End→strategy mapping and the unique-vs-inherited "Lvl N" rule), but trim the now-redundant "Return ONLY valid JSON / no markdown" framing since the schema enforces it.

**Error mapping:** SDK throws typed errors; wrap in try/catch and map to `{ success: false, error: <message> }`, preserving the proxy-first → user-key fallback and the existing user-facing messages. The markdown-fence stripping and truncation guard are **deleted** (schema makes them unreachable).

### 3. Worker reverse proxy — `uma-tools-worker/webhook-proxy.js`

Replace the body-forwarding `/gemini` handler with a path-forwarding reverse proxy:

- Match `url.pathname` starting with `/gemini/` (or exactly `/gemini`). Strip the `/gemini` prefix to get the upstream path (e.g. `/v1beta/models/gemini-2.5-flash:generateContent`).
- Forward to `https://generativelanguage.googleapis.com<upstreamPath><search>`, method `POST`, body passthrough, injecting the server key as the **`x-goog-api-key`** header (ignore any client-sent key). Keep `Content-Type: application/json`.
- Return the upstream response (status + body) with CORS headers.
- **CORS:** `Access-Control-Allow-Headers` must now include **`x-goog-api-key`** and `content-type` (the SDK sends both); handle `OPTIONS` preflight (already present — extend allowed headers).
- The `/` Discord webhook route and its handler are **unchanged**. The 503 "key not configured" guard stays.
- This handler no longer references any model name → model-agnostic.

### 4. Discord bot — `uma-tools-bot/src/gemini-ocr.ts`

Replace its raw `fetch` with the Node SDK using the server key:
```ts
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const resp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents:[…], config:{… responseSchema …} });
```
Reuse the same `RESPONSE_SCHEMA` shape and prompt. The bot's own name-matching logic is out of scope (left as-is) beyond the model/API swap.

### 5. Model location

A `MODEL = 'gemini-2.5-flash'` constant in `components/GeminiOCR.ts` and in `uma-tools-bot/src/gemini-ocr.ts` (2 places). The worker has none. (Per the user's choice, not exposing it as a build define — a constant per file is fine and clearly documented.)

## Documentation

- **CLAUDE.md** — new "OCR Pipeline" subsection: architecture (3 consumers / 2 envs), the `@google/genai` SDK, **gemini-2.5-flash** + the free-tier rationale (and the "don't use `gemini-flash-latest`/2.0" note), the proxy reverse-proxy contract (`baseUrl` → `/gemini/*` → Google with server key), structured output, and "to change the model, edit the `MODEL` constant in the 2 files."
- **`uma-tools-worker/README.md`** — update the `/gemini` route description from body-forward to reverse proxy, and note the `x-goog-api-key` injection + CORS header.

## Edge cases & error handling

1. **Proxy down / rate-limited** → SDK call throws or returns non-OK → caught → fall back to user key (preserved behavior).
2. **No proxy + no user key** → existing "Please enter your Gemini API key" error.
3. **Placeholder key on proxy path** — the SDK requires a non-empty `apiKey`; `'proxy'` satisfies it and the worker overwrites it. (If the SDK ever rejects a malformed key client-side, use any syntactically plausible string; not expected.)
4. **Schema vs prompt drift** — schema defines shape; prompt defines content. `strategy`/aptitude `enum`s constrain to valid values, reducing bad mappings downstream.
5. **`maxOutputTokens` truncation** — far less likely with compact JSON (no markdown), but keep a defensive `JSON.parse` try/catch returning a clear error.
6. **Browser bundle** — confirm the SDK tree-shakes acceptably in the esbuild (v1) and vite (v2) builds; if it pulls Node-only polyfills, address via the existing alias/define config.

## Verification

No automated harness exists for this (browser + live external API), matching the repo's pattern. Verify by:

1. **Builds:** `cd umalator-global && node build.mjs` (v1 esbuild) and `cd umalator-global/v2 && npx vite build` (v2) succeed with the SDK bundled, no resolution/polyfill errors.
2. **Bot:** `cd uma-tools-bot && npm install && npx tsc --noEmit` (or its build) passes.
3. **Worker:** `cd uma-tools-worker && npx wrangler deploy --dry-run` (or `wrangler dev`) validates; a `curl` to `/gemini/v1beta/models/gemini-2.5-flash:generateContent` with a tiny payload returns a Gemini response (or a clear upstream error), and `OPTIONS` preflight returns the CORS headers incl. `x-goog-api-key`.
4. **Manual OCR smoke test:** load the v2 app, run a real uma screenshot through the modal end-to-end (proxy path), confirm stats/skills populate and the review→confirm flow loads the uma. Then test the user-key fallback path.
5. Existing `uma-skill-tools` tests still pass (unaffected, but run as a sanity check).

## Out of scope (follow-ups)

- Unifying the bot's independent name-matching with `components/GeminiOCR.ts` (long-standing duplication).
- Making the review screen fully editable (name/outfit/stats/skills) — separate UX change.
- Exposing the model as a build define / runtime config.
- Migrating other Gemini usages if any appear later.
