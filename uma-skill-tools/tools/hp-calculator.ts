/**
 * HP Calculator Utility
 *
 * Estimates HP requirements for achieving full spurt on different courses.
 *
 * Usage:
 *   cd uma-skill-tools && ts-node tools/hp-calculator.ts [courseId] [options]
 *
 * Examples:
 *   ts-node tools/hp-calculator.ts 10914          # Hanshin 3200m
 *   ts-node tools/hp-calculator.ts 10611          # Tokyo Dirt 1600m
 *   ts-node tools/hp-calculator.ts --list         # List common courses
 *   ts-node tools/hp-calculator.ts 10914 --stamina 1200 --guts 1000 --strategy sashi
 *   ts-node tools/hp-calculator.ts 10914 --heal 11 --compare  # Compare strategies with 11% heal
 *   ts-node tools/hp-calculator.ts 10914 --full --skills 200191,200181  # Full sim with 2 heals
 */

import courses from '../data/course_data.json';
import skillnames from '../data/skillnames.json';
import { CourseHelpers } from '../CourseData';
import { RaceSolverBuilder, Perspective } from '../RaceSolverBuilder';
import { GroundCondition, Weather, Season, Time } from '../RaceParameters';
import { PosKeepMode, RaceSolver } from '../RaceSolver';

type Locale = 'jp' | 'gl';

function getSkillName(skillId: string, locale: Locale): string {
	const names = (skillnames as Record<string, string[]>)[skillId];
	if (!names) return skillId;
	// Index 0 = Japanese, Index 1 = English (Global)
	return names[locale === 'jp' ? 0 : 1] || names[0] || skillId;
}

const StrategyLocalization: Record<string, { jp: string; gl: string }> = {
	'nige': { jp: '逃げ', gl: 'Front Runner' },
	'senkou': { jp: '先行', gl: 'Pace Chaser' },
	'sashi': { jp: '差し', gl: 'Late Surger' },
	'oikomi': { jp: '追込', gl: 'End Closer' },
	'oonige': { jp: '大逃げ', gl: 'Runaway' },
};

function getStrategyName(strategy: string, locale: Locale): string {
	const loc = StrategyLocalization[strategy];
	return loc ? loc[locale] : strategy;
}

// Strategy HP Coefficients (from HpPolicy.ts)
const HpStrategyCoefficient: Record<string, number> = {
	'nige': 0.95,
	'senkou': 0.89,
	'sashi': 1.0,
	'oikomi': 0.995,
	'oonige': 0.86,
};

const StrategyNames: Record<number, string> = {
	1: 'nige',
	2: 'senkou',
	3: 'sashi',
	4: 'oikomi',
	5: 'oonige',
};

// Strategy phase speed coefficients (from RaceSolver.ts)
const StrategyPhaseCoefficient: Record<string, number[]> = {
	'nige':    [1.0, 0.98, 0.962, 0.962],
	'senkou':  [0.978, 0.991, 0.975, 0.975],
	'sashi':    [0.938, 0.998, 0.994, 0.994],
	'oikomi':  [0.931, 1.0, 1.0, 1.0],
	'oonige':  [1.0, 0.98, 0.962, 0.962],
};

interface CourseData {
	raceTrackId: number;
	distance: number;
	surface: number;
	distanceType: number;
}

interface HpEstimate {
	courseId: string;
	courseName: string;
	distance: number;
	strategy: string;
	stamina: number;
	guts: number;
	maxHp: number;
	phase01Hp: number;
	phase2Hp: number;
	totalHpNeeded: number;
	hpSurplus: number;
	canFullSpurt: boolean;
	healNeeded: number;
	minStaminaForFullSpurt: number;
}

const trackNames: Record<number, string> = {
	10001: 'Sapporo',
	10002: 'Hakodate',
	10003: 'Fukushima',
	10004: 'Niigata',
	10005: 'Nakayama',
	10006: 'Tokyo',
	10007: 'Chukyo',
	10008: 'Kyoto',
	10009: 'Hanshin',
	10010: 'Kokura',
	10101: 'Oi',
};

function getCourseName(course: CourseData): string {
	const trackName = trackNames[course.raceTrackId] || `Track ${course.raceTrackId}`;
	const surface = course.surface === 1 ? 'Turf' : 'Dirt';
	return `${trackName} ${surface} ${course.distance}m`;
}

function baseSpeed(distance: number): number {
	return 20.0 - (distance - 2000) / 1000.0;
}

function gutsModifier(guts: number): number {
	return 1.0 + 200.0 / Math.sqrt(600.0 * guts);
}

function calcMaxHp(stamina: number, distance: number, strategy: string): number {
	const coef = HpStrategyCoefficient[strategy] || 1.0;
	return 0.8 * coef * stamina + distance;
}

function hpPerSecond(velocity: number, baseSpd: number, gutsMod: number, isPhase2: boolean): number {
	const guts = isPhase2 ? gutsMod : 1.0;
	return 20.0 * Math.pow(velocity - baseSpd + 12.0, 2) / 144.0 * guts;
}

function estimatePhase01Speed(baseSpd: number, strategy: string): number {
	// Average of phase 0 and phase 1 coefficients
	const coefs = StrategyPhaseCoefficient[strategy] || StrategyPhaseCoefficient['sashi'];
	const avgCoef = (coefs[0] + coefs[1]) / 2;
	return baseSpd * avgCoef;
}

function estimateSpurtSpeed(baseSpd: number, speed: number, strategy: string, distanceAptitude: number = 1.0): number {
	// Simplified last spurt speed calculation
	const coefs = StrategyPhaseCoefficient[strategy] || StrategyPhaseCoefficient['sashi'];
	const baseTargetSpeed = baseSpd * coefs[2] + Math.sqrt(500.0 * speed) * distanceAptitude * 0.002;
	const lastSpurt = (baseTargetSpeed + 0.01 * baseSpd) * 1.05 + Math.sqrt(500.0 * speed) * distanceAptitude * 0.002;
	return lastSpurt;
}

function estimateHpNeeded(
	distance: number,
	strategy: string,
	guts: number,
	speed: number = 1200,
	distanceAptitude: number = 1.0
): { phase01: number; phase2: number; total: number } {
	const baseSpd = baseSpeed(distance);
	const gutsMod = gutsModifier(guts);

	// Phase 0+1: first 2/3 of race
	const phase01Distance = distance * (2 / 3);
	const phase01Speed = estimatePhase01Speed(baseSpd, strategy);
	const phase01Time = phase01Distance / phase01Speed;
	const phase01Hp = hpPerSecond(phase01Speed, baseSpd, gutsMod, false) * phase01Time;

	// Phase 2: last 1/3 of race (spurt)
	const phase2Distance = distance * (1 / 3);
	const spurtSpeed = estimateSpurtSpeed(baseSpd, speed, strategy, distanceAptitude);
	const phase2Time = phase2Distance / spurtSpeed;
	const phase2Hp = hpPerSecond(spurtSpeed, baseSpd, gutsMod, true) * phase2Time;

	return {
		phase01: phase01Hp,
		phase2: phase2Hp,
		total: phase01Hp + phase2Hp,
	};
}

function findMinStaminaForFullSpurt(
	distance: number,
	strategy: string,
	guts: number,
	speed: number = 1200,
	healPercent: number = 0
): number {
	const hpNeeded = estimateHpNeeded(distance, strategy, guts, speed);

	// Binary search for minimum stamina
	let low = 100;
	let high = 2000;

	while (high - low > 1) {
		const mid = Math.floor((low + high) / 2);
		const maxHp = calcMaxHp(mid, distance, strategy);
		const effectiveHp = maxHp * (1 + healPercent / 100);

		if (effectiveHp >= hpNeeded.total) {
			high = mid;
		} else {
			low = mid;
		}
	}

	return high;
}

// ============================================================================
// Full Simulation Mode
// ============================================================================

interface FullSimConfig {
	courseId: string;
	strategy: string;
	speed: number;
	guts: number;
	power: number;
	wisdom: number;
	skillIds: string[];
	nsamples: number;
	targetSpurtRate: number;
	locale: Locale;
}

function runFullSimulation(
	stamina: number,
	config: FullSimConfig
): { fullSpurtRate: number; hpDiedRate: number } {
	const course = CourseHelpers.getCourse(parseInt(config.courseId));

	const horseDesc = {
		speed: config.speed,
		stamina: stamina,
		power: config.power,
		guts: config.guts,
		wisdom: config.wisdom,
		strategy: config.strategy,
		distanceAptitude: 'A',
		surfaceAptitude: 'A',
		strategyAptitude: 'A',
		mood: 2 as const,
	};

	const builder = new RaceSolverBuilder(config.nsamples)
		.seed(12345)
		.course(course)
		.ground(GroundCondition.Good)
		.weather(Weather.Sunny)
		.season(Season.Spring)
		.time(Time.Midday)
		.posKeepMode(PosKeepMode.None)
		.mode('compare');  // Need 'compare' mode to enable HP tracking

	builder.horse(horseDesc);

	// Add skills
	config.skillIds.forEach(id => {
		builder.addSkill(id, Perspective.Self);
	});

	const gen = builder.build();
	let fullSpurtCount = 0;
	let hpDiedCount = 0;

	for (let i = 0; i < config.nsamples; i++) {
		const solver = gen.next().value as RaceSolver;
		solver.initUmas([]);

		while (solver.pos < course.distance) {
			solver.step(1/15);
		}
		solver.cleanup();

		if (solver.fullSpurt) {
			fullSpurtCount++;
		}
		if (solver.hpDied) {
			hpDiedCount++;
		}
	}

	return {
		fullSpurtRate: (fullSpurtCount / config.nsamples) * 100,
		hpDiedRate: (hpDiedCount / config.nsamples) * 100,
	};
}

function findMinStaminaFullSim(config: FullSimConfig): { minStamina: number; finalRate: number } {
	console.log(`\nRunning full simulation (${config.nsamples} samples per test)...`);
	const skillDisplay = config.skillIds.length > 0
		? config.skillIds.map(id => getSkillName(id, config.locale)).join(', ')
		: 'none';
	console.log(`Skills: ${skillDisplay}`);
	console.log(`Target: ${config.targetSpurtRate}% full spurt rate\n`);

	let low = 100;
	let high = 2000;
	let lastGoodStamina = high;
	let lastGoodRate = 0;

	// Binary search for minimum stamina
	while (high - low > 10) {
		const mid = Math.floor((low + high) / 2);
		process.stdout.write(`  Testing stamina ${mid}... `);

		const result = runFullSimulation(mid, config);
		console.log(`${result.fullSpurtRate.toFixed(1)}% full spurt`);

		if (result.fullSpurtRate >= config.targetSpurtRate) {
			high = mid;
			lastGoodStamina = mid;
			lastGoodRate = result.fullSpurtRate;
		} else {
			low = mid;
		}
	}

	// Fine-tune with smaller steps
	for (let s = low; s <= high; s += 5) {
		const result = runFullSimulation(s, config);
		if (result.fullSpurtRate >= config.targetSpurtRate) {
			return { minStamina: s, finalRate: result.fullSpurtRate };
		}
	}

	return { minStamina: lastGoodStamina, finalRate: lastGoodRate };
}

function calculateEstimate(
	courseId: string,
	stamina: number,
	guts: number,
	strategy: string,
	speed: number = 1200,
	healPercent: number = 0
): HpEstimate {
	const course = (courses as Record<string, CourseData>)[courseId];
	if (!course) {
		throw new Error(`Course ${courseId} not found`);
	}

	const distance = course.distance;
	const maxHp = calcMaxHp(stamina, distance, strategy);
	const hpNeeded = estimateHpNeeded(distance, strategy, guts, speed);
	const effectiveHp = maxHp * (1 + healPercent / 100);
	const hpSurplus = effectiveHp - hpNeeded.total;
	const canFullSpurt = hpSurplus >= 0;

	// Calculate heal needed if can't full spurt
	const healNeeded = canFullSpurt ? 0 : Math.ceil(((hpNeeded.total - maxHp) / maxHp) * 100 * 10) / 10;

	// Find minimum stamina for full spurt with current heal
	const minStamina = findMinStaminaForFullSpurt(distance, strategy, guts, speed, healPercent);

	return {
		courseId,
		courseName: getCourseName(course),
		distance,
		strategy,
		stamina,
		guts,
		maxHp: Math.round(maxHp),
		phase01Hp: Math.round(hpNeeded.phase01),
		phase2Hp: Math.round(hpNeeded.phase2),
		totalHpNeeded: Math.round(hpNeeded.total),
		hpSurplus: Math.round(hpSurplus),
		canFullSpurt,
		healNeeded,
		minStaminaForFullSpurt: minStamina,
	};
}

function printEstimate(estimate: HpEstimate, healPercent: number = 0, locale: Locale = 'gl'): void {
	console.log('\n' + '='.repeat(60));
	console.log(`HP ESTIMATE: ${estimate.courseName}`);
	console.log('='.repeat(60));
	console.log(`Course ID:     ${estimate.courseId}`);
	console.log(`Distance:      ${estimate.distance}m`);
	console.log(`Strategy:      ${getStrategyName(estimate.strategy, locale)}`);
	console.log(`Stamina:       ${estimate.stamina}`);
	console.log(`Guts:          ${estimate.guts}`);
	if (healPercent > 0) {
		console.log(`Heal:          ${healPercent}%`);
	}
	console.log('-'.repeat(60));
	console.log(`Max HP:        ${estimate.maxHp}`);
	console.log(`Phase 0+1 HP:  ${estimate.phase01Hp} (first 2/3 of race)`);
	console.log(`Phase 2 HP:    ${estimate.phase2Hp} (last 1/3 spurt)`);
	console.log(`Total Needed:  ${estimate.totalHpNeeded}`);
	console.log('-'.repeat(60));
	console.log(`HP Surplus:    ${estimate.hpSurplus >= 0 ? '+' : ''}${estimate.hpSurplus}`);
	console.log(`Full Spurt:    ${estimate.canFullSpurt ? '✓ YES' : '✗ NO'}`);
	if (!estimate.canFullSpurt) {
		console.log(`Heal Needed:   ~${estimate.healNeeded}% to achieve full spurt`);
	}
	console.log(`Min Stamina:   ${estimate.minStaminaForFullSpurt} (for full spurt${healPercent > 0 ? ` with ${healPercent}% heal` : ''})`);
	console.log('='.repeat(60));
}

function listCommonCourses(): void {
	const commonCourses = [
		// Sprint (1000-1400m)
		{ id: '10503', desc: 'Nakayama Turf 1200m (Sprint)' },
		{ id: '10601', desc: 'Tokyo Turf 1400m (Sprint)' },
		// Mile (1401-1800m)
		{ id: '10604', desc: 'Tokyo Turf 1600m (Mile)' },
		{ id: '10611', desc: 'Tokyo Dirt 1600m (Mile)' },
		{ id: '10804', desc: 'Kyoto Turf 1600m (Mile)' },
		// Medium (1801-2400m)
		{ id: '10507', desc: 'Nakayama Turf 2000m (Medium)' },
		{ id: '10606', desc: 'Tokyo Turf 2400m (Medium - Japan Derby)' },
		{ id: '10906', desc: 'Hanshin Turf 2200m (Medium)' },
		// Long (2401m+)
		{ id: '10506', desc: 'Nakayama Turf 2500m (Long - Arima Kinen)' },
		{ id: '10810', desc: 'Kyoto Turf 3000m (Long - Kikka-sho)' },
		{ id: '10914', desc: 'Hanshin Turf 3200m (Long - Tenno-sho Spring)' },
		{ id: '10608', desc: 'Tokyo Turf 3400m (Long)' },
	];

	console.log('\nCommon Course IDs:');
	console.log('-'.repeat(50));
	commonCourses.forEach(c => {
		console.log(`  ${c.id}  ${c.desc}`);
	});
	console.log('\nUsage: npx ts-node tools/hp-calculator.ts <courseId> [options]');
}

function printStrategyComparison(courseId: string, stamina: number, guts: number, speed: number, healPercent: number, locale: Locale = 'gl'): void {
	const strategies = ['nige', 'senkou', 'sashi', 'oikomi', 'oonige'];

	console.log('\n' + '='.repeat(80));
	console.log('STRATEGY COMPARISON');
	console.log('='.repeat(80));
	console.log(`Course: ${courseId} | Stamina: ${stamina} | Guts: ${guts} | Heal: ${healPercent}%`);
	console.log('-'.repeat(80));
	console.log('Strategy       | HP Coef | Max HP | Needed | Surplus | Full Spurt | Min Sta');
	console.log('-'.repeat(80));

	strategies.forEach(strat => {
		const est = calculateEstimate(courseId, stamina, guts, strat, speed, healPercent);
		const coef = HpStrategyCoefficient[strat];
		const stratName = getStrategyName(strat, locale);
		console.log(
			`${stratName.padEnd(14)} | ${coef.toFixed(3)}   | ${est.maxHp.toString().padStart(6)} | ${est.totalHpNeeded.toString().padStart(6)} | ${(est.hpSurplus >= 0 ? '+' : '') + est.hpSurplus.toString().padStart(5)} | ${est.canFullSpurt ? '   ✓    ' : '   ✗    '} | ${est.minStaminaForFullSpurt}`
		);
	});
	console.log('='.repeat(80));
}

// Parse command line arguments
function main(): void {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		console.log(`
HP Calculator - Estimate stamina requirements for full spurt

Usage:
  ts-node tools/hp-calculator.ts <courseId> [options]
  ts-node tools/hp-calculator.ts --list

Options:
  --stamina <n>   Stamina stat (default: 1200)
  --guts <n>      Guts stat (default: 1000)
  --speed <n>     Speed stat (default: 1200)
  --power <n>     Power stat for full sim (default: 1200)
  --wisdom <n>    Wisdom stat for full sim (default: 1200)
  --strategy <s>  Strategy: nige, senkou, sashi, oikomi, oonige (default: sashi)
  --heal <n>      Total heal percentage from skills (default: 0)
  --compare       Compare all strategies
  --list          List common course IDs
  --locale <l>    Locale for skill names: jp or gl (default: gl)

Full Simulation Mode:
  --full          Run actual race simulation (slower but accurate)
  --skills <ids>  Comma-separated skill IDs (e.g., 200191,200181)
  --nsamples <n>  Samples per stamina test (default: 100)
  --target <n>    Target full spurt rate % (default: 100)

Examples:
  ts-node tools/hp-calculator.ts 10914
  ts-node tools/hp-calculator.ts 10914 --stamina 1400 --strategy oikomi
  ts-node tools/hp-calculator.ts 10914 --heal 5.5 --compare
  ts-node tools/hp-calculator.ts 10914 --full --skills 200191,200181
  ts-node tools/hp-calculator.ts 10914 --full --nsamples 200 --target 95
		`);
		return;
	}

	if (args.includes('--list')) {
		listCommonCourses();
		return;
	}

	const courseId = args[0];
	let stamina = 1200;
	let guts = 1000;
	let speed = 1200;
	let power = 1200;
	let wisdom = 1200;
	let strategy = 'sashi';
	let healPercent = 0;
	let compare = false;
	let fullSim = false;
	let skillIds: string[] = [];
	let nsamples = 100;
	let targetSpurtRate = 100;
	let locale: Locale = 'gl';

	for (let i = 1; i < args.length; i++) {
		switch (args[i]) {
			case '--stamina':
				stamina = parseInt(args[++i], 10);
				break;
			case '--guts':
				guts = parseInt(args[++i], 10);
				break;
			case '--speed':
				speed = parseInt(args[++i], 10);
				break;
			case '--power':
				power = parseInt(args[++i], 10);
				break;
			case '--wisdom':
				wisdom = parseInt(args[++i], 10);
				break;
			case '--strategy':
				strategy = args[++i].toLowerCase();
				break;
			case '--heal':
				healPercent = parseFloat(args[++i]);
				break;
			case '--compare':
				compare = true;
				break;
			case '--full':
				fullSim = true;
				break;
			case '--skills':
				skillIds = args[++i].split(',').map(s => s.trim()).filter(s => s.length > 0);
				break;
			case '--nsamples':
				nsamples = parseInt(args[++i], 10);
				break;
			case '--target':
				targetSpurtRate = parseFloat(args[++i]);
				break;
			case '--locale':
				const loc = args[++i]?.toLowerCase();
				if (loc === 'jp' || loc === 'gl') {
					locale = loc;
				} else {
					console.error(`Error: Invalid locale "${loc}". Use 'jp' or 'gl'.`);
					process.exit(1);
				}
				break;
		}
	}

	if (!(courseId in courses)) {
		console.error(`Error: Course ${courseId} not found`);
		console.log('Use --list to see common course IDs');
		process.exit(1);
	}

	if (!(strategy in HpStrategyCoefficient)) {
		console.error(`Error: Unknown strategy "${strategy}"`);
		console.log('Valid strategies: nige, senkou, sashi, oikomi, oonige');
		process.exit(1);
	}

	if (fullSim) {
		const course = (courses as Record<string, CourseData>)[courseId];
		const config: FullSimConfig = {
			courseId,
			strategy,
			speed,
			guts,
			power,
			wisdom,
			skillIds,
			nsamples,
			targetSpurtRate,
			locale,
		};

		console.log('\n' + '='.repeat(60));
		console.log(`FULL SIMULATION: ${getCourseName(course)}`);
		console.log('='.repeat(60));
		console.log(`Strategy:      ${getStrategyName(strategy, locale)}`);
		console.log(`Speed:         ${speed}`);
		console.log(`Power:         ${power}`);
		console.log(`Guts:          ${guts}`);
		console.log(`Wisdom:        ${wisdom}`);

		const { minStamina, finalRate } = findMinStaminaFullSim(config);

		console.log('-'.repeat(60));
		console.log(`Min Stamina:   ${minStamina} (for ${finalRate.toFixed(1)}% full spurt)`);
		console.log('='.repeat(60));

		// Also show the estimate for comparison
		const estimate = calculateEstimate(courseId, minStamina, guts, strategy, speed, healPercent);
		console.log(`\n(Estimate without skills was: ${estimate.minStaminaForFullSpurt} stamina)`);
	} else if (compare) {
		printStrategyComparison(courseId, stamina, guts, speed, healPercent, locale);
	} else {
		const estimate = calculateEstimate(courseId, stamina, guts, strategy, speed, healPercent);
		printEstimate(estimate, healPercent, locale);
	}
}

main();
