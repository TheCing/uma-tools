#!/usr/bin/env -S npx ts-node --transpile-only --project test/tsconfig.json
/**
 * Compare Regression Tests
 *
 * Verifies that simulation results match expected values from fixture files.
 * Run this after making changes to ensure no regressions were introduced.
 *
 * Usage:
 *   npx ts-node --transpile-only --project test/tsconfig.json test/regression/compare-regression.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import test from 'tape';
import { runV2Comparison, TestCase, CompareResult } from '../v1-v2-parity/v2-adapter';

// ============================================
// TYPES
// ============================================

interface Fixture {
	meta: {
		name: string;
		createdAt: string;
		gitCommit: string;
	};
	input: TestCase;
	expected: {
		min: number;
		max: number;
		mean: number;
		median: number;
		bashin: number[];
	};
}

// ============================================
// CONFIGURATION
// ============================================

const EPSILON = 1e-10; // Tolerance for floating-point comparisons
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'compare');

// ============================================
// HELPERS
// ============================================

function almostEqual(a: number, b: number, epsilon: number = EPSILON): boolean {
	if (a === b) return true;
	return Math.abs(a - b) < Math.max(epsilon * (Math.abs(a) + Math.abs(b)), Number.EPSILON);
}

function loadFixtures(): Fixture[] {
	if (!fs.existsSync(FIXTURE_DIR)) {
		console.log(`No fixtures directory found at ${FIXTURE_DIR}`);
		return [];
	}

	const files = fs.readdirSync(FIXTURE_DIR)
		.filter(f => f.endsWith('.fixture.json'));

	if (files.length === 0) {
		console.log('No fixture files found. Run create-compare-fixture.ts to create some.');
		return [];
	}

	return files.map(f => {
		const content = fs.readFileSync(path.join(FIXTURE_DIR, f), 'utf8');
		return JSON.parse(content) as Fixture;
	});
}

// ============================================
// TESTS
// ============================================

const fixtures = loadFixtures();

if (fixtures.length === 0) {
	test('No fixtures found', t => {
		t.pass('No fixtures to test. Create some with create-compare-fixture.ts');
		t.end();
	});
} else {
	test(`Regression tests (${fixtures.length} fixtures)`, t => {
		const failures: { fixture: string; field: string; expected: number; actual: number }[] = [];

		fixtures.forEach(fixture => {
			const name = fixture.meta.name;

			try {
				// Run simulation with same inputs
				const actual = runV2Comparison(fixture.input);

				// Compare statistics
				if (!almostEqual(actual.min, fixture.expected.min)) {
					failures.push({ fixture: name, field: 'min', expected: fixture.expected.min, actual: actual.min });
				}

				if (!almostEqual(actual.max, fixture.expected.max)) {
					failures.push({ fixture: name, field: 'max', expected: fixture.expected.max, actual: actual.max });
				}

				if (!almostEqual(actual.mean, fixture.expected.mean)) {
					failures.push({ fixture: name, field: 'mean', expected: fixture.expected.mean, actual: actual.mean });
				}

				if (!almostEqual(actual.median, fixture.expected.median)) {
					failures.push({ fixture: name, field: 'median', expected: fixture.expected.median, actual: actual.median });
				}

				// Compare full bashin array
				if (actual.bashin.length !== fixture.expected.bashin.length) {
					t.fail(`${name}: bashin array length mismatch - expected ${fixture.expected.bashin.length}, got ${actual.bashin.length}`);
				} else {
					let bashinMatch = true;
					for (let i = 0; i < actual.bashin.length; i++) {
						if (!almostEqual(actual.bashin[i], fixture.expected.bashin[i])) {
							bashinMatch = false;
							console.log(`  ${name}: bashin[${i}] mismatch - expected ${fixture.expected.bashin[i]}, got ${actual.bashin[i]}`);
							break; // Only report first mismatch
						}
					}

					if (bashinMatch) {
						t.pass(`${name}: bashin array matches`);
					} else {
						t.fail(`${name}: bashin array mismatch`);
					}
				}

				// Report stats comparison
				const statsMatch = almostEqual(actual.min, fixture.expected.min)
					&& almostEqual(actual.max, fixture.expected.max)
					&& almostEqual(actual.mean, fixture.expected.mean)
					&& almostEqual(actual.median, fixture.expected.median);

				if (statsMatch) {
					t.pass(`${name}: statistics match`);
				} else {
					t.fail(`${name}: statistics mismatch`);
				}

			} catch (err) {
				t.fail(`${name}: Error running simulation: ${err}`);
			}
		});

		// Summary
		if (failures.length > 0) {
			console.log('\n--- Failures ---');
			failures.forEach(f => {
				console.log(`  ${f.fixture} [${f.field}]: expected ${f.expected}, got ${f.actual}`);
			});
		}

		t.end();
	});
}

// ============================================
// DETAILED TEST (optional)
// ============================================

if (fixtures.length > 0) {
	test('Detailed bashin comparison', t => {
		fixtures.forEach(fixture => {
			const actual = runV2Comparison(fixture.input);

			// Calculate difference statistics
			if (actual.bashin.length === fixture.expected.bashin.length) {
				const diffs = actual.bashin.map((v, i) => Math.abs(v - fixture.expected.bashin[i]));
				const maxDiff = Math.max(...diffs);
				const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;

				t.ok(maxDiff < EPSILON,
					`${fixture.meta.name}: max bashin difference is ${maxDiff.toExponential(2)}`);

				console.log(`  ${fixture.meta.name}: max diff=${maxDiff.toExponential(2)}, avg diff=${avgDiff.toExponential(2)}`);
			}
		});

		t.end();
	});
}
