#!/usr/bin/env -S npx ts-node --transpile-only --project test/tsconfig.json
/**
 * Create Compare Fixture
 *
 * Generates a fixture file with expected simulation results.
 * Used to create baseline data for regression testing.
 *
 * Usage:
 *   npx ts-node --transpile-only --project test/tsconfig.json \
 *     test/regression/create-compare-fixture.ts \
 *     uma-skill-tools/tools/nige.json uma-skill-tools/tools/senkou.json \
 *     test/regression/fixtures/compare/nige-senkou-kyoto.fixture.json \
 *     -c 10810 --seed 12345
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { program, Option } from 'commander';
import { runV2Comparison, TestCase, HorseConfig } from '../v1-v2-parity/v2-adapter';

// ============================================
// CLI SETUP
// ============================================

program
	.argument('<horse1>', 'path to JSON file for first horse')
	.argument('<horse2>', 'path to JSON file for second horse')
	.argument('<output>', 'output fixture filename')
	.requiredOption('-c, --course <id>', 'course ID')
	.addOption(new Option('-g, --ground <condition>', 'ground condition')
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
	.addOption(new Option('-N, --nsamples <N>', 'number of samples')
		.default(200)
		.argParser(x => parseInt(x, 10))
	)
	.option('--seed <seed>', 'RNG seed', (value, _) => parseInt(value, 10) >>> 0)
	.option('--name <name>', 'fixture name');

program.parse();
const opts = program.opts();

// ============================================
// HELPERS
// ============================================

function loadHorseConfig(filePath: string): HorseConfig {
	const resolved = path.resolve(filePath);
	if (!fs.existsSync(resolved)) {
		throw new Error(`Horse file not found: ${resolved}`);
	}
	const content = fs.readFileSync(resolved, 'utf8');
	return JSON.parse(content);
}

function getGitCommit(): string {
	try {
		return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
	} catch {
		return 'unknown';
	}
}

function getToday(): string {
	return new Date().toISOString().slice(0, 10);
}

// ============================================
// MAIN
// ============================================

function main() {
	const horse1Path = program.args[0];
	const horse2Path = program.args[1];
	const outputPath = program.args[2];

	// Load horse configs
	const horse1 = loadHorseConfig(horse1Path);
	const horse2 = loadHorseConfig(horse2Path);

	// Generate seed if not provided
	const seed = opts.seed ?? Math.floor(Math.random() * (0xFFFFFFFF >>> 0));

	// Build test case
	const testCase: TestCase = {
		horse1,
		horse2,
		courseId: opts.course,
		ground: opts.ground,
		weather: opts.weather,
		season: opts.season,
		time: opts.time,
		nsamples: opts.nsamples,
		seed
	};

	// Run simulation
	console.log('Running simulation...');
	const result = runV2Comparison(testCase);

	// Build fixture
	const fixtureName = opts.name ||
		`${path.basename(horse1Path, '.json')} vs ${path.basename(horse2Path, '.json')} on ${opts.course}`;

	const fixture = {
		meta: {
			name: fixtureName,
			createdAt: getToday(),
			gitCommit: getGitCommit()
		},
		input: {
			horse1,
			horse2,
			courseId: opts.course,
			ground: opts.ground,
			weather: opts.weather,
			season: opts.season,
			time: opts.time,
			nsamples: opts.nsamples,
			seed
		},
		expected: {
			min: result.min,
			max: result.max,
			mean: result.mean,
			median: result.median,
			bashin: result.bashin
		}
	};

	// Ensure output directory exists
	const outputDir = path.dirname(outputPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Write fixture
	fs.writeFileSync(outputPath, JSON.stringify(fixture, null, 2));

	console.log(`\nFixture created: ${outputPath}`);
	console.log(`  Name: ${fixture.meta.name}`);
	console.log(`  Samples: ${opts.nsamples}`);
	console.log(`  Seed: ${seed}`);
	console.log(`  Results: min=${result.min.toFixed(2)}, max=${result.max.toFixed(2)}, mean=${result.mean.toFixed(2)}, median=${result.median.toFixed(2)}`);
}

main();
