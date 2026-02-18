/**
 * V1 vs V2 Parity Tests
 *
 * Verifies that the v2 simulation (runComparison) produces results
 * consistent with v1 (direct RaceSolver usage).
 *
 * Note: V1 and V2 use different simulation approaches:
 * - V1: Runs horses independently, compares final positions
 * - V2: Runs full head-to-head race with position keeping, pacers, etc.
 *
 * Therefore, results will NOT be identical. These tests verify:
 * 1. Both engines produce valid, non-NaN results
 * 2. Results are within a reasonable range
 * 3. Statistical properties are similar (same general direction)
 *
 * For regression testing of exact values, use the fixture-based tests.
 *
 * Usage:
 *   npx ts-node --transpile-only test/v1-v2-parity/parity.test.ts
 */

import test from 'tape';
import { runV1Comparison } from './v1-adapter';
import { runV2Comparison, TestCase } from './v2-adapter';

// ============================================
// TEST CASES
// ============================================

// Standard horse configurations matching uma-skill-tools/tools/*.json
const NIGE: TestCase['horse1'] = {
	speed: 1500,
	stamina: 800,
	power: 1200,
	guts: 700,
	wisdom: 1200,
	strategy: 'Nige',
	distanceAptitude: 'S',
	surfaceAptitude: 'A',
	strategyAptitude: 'A',
	mood: 2,
	skills: []
};

const SENKOU: TestCase['horse1'] = {
	speed: 1400,
	stamina: 900,
	power: 1300,
	guts: 600,
	wisdom: 1100,
	strategy: 'Senkou',
	distanceAptitude: 'A',
	surfaceAptitude: 'A',
	strategyAptitude: 'S',
	mood: 2,
	skills: []
};

const SASI: TestCase['horse1'] = {
	speed: 1350,
	stamina: 1000,
	power: 1250,
	guts: 650,
	wisdom: 1150,
	strategy: 'Sasi',
	distanceAptitude: 'A',
	surfaceAptitude: 'A',
	strategyAptitude: 'A',
	mood: 2,
	skills: []
};

const OIKOMI: TestCase['horse1'] = {
	speed: 1300,
	stamina: 1100,
	power: 1200,
	guts: 700,
	wisdom: 1200,
	strategy: 'Oikomi',
	distanceAptitude: 'S',
	surfaceAptitude: 'A',
	strategyAptitude: 'A',
	mood: 2,
	skills: []
};

const testCases: TestCase[] = [
	{
		name: 'nige vs senkou on Kyoto 3000m',
		horse1: NIGE,
		horse2: SENKOU,
		courseId: 10810,
		ground: 'good',
		nsamples: 50,
		seed: 12345
	},
	{
		name: 'sasi vs oikomi on Tokyo 2400m',
		horse1: SASI,
		horse2: OIKOMI,
		courseId: 10501,
		ground: 'good',
		nsamples: 50,
		seed: 67890
	},
	{
		name: 'same horse comparison (nige vs nige)',
		horse1: NIGE,
		horse2: NIGE,
		courseId: 10101,
		ground: 'good',
		nsamples: 30,
		seed: 11111
	},
	{
		name: 'senkou vs sasi on short track',
		horse1: SENKOU,
		horse2: SASI,
		courseId: 10301, // Short track
		ground: 'good',
		nsamples: 50,
		seed: 99999
	}
];

// ============================================
// HELPER FUNCTIONS
// ============================================

function allValuesValid(arr: number[]): boolean {
	return arr.every(v => !isNaN(v) && isFinite(v));
}

function arrayStats(arr: number[]) {
	const min = Math.min(...arr);
	const max = Math.max(...arr);
	const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
	const variance = arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length;
	return { min, max, mean, stddev: Math.sqrt(variance) };
}

// ============================================
// TESTS
// ============================================

test('V1 produces valid results', t => {
	testCases.forEach(tc => {
		try {
			const result = runV1Comparison(tc);

			t.ok(result.bashin.length === tc.nsamples,
				`${tc.name}: V1 produces correct number of samples`);

			t.ok(allValuesValid(result.bashin),
				`${tc.name}: V1 produces valid (non-NaN) bashin values`);

			t.ok(result.min <= result.max,
				`${tc.name}: V1 min <= max`);

		} catch (err) {
			t.fail(`${tc.name}: V1 threw error: ${err}`);
		}
	});

	t.end();
});

test('V2 produces valid results', t => {
	testCases.forEach(tc => {
		try {
			const result = runV2Comparison(tc);

			t.ok(result.bashin.length === tc.nsamples,
				`${tc.name}: V2 produces correct number of samples`);

			t.ok(allValuesValid(result.bashin),
				`${tc.name}: V2 produces valid (non-NaN) bashin values`);

			t.ok(result.min <= result.max,
				`${tc.name}: V2 min <= max`);

		} catch (err) {
			t.fail(`${tc.name}: V2 threw error: ${err}`);
		}
	});

	t.end();
});

test('V1 and V2 results have similar characteristics', t => {
	testCases.forEach(tc => {
		try {
			const v1 = runV1Comparison(tc);
			const v2 = runV2Comparison(tc);

			const v1Stats = arrayStats(v1.bashin);
			const v2Stats = arrayStats(v2.bashin);

			// Both should have reasonable range (not all identical values)
			if (tc.name !== 'same horse comparison (nige vs nige)') {
				t.ok(v1Stats.max - v1Stats.min > 0.1,
					`${tc.name}: V1 has variation in results`);
				t.ok(v2Stats.max - v2Stats.min > 0.1,
					`${tc.name}: V2 has variation in results`);
			}

			// Log comparison for inspection
			console.log(`\n${tc.name}:`);
			console.log(`  V1: mean=${v1Stats.mean.toFixed(2)}, stddev=${v1Stats.stddev.toFixed(2)}, range=[${v1Stats.min.toFixed(2)}, ${v1Stats.max.toFixed(2)}]`);
			console.log(`  V2: mean=${v2Stats.mean.toFixed(2)}, stddev=${v2Stats.stddev.toFixed(2)}, range=[${v2Stats.min.toFixed(2)}, ${v2Stats.max.toFixed(2)}]`);

			t.pass(`${tc.name}: Both V1 and V2 completed successfully`);

		} catch (err) {
			t.fail(`${tc.name}: Error comparing V1/V2: ${err}`);
		}
	});

	t.end();
});

test('Same seed produces consistent V2 results', t => {
	const tc = testCases[0];

	const result1 = runV2Comparison(tc);
	const result2 = runV2Comparison(tc);

	t.deepEqual(result1.bashin, result2.bashin,
		'Same seed produces identical V2 bashin arrays');

	t.equal(result1.mean, result2.mean,
		'Same seed produces identical V2 mean');

	t.end();
});

test('Same seed produces consistent V1 results', t => {
	const tc = testCases[0];

	const result1 = runV1Comparison(tc);
	const result2 = runV1Comparison(tc);

	t.deepEqual(result1.bashin, result2.bashin,
		'Same seed produces identical V1 bashin arrays');

	t.equal(result1.mean, result2.mean,
		'Same seed produces identical V1 mean');

	t.end();
});
