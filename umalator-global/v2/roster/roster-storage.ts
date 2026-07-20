/**
 * localStorage persistence for the roster. Namespaced to v2 — we deliberately do NOT
 * share kachi's `umas_tab_roster` key.
 */
import { DecodedUma, saveRoster, loadRoster } from './roster-decoder';

const STORAGE_KEY = 'v2_umas_roster';

export async function readRosterFromStorage(): Promise<DecodedUma[]> {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return [];
		return await loadRoster(stored);
	} catch {
		// Corrupt or undecodable payload — treat as empty rather than breaking the tab.
		return [];
	}
}

export async function writeRosterToStorage(
	umas: DecodedUma[]
): Promise<{ ok: true } | { ok: false; reason: string }> {
	try {
		localStorage.setItem(STORAGE_KEY, await saveRoster(umas));
		return { ok: true };
	} catch (e) {
		// Most likely QuotaExceededError on a large roster. The caller keeps the roster
		// in memory for the session and warns.
		return { ok: false, reason: e instanceof Error ? e.message : String(e) };
	}
}

export function clearRosterStorage(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		/* nothing useful to do */
	}
}
