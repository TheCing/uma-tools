# OCR Proxy Abuse Protection — Design Spec

**Date:** 2026-06-26
**Status:** Approved (design)

## Purpose

The OCR `/gemini` reverse proxy (`uma-tools-worker/webhook-proxy.js`) is an
**open, unauthenticated** endpoint: `CORS: *`, no Origin check, server Gemini key
injected for any caller. Anyone who finds the URL can POST images and burn the
server's Gemini key, quota, and (on a paid plan) money. This already drove the
worker past the Cloudflare Workers free-plan **100,000 requests/day** account limit
(error 1027), taking down OCR for real users.

This adds two gates to the proxy so only the real apps (umalator.app / dev /
localhost), driven by a verified human/browser session, can use the server key:

1. **Origin allowlist** — a cheap first gate; reject requests whose `Origin` isn't ours.
2. **Cloudflare Turnstile** (Managed mode) — the real anti-abuse: each OCR call carries
   a single-use Turnstile token the worker verifies before proxying to Gemini.

The existing **user-key fallback** (user's own Gemini key → Google directly) and the
**Discord bot** path do not use the proxy and are unaffected. The Discord feedback
`/` route is intentionally left ungated (lower-value abuse surface).

## Architecture

```
Browser (OCRModal) ── Managed Turnstile widget ──► token
        │
        │  extractHorseDataFromImage(..., turnstileToken)
        ▼
  SDK client: httpOptions.headers['X-Turnstile-Token'] = token,  Origin: <app>
        │
        ▼
Worker /gemini ─► Gate 1: Origin in allowlist?  ─no─► 403
                ─► Gate 2: siteverify(token, TURNSTILE_SECRET) ok? ─no─► 403
                ─► inject GEMINI_API_KEY, forward to Google ─► response
```

No token (widget not ready / blocked) or any 403 → the browser's existing
proxy→user-key fallback handles it (unchanged UX).

## Components

### 1. Worker — `uma-tools-worker/webhook-proxy.js`

Add two checks at the **top of `handleGemini`**, before the existing key-guard /
path-allowlist / upstream fetch (keep those in place, after these gates):

- **Origin gate.** Read `request.headers.get('Origin')`. Allow if it exactly matches
  `https://umalator.app` or `https://dev.umalator.app`, or starts with
  `http://localhost:` or `http://127.0.0.1:` (dev). Otherwise return
  `403 Forbidden` (CORS headers attached). Define the allowlist as a small
  `isAllowedOrigin(origin)` helper near the top of the file.
- **Turnstile gate.** Read `request.headers.get('X-Turnstile-Token')`. If missing/empty
  → `403`. Else `POST` to `https://challenges.cloudflare.com/turnstile/v0/siteverify`
  with `application/x-www-form-urlencoded` body `secret=<env.TURNSTILE_SECRET>` +
  `response=<token>` (+ optional `remoteip=<CF-Connecting-IP>`). Parse JSON; if
  `!data.success` → `403`. If `env.TURNSTILE_SECRET` is unset → `503` (mirrors the
  existing `GEMINI_API_KEY` 503 guard) so a misconfigured deploy fails closed.

**CORS changes (`corsHeaders` + preflight):**
- `Access-Control-Allow-Headers`: add `X-Turnstile-Token` (keep `Content-Type`,
  `x-goog-api-key`).
- `Access-Control-Allow-Origin`: stop using the static `*`. Compute per-request — if
  the Origin is allowed, echo it; add `Vary: Origin`. Implement as a
  `corsHeadersFor(origin)` helper returning the header object. The `OPTIONS` preflight
  and every `/gemini` response use `corsHeadersFor(request Origin)`. The Discord `/`
  route keeps its current behavior (may keep `*` or reuse the helper; do not break it).

The handler still injects `env.GEMINI_API_KEY` as `x-goog-api-key` and remains
model-agnostic. New secret required: `TURNSTILE_SECRET`.

### 2. Browser client — `components/GeminiOCR.ts`

- `extractHorseDataFromImage(imageBase64, mimeType, apiKey, turnstileToken?)` — add an
  optional `turnstileToken` parameter (last, optional, so other callers are unaffected).
- **Proxy path** (when `OCR_PROXY_URL` is set **and** a `turnstileToken` is present):
  construct the client with the token header —
  ```ts
  const ai = new GoogleGenAI({
    apiKey: 'proxy',
    httpOptions: { baseUrl: proxyBaseUrl(), headers: { 'X-Turnstile-Token': turnstileToken } },
  });
  ```
  (`HttpOptions.headers` is supported by `@google/genai` v2.10.0 — verified in
  `dist/genai.d.ts`.)
- If `OCR_PROXY_URL` is set but **no** token is available, skip the proxy attempt and go
  straight to the user-key path (a tokenless proxy call would just 403). Preserve the
  existing user-facing "enter your key" messaging when there's also no user key.
- Add a build define `CC_TURNSTILE_SITEKEY` (public sitekey) alongside the existing
  `CC_OCR_PROXY`, surfaced as an exported `TURNSTILE_SITEKEY` constant for the modal.

### 3. Turnstile helper + the two OCR modals

There are **two** OCR modals, both calling `extractHorseDataFromImage`:
`components/OCRModal.tsx` (v1/shared) and `umalator-global/v2/ocr-modal.tsx` (v2).
To stay DRY, the Turnstile widget logic lives in a **shared helper**, not duplicated
per modal.

**`components/turnstile.ts` (new):**
- Exposes `TURNSTILE_SITEKEY` (from the `CC_TURNSTILE_SITEKEY` define) and an async
  `getTurnstileToken(): Promise<string | undefined>`.
- Lazy-loads the Turnstile script (`…/api.js?render=explicit`) once; renders a single
  hidden widget in **execute** mode (Managed appearance — invisible unless a challenge
  is needed, in which case Turnstile shows its own centered overlay).
- Each call does `turnstile.reset()` + `turnstile.execute()` and resolves with the fresh
  single-use token via the success callback; resolves `undefined` on error/expiry/timeout
  (30s) or when `TURNSTILE_SITEKEY` is unset. Never throws.

**Both modals' extract handlers:**
- Call `const token = await getTurnstileToken();` and pass it as the new 4th arg to
  `extractHorseDataFromImage(base64, mimeType, apiKey.trim(), token)`.
- `undefined` token (helper failed / not configured) → proxy skipped → user-key fallback.
  Do not hard-block the UI on Turnstile.
- Align v1 `components/OCRModal.tsx`'s pre-extract gate to v2's proxy-aware form
  (`if (!OCR_PROXY_URL && !apiKey.trim())`) so the keyless proxy path is reachable there
  too (v2 already does this).

### 4. Build wiring

- `umalator-global/build.mjs` (esbuild, both v1 and v2 define blocks): add
  `CC_TURNSTILE_SITEKEY: JSON.stringify(process.env.TURNSTILE_SITEKEY || '')`.
- `umalator-global/v2/vite.config.ts`: add the same define from `loadEnv`/`process.env`.
- `umalator-global/v2/.env.local` + `.env.example`: add `TURNSTILE_SITEKEY=...`
  (`.env.local` gets the real value; `.env.example` a placeholder).

## Out of scope (operator / dashboard steps — documented, not coded)

These are prerequisites the operator performs in the Cloudflare dashboard:

1. Create a **Turnstile widget** (Managed) for hostnames `umalator.app`,
   `dev.umalator.app`, `localhost` → yields a **sitekey** and **secret**.
2. Set the Pages build env var `TURNSTILE_SITEKEY` to the sitekey (and add it to
   `.env.local` for local builds).
3. `cd uma-tools-worker && npx wrangler secret put TURNSTILE_SECRET` with the secret.
4. Local dev may use Cloudflare's always-pass test pair (sitekey `1x00000000000000000000AA`,
   secret `1x0000000000000000000000000000000AA`).

Also out of scope: gating the Discord `/` feedback route; a per-IP rate-limit rule
(can be added later in the dashboard as a backstop).

## Edge cases & error handling

1. **No token + no user key** → existing "OCR server unavailable / enter your key" error.
2. **Token expired before submit** → `expired-callback` resets the widget; if the user
   submits during the gap, the worker 403s → user-key fallback.
3. **`TURNSTILE_SECRET` unset on the worker** → `503` (fail closed), not a silent allow.
4. **Origin spoofing** → Origin gate is a cheap filter, not the primary defense;
   Turnstile is what actually stops automated callers. Both must pass.
5. **Turnstile script blocked by an ad/privacy blocker** → no token → user-key fallback;
   message the user clearly if they also lack a key.
6. **Multiple extractions in one modal session** → reset after each call so every
   request carries a fresh, unused token.

## Verification

No automated harness for the browser/live-API path (matches repo pattern). Verify by:

1. **Worker (dummy Turnstile pair):** `wrangler dev` (or deploy) with
   `TURNSTILE_SECRET` = the always-pass test secret. `curl` the proxy path:
   - allowed Origin + valid dummy token → forwards (200 / upstream error).
   - missing/empty `X-Turnstile-Token` → `403`.
   - foreign `Origin` (e.g. `https://evil.example`) → `403`.
   - `OPTIONS` preflight → CORS headers include `X-Turnstile-Token` and echo the allowed Origin.
2. **Builds:** `cd umalator-global && node build.mjs` (v1 esbuild) and
   `cd umalator-global/v2 && npx vite build` (v2) succeed with `CC_TURNSTILE_SITEKEY`
   defined; no resolution errors.
3. **Manual OCR smoke (dev preview):** real screenshot through **both** modals (v1
   `components/OCRModal.tsx`, v2 `umalator-global/v2/ocr-modal.tsx`) — Managed widget
   passes invisibly, OCR populates. Then force the fallback (block the token) and confirm
   the user-key path still works.
4. Existing `uma-skill-tools` tests still pass (unaffected sanity check).
