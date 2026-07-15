/**
 * Parses an UmaExtractor `data.json` (the raw game `trained_chara` array) into the same
 * `DecodedUma` shape the bit-packed share code produces, so nothing downstream forks.
 *
 * Why this exists: the share code is a lossy transport. It carries no `create_time` at all
 * (its v4 fixed prefix is exactly V4_MIN_BITS with no room for one), and no `running_style`
 * — so strategy has to be inferred from the best style aptitude, which measured wrong for
 * 54 of 249 umas (22%) on a real roster. This file reads both for real.
 *
 * PRIVACY: this is a WHITELIST. The source record has 51 fields including account
 * identifiers (viewer_id, owner_viewer_id, trained_chara_id, nickname_id) and ~1.8MB of
 * bulk we don't need (race_result_list, succession_chara_array). Only the fields named below
 * are read, so everything else is dropped by construction — including any field a future
 * UmaExtractor version adds. Do not "improve" this into a spread-and-delete.
 */
import { DecodedUma } from './roster-decoder';

/** One record of the raw game trained_chara array, narrowed to what we read. */
interface RawTrainedChara {
	card_id?: unknown;
	create_time?: unknown;
	rank_score?: unknown;
	talent_level?: unknown;
	running_style?: unknown;
	speed?: unknown; stamina?: unknown; power?: unknown; guts?: unknown; wiz?: unknown;
	proper_distance_short?: unknown; proper_distance_mile?: unknown;
	proper_distance_middle?: unknown; proper_distance_long?: unknown;
	proper_ground_turf?: unknown; proper_ground_dirt?: unknown;
	proper_running_style_nige?: unknown; proper_running_style_senko?: unknown;
	proper_running_style_sashi?: unknown; proper_running_style_oikomi?: unknown;
	skill_array?: unknown;
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && isFinite(v) ? v : fallback);
const optNum = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

function readRecord(rawInput: unknown): DecodedUma | null {
	// A null/primitive array element must be skipped, not throw: one malformed record must
	// never abort the whole import. (typeof null === 'object', hence the explicit null check.)
	if (rawInput === null || typeof rawInput !== 'object') return null;
	const raw = rawInput as RawTrainedChara;

	const card_id = optNum(raw.card_id);
	if (card_id === undefined) return null; // not a trained-uma record

	const skills = Array.isArray(raw.skill_array)
		? raw.skill_array.reduce((acc: Array<{ id: number; level: number }>, s: any) => {
			const id = optNum(s?.skill_id);
			if (id !== undefined) acc.push({ id, level: num(s?.level, 1) });
			return acc;
		}, [])
		: [];

	return {
		card_id,
		// Verbatim: "YYYY-MM-DD HH:MM:SS". Never parse it — see the sort comment in roster-filter.
		create_time: optStr(raw.create_time),
		rank_score: optNum(raw.rank_score),
		talent_level: optNum(raw.talent_level),
		running_style: optNum(raw.running_style),
		speed: num(raw.speed),
		stamina: num(raw.stamina),
		power: num(raw.power),
		guts: num(raw.guts),
		wisdom: num(raw.wiz),          // data.json calls it `wiz`
		// Aptitudes are already 1..8 (1=G .. 8=S) — the same encoding DecodedUma uses.
		apt_short: num(raw.proper_distance_short),
		apt_mile: num(raw.proper_distance_mile),
		apt_middle: num(raw.proper_distance_middle),
		apt_long: num(raw.proper_distance_long),
		apt_turf: num(raw.proper_ground_turf),
		apt_dirt: num(raw.proper_ground_dirt),
		apt_nige: num(raw.proper_running_style_nige),
		apt_senko: num(raw.proper_running_style_senko),
		apt_sashi: num(raw.proper_running_style_sashi),
		apt_oikomi: num(raw.proper_running_style_oikomi),
		skills
	};
}

/** Returns [] for anything unusable — callers show one inline error, same as a bad code. */
export function parseRosterJson(text: string): DecodedUma[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	return parsed.reduce((acc: DecodedUma[], raw) => {
		const uma = readRecord(raw);
		if (uma) acc.push(uma);
		return acc;
	}, []);
}
