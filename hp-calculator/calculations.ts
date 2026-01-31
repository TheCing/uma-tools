/**
 * HP Calculation Logic
 * Ported from uma-skill-tools/tools/hp-calculator.ts
 */

import courses from '../umalator-global/course_data.json';

export type Locale = 'jp' | 'gl';
export type Strategy = 'nige' | 'senkou' | 'sashi' | 'oikomi' | 'oonige';

export interface CourseData {
	raceTrackId: number;
	distance: number;
	surface: number;
	distanceType: number;
}

export interface HpEstimate {
	courseId: string;
	courseName: string;
	distance: number;
	strategy: Strategy;
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

// Strategy HP Coefficients (from HpPolicy.ts)
export const HpStrategyCoefficient: Record<Strategy, number> = {
	'nige': 0.95,
	'senkou': 0.89,
	'sashi': 1.0,
	'oikomi': 0.995,
	'oonige': 0.86,
};

// Strategy phase speed coefficients (from RaceSolver.ts)
export const StrategyPhaseCoefficient: Record<Strategy, number[]> = {
	'nige':    [1.0, 0.98, 0.962, 0.962],
	'senkou':  [0.978, 0.991, 0.975, 0.975],
	'sashi':   [0.938, 0.998, 0.994, 0.994],
	'oikomi':  [0.931, 1.0, 1.0, 1.0],
	'oonige':  [1.0, 0.98, 0.962, 0.962],
};

export const StrategyLocalization: Record<Strategy, { jp: string; gl: string }> = {
	'nige': { jp: '逃げ', gl: 'Front Runner' },
	'senkou': { jp: '先行', gl: 'Pace Chaser' },
	'sashi': { jp: '差し', gl: 'Late Surger' },
	'oikomi': { jp: '追込', gl: 'End Closer' },
	'oonige': { jp: '大逃げ', gl: 'Runaway' },
};

export const STRATEGIES: Strategy[] = ['nige', 'senkou', 'sashi', 'oikomi', 'oonige'];

export const trackNames: Record<number, string> = {
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

export function getStrategyName(strategy: Strategy, locale: Locale): string {
	return StrategyLocalization[strategy][locale];
}

export function getCourseName(course: CourseData): string {
	const trackName = trackNames[course.raceTrackId] || `Track ${course.raceTrackId}`;
	const surface = course.surface === 1 ? 'Turf' : 'Dirt';
	return `${trackName} ${surface} ${course.distance}m`;
}

export function getCourse(courseId: string): CourseData | null {
	return (courses as Record<string, CourseData>)[courseId] || null;
}

export function getAllCourseIds(): string[] {
	return Object.keys(courses);
}

export function baseSpeed(distance: number): number {
	return 20.0 - (distance - 2000) / 1000.0;
}

export function gutsModifier(guts: number): number {
	return 1.0 + 200.0 / Math.sqrt(600.0 * guts);
}

export function calcMaxHp(stamina: number, distance: number, strategy: Strategy): number {
	const coef = HpStrategyCoefficient[strategy];
	return 0.8 * coef * stamina + distance;
}

function hpPerSecond(velocity: number, baseSpd: number, gutsMod: number, isPhase2: boolean): number {
	const guts = isPhase2 ? gutsMod : 1.0;
	return 20.0 * Math.pow(velocity - baseSpd + 12.0, 2) / 144.0 * guts;
}

function estimatePhase01Speed(baseSpd: number, strategy: Strategy): number {
	const coefs = StrategyPhaseCoefficient[strategy];
	const avgCoef = (coefs[0] + coefs[1]) / 2;
	return baseSpd * avgCoef;
}

function estimateSpurtSpeed(baseSpd: number, speed: number, strategy: Strategy, distanceAptitude: number = 1.0): number {
	const coefs = StrategyPhaseCoefficient[strategy];
	const baseTargetSpeed = baseSpd * coefs[2] + Math.sqrt(500.0 * speed) * distanceAptitude * 0.002;
	const lastSpurt = (baseTargetSpeed + 0.01 * baseSpd) * 1.05 + Math.sqrt(500.0 * speed) * distanceAptitude * 0.002;
	return lastSpurt;
}

export function estimateHpNeeded(
	distance: number,
	strategy: Strategy,
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

export function findMinStaminaForFullSpurt(
	distance: number,
	strategy: Strategy,
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

export function calculateEstimate(
	courseId: string,
	stamina: number,
	guts: number,
	strategy: Strategy,
	speed: number = 1200,
	healPercent: number = 0
): HpEstimate | null {
	const course = getCourse(courseId);
	if (!course) {
		return null;
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

// Common courses for the dropdown
export const COMMON_COURSES = [
	{ id: '10503', name: 'Nakayama Turf 1200m', tag: 'Sprint' },
	{ id: '10601', name: 'Tokyo Turf 1400m', tag: 'Sprint' },
	{ id: '10604', name: 'Tokyo Turf 1600m', tag: 'Mile' },
	{ id: '10611', name: 'Tokyo Dirt 1600m', tag: 'Mile' },
	{ id: '10507', name: 'Nakayama Turf 2000m', tag: 'Medium' },
	{ id: '10606', name: 'Tokyo Turf 2400m', tag: 'Japan Derby' },
	{ id: '10906', name: 'Hanshin Turf 2200m', tag: 'Medium' },
	{ id: '10506', name: 'Nakayama Turf 2500m', tag: 'Arima Kinen' },
	{ id: '10810', name: 'Kyoto Turf 3000m', tag: 'Kikka-sho' },
	{ id: '10914', name: 'Hanshin Turf 3200m', tag: 'Tenno-sho Spring' },
	{ id: '10608', name: 'Tokyo Turf 3400m', tag: 'Long' },
];
