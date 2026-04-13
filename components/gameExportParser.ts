/**
 * Game Export Parser
 * Converts raw Uma Musume game API exports (network traffic captures)
 * into the UmaState JSON format used by the simulator.
 *
 * Game exports contain multiple concatenated JSON request/response objects.
 * The final object with `chara_info` holds the fully-trained uma state.
 */

const APT_MAP: Record<number, string> = {1:'G',2:'F',3:'E',4:'D',5:'C',6:'B',7:'A',8:'S'};
const STRATEGY_MAP: Record<number, string> = {1:'Nige',2:'Senkou',3:'Sasi',4:'Oikomi'};
const STRATEGY_PROPER_KEYS: Record<number, string> = {
	1: 'proper_running_style_nige',
	2: 'proper_running_style_senko',
	3: 'proper_running_style_sashi',
	4: 'proper_running_style_oikomi',
};

/**
 * Detect whether an object is a game API response containing chara_info
 */
function isGameExportResponse(obj: any): boolean {
	return obj && typeof obj === 'object'
		&& obj.chara_info && typeof obj.chara_info === 'object'
		&& typeof obj.chara_info.speed === 'number'
		&& typeof obj.chara_info.wiz === 'number'
		&& Array.isArray(obj.chara_info.skill_array);
}

/**
 * Convert a game API response object (with chara_info) to our JSON import format.
 * Returns a plain object matching the UmaState JSON shape, or null if conversion fails.
 */
export function convertGameExport(obj: any): Record<string, any> | null {
	if (!isGameExportResponse(obj)) return null;

	const ci = obj.chara_info;

	// Strategy
	const strategy = STRATEGY_MAP[ci.race_running_style] || 'Senkou';

	// Surface aptitude (turf)
	const surfaceAptitude = APT_MAP[ci.proper_ground_turf] || 'A';

	// Distance aptitude — pick the highest among all four distances
	const distVals = [
		ci.proper_distance_short || 1,
		ci.proper_distance_mile || 1,
		ci.proper_distance_middle || 1,
		ci.proper_distance_long || 1,
	];
	const distanceAptitude = APT_MAP[Math.max(...distVals)] || 'A';

	// Strategy aptitude — pick the one matching the running style
	const stratKey = STRATEGY_PROPER_KEYS[ci.race_running_style] || 'proper_running_style_senko';
	const strategyAptitude = APT_MAP[ci[stratKey] || 7] || 'A';

	// Mood: game 1-5 → our -2 to 2
	const mood = Math.max(-2, Math.min(2, (ci.motivation || 3) - 3));

	// Skills
	const skills: string[] = [];
	let uniqueLv = 1;
	for (const s of ci.skill_array) {
		skills.push(String(s.skill_id));
		if (s.level > 1) {
			uniqueLv = s.level;
		}
	}

	return {
		outfitId: String(ci.card_id || ''),
		starCount: typeof ci.rarity === 'number' ? ci.rarity : 3,
		uniqueLv,
		speed: ci.speed,
		stamina: ci.stamina,
		power: ci.power,
		guts: ci.guts,
		wisdom: ci.wiz,
		strategy,
		distanceAptitude,
		surfaceAptitude,
		strategyAptitude,
		mood,
		skills,
		forcedSkillPositions: {},
	};
}

/**
 * Try to parse import text, handling both our native JSON format
 * and raw game API export format (concatenated JSON objects).
 * Returns a parsed object in our format, or null if unparseable.
 */
export function tryParseImportText(text: string): any {
	// 1. Try standard JSON.parse
	try {
		const json = JSON.parse(text);
		// If it parses and has chara_info, it's a single game response object
		const converted = convertGameExport(json);
		if (converted) return converted;
		// Otherwise it's presumably our native format
		return json;
	} catch (_) {
		// JSON.parse failed — might be concatenated objects
	}

	// 2. Try wrapping in [...] to parse concatenated comma-separated objects
	try {
		const arr = JSON.parse('[' + text + ']');
		if (!Array.isArray(arr)) return null;

		// Find the LAST object with chara_info (final trained state)
		for (let i = arr.length - 1; i >= 0; i--) {
			const converted = convertGameExport(arr[i]);
			if (converted) return converted;
		}
	} catch (_) {
		// Still can't parse
	}

	return null;
}
