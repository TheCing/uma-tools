#!/usr/bin/env -S npx ts-node --transpile-only
/**
 * Real Chart Mode Benchmark
 *
 * Actually runs chart mode simulations to measure real wall-clock time.
 * Compares different sampling strategies (kachi 3-round vs v2 2-round).
 *
 * Usage:
 *   npx ts-node tools/chart-benchmark-real.ts -c 10810 --skills 50
 *   npx ts-node tools/chart-benchmark-real.ts -c 10501 --skills 100 --strategy all
 */

import { performance } from 'perf_hooks';
import { program, Option } from 'commander';
import { Map as ImmMap } from 'immutable';

import { CourseHelpers, CourseData } from '../uma-skill-tools/CourseData';
import { GroundCondition, Weather, Season, Time, Grade, RaceParameters } from '../uma-skill-tools/RaceParameters';
import { PosKeepMode } from '../uma-skill-tools/RaceSolver';
import { HorseState, SkillSet } from '../components/HorseDefTypes';
import { runComparison } from '../umalator/compare';
import { getActivateableSkills, isGeneralSkill } from '../umalator-global/v2/skill-chart-utils';

// Skill data
const skilldata: Record<string, any> = require('../umalator-global/skill_data.json');
const skillmeta: Record<string, any> = require('../skill_meta.json');

// ============================================
// CLI SETUP
// ============================================

program
	.addOption(new Option('-c, --course <id>', 'course ID')
		.default('10810')
	)
	.addOption(new Option('--skills <count>', 'number of skills to test')
		.default(50)
		.argParser(x => parseInt(x, 10))
	)
	.addOption(new Option('--strategy <type>', 'strategy to benchmark')
		.choices(['kachi', 'v2-current', 'v2-variance', 'v2-turbo', 'all'])
		.default('all')
	)
	.option('--seed <seed>', 'RNG seed', (value, _) => parseInt(value, 10) >>> 0)
	.option('--verbose', 'show per-round details');

program.parse();
const opts = program.opts();

// ============================================
// TEST UMA SETUP
// ============================================

function createTestUma(strategy: string = 'Senkou'): HorseState {
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

function createRaceParams(): RaceParameters {
	return {
		mood: 2,
		groundCondition: GroundCondition.Good,
		weather: Weather.Sunny,
		season: Season.Winter,
		time: Time.Midday,
		grade: Grade.G1,
		popularity: 1,
		skillId: '',
		orderRange: [2, 4] as [number, number],
		numUmas: 9
	};
}

// ============================================
// CHART RESULT TYPE
// ============================================

interface ChartResult {
	id: string;
	min: number;
	max: number;
	mean: number;
	median: number;
	sampleCount: number;
}

// ============================================
// SAMPLING STRATEGIES
// ============================================

function runSingleSkillTest(
	skillId: string,
	nsamples: number,
	course: CourseData,
	racedef: RaceParameters,
	baseUma: HorseState,
	seed: number
): { bashin: number[]; timeMs: number } {
	// Create uma with this skill
	const groupId = skillmeta[skillId]?.groupId;
	const withSkill = baseUma.set('skills', SkillSet([skillId]));

	const simOptions = {
		seed,
		posKeepMode: PosKeepMode.Approximate,
		mode: 'chart',
		syncRng: true,
		skillWisdomCheck: false,
		rushedKakari: false,
		pacemakerCount: 1
	};

	const start = performance.now();
	const results = runComparison(nsamples, course, racedef, baseUma, withSkill, null, simOptions);
	const elapsed = performance.now() - start;

	return { bashin: results.results, timeMs: elapsed };
}

function calcStats(bashin: number[]): { min: number; max: number; mean: number; median: number } {
	const sorted = [...bashin].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return {
		min: sorted[0],
		max: sorted[sorted.length - 1],
		mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
		median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
	};
}

/**
 * Kachi 3-round strategy: 25 → filter → 50 → filter → 125
 */
function runKachiStrategy(
	skills: string[],
	course: CourseData,
	racedef: RaceParameters,
	baseUma: HorseState,
	seed: number,
	verbose: boolean
): { results: Map<string, ChartResult>; totalTimeMs: number; totalSamples: number } {
	const results = new Map<string, ChartResult>();
	let totalTimeMs = 0;
	let totalSamples = 0;
	let activeSkills = [...skills];

	// Round 1: 25 samples per skill
	if (verbose) console.log(`  Round 1: ${activeSkills.length} skills × 25 samples`);
	const round1Start = performance.now();
	for (const skillId of activeSkills) {
		const { bashin, timeMs } = runSingleSkillTest(skillId, 25, course, racedef, baseUma, seed);
		totalTimeMs += timeMs;
		totalSamples += 25;
		const stats = calcStats(bashin);
		results.set(skillId, { id: skillId, ...stats, sampleCount: 25 });
	}
	if (verbose) console.log(`    Time: ${(performance.now() - round1Start).toFixed(0)}ms`);

	// Filter: max > 0.1L
	activeSkills = activeSkills.filter(id => {
		const r = results.get(id);
		return r && r.max > 0.1;
	});
	if (verbose) console.log(`  After max filter: ${activeSkills.length} skills`);

	// Round 2: 50 samples for filtered skills
	if (verbose) console.log(`  Round 2: ${activeSkills.length} skills × 50 samples`);
	const round2Start = performance.now();
	for (const skillId of activeSkills) {
		const { bashin, timeMs } = runSingleSkillTest(skillId, 50, course, racedef, baseUma, seed);
		totalTimeMs += timeMs;
		totalSamples += 50;
		const existing = results.get(skillId)!;
		const stats = calcStats(bashin);
		results.set(skillId, {
			id: skillId,
			min: Math.min(existing.min, stats.min),
			max: Math.max(existing.max, stats.max),
			mean: (existing.mean * 25 + stats.mean * 50) / 75,
			median: stats.median, // Use latest
			sampleCount: 75
		});
	}
	if (verbose) console.log(`    Time: ${(performance.now() - round2Start).toFixed(0)}ms`);

	// Filter: variance > 0.1L
	activeSkills = activeSkills.filter(id => {
		const r = results.get(id);
		return r && Math.abs(r.max - r.min) > 0.1;
	});
	if (verbose) console.log(`  After variance filter: ${activeSkills.length} skills`);

	// Round 3: 125 samples for remaining skills
	if (verbose) console.log(`  Round 3: ${activeSkills.length} skills × 125 samples`);
	const round3Start = performance.now();
	for (const skillId of activeSkills) {
		const { bashin, timeMs } = runSingleSkillTest(skillId, 125, course, racedef, baseUma, seed);
		totalTimeMs += timeMs;
		totalSamples += 125;
		const existing = results.get(skillId)!;
		const stats = calcStats(bashin);
		results.set(skillId, {
			id: skillId,
			min: Math.min(existing.min, stats.min),
			max: Math.max(existing.max, stats.max),
			mean: (existing.mean * 75 + stats.mean * 125) / 200,
			median: stats.median,
			sampleCount: 200
		});
	}
	if (verbose) console.log(`    Time: ${(performance.now() - round3Start).toFixed(0)}ms`);

	return { results, totalTimeMs, totalSamples };
}

/**
 * V2 Current: 75 → filter → 125
 */
function runV2CurrentStrategy(
	skills: string[],
	course: CourseData,
	racedef: RaceParameters,
	baseUma: HorseState,
	seed: number,
	verbose: boolean
): { results: Map<string, ChartResult>; totalTimeMs: number; totalSamples: number } {
	const results = new Map<string, ChartResult>();
	let totalTimeMs = 0;
	let totalSamples = 0;
	let activeSkills = [...skills];

	// Round 1: 75 samples per skill
	if (verbose) console.log(`  Round 1: ${activeSkills.length} skills × 75 samples`);
	const round1Start = performance.now();
	for (const skillId of activeSkills) {
		const { bashin, timeMs } = runSingleSkillTest(skillId, 75, course, racedef, baseUma, seed);
		totalTimeMs += timeMs;
		totalSamples += 75;
		const stats = calcStats(bashin);
		results.set(skillId, { id: skillId, ...stats, sampleCount: 75 });
	}
	if (verbose) console.log(`    Time: ${(performance.now() - round1Start).toFixed(0)}ms`);

	// Filter: max > 0.1L AND variance > 0.1L
	activeSkills = activeSkills.filter(id => {
		const r = results.get(id);
		return r && r.max > 0.1 && Math.abs(r.max - r.min) > 0.1;
	});
	if (verbose) console.log(`  After combined filter: ${activeSkills.length} skills`);

	// Round 2: 125 samples for filtered skills
	if (verbose) console.log(`  Round 2: ${activeSkills.length} skills × 125 samples`);
	const round2Start = performance.now();
	for (const skillId of activeSkills) {
		const { bashin, timeMs } = runSingleSkillTest(skillId, 125, course, racedef, baseUma, seed);
		totalTimeMs += timeMs;
		totalSamples += 125;
		const existing = results.get(skillId)!;
		const stats = calcStats(bashin);
		results.set(skillId, {
			id: skillId,
			min: Math.min(existing.min, stats.min),
			max: Math.max(existing.max, stats.max),
			mean: (existing.mean * 75 + stats.mean * 125) / 200,
			median: stats.median,
			sampleCount: 200
		});
	}
	if (verbose) console.log(`    Time: ${(performance.now() - round2Start).toFixed(0)}ms`);

	return { results, totalTimeMs, totalSamples };
}

/**
 * V2 Variance: 25 → combined filter → 175
 */
function runV2VarianceStrategy(
	skills: string[],
	course: CourseData,
	racedef: RaceParameters,
	baseUma: HorseState,
	seed: number,
	verbose: boolean
): { results: Map<string, ChartResult>; totalTimeMs: number; totalSamples: number } {
	const results = new Map<string, ChartResult>();
	let totalTimeMs = 0;
	let totalSamples = 0;
	let activeSkills = [...skills];

	// Round 1: 25 samples per skill (same as kachi)
	if (verbose) console.log(`  Round 1: ${activeSkills.length} skills × 25 samples`);
	const round1Start = performance.now();
	for (const skillId of activeSkills) {
		const { bashin, timeMs } = runSingleSkillTest(skillId, 25, course, racedef, baseUma, seed);
		totalTimeMs += timeMs;
		totalSamples += 25;
		const stats = calcStats(bashin);
		results.set(skillId, { id: skillId, ...stats, sampleCount: 25 });
	}
	if (verbose) console.log(`    Time: ${(performance.now() - round1Start).toFixed(0)}ms`);

	// Combined filter: max > 0.1L AND variance > 0.1L (same net result as kachi)
	activeSkills = activeSkills.filter(id => {
		const r = results.get(id);
		return r && r.max > 0.1 && Math.abs(r.max - r.min) > 0.1;
	});
	if (verbose) console.log(`  After combined filter: ${activeSkills.length} skills`);

	// Round 2: 175 samples for filtered skills (total 200)
	if (verbose) console.log(`  Round 2: ${activeSkills.length} skills × 175 samples`);
	const round2Start = performance.now();
	for (const skillId of activeSkills) {
		const { bashin, timeMs } = runSingleSkillTest(skillId, 175, course, racedef, baseUma, seed);
		totalTimeMs += timeMs;
		totalSamples += 175;
		const existing = results.get(skillId)!;
		const stats = calcStats(bashin);
		results.set(skillId, {
			id: skillId,
			min: Math.min(existing.min, stats.min),
			max: Math.max(existing.max, stats.max),
			mean: (existing.mean * 25 + stats.mean * 175) / 200,
			median: stats.median,
			sampleCount: 200
		});
	}
	if (verbose) console.log(`    Time: ${(performance.now() - round2Start).toFixed(0)}ms`);

	return { results, totalTimeMs, totalSamples };
}

/**
 * V2 Turbo: single round with 50 samples (fastest, lower accuracy)
 */
function runV2TurboStrategy(
	skills: string[],
	course: CourseData,
	racedef: RaceParameters,
	baseUma: HorseState,
	seed: number,
	verbose: boolean
): { results: Map<string, ChartResult>; totalTimeMs: number; totalSamples: number } {
	const results = new Map<string, ChartResult>();
	let totalTimeMs = 0;
	let totalSamples = 0;

	// Single round: 50 samples per skill
	if (verbose) console.log(`  Round 1: ${skills.length} skills × 50 samples`);
	const round1Start = performance.now();
	for (const skillId of skills) {
		const { bashin, timeMs } = runSingleSkillTest(skillId, 50, course, racedef, baseUma, seed);
		totalTimeMs += timeMs;
		totalSamples += 50;
		const stats = calcStats(bashin);
		results.set(skillId, { id: skillId, ...stats, sampleCount: 50 });
	}
	if (verbose) console.log(`    Time: ${(performance.now() - round1Start).toFixed(0)}ms`);

	return { results, totalTimeMs, totalSamples };
}

// ============================================
// MAIN
// ============================================

async function main() {
	const courseId = parseInt(opts.course, 10);
	const course = CourseHelpers.getCourse(courseId);
	if (!course) {
		console.error(`Error: Course ID ${opts.course} not found`);
		process.exit(1);
	}

	const baseUma = createTestUma();
	const racedef = createRaceParams();
	const seed = opts.seed ?? Math.floor(Math.random() * 0xFFFFFFFF);

	// Get activateable skills
	const allSkills = Object.keys(skilldata).filter(id => isGeneralSkill(id));
	const activateable = getActivateableSkills(allSkills, {
		outfitId: '',
		speed: 1200,
		stamina: 1000,
		power: 1000,
		guts: 800,
		wisdom: 1000,
		strategy: 'Senkou',
		distanceAptitude: 'A',
		surfaceAptitude: 'A',
		strategyAptitude: 'A',
		mood: 2,
		skills: [],
		forcedSkillPositions: {}
	}, course, racedef);

	// Limit skills for testing
	const testSkills = activateable.slice(0, opts.skills);

	console.log('Real Chart Mode Benchmark');
	console.log('=========================');
	console.log(`Course: ${courseId} (${course.distance}m)`);
	console.log(`Skills to test: ${testSkills.length} (of ${activateable.length} activateable)`);
	console.log(`Seed: ${seed}`);
	console.log('');

	const strategies = opts.strategy === 'all'
		? ['kachi', 'v2-current', 'v2-variance', 'v2-turbo']
		: [opts.strategy];

	interface StrategyResult {
		name: string;
		totalTimeMs: number;
		totalSamples: number;
		results: Map<string, ChartResult>;
	}

	const strategyResults: StrategyResult[] = [];

	for (const strategy of strategies) {
		console.log(`\n--- ${strategy} ---`);
		let result: { results: Map<string, ChartResult>; totalTimeMs: number; totalSamples: number };

		switch (strategy) {
			case 'kachi':
				result = runKachiStrategy(testSkills, course, racedef, baseUma, seed, opts.verbose);
				break;
			case 'v2-current':
				result = runV2CurrentStrategy(testSkills, course, racedef, baseUma, seed, opts.verbose);
				break;
			case 'v2-variance':
				result = runV2VarianceStrategy(testSkills, course, racedef, baseUma, seed, opts.verbose);
				break;
			case 'v2-turbo':
				result = runV2TurboStrategy(testSkills, course, racedef, baseUma, seed, opts.verbose);
				break;
			default:
				console.error(`Unknown strategy: ${strategy}`);
				continue;
		}

		strategyResults.push({ name: strategy, ...result });
		console.log(`  Total time: ${result.totalTimeMs.toFixed(0)}ms`);
		console.log(`  Total samples: ${result.totalSamples.toLocaleString()}`);
	}

	// Comparison
	if (strategyResults.length > 1) {
		console.log('\n=== Comparison ===');
		const baseline = strategyResults.find(s => s.name === 'kachi') || strategyResults[0];
		console.log(`Baseline: ${baseline.name} (${baseline.totalTimeMs.toFixed(0)}ms)`);
		console.log('');

		for (const result of strategyResults) {
			if (result.name === baseline.name) continue;
			const ratio = baseline.totalTimeMs / result.totalTimeMs;
			const sampleRatio = baseline.totalSamples / result.totalSamples;
			console.log(`${result.name}:`);
			console.log(`  Speed: ${ratio.toFixed(2)}x ${ratio > 1 ? 'faster' : 'slower'}`);
			console.log(`  Samples: ${sampleRatio.toFixed(2)}x ${sampleRatio > 1 ? 'fewer' : 'more'}`);
		}
	}
}

main().catch(err => {
	console.error('Error:', err);
	process.exit(1);
});
