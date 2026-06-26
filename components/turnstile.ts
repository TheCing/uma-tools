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

// Serialize token requests: the single hidden widget + `pending` resolver can only
// service one challenge at a time. Without this, an overlapping call would reset() the
// in-flight challenge and orphan the first promise until its 30s timeout.
let chain: Promise<unknown> = Promise.resolve();

/**
 * Resolve to a fresh single-use Turnstile token, or undefined if Turnstile is
 * unconfigured/unavailable/challenged-out. Never rejects. Calls are serialized.
 */
export function getTurnstileToken(): Promise<string | undefined> {
	const next = chain.then(acquireToken, acquireToken);
	chain = next.catch(() => undefined);
	return next;
}

/**
 * Resolve to a fresh single-use Turnstile token, or undefined if Turnstile is
 * unconfigured/unavailable/challenged-out. Never rejects.
 */
async function acquireToken(): Promise<string | undefined> {
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
