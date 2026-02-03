/**
 * V2 Storage Utilities
 * Save/load horse configurations to localStorage and JSON export/import
 */

import { UmaState, defaultUmaState } from './uma-panel';
import umas from '../umas.json'; // Use global version for English names
import skilldata from '../skill_data.json'; // Use Global version

// LocalStorage keys
const HORSE_SLOTS_KEY = 'umalator_v2_horse_slots';
const SESSION_KEY = 'umalator_v2_session';
const PREFERENCES_KEY = 'umalator_v2_prefs';

// ============================================
// VALIDATION
// ============================================

const VALID_STRATEGIES = ['Nige', 'Senkou', 'Sasi', 'Oikomi', 'Oonige'];
const VALID_APTITUDES = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

/**
 * Validate and parse JSON into UmaState
 */
export function validateAndParseUmaJson(json: any): UmaState | null {
	if (!json || typeof json !== 'object') return null;

	// Check required numeric fields
	const numericFields = ['speed', 'stamina', 'power', 'guts', 'wisdom', 'mood'];
	for (const field of numericFields) {
		if (typeof json[field] !== 'number') return null;
	}

	// Check required string fields
	const stringFields = ['strategy', 'distanceAptitude', 'surfaceAptitude', 'strategyAptitude'];
	for (const field of stringFields) {
		if (typeof json[field] !== 'string') return null;
	}

	// Validate strategy
	if (!VALID_STRATEGIES.includes(json.strategy)) return null;

	// Validate aptitudes
	if (!VALID_APTITUDES.includes(json.distanceAptitude)) return null;
	if (!VALID_APTITUDES.includes(json.surfaceAptitude)) return null;
	if (!VALID_APTITUDES.includes(json.strategyAptitude)) return null;

	// Validate mood (-2 to 2)
	if (json.mood < -2 || json.mood > 2) return null;

	// Validate skills is an array
	if (!Array.isArray(json.skills)) return null;

	// Filter valid skill IDs
	const validSkills = json.skills.filter((id: any) => {
		if (typeof id !== 'string') return false;
		const baseId = id.split('-')[0];
		return (skilldata as Record<string, any>)[baseId];
	});

	// Parse forcedSkillPositions - validate it's an object with string values
	let forcedSkillPositions: Record<string, string> = {};
	if (json.forcedSkillPositions && typeof json.forcedSkillPositions === 'object') {
		for (const [skillId, pos] of Object.entries(json.forcedSkillPositions)) {
			if (typeof pos === 'string' && pos.trim()) {
				forcedSkillPositions[skillId] = pos;
			}
		}
	}

	return {
		outfitId: typeof json.outfitId === 'string' ? json.outfitId : '',
		speed: Math.max(1, Math.min(2000, json.speed)),
		stamina: Math.max(1, Math.min(2000, json.stamina)),
		power: Math.max(1, Math.min(2000, json.power)),
		guts: Math.max(1, Math.min(2000, json.guts)),
		wisdom: Math.max(1, Math.min(2000, json.wisdom)),
		strategy: json.strategy,
		distanceAptitude: json.distanceAptitude,
		surfaceAptitude: json.surfaceAptitude,
		strategyAptitude: json.strategyAptitude,
		mood: json.mood,
		skills: validSkills,
		forcedSkillPositions,
	};
}

// ============================================
// LOCALSTORAGE SLOTS
// ============================================

export interface SavedSlot {
	name: string;
	data: UmaState;
	savedAt: number;
	memo?: string;  // User-editable notes
}

/**
 * Get all saved horse slots from localStorage (raw)
 */
export function getHorseSlots(): Record<string, { data: any; savedAt: number; memo?: string }> {
	try {
		const stored = localStorage.getItem(HORSE_SLOTS_KEY);
		return stored ? JSON.parse(stored) : {};
	} catch (e) {
		console.error('Failed to load horse slots:', e);
		return {};
	}
}

/**
 * Get all saved slots as an array with validated data
 */
export function getAllSavedSlots(): SavedSlot[] {
	const slots = getHorseSlots();
	const result: SavedSlot[] = [];

	for (const [name, slot] of Object.entries(slots)) {
		const data = validateAndParseUmaJson(slot.data);
		if (data) {
			result.push({
				name,
				data,
				savedAt: slot.savedAt || 0,
				memo: slot.memo || '',
			});
		}
	}

	// Sort by savedAt descending (most recent first)
	return result.sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Get list of saved slot names
 */
export function getSavedSlotNames(): string[] {
	const slots = getHorseSlots();
	return Object.keys(slots).sort((a, b) => {
		const timeA = slots[a].savedAt || 0;
		const timeB = slots[b].savedAt || 0;
		return timeB - timeA; // Most recent first
	});
}

/**
 * Save a horse to a named slot
 * If memo is not provided, preserves existing memo (for updates)
 */
export function saveHorseSlot(name: string, horse: UmaState, memo?: string): boolean {
	try {
		const slots = getHorseSlots();
		const existingMemo = slots[name]?.memo;

		slots[name] = {
			data: horse,
			savedAt: Date.now(),
			memo: memo !== undefined ? memo : existingMemo || '',
		};
		localStorage.setItem(HORSE_SLOTS_KEY, JSON.stringify(slots));
		return true;
	} catch (e) {
		console.error('Failed to save horse slot:', e);
		return false;
	}
}

/**
 * Load a horse from a named slot
 */
export function loadHorseSlot(name: string): UmaState | null {
	const slots = getHorseSlots();
	if (!slots[name]) return null;
	return validateAndParseUmaJson(slots[name].data);
}

/**
 * Delete a horse slot by name
 */
export function deleteHorseSlot(name: string): boolean {
	try {
		const slots = getHorseSlots();
		delete slots[name];
		localStorage.setItem(HORSE_SLOTS_KEY, JSON.stringify(slots));
		return true;
	} catch (e) {
		console.error('Failed to delete horse slot:', e);
		return false;
	}
}

/**
 * Update the memo for a saved slot
 */
export function updateSlotMemo(name: string, memo: string): boolean {
	try {
		const slots = getHorseSlots();
		if (!slots[name]) return false;

		slots[name].memo = memo;
		localStorage.setItem(HORSE_SLOTS_KEY, JSON.stringify(slots));
		return true;
	} catch (e) {
		console.error('Failed to update slot memo:', e);
		return false;
	}
}

// ============================================
// JSON EXPORT/IMPORT
// ============================================

/**
 * Export horse state as JSON file download
 */
export function downloadHorseJson(horse: UmaState): void {
	const blob = new Blob([JSON.stringify(horse, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;

	// Generate filename from character name
	let name = 'horse';
	if (horse.outfitId) {
		const uma = (umas as any)[horse.outfitId.slice(0, 4)];
		if (uma?.name?.[1]) {
			name = uma.name[1].replace(/\s+/g, '_');
		}
	}
	a.download = `${name}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * Import horse state from JSON file
 * Returns a promise that resolves to the parsed UmaState or null
 */
export function importHorseJson(): Promise<UmaState | null> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json,application/json';

		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) {
				resolve(null);
				return;
			}

			try {
				const text = await file.text();
				const json = JSON.parse(text);
				const parsed = validateAndParseUmaJson(json);
				resolve(parsed);
			} catch (err) {
				console.error('Failed to parse JSON file:', err);
				resolve(null);
			}
		};

		input.oncancel = () => resolve(null);
		input.click();
	});
}

/**
 * Copy horse state to clipboard as JSON
 */
export async function copyHorseToClipboard(horse: UmaState): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(JSON.stringify(horse, null, 2));
		return true;
	} catch (e) {
		console.error('Failed to copy to clipboard:', e);
		return false;
	}
}

/**
 * Paste horse state from clipboard
 */
export async function pasteHorseFromClipboard(): Promise<UmaState | null> {
	try {
		const text = await navigator.clipboard.readText();
		const json = JSON.parse(text);
		return validateAndParseUmaJson(json);
	} catch (e) {
		console.error('Failed to paste from clipboard:', e);
		return null;
	}
}

// ============================================
// SESSION STATE PERSISTENCE
// ============================================

/**
 * Full session state that gets auto-saved
 */
export interface SessionState {
	// Course & conditions
	courseId: number;
	selectedPresetId: number | null;
	ground: number;
	weather: number;
	season: number;
	time: number;
	// Simulation settings
	samples: number;
	mode: 'compare' | 'chart';
	// Uma states
	uma1: UmaState;
	uma2: UmaState;
}

/**
 * Save session state to localStorage
 */
export function saveSession(state: SessionState): boolean {
	try {
		localStorage.setItem(SESSION_KEY, JSON.stringify(state));
		return true;
	} catch (e) {
		console.error('Failed to save session:', e);
		return false;
	}
}

/**
 * Load session state from localStorage
 */
export function loadSession(): SessionState | null {
	try {
		const stored = localStorage.getItem(SESSION_KEY);
		if (!stored) return null;

		const json = JSON.parse(stored);

		// Validate and return with defaults for missing fields
		return {
			courseId: typeof json.courseId === 'number' ? json.courseId : 10506,
			selectedPresetId: json.selectedPresetId ?? null,
			ground: typeof json.ground === 'number' ? json.ground : 1,
			weather: typeof json.weather === 'number' ? json.weather : 1,
			season: typeof json.season === 'number' ? json.season : 4,
			time: typeof json.time === 'number' ? json.time : 2,
			samples: typeof json.samples === 'number' ? json.samples : 500,
			mode: json.mode === 'chart' ? 'chart' : 'compare',
			uma1: validateAndParseUmaJson(json.uma1) || defaultUmaState,
			uma2: validateAndParseUmaJson(json.uma2) || defaultUmaState,
		};
	} catch (e) {
		console.error('Failed to load session:', e);
		return null;
	}
}

/**
 * Clear session state
 */
export function clearSession(): void {
	try {
		localStorage.removeItem(SESSION_KEY);
	} catch (e) {
		console.error('Failed to clear session:', e);
	}
}

// ============================================
// USER PREFERENCES
// ============================================

/**
 * User preferences that persist across sessions
 */
export interface Preferences {
	darkMode: boolean;
	classicGreen: boolean;
	notificationDismissed: boolean;
	tourCompleted: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
	darkMode: true,
	classicGreen: false,
	notificationDismissed: false,
	tourCompleted: false,
};

/**
 * Save user preferences
 */
export function savePreferences(prefs: Partial<Preferences>): boolean {
	try {
		const current = loadPreferences();
		const updated = { ...current, ...prefs };
		localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
		return true;
	} catch (e) {
		console.error('Failed to save preferences:', e);
		return false;
	}
}

/**
 * Load user preferences
 */
export function loadPreferences(): Preferences {
	try {
		const stored = localStorage.getItem(PREFERENCES_KEY);
		if (!stored) return DEFAULT_PREFERENCES;

		const json = JSON.parse(stored);
		return {
			darkMode: typeof json.darkMode === 'boolean' ? json.darkMode : DEFAULT_PREFERENCES.darkMode,
			classicGreen: typeof json.classicGreen === 'boolean' ? json.classicGreen : DEFAULT_PREFERENCES.classicGreen,
			notificationDismissed: typeof json.notificationDismissed === 'boolean' ? json.notificationDismissed : DEFAULT_PREFERENCES.notificationDismissed,
			tourCompleted: typeof json.tourCompleted === 'boolean' ? json.tourCompleted : DEFAULT_PREFERENCES.tourCompleted,
		};
	} catch (e) {
		console.error('Failed to load preferences:', e);
		return DEFAULT_PREFERENCES;
	}
}
