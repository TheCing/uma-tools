/**
 * Roster -> simulator mapping.
 *
 * DecodedUma carries all 10 aptitudes but UmaState stores only 3 (distance/surface/
 * strategy), so a collapse is required. Upstream (kachi-dev app.tsx:1530) collapses with
 * Math.max(), which OVERSTATES aptitude on off-surface/off-distance courses (an A-turf /
 * G-dirt uma loads as surface A on a dirt race) and yields wrong sim numbers. We select
 * the aptitude matching the current course instead.
 *
 * This is a snapshot: changing the course after loading does not re-derive, exactly as
 * for a manually-entered uma.
 */
import { DecodedUma } from './roster-decoder';
import { UmaState, defaultUmaState } from '../uma-panel';
import skilldata from '../../skill_data.json';
import umas from '../../umas.json';
import icons from '../../../icons.json';

export type AptLetter = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/** Subset of course_data.json we need. Surface: Turf=1, Dirt=2. DistanceType: Short=1, Mile=2, Mid=3, Long=4. */
export interface RosterCourse {
	surface: number;
	distanceType: number;
}

// Roster encodes 1=G .. 8=S (v4 reads 3 bits +1 => 1-8; v1/v2 read 4 bits => 0-9).
// Index by the raw value; the duplicated G/S ends clamp v1/v2's wider range.
const APT_LETTERS: readonly AptLetter[] =
	['G', 'G', 'F', 'E', 'D', 'C', 'B', 'A', 'S', 'S'];

export function aptToLetter(v: number): AptLetter {
	return APT_LETTERS[Math.max(0, Math.min(9, v))];
}

type StratKey = 'apt_nige' | 'apt_senko' | 'apt_sashi' | 'apt_oikomi';

const STRATEGIES: ReadonlyArray<{ key: StratKey; strat: 'Nige' | 'Senkou' | 'Sasi' | 'Oikomi' }> = [
	{ key: 'apt_nige',   strat: 'Nige' },
	{ key: 'apt_senko',  strat: 'Senkou' },
	{ key: 'apt_sashi',  strat: 'Sasi' },
	{ key: 'apt_oikomi', strat: 'Oikomi' }
];

// umas.json outfit.strategy: 1=Nige, 2=Senkou, 3=Sashi, 4=Oikomi
const CANONICAL_STRATEGY_KEY: Record<number, StratKey> = {
	1: 'apt_nige', 2: 'apt_senko', 3: 'apt_sashi', 4: 'apt_oikomi'
};

function canonicalStrategyKey(card_id: number): StratKey | null {
	const charId = String(Math.floor(card_id / 100));
	const outfit = (umas as any)[charId]?.outfits?.[String(card_id)];
	return outfit ? (CANONICAL_STRATEGY_KEY[outfit.strategy] ?? null) : null;
}

/**
 * The roster does not record which style the uma actually runs, so use the best strategy
 * aptitude. Upstream's `>=` reduce silently resolves ties to Oikomi (common: all-equal
 * aptitudes); we break ties toward the outfit's canonical strategy from umas.json, else
 * the first best in Nige -> Senkou -> Sasi -> Oikomi order.
 */
export function bestStrategyKey(uma: DecodedUma): StratKey {
	const best = Math.max(uma.apt_nige, uma.apt_senko, uma.apt_sashi, uma.apt_oikomi);
	const tied = STRATEGIES.filter(s => uma[s.key] === best);
	if (tied.length === 1) return tied[0].key;
	const canonical = canonicalStrategyKey(uma.card_id);
	if (canonical && tied.some(s => s.key === canonical)) return canonical;
	return tied[0].key;
}

export function getCharInfo(card_id: number): { charName: string; outfitName: string; iconSrc: string } {
	const charId = String(Math.floor(card_id / 100));
	const outfitId = String(card_id);
	const character = (umas as any)[charId];
	// umas.json name is [jp, en]; v2 is Global so take index 1 and fall back to the raw id.
	const charName = character?.name?.[1] ?? `Unknown (${charId})`;
	const outfitName = character?.outfits?.[outfitId]?.epithet ?? '';
	const iconSrc = (icons as any)[outfitId] ?? (icons as any)[charId]
		?? '/uma-tools/icons/utx_ico_umamusume_00.png';
	return { charName, outfitName, iconSrc };
}

export function decodedUmaToUmaState(uma: DecodedUma, course: RosterCourse): UmaState {
	const surfaceApt = course.surface === 2 ? uma.apt_dirt : uma.apt_turf;
	const distanceApt = [uma.apt_short, uma.apt_mile, uma.apt_middle, uma.apt_long][
		Math.max(0, Math.min(3, course.distanceType - 1))
	];
	const stratKey = bestStrategyKey(uma);
	const strat = STRATEGIES.find(s => s.key === stratKey)!;

	return {
		...defaultUmaState,
		outfitId: String(uma.card_id),
		uniqueLv: uma.talent_level ?? 1,
		speed: uma.speed,
		stamina: uma.stamina,
		power: uma.power,
		guts: uma.guts,
		wisdom: uma.wisdom,
		strategy: strat.strat,
		distanceAptitude: aptToLetter(distanceApt),
		surfaceAptitude: aptToLetter(surfaceApt),
		strategyAptitude: aptToLetter(uma[stratKey]),
		mood: 2,
		// Drop ids Global doesn't know so the sim never sees an unknown skill.
		skills: uma.skills.map(s => String(s.id)).filter(id => id in (skilldata as any)),
		forcedSkillPositions: {}
	};
}

/** Ids in the roster that our Global data doesn't know — surfaced in the UI, not hidden. */
export function unknownSkillCount(uma: DecodedUma): number {
	return uma.skills.filter(s => !(String(s.id) in (skilldata as any))).length;
}
