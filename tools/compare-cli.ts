#!/usr/bin/env -S npx ts-node --transpile-only
/**
 * Compare CLI Tool
 *
 * Runs race comparison simulations from the command line.
 * Uses the same runComparison logic as the v2 web UI.
 *
 * Usage:
 *   npx ts-node tools/compare-cli.ts horse1.json horse2.json -c 10810
 *   npx ts-node tools/compare-cli.ts uma-skill-tools/tools/nige.json uma-skill-tools/tools/senkou.json -c 10810 --seed 12345
 */

import * as fs from 'fs';
import * as path from 'path';
import { program, Option } from 'commander';
import { Map as ImmMap } from 'immutable';

import { CourseHelpers } from '../uma-skill-tools/CourseData';
import { GroundCondition, Weather, Season, Time, Grade } from '../uma-skill-tools/RaceParameters';
import { PosKeepMode } from '../uma-skill-tools/RaceSolver';
import { HorseState, SkillSet } from '../components/HorseDefTypes';
import { runComparison } from '../umalator/compare';

// ============================================
// CLI SETUP
// ============================================

program
	.argument('<horse1>', 'path to JSON file for first horse')
	.argument('<horse2>', 'path to JSON file for second horse')
	.requiredOption('-c, --course <id>', 'course ID (e.g., 10810 for Kyoto 3000m)')
	.addOption(new Option('-m, --mood <mood>', 'mood modifier')
		.choices(['-2', '-1', '0', '+1', '+2'])
		.default(2)
		.argParser(x => parseInt(x, 10))
	)
	.addOption(new Option('-g, --ground <condition>', 'ground/track condition')
		.choices(['good', 'yielding', 'soft', 'heavy'])
		.default('good')
	)
	.addOption(new Option('-w, --weather <weather>', 'weather')
		.choices(['sunny', 'cloudy', 'rainy', 'snowy'])
		.default('sunny')
	)
	.addOption(new Option('-s, --season <season>', 'season')
		.choices(['spring', 'summer', 'autumn', 'winter'])
		.default('winter')
	)
	.addOption(new Option('-t, --time <time>', 'time of day')
		.choices(['morning', 'midday', 'evening', 'night'])
		.default('midday')
	)
	.addOption(new Option('-N, --nsamples <N>', 'number of simulation samples')
		.default(500)
		.argParser(x => parseInt(x, 10))
	)
	.option('--seed <seed>', 'RNG seed for reproducibility', (value, _) => parseInt(value, 10) >>> 0)
	.addOption(new Option('--thresholds <cutoffs>', 'comma-separated threshold values to report')
		.default([0.5, 1.0, 1.5, 2.0, 2.5])
		.argParser(t => t.split(',').map(parseFloat))
	)
	.addOption(new Option('--pos-keep <mode>', 'position keep mode')
		.choices(['none', 'approximate', 'virtual'])
		.default('approximate')
	)
	.option('--dump', 'output raw JSON instead of formatted summary')
	.option('--verbose', 'show detailed output including per-uma stats')
	.option('--downhill', 'show downhill mode activation details from median run');

program.parse();
const opts = program.opts();

// ============================================
// ENUM CONVERTERS
// ============================================

function parseGroundCondition(str: string): GroundCondition {
	switch (str) {
		case 'good': return GroundCondition.Good;
		case 'yielding': return GroundCondition.Yielding;
		case 'soft': return GroundCondition.Soft;
		case 'heavy': return GroundCondition.Heavy;
		default: return GroundCondition.Good;
	}
}

function parseWeather(str: string): Weather {
	switch (str) {
		case 'sunny': return Weather.Sunny;
		case 'cloudy': return Weather.Cloudy;
		case 'rainy': return Weather.Rainy;
		case 'snowy': return Weather.Snowy;
		default: return Weather.Sunny;
	}
}

function parseSeason(str: string): Season {
	switch (str) {
		case 'spring': return Season.Spring;
		case 'summer': return Season.Summer;
		case 'autumn': return Season.Autumn;
		case 'winter': return Season.Winter;
		default: return Season.Winter;
	}
}

function parseTime(str: string): Time {
	switch (str) {
		case 'morning': return Time.Morning;
		case 'midday': return Time.Midday;
		case 'evening': return Time.Evening;
		case 'night': return Time.Night;
		default: return Time.Midday;
	}
}

function parsePosKeepMode(str: string): PosKeepMode {
	switch (str) {
		case 'none': return PosKeepMode.None;
		case 'approximate': return PosKeepMode.Approximate;
		case 'virtual': return PosKeepMode.Virtual;
		default: return PosKeepMode.Approximate;
	}
}

// ============================================
// HORSE LOADING
// ============================================

interface HorseConfig {
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
	outfitId?: string;
}

function loadHorseConfig(filePath: string): HorseConfig {
	const resolved = path.resolve(filePath);
	if (!fs.existsSync(resolved)) {
		throw new Error(`Horse file not found: ${resolved}`);
	}
	const content = fs.readFileSync(resolved, 'utf8');
	return JSON.parse(content);
}

function configToHorseState(config: HorseConfig, moodOverride?: number): HorseState {
	const mood = moodOverride ?? config.mood ?? 2;
	const skillIds = (config.skills || []).map(s => String(s));

	return new HorseState({
		outfitId: config.outfitId || '',
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

// ============================================
// MAIN
// ============================================

function main() {
	// Load course
	const course = CourseHelpers.getCourse(opts.course);
	if (!course) {
		console.error(`Error: Course ID ${opts.course} not found`);
		process.exit(1);
	}

	// Load horses
	const config1 = loadHorseConfig(program.args[0]);
	const config2 = loadHorseConfig(program.args[1]);

	const horse1 = configToHorseState(config1, opts.mood);
	const horse2 = configToHorseState(config2, opts.mood);

	// Build race parameters
	const racedef = {
		groundCondition: parseGroundCondition(opts.ground),
		weather: parseWeather(opts.weather),
		season: parseSeason(opts.season),
		time: parseTime(opts.time),
		grade: Grade.G1,
		mood: opts.mood as -2 | -1 | 0 | 1 | 2,
		popularity: 1,
		skillId: ''
	};

	// Build simulation options
	const seed = opts.seed ?? Math.floor(Math.random() * (0xFFFFFFFF >>> 0));
	const simOptions = {
		seed,
		posKeepMode: parsePosKeepMode(opts.posKeep),
		mode: 'compare',
		syncRng: true,
		skillWisdomCheck: true,
		rushedKakari: true,
		pacemakerCount: 1
	};

	// Run comparison
	const results = runComparison(
		opts.nsamples,
		course,
		racedef,
		horse1,
		horse2,
		null, // pacer
		simOptions
	);

	// Output results
	if (opts.dump) {
		// JSON dump mode
		console.log(JSON.stringify({
			bashin: results.results,
			min: results.results[0],
			max: results.results[results.results.length - 1],
			mean: results.results.reduce((a, b) => a + b, 0) / results.results.length,
			median: calcMedian(results.results),
			seed,
			nsamples: opts.nsamples,
			courseId: opts.course
		}));
		process.exit(0);
	}

	// Formatted output
	const bashin = results.results;
	const min = bashin[0];
	const max = bashin[bashin.length - 1];
	const mean = bashin.reduce((a, b) => a + b, 0) / bashin.length;
	const median = calcMedian(bashin);

	console.log(`min:\t${min.toFixed(2)}`);
	console.log(`max:\t${max.toFixed(2)}`);
	console.log(`median:\t${median.toFixed(2)}`);
	console.log(`mean:\t${mean.toFixed(2)}`);

	if (opts.thresholds.length > 0) {
		console.log('');
		opts.thresholds.forEach((n: number) => {
			const count = bashin.filter((b: number) => b >= n).length;
			const pct = (count / bashin.length * 100).toFixed(2);
			console.log(`≥${n.toFixed(2)} | ${pct}%`);
		});
	}

	console.log('');
	console.log(`seed: ${seed >>> 0}`);

	if (opts.verbose) {
		console.log('');
		console.log('--- Uma 1 ---');
		console.log(`Full spurt rate: ${results.staminaStats.uma1.fullSpurtRate.toFixed(1)}%`);
		console.log(`HP survival: ${results.staminaStats.uma1.staminaSurvivalRate.toFixed(1)}%`);
		console.log(`First place rate: ${results.firstUmaStats.uma1.firstPlaceRate.toFixed(1)}%`);

		console.log('');
		console.log('--- Uma 2 ---');
		console.log(`Full spurt rate: ${results.staminaStats.uma2.fullSpurtRate.toFixed(1)}%`);
		console.log(`HP survival: ${results.staminaStats.uma2.staminaSurvivalRate.toFixed(1)}%`);
		console.log(`First place rate: ${results.firstUmaStats.uma2.firstPlaceRate.toFixed(1)}%`);

		if (results.runData?.allruns) {
			const allruns = results.runData.allruns;
			if (allruns.rushed) {
				console.log('');
				console.log('--- Race Mechanics ---');
				if (allruns.rushed[0].frequency > 0 || allruns.rushed[1].frequency > 0) {
					console.log(`Uma 1 rushed: ${allruns.rushed[0].frequency.toFixed(1)}% (avg ${allruns.rushed[0].mean?.toFixed(0) || 0}m)`);
					console.log(`Uma 2 rushed: ${allruns.rushed[1].frequency.toFixed(1)}% (avg ${allruns.rushed[1].mean?.toFixed(0) || 0}m)`);
				}
			}
		}
	}

	// Downhill mode activation details
	if (opts.downhill && results.runData?.medianrun) {
		const medianrun = results.runData.medianrun;
		const downhillSlopes = (course.slopes || []).filter((s: any) => s.slope < 0);
		const totalDownhillDist = downhillSlopes.reduce((sum: number, s: any) => sum + s.length, 0);

		console.log('');
		console.log('--- Downhill Mode (Median Run) ---');
		console.log(`Course distance: ${course.distance}m`);
		console.log(`Downhill sections: ${downhillSlopes.map((s: any) => `${s.start}-${s.start + s.length}m (${s.length}m)`).join(', ') || 'none'}`);
		console.log(`Total downhill distance: ${totalDownhillDist}m (${(totalDownhillDist / course.distance * 100).toFixed(1)}% of course)`);

		for (let i = 0; i < 2; i++) {
			const activations = medianrun.downhillActivations?.[i] || [];
			const totalActive = activations.reduce((sum: number, [start, end]: [number, number]) => sum + (end - start), 0);

			console.log('');
			console.log(`Uma ${i + 1} downhill mode:`);
			console.log(`  Activations: ${activations.length}`);
			if (activations.length > 0) {
				console.log(`  Regions: ${activations.map(([s, e]: [number, number]) => `${s.toFixed(0)}-${e.toFixed(0)}m (${(e - s).toFixed(0)}m)`).join(', ')}`);
				console.log(`  Total active: ${totalActive.toFixed(0)}m (${(totalActive / totalDownhillDist * 100).toFixed(1)}% of downhill)`);
			}
		}
	}
}

function calcMedian(arr: number[]): number {
	const mid = Math.floor(arr.length / 2);
	return arr.length % 2 === 0
		? (arr[mid - 1] + arr[mid]) / 2
		: arr[mid];
}

// Run
main();
