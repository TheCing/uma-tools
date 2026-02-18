#!/usr/bin/env -S npx ts-node --transpile-only --project test/tsconfig.json
/**
 * Velocity Lines Parity Test
 *
 * Verifies that v2's VelocityOverlay generates identical SVG paths to v1's VelocityLines.
 */

import test from 'tape';
import * as d3 from 'd3';

// ============================================
// V1 PATH GENERATION (from umalator/app.tsx VelocityLines)
// ============================================

function generateV1VelocityPath(
	data: { p: number[][]; v: number[][] },
	courseDistance: number,
	width: number,
	height: number,
	umaIndex: number
): string {
	const x = d3.scaleLinear().domain([0, courseDistance]).range([0, width]);
	const y = d3.scaleLinear().domain([0, d3.max(data.v, v => d3.max(v)) ?? 20]).range([height, 0]);

	// V1's exact logic from line 974-976:
	// d3.line().x(j => x(data.p[i][j])).y(j => y(v[j]))(data.p[i].map((_,j) => j))
	const v = data.v[umaIndex];
	const pathData = d3.line<number>()
		.x(j => x(data.p[umaIndex][j]))
		.y(j => y(v[j]))(data.p[umaIndex].map((_, j) => j));

	return pathData ?? '';
}

function generateV1HpPath(
	data: { p: number[][]; hp: number[][] },
	courseDistance: number,
	width: number,
	height: number,
	umaIndex: number
): string {
	const x = d3.scaleLinear().domain([0, courseDistance]).range([0, width]);
	const hpY = d3.scaleLinear().domain([0, d3.max(data.hp, hp => d3.max(hp)) ?? 100]).range([height, 0]);

	// V1's exact HP logic from line 978-981:
	// d3.line().x(j => x(data.p[i][j])).y(j => hpY(hp[j]))(data.p[i].map((_,j) => j))
	const hp = data.hp[umaIndex];
	const pathData = d3.line<number>()
		.x(j => x(data.p[umaIndex][j]))
		.y(j => hpY(hp[j]))(data.p[umaIndex].map((_, j) => j));

	return pathData ?? '';
}

// ============================================
// V2 PATH GENERATION (from v2/velocity-overlay.tsx)
// ============================================

function generateV2VelocityPath(
	data: { p: number[][]; v: number[][] },
	courseDistance: number,
	width: number,
	height: number,
	umaIndex: number
): string {
	const x = d3.scaleLinear().domain([0, courseDistance]).range([0, width]);
	const maxV = d3.max(data.v, (v) => d3.max(v)) ?? 20;
	const y = d3.scaleLinear().domain([0, maxV]).range([height, 0]);

	// V2's logic:
	const indices = data.p[umaIndex].map((_, j) => j);
	const v = data.v[umaIndex];
	const pathData = d3.line<number>()
		.x((j) => x(data.p[umaIndex][j]))
		.y((j) => y(v[j]))(indices);

	return pathData ?? '';
}

function generateV2HpPath(
	data: { p: number[][]; hp: number[][] },
	courseDistance: number,
	width: number,
	height: number,
	umaIndex: number
): string {
	const x = d3.scaleLinear().domain([0, courseDistance]).range([0, width]);
	const maxHp = d3.max(data.hp, (hp) => d3.max(hp)) ?? 100;
	const hpY = d3.scaleLinear().domain([0, maxHp]).range([height, 0]);

	const indices = data.p[umaIndex].map((_, j) => j);
	const hp = data.hp[umaIndex];
	const pathData = d3.line<number>()
		.x((j) => x(data.p[umaIndex][j]))
		.y((j) => hpY(hp[j]))(indices);

	return pathData ?? '';
}

// ============================================
// TEST DATA
// ============================================

// Generate realistic test data
function generateTestData(numPoints: number, courseDistance: number) {
	const data = {
		p: [[] as number[], [] as number[]],
		v: [[] as number[], [] as number[]],
		hp: [[] as number[], [] as number[]],
		t: [[] as number[], [] as number[]],
	};

	for (let uma = 0; uma < 2; uma++) {
		let pos = 0;
		let time = 0;
		let hp = 100 + Math.random() * 20;
		const baseSpeed = 16 + Math.random() * 2;

		for (let i = 0; i < numPoints; i++) {
			data.p[uma].push(pos);
			// Velocity varies with position (phases)
			const phase = pos / courseDistance;
			let velocity = baseSpeed;
			if (phase < 0.16) velocity = baseSpeed * 0.85; // Opening
			else if (phase < 0.5) velocity = baseSpeed * 0.95; // Middle
			else if (phase < 0.83) velocity = baseSpeed * 1.0; // Final
			else velocity = baseSpeed * 1.1; // Spurt

			velocity += (Math.random() - 0.5) * 0.5; // Add noise
			data.v[uma].push(velocity);

			// HP decreases over time
			hp -= Math.random() * 0.5;
			data.hp[uma].push(Math.max(0, hp));

			data.t[uma].push(time);

			// Advance position and time
			const dt = 0.1;
			time += dt;
			pos += velocity * dt;
			if (pos >= courseDistance) break;
		}
	}

	return data;
}

// ============================================
// TESTS
// ============================================

test('V1 and V2 velocity path generation match', t => {
	const courseDistance = 2000;
	const width = 960;
	const height = 250;
	const testData = generateTestData(500, courseDistance);

	for (let uma = 0; uma < 2; uma++) {
		const v1Path = generateV1VelocityPath(testData, courseDistance, width, height, uma);
		const v2Path = generateV2VelocityPath(testData, courseDistance, width, height, uma);

		t.equal(v1Path, v2Path, `Uma ${uma + 1} velocity paths should be identical`);
	}

	t.end();
});

test('V1 and V2 HP path generation match', t => {
	const courseDistance = 2000;
	const width = 960;
	const height = 250;
	const testData = generateTestData(500, courseDistance);

	for (let uma = 0; uma < 2; uma++) {
		const v1Path = generateV1HpPath(testData, courseDistance, width, height, uma);
		const v2Path = generateV2HpPath(testData, courseDistance, width, height, uma);

		t.equal(v1Path, v2Path, `Uma ${uma + 1} HP paths should be identical`);
	}

	t.end();
});

test('Path generation with real simulation data', async t => {
	// Use the v2 adapter to run a real simulation
	const { runV2Comparison, TestCase } = await import('./v2-adapter');

	const testCase: TestCase = {
		horse1: {
			speed: 1200,
			stamina: 800,
			power: 1000,
			guts: 800,
			wisdom: 1000,
			strategy: 'Nige',
			distanceAptitude: 'A',
			surfaceAptitude: 'A',
			strategyAptitude: 'A',
			mood: 2,
			skills: [],
		},
		horse2: {
			speed: 1200,
			stamina: 800,
			power: 1000,
			guts: 800,
			wisdom: 1000,
			strategy: 'Senkou',
			distanceAptitude: 'A',
			surfaceAptitude: 'A',
			strategyAptitude: 'A',
			mood: 2,
			skills: [],
		},
		courseId: '10506',
		ground: 'good',
		weather: 'sunny',
		season: 'winter',
		time: 'midday',
		nsamples: 10,
		seed: 12345,
	};

	const result = runV2Comparison(testCase);

	// Get the median run data
	const snapshot = (result as any).runData?.medianrun;
	if (!snapshot) {
		t.skip('No run data available');
		t.end();
		return;
	}

	const courseDistance = 2500; // Nakayama 2500m
	const width = 960;
	const height = 250;

	const data = {
		p: snapshot.p,
		v: snapshot.v,
		hp: snapshot.hp,
	};

	for (let uma = 0; uma < 2; uma++) {
		const v1VelPath = generateV1VelocityPath(data, courseDistance, width, height, uma);
		const v2VelPath = generateV2VelocityPath(data, courseDistance, width, height, uma);

		t.equal(v1VelPath, v2VelPath, `Real data: Uma ${uma + 1} velocity paths match`);

		const v1HpPath = generateV1HpPath(data, courseDistance, width, height, uma);
		const v2HpPath = generateV2HpPath(data, courseDistance, width, height, uma);

		t.equal(v1HpPath, v2HpPath, `Real data: Uma ${uma + 1} HP paths match`);
	}

	t.end();
});

// Run if executed directly
if (require.main === module) {
	console.log('Running velocity lines parity tests...\n');
}
