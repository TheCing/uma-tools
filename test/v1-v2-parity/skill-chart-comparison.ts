/**
 * V1 vs V2 Skill Chart Parity Test
 *
 * Compares skill filtering between v1 (umalator/BasinnChart.tsx) and v2 (skill-chart-utils.ts)
 * to verify they produce identical activateable skill lists.
 *
 * Usage:
 *   npx ts-node --transpile-only -r ./test/v1-v2-parity/setup.ts test/v1-v2-parity/skill-chart-comparison.ts
 */

import { Map as ImmMap } from 'immutable';

// Core imports (no JSX dependencies)
import { HorseState, SkillSet } from '../../components/HorseDefTypes';
import { CourseHelpers, CourseData } from '../../uma-skill-tools/CourseData';
import { GroundCondition, Weather, Season, Time, Grade, RaceParameters } from '../../uma-skill-tools/RaceParameters';
import { Region, RegionList } from '../../uma-skill-tools/Region';
import { getParser } from '../../uma-skill-tools/ConditionParser';
import { buildBaseStats, buildSkillData, Perspective } from '../../uma-skill-tools/RaceSolverBuilder';

// V2 imports
import { getActivateableSkills as getActivateableSkillsV2, isGeneralSkill } from '../../umalator-global/v2/skill-chart-utils';
import type { UmaState } from '../../umalator-global/v2/uma-panel';

// Skill data for getting full skill list (use require to avoid type explosion)
const skilldata: Record<string, any> = require('../../umalator-global/skill_data.json');

// ============================================
// V1 getActivateableSkills (extracted from BasinnChart.tsx)
// ============================================

/**
 * Convert HorseState to HorseDesc compatible plain object
 */
function horseStateToDesc(horse: HorseState) {
	return {
		speed: horse.speed,
		stamina: horse.stamina,
		power: horse.power,
		guts: horse.guts,
		wisdom: horse.wisdom,
		strategy: horse.strategy,
		distanceAptitude: horse.distanceAptitude,
		surfaceAptitude: horse.surfaceAptitude,
		strategyAptitude: horse.strategyAptitude,
		mood: horse.mood,
		skills: horse.skills.valueSeq().toArray() as string[]
	};
}

/**
 * V1 implementation of getActivateableSkills
 * Copied from umalator/BasinnChart.tsx lines 89-103
 */
function getActivateableSkillsV1(skills: string[], horse: HorseState, course: CourseData, racedef: RaceParameters): string[] {
	const parser = getParser();
	const horseDesc = horseStateToDesc(horse);
	const h2 = buildBaseStats(horseDesc, horse.mood);
	const wholeCourse = new RegionList();
	wholeCourse.push(new Region(0, course.distance));
	return skills.filter(id => {
		let sd: any;
		try {
			sd = buildSkillData(h2, racedef, course, wholeCourse, parser, id, Perspective.Any);
		} catch (_) {
			return false;
		}
		return sd.some((trigger: any) => trigger.regions.length > 0 && trigger.regions[0].start < 9999);
	});
}

// ============================================
// ORDER RANGE BY STRATEGY (must match v1 exactly)
// ============================================

const ORDER_RANGE_FOR_STRATEGY: Record<string, [number, number]> = {
	'Nige': [1, 1],
	'Senkou': [2, 4],
	'Sasi': [5, 9],
	'Oikomi': [5, 9],
	'Oonige': [1, 1]
};

// ============================================
// TEST CONFIGURATION
// ============================================

interface TestConfig {
	name: string;
	strategy: string;
	courseId: string;
	ground: GroundCondition;
	weather: Weather;
	season: Season;
	time: Time;
}

const TEST_CONFIGS: TestConfig[] = [
	{
		name: 'Front Runner (Nige) - Tokyo 2400m',
		strategy: 'Nige',
		courseId: '10501',
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		season: Season.Winter,
		time: Time.Midday,
	},
	{
		name: 'Pace Chaser (Senkou) - Tokyo 2400m',
		strategy: 'Senkou',
		courseId: '10501',
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		season: Season.Winter,
		time: Time.Midday,
	},
	{
		name: 'Late Surger (Sashi) - Tokyo 2400m',
		strategy: 'Sasi',
		courseId: '10501',
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		season: Season.Winter,
		time: Time.Midday,
	},
	{
		name: 'End Closer (Oikomi) - Tokyo 2400m',
		strategy: 'Oikomi',
		courseId: '10501',
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		season: Season.Winter,
		time: Time.Midday,
	},
	{
		name: 'Pace Chaser (Senkou) - Kyoto 3000m (Long)',
		strategy: 'Senkou',
		courseId: '10810',
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		season: Season.Winter,
		time: Time.Midday,
	},
	{
		name: 'End Closer (Oikomi) - Nakayama 1200m (Sprint)',
		strategy: 'Oikomi',
		courseId: '10503',
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		season: Season.Winter,
		time: Time.Midday,
	},
	{
		name: 'Pace Chaser (Senkou) - Tokyo 1600m (Mile)',
		strategy: 'Senkou',
		courseId: '10611',
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		season: Season.Winter,
		time: Time.Midday,
	},
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create V1 HorseState for testing
 */
function createV1HorseState(strategy: string): HorseState {
	return new HorseState({
		outfitId: '',
		speed: 1200,
		stamina: 1000,
		power: 1000,
		guts: 800,
		wisdom: 1000,
		strategy,
		distanceAptitude: 'A',
		surfaceAptitude: 'A',
		strategyAptitude: 'A',
		mood: 2 as const,
		skills: SkillSet([]),
		forcedSkillPositions: ImmMap({})
	});
}

/**
 * Create V2 UmaState for testing
 */
function createV2UmaState(strategy: string): UmaState {
	return {
		outfitId: '',
		speed: 1200,
		stamina: 1000,
		power: 1000,
		guts: 800,
		wisdom: 1000,
		strategy: strategy as any,
		distanceAptitude: 'A',
		surfaceAptitude: 'A',
		strategyAptitude: 'A',
		mood: 2,
		skills: [],
		forcedSkillPositions: {}
	};
}

/**
 * Build RaceParameters (includes orderRange based on strategy)
 */
function buildRaceParams(config: TestConfig): RaceParameters {
	return {
		mood: 2,
		groundCondition: config.ground,
		weather: config.weather,
		season: config.season,
		time: config.time,
		grade: Grade.G1,
		popularity: 1,
		skillId: '',
		orderRange: ORDER_RANGE_FOR_STRATEGY[config.strategy],
		numUmas: 9
	};
}

/**
 * Get base skill list (general skills only)
 */
function getBaseSkills(): string[] {
	return Object.keys(skilldata).filter(id => isGeneralSkill(id));
}

// ============================================
// COMPARISON LOGIC
// ============================================

interface ComparisonResult {
	passed: boolean;
	v1Count: number;
	v2Count: number;
	onlyInV1: string[];
	onlyInV2: string[];
}

function compareSkillLists(v1Skills: string[], v2Skills: string[]): ComparisonResult {
	const v1Set = new Set(v1Skills);
	const v2Set = new Set(v2Skills);

	const onlyInV1 = v1Skills.filter(id => !v2Set.has(id));
	const onlyInV2 = v2Skills.filter(id => !v1Set.has(id));

	return {
		passed: onlyInV1.length === 0 && onlyInV2.length === 0,
		v1Count: v1Skills.length,
		v2Count: v2Skills.length,
		onlyInV1,
		onlyInV2
	};
}

// ============================================
// TEST RUNNER
// ============================================

async function runSkillFilteringParityTest(config: TestConfig): Promise<ComparisonResult> {
	const course = CourseHelpers.getCourse(parseInt(config.courseId, 10));
	if (!course) {
		throw new Error('Course not found: ' + config.courseId);
	}

	// Get base skills to test
	const baseSkills = getBaseSkills();

	// Create uma states
	const v1Uma = createV1HorseState(config.strategy);
	const v2Uma = createV2UmaState(config.strategy);

	// Build race params (with orderRange)
	const raceParams = buildRaceParams(config);

	// Run V1 filtering
	const v1Skills = getActivateableSkillsV1(baseSkills, v1Uma, course, raceParams);

	// Run V2 filtering
	const v2Skills = getActivateableSkillsV2(baseSkills, v2Uma, course, raceParams);

	return compareSkillLists(v1Skills, v2Skills);
}

// ============================================
// REPORTING
// ============================================

function formatResult(config: TestConfig, result: ComparisonResult): string {
	const lines: string[] = [];
	lines.push('');
	lines.push('-'.repeat(80));
	lines.push('TEST: ' + config.name);
	lines.push('  Strategy: ' + config.strategy + ', Course: ' + config.courseId);
	lines.push('-'.repeat(80));

	if (result.passed) {
		lines.push('PASSED - Both versions return ' + result.v1Count + ' activateable skills');
	} else {
		lines.push('FAILED');
		lines.push('  V1: ' + result.v1Count + ' skills');
		lines.push('  V2: ' + result.v2Count + ' skills');

		if (result.onlyInV1.length > 0) {
			lines.push('  Only in V1 (' + result.onlyInV1.length + '):');
			const toShow = result.onlyInV1.slice(0, 10);
			toShow.forEach(id => {
				lines.push('    - ' + id);
			});
			if (result.onlyInV1.length > 10) {
				lines.push('    ... and ' + (result.onlyInV1.length - 10) + ' more');
			}
		}

		if (result.onlyInV2.length > 0) {
			lines.push('  Only in V2 (' + result.onlyInV2.length + '):');
			const toShow = result.onlyInV2.slice(0, 10);
			toShow.forEach(id => {
				lines.push('    - ' + id);
			});
			if (result.onlyInV2.length > 10) {
				lines.push('    ... and ' + (result.onlyInV2.length - 10) + ' more');
			}
		}
	}

	return lines.join('\n');
}

// ============================================
// MAIN
// ============================================

async function main() {
	console.log('\nV1 vs V2 Skill Chart Filtering Parity Test\n');
	console.log('='.repeat(80));

	let passed = 0;
	let failed = 0;

	for (const config of TEST_CONFIGS) {
		try {
			const result = await runSkillFilteringParityTest(config);
			console.log(formatResult(config, result));

			if (result.passed) {
				passed++;
			} else {
				failed++;
			}
		} catch (error) {
			console.error('\nERROR in ' + config.name + ': ' + error);
			failed++;
		}
	}

	console.log('\n' + '='.repeat(80));
	console.log('SUMMARY');
	console.log('-'.repeat(80));
	console.log('Total: ' + TEST_CONFIGS.length);
	console.log('Passed: ' + passed);
	console.log('Failed: ' + failed);
	console.log('='.repeat(80) + '\n');

	process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
	main().catch(error => {
		console.error('Fatal error:', error);
		process.exit(1);
	});
}

export { runSkillFilteringParityTest, compareSkillLists, TEST_CONFIGS };
