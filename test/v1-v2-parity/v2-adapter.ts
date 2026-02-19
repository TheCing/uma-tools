/**
 * V2 Adapter
 *
 * Wraps runComparison from umalator/compare.ts for parity testing.
 * This adapter converts test case inputs to the format expected by the v2 simulation.
 */

import { Map as ImmMap } from 'immutable';
import { CourseHelpers } from '../../uma-skill-tools/CourseData';
import { GroundCondition, Weather, Season, Time, Grade } from '../../uma-skill-tools/RaceParameters';
import { PosKeepMode } from '../../uma-skill-tools/RaceSolver';
import { HorseState, SkillSet } from '../../components/HorseDefTypes';
import { runComparison } from '../../umalator/compare';

// ============================================
// TYPES
// ============================================

export interface HorseConfig {
	speed: number;
	stamina: number;
	power: number;
	guts: number;
	wisdom: number;
	strategy: string;
	distanceAptitude: string;
	surfaceAptitude: string;
	strategyAptitude: string;
	mood?: number;
	skills?: (string | number)[];
	forcedSkillPositions?: Record<string, number>;
}

export interface TestCase {
	name?: string;
	horse1: HorseConfig;
	horse2: HorseConfig;
	courseId: number | string;
	ground?: string;
	weather?: string;
	season?: string;
	time?: string;
	nsamples: number;
	seed: number;
}

export interface CompareResult {
	bashin: number[];
	min: number;
	max: number;
	mean: number;
	median: number;
	seed: number;
	runData?: {
		medianrun: {
			p: number[][];
			v: number[][];
			hp: number[][];
			t: number[][];
			sk: any[];
		};
	};
}

// ============================================
// ENUM CONVERTERS
// ============================================

function parseGroundCondition(str?: string): GroundCondition {
	switch (str) {
		case 'good': return GroundCondition.Good;
		case 'yielding': return GroundCondition.Yielding;
		case 'soft': return GroundCondition.Soft;
		case 'heavy': return GroundCondition.Heavy;
		default: return GroundCondition.Good;
	}
}

function parseWeather(str?: string): Weather {
	switch (str) {
		case 'sunny': return Weather.Sunny;
		case 'cloudy': return Weather.Cloudy;
		case 'rainy': return Weather.Rainy;
		case 'snowy': return Weather.Snowy;
		default: return Weather.Sunny;
	}
}

function parseSeason(str?: string): Season {
	switch (str) {
		case 'spring': return Season.Spring;
		case 'summer': return Season.Summer;
		case 'autumn': return Season.Autumn;
		case 'winter': return Season.Winter;
		default: return Season.Winter;
	}
}

function parseTime(str?: string): Time {
	switch (str) {
		case 'morning': return Time.Morning;
		case 'midday': return Time.Midday;
		case 'evening': return Time.Evening;
		case 'night': return Time.Night;
		default: return Time.Midday;
	}
}

// ============================================
// CONVERSION
// ============================================

function configToHorseState(config: HorseConfig): HorseState {
	const mood = config.mood ?? 2;
	const skillIds = (config.skills || []).map(s => String(s));

	return new HorseState({
		outfitId: '',
		speed: config.speed,
		stamina: config.stamina,
		power: config.power,
		guts: config.guts,
		wisdom: config.wisdom,
		strategy: config.strategy,
		distanceAptitude: config.distanceAptitude,
		surfaceAptitude: config.surfaceAptitude,
		strategyAptitude: config.strategyAptitude,
		mood: mood as -2 | -1 | 0 | 1 | 2,
		skills: SkillSet(skillIds),
		forcedSkillPositions: ImmMap(config.forcedSkillPositions || {})
	});
}

function calcMedian(arr: number[]): number {
	const mid = Math.floor(arr.length / 2);
	return arr.length % 2 === 0
		? (arr[mid - 1] + arr[mid]) / 2
		: arr[mid];
}

// ============================================
// MAIN ADAPTER
// ============================================

/**
 * Run V2 comparison using runComparison from umalator/compare.ts
 */
export function runV2Comparison(tc: TestCase): CompareResult {
	const course = CourseHelpers.getCourse(String(tc.courseId));
	if (!course) {
		throw new Error(`Course ID ${tc.courseId} not found`);
	}

	const horse1 = configToHorseState(tc.horse1);
	const horse2 = configToHorseState(tc.horse2);

	const racedef = {
		groundCondition: parseGroundCondition(tc.ground),
		weather: parseWeather(tc.weather),
		season: parseSeason(tc.season),
		time: parseTime(tc.time),
		grade: Grade.G1,
		mood: (tc.horse1.mood ?? 2) as -2 | -1 | 0 | 1 | 2,
		popularity: 1,
		skillId: ''
	};

	const simOptions = {
		seed: tc.seed,
		posKeepMode: PosKeepMode.Approximate,
		mode: 'compare',
		syncRng: true,
		skillWisdomCheck: true,
		rushedKakari: true,
		pacemakerCount: 1
	};

	const results = runComparison(
		tc.nsamples,
		course,
		racedef,
		horse1,
		horse2,
		null,
		simOptions
	);

	const bashin = results.results;

	return {
		bashin,
		min: bashin[0],
		max: bashin[bashin.length - 1],
		mean: bashin.reduce((a, b) => a + b, 0) / bashin.length,
		median: calcMedian(bashin),
		seed: tc.seed,
		runData: results.runData
	};
}
