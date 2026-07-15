/** Pure filter/sort over the decoded roster. No UI, no state. */
import { DecodedUma } from './roster-decoder';
import { getCharInfo } from './roster-mapping';
import { calcTotalSP } from './roster-sp';

export type AptKey =
	| 'apt_turf' | 'apt_dirt'
	| 'apt_short' | 'apt_mile' | 'apt_middle' | 'apt_long'
	| 'apt_nige' | 'apt_senko' | 'apt_sashi' | 'apt_oikomi';

export interface FilterState {
	name: string;
	aptMin: Partial<Record<AptKey, number>>;
	skills: number[];
}

export const EMPTY_FILTERS: FilterState = { name: '', aptMin: {}, skills: [] };

export type SortKey = 'sp' | 'time' | 'rating';
export type SortDir = 'asc' | 'desc';
export interface SortState { key: SortKey; dir: SortDir }

export const SORT_LABELS: Record<SortKey, string> = {
	sp: 'Total SP', time: 'Created', rating: 'Rating'
};
export const DEFAULT_SORT: SortState = { key: 'time', dir: 'desc' };

/**
 * Number of active filter CONSTRAINTS, not categories: each aptitude threshold counts
 * separately, so setting turf>=S and dirt>=A counts 2, not 1. Drives the "N filters active"
 * badge in the filter panel.
 */
export function activeFilterCount(f: FilterState): number {
	return (f.name.trim() ? 1 : 0) + Object.keys(f.aptMin).length + (f.skills.length ? 1 : 0);
}

export function filterUmas(all: DecodedUma[], f: FilterState): DecodedUma[] {
	const needle = f.name.trim().toLowerCase();
	return all.filter(uma => {
		if (needle) {
			const { charName, outfitName } = getCharInfo(uma.card_id);
			const haystack = `${charName} ${outfitName}`.toLowerCase();
			if (!haystack.includes(needle)) return false;
		}
		for (const [key, min] of Object.entries(f.aptMin)) {
			if (uma[key as AptKey] < (min as number)) return false;
		}
		if (f.skills.length) {
			const owned = new Set(uma.skills.map(s => s.id));
			// AND semantics: the uma must own every selected skill.
			if (!f.skills.every(id => owned.has(id))) return false;
		}
		return true;
	});
}

function sortValue(uma: DecodedUma, key: SortKey): number {
	switch (key) {
		case 'sp': return calcTotalSP(uma.skills);
		case 'rating': return uma.rank_score ?? 0;
		case 'time': return uma.create_time ? Date.parse(uma.create_time) || 0 : 0;
	}
}

export function sortUmas(all: DecodedUma[], s: SortState): DecodedUma[] {
	const dir = s.dir === 'asc' ? 1 : -1;
	// slice() so callers can sort derived arrays without surprising mutation.
	return all.slice().sort((a, b) => (sortValue(a, s.key) - sortValue(b, s.key)) * dir);
}
