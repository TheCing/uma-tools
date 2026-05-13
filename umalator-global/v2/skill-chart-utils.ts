/**
 * Utility functions for Skill Chart mode
 *
 * Ported from umalator/BasinnChart.tsx for v2
 */

import { Region, RegionList } from '../../uma-skill-tools/Region';
import { CourseData } from '../../uma-skill-tools/CourseData';
import { RaceParameters } from '../../uma-skill-tools/RaceParameters';
import { getParser } from '../../uma-skill-tools/ConditionParser';
import { buildBaseStats, buildSkillData, Perspective } from '../../uma-skill-tools/RaceSolverBuilder';
import type { UmaState } from './storage';
import type { SkillChartResult } from './skill-chart-types';

// Import data files
import skilldata from '../skill_data.json';
import skillmeta from '../../skill_meta.json';
import umas from '../../umas.json';
import notInGame from '../not-in-game.json';

/**
 * Check if a skill is a purple (evolved) variant
 */
export function isPurpleSkill(id: string): boolean {
	const iconId = skillmeta[id]?.iconId;
	if (!iconId) return false;
	return iconId[iconId.length - 1] === '4';
}

/**
 * Skill groups sorted by rarity and upgraded/downgraded status
 * Used for SP cost calculation
 */
export const skillGroups = Object.keys(skilldata).sort((a, b) =>
	// Sort by:
	//   - rarity (lowest to highest: white → gold → pink)
	//   - if rarity is same, sort ○ before ◎ (◎ skills have lower ID than ○ counterparts)
	//   - sort purple versions last (to avoid counting towards total cost)
	isPurpleSkill(a) - isPurpleSkill(b) || skilldata[a].rarity - skilldata[b].rarity || +b - +a
).reduce((groups, id) => {
	const groupId = skillmeta[id]?.groupId;
	if (groupId) {
		if (groups.has(groupId)) {
			groups.get(groupId).push(id);
		} else {
			groups.set(groupId, [id]);
		}
	}
	return groups;
}, new Map<string, string[]>());

/**
 * Scale base SP cost by hint level
 * Hint levels 1-3: 10% reduction per level
 * Hint levels 4-5: 30% + 5% per level above 3
 */
function scaleBaseCost(baseCost: number, hint: number): number {
	return Math.floor(baseCost * (1 - (hint <= 3 ? 0.1 * hint : 0.3 + 0.05 * (hint - 3))));
}

/**
 * Calculate total SP cost for acquiring a skill
 * Considers skill groups, hint levels, and owned skills
 */
export function calculateSkillCost(
	id: string,
	hints: Map<string, number>,
	ownedSkills: Map<string, string>
): number {
	const groupId = skillmeta[id]?.groupId;
	if (!groupId) return 0;

	const group = skillGroups.get(groupId);
	if (!group) return 0;

	const existing = ownedSkills.get(groupId);
	let cost = 0;

	for (let i = 0; i < group.length; ++i) {
		// Don't count cost of already-owned skill in same group
		if (group[i] !== existing) {
			const hint = hints.get(group[i]) || 0;
			cost += scaleBaseCost(skillmeta[group[i]].baseCost, hint);
		}
		// Stop when we reach the target skill
		if (group[i] === id) {
			break;
		}
	}

	return cost;
}

/**
 * Get uma outfit ID for a character-specific skill (unique or inherited)
 * Returns null if skill is not character-specific or uma doesn't exist
 *
 * Skill ID patterns:
 * - Unique: 100XXX (e.g., 100681 → uma 1068, outfit 106801)
 * - Inherited: 90XXX or 9XXXX (e.g., 900681 → uma 1068)
 */
export function umaForUniqueSkill(skillId: string): string | null {
	const sid = parseInt(skillId);

	// Handle inherited skills (9xxxxx pattern)
	if (skillId[0] === '9' && skillId.length >= 6) {
		// Extract uma ID: 90XXX → uma 10XX, 9XXXX → uma 1XXX
		// Pattern: 9 + (uma_id - 1000 padded to 4 digits) + variant
		const umaDigits = skillId.slice(1, 5); // e.g., "0068" from "900681"
		const umaId = 1000 + parseInt(umaDigits, 10); // 1000 + 68 = 1068
		const baseUmaId = umaId.toString();

		// Return first outfit for this uma (01 suffix)
		const outfitId = `${baseUmaId}01`;
		if (umas[baseUmaId] && umas[baseUmaId].outfits[outfitId]) {
			return outfitId;
		}
		return null;
	}

	// Handle unique skills (100xxx-199xxx pattern)
	if (sid < 100000 || sid >= 200000) return null;

	const remainder = sid - 100001;
	if (remainder < 0) return null;

	const i = Math.floor(remainder / 10) % 1000;
	const v = Math.floor(remainder / 10 / 1000) + 1;

	const umaId = i.toString().padStart(3, '0');
	const baseUmaId = `1${umaId}`;
	const outfitId = `${baseUmaId}${v.toString().padStart(2, '0')}`;

	if (umas[baseUmaId] && umas[baseUmaId].outfits[outfitId]) {
		return outfitId;
	}

	return null;
}

/**
 * Filter skills to only those that can activate on the given course
 * Uses condition parser to check if skill has valid activation regions
 */
export function getActivateableSkills(
	skills: string[],
	uma: UmaState,
	course: CourseData,
	racedef: RaceParameters
): string[] {
	const parser = getParser();

	// Build base stats for condition checking
	const baseStats = buildBaseStats(
		{
			speed: uma.speed,
			stamina: uma.stamina,
			power: uma.power,
			guts: uma.guts,
			wisdom: uma.wisdom,
			strategy: uma.strategy,
			distanceAptitude: uma.distanceAptitude,
			surfaceAptitude: uma.surfaceAptitude,
			strategyAptitude: uma.strategyAptitude,
			mood: uma.mood
		} as any,
		uma.mood
	);

	// Create region covering entire course
	const wholeCourse = new RegionList();
	wholeCourse.push(new Region(0, course.distance));

	return skills.filter(id => {
		let sd;
		try {
			sd = buildSkillData(baseStats, racedef, course, wholeCourse, parser, id, Perspective.Any);
		} catch (_) {
			return false;
		}
		// Skill is activateable if it has at least one trigger with valid regions
		return sd.some(trigger => trigger.regions.length > 0 && trigger.regions[0].start < 9999);
	});
}

/**
 * List of pink (unique) skills that are universally accessible
 * - Welfare/collaboration event alternate unique inherits
 * - Skills starting with '4' (scenario skills)
 */
const universallyAccessiblePinks = ['92111091' /* welfare kraft alt pink unique inherit */]
	.concat(Object.keys(skilldata).filter(id => id[0] === '4'));

/**
 * Check if a skill is a "general" skill that should be tested in chart mode
 * - Rarity < 3 (white and gold skills)
 * - OR universally accessible pink skills
 */
export function isGeneralSkill(id: string): boolean {
	return skilldata[id]?.rarity < 3 || universallyAccessiblePinks.indexOf(id) > -1;
}

/**
 * Get base list of skills to test in chart mode.
 * Filters to general skills only (no character-specific uniques).
 *
 * When `hideNotInGame` is true, ALSO pre-filters out skills that aren't on
 * the live Global server (per not-in-game.json). This saves chart-mode
 * simulation time on skills that would be filtered from the display anyway —
 * roughly 60% of the previously-tested skills on a typical fast-forward.
 */
export function getBaseSkillsToTest(uma: UmaState, hideNotInGame: boolean = false): string[] {
	const notInGameSet = hideNotInGame ? new Set(notInGame.skills) : null;
	return Object.keys(skilldata).filter(id => {
		if (!isGeneralSkill(id)) return false;
		if (notInGameSet && notInGameSet.has(id)) return false;
		return true;
	});
}

/**
 * Create empty result row for skills that haven't been tested yet
 */
export function getNullRow(skillId: string): SkillChartResult {
	return {
		id: skillId,
		min: 0,
		max: 0,
		mean: 0,
		median: 0,
		results: [],
		runData: null as any
	};
}

/**
 * Calculate statistics from sorted results array
 */
export function calculateStats(results: number[]): {
	min: number;
	max: number;
	mean: number;
	median: number;
} {
	if (results.length === 0) {
		return { min: 0, max: 0, mean: 0, median: 0 };
	}

	const sorted = [...results].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);

	return {
		min: sorted[0],
		max: sorted[sorted.length - 1],
		mean: sorted.reduce((sum, v) => sum + v, 0) / sorted.length,
		median: sorted.length % 2 === 0
			? (sorted[mid - 1] + sorted[mid]) / 2
			: sorted[mid]
	};
}
