/**
 * Simulation Utilities for V2
 * Converts V2 UmaState and race parameters to worker-compatible format
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { Grade, GroundCondition, Weather, Season, Time } from '../../uma-skill-tools/RaceParameters';
import { PosKeepMode } from '../../uma-skill-tools/RaceSolver';
import skillmeta from '../skill_meta.json';
import type { UmaState } from './uma-panel';

// Re-export enums for convenience
export { Grade, GroundCondition, Weather, Season, Time, PosKeepMode };

/**
 * Check if a skill is a debuff skill (can have multiple copies)
 */
function isDebuffSkill(id: string): boolean {
	const meta = skillmeta[id];
	return meta?.iconId?.[0] === '3';
}

/**
 * Convert skill array to groupId-keyed object format expected by worker
 * V2 stores skills as string[] (array of skill IDs)
 * Worker expects {groupId: skillId, ...} object
 */
export function skillArrayToObject(skillIds: string[]): Record<string, string> {
	let debuffCount = 0;
	const result: Record<string, string> = {};

	for (const id of skillIds) {
		const meta = skillmeta[id];
		if (!meta) continue;

		const groupId = meta.groupId;
		if (isDebuffSkill(id)) {
			// Debuff skills can have multiple copies, key them uniquely
			result[`${groupId}-${debuffCount}`] = id;
			debuffCount++;
		} else {
			result[groupId] = id;
		}
	}

	return result;
}

/**
 * Convert forced skill positions from Record<string, string> to Record<string, number>
 * V2 stores positions as strings (from input fields)
 * Worker expects numbers
 */
export function convertForcedPositions(positions: Record<string, string>): Record<string, number> {
	const result: Record<string, number> = {};
	for (const [skillId, posStr] of Object.entries(positions)) {
		const pos = parseFloat(posStr);
		if (!isNaN(pos) && pos > 0) {
			result[skillId] = pos;
		}
	}
	return result;
}

/**
 * Convert V2 UmaState to worker-compatible format
 */
export function convertUmaStateForWorker(uma: UmaState) {
	return {
		outfitId: uma.outfitId,
		speed: uma.speed,
		stamina: uma.stamina,
		power: uma.power,
		guts: uma.guts,
		wisdom: uma.wisdom,
		strategy: uma.strategy,
		distanceAptitude: uma.distanceAptitude,
		surfaceAptitude: uma.surfaceAptitude,
		strategyAptitude: uma.strategyAptitude,
		mood: uma.mood,
		// Convert skills array to groupId-keyed object
		skills: skillArrayToObject(uma.skills),
		// Convert position strings to numbers
		forcedSkillPositions: convertForcedPositions(uma.forcedSkillPositions)
	};
}

/**
 * Order range by strategy - determines expected race position for each running style
 * Used for filtering skills with order conditions (e.g., order<=2 only makes sense for Front runners)
 */
const ORDER_RANGE_FOR_STRATEGY: Record<string, [number, number]> = {
	'Nige': [1, 1],      // Front runners expected in 1st
	'Senkou': [2, 4],    // Stalkers expected in 2nd-4th
	'Sasi': [5, 9],      // Betweeners expected in 5th-9th
	'Oikomi': [5, 9],    // Stretch Runners expected in 5th-9th
	'Oonige': [1, 1]     // Breakaway Front expected in 1st
};

/**
 * Build RaceParameters from V2 state values
 * @param strategy - Optional strategy string to set orderRange for skill filtering
 */
export function buildRaceParameters(
	ground: number,
	weather: number,
	season: number,
	time: number,
	strategy?: string
) {
	return {
		mood: 2 as const, // Standard mood for race params
		groundCondition: ground as GroundCondition,
		weather: weather as Weather,
		season: season as Season,
		time: time as Time,
		grade: Grade.G1,
		popularity: 1,
		skillId: '',
		orderRange: strategy ? ORDER_RANGE_FOR_STRATEGY[strategy] : null,
		numUmas: 9
	};
}

/**
 * Simulation options configuration
 */
export interface DuelingRates {
	runaway: number;       // % chance an Oonige uma engages in dueling
	frontRunner: number;   // % chance a Nige uma duels (solver excludes them anyway — kept for completeness)
	paceChaser: number;    // % chance a Senkou uma duels
	lateSurger: number;    // % chance a Sashi uma duels
	endCloser: number;     // % chance an Oikomi uma duels
}

export interface SimulationOptions {
	seed: number;
	syncRng: boolean;
	skillWisdomCheck: boolean;
	rushedKakari: boolean;
	leadCompetition: boolean;
	competeFight: boolean;
	duelingRates?: DuelingRates;
	laneMovement: boolean;
}

/**
 * Build simulation options object
 */
export function buildSimulationOptions(options: Partial<SimulationOptions> = {}) {
	return {
		seed: options.seed ?? Math.floor(Math.random() * 0xFFFFFFFF),
		posKeepMode: PosKeepMode.Approximate,
		pacemakerCount: 1,
		syncRng: options.syncRng ?? true,
		skillWisdomCheck: options.skillWisdomCheck ?? true,
		rushedKakari: options.rushedKakari ?? true,
		leadCompetition: options.leadCompetition ?? false,
		competeFight: options.competeFight ?? false,
		duelingRates: options.duelingRates,
		laneMovement: options.laneMovement ?? true,
	};
}

/**
 * Default pacer state - must match v1's HorseState defaults
 */
export function getDefaultPacer() {
	return {
		outfitId: '',
		speed: 1200,
		stamina: 1200,
		power: 800,
		guts: 400,
		wisdom: 400,
		strategy: 'Nige',
		distanceAptitude: 'S',
		surfaceAptitude: 'A',
		strategyAptitude: 'A',
		mood: 2,
		skills: {},
		forcedSkillPositions: {}
	};
}
