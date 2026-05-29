/**
 * Mechanics Explorer — pure race-mechanics formulas.
 *
 * Transcribed from docs/"Uma Musume Race Mechanics.md" (§Speed, §Acceleration,
 * §HP, §Last Spurt, §Skill Activation Chance) and verified line-by-line against
 * uma-skill-tools/RaceSolver.ts and HpPolicy.ts (the doc and code agree).
 *
 * All functions take an already-ADJUSTED horse (post motivation / course /
 * ground / strategy-proficiency) — the same HorseParameters the solver uses.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

/** Already-adjusted stats; strategy 1=Nige 2=Senkou 3=Sasi 4=Oikomi 5=Oonige; aptitude 0=S..7=G. */
export interface MechHorse {
	speed: number;
	stamina: number;
	power: number;
	guts: number;
	wisdom: number;
	strategy: number;
	distanceAptitude: number;
	surfaceAptitude: number;
}

/** Minimal course: surface 1=turf 2=dirt. */
export interface MechCourse {
	distance: number;
	surface: number;
}

// --- Speed (RaceSolver.ts:21-49; doc §Speed) ---
const SpeedStrategyPhaseCoefficient = [
	[],
	[1.0, 0.98, 0.962],
	[0.978, 0.991, 0.975],
	[0.938, 0.998, 0.994],
	[0.931, 1.0, 1.0],
	[1.063, 0.962, 0.95]
];
const SpeedDistanceProficiencyModifier = [1.05, 1.0, 0.9, 0.8, 0.6, 0.4, 0.2, 0.1];

// --- Acceleration (RaceSolver.ts:51-72; doc §Acceleration) ---
const AccelStrategyPhaseCoefficient = [
	[],
	[1.0, 1.0, 0.996],
	[0.985, 1.0, 0.996],
	[0.975, 1.0, 1.0],
	[0.945, 1.0, 0.997],
	[1.17, 0.94, 0.956]
];
const AccelGroundTypeProficiencyModifier = [1.05, 1.0, 0.9, 0.8, 0.7, 0.5, 0.3, 0.1];
const AccelDistanceProficiencyModifier = [1.0, 1.0, 1.0, 1.0, 1.0, 0.6, 0.5, 0.4];
const BaseAccel = 0.0006;
const UphillBaseAccel = 0.0004;

export function baseSpeed(distance: number): number {
	return 20.0 - (distance - 2000) / 1000.0;
}

export function baseTargetSpeed(h: MechHorse, c: MechCourse, phase: number): number {
	return baseSpeed(c.distance) * SpeedStrategyPhaseCoefficient[h.strategy][phase] +
		(phase === 2 ? Math.sqrt(500.0 * h.speed) * SpeedDistanceProficiencyModifier[h.distanceAptitude] * 0.002 : 0);
}

export function lastSpurtSpeed(h: MechHorse, c: MechCourse): number {
	let v = (baseTargetSpeed(h, c, 2) + 0.01 * baseSpeed(c.distance)) * 1.05 +
		Math.sqrt(500.0 * h.speed) * SpeedDistanceProficiencyModifier[h.distanceAptitude] * 0.002;
	v += Math.pow(450.0 * h.guts, 0.597) * 0.0001;
	return v;
}

export function minSpeed(h: MechHorse, c: MechCourse): number {
	return 0.85 * baseSpeed(c.distance) + Math.sqrt(200.0 * h.guts) * 0.001;
}

export function startingSpeed(c: MechCourse): number {
	return 0.85 * baseSpeed(c.distance);
}

export function baseAccel(h: MechHorse, phase: number, uphill = false): number {
	return (uphill ? UphillBaseAccel : BaseAccel) * Math.sqrt(500.0 * h.power) *
		AccelStrategyPhaseCoefficient[h.strategy][phase] *
		AccelGroundTypeProficiencyModifier[h.surfaceAptitude] *
		AccelDistanceProficiencyModifier[h.distanceAptitude];
}

/** Flat acceleration bonus applied during the start dash (RaceSolver.ts:532). */
export const StartDashAccel = 24.0;

// --- HP (HpPolicy.ts:27-94; doc §HP) ---
const HpStrategyCoefficient = [0, 0.95, 0.89, 1.0, 0.995, 0.86];
const HpConsumptionGroundModifier = [
	[],
	[0, 1.0, 1.0, 1.02, 1.02], // turf:  [_, Firm, Good, Soft, Heavy]
	[0, 1.0, 1.0, 1.01, 1.02]  // dirt
];

export function maxHp(h: MechHorse, c: MechCourse): number {
	return 0.8 * HpStrategyCoefficient[h.strategy] * h.stamina + c.distance;
}

/** Guts-based HP-drain multiplier; applies in phase >= 2. */
export function gutsModifier(h: MechHorse): number {
	return 1.0 + 200.0 / Math.sqrt(600.0 * h.guts);
}

export function groundModifier(c: MechCourse, ground: number): number {
	return HpConsumptionGroundModifier[c.surface][ground];
}

export function hpPerSecond(
	h: MechHorse, c: MechCourse, ground: number,
	velocity: number, phase: number, statusModifier = 1.0
): number {
	const guts = phase >= 2 ? gutsModifier(h) : 1.0;
	return 20.0 * Math.pow(velocity - baseSpeed(c.distance) + 12.0, 2) / 144.0 *
		statusModifier * groundModifier(c, ground) * guts;
}

// --- Spurt (HpPolicy.getLastSpurtPair; doc §Last Spurt) ---

/** Position where phase 2 (the spurt zone) begins = CourseHelpers.phaseStart(distance, 2). */
export function phase2Start(distance: number): number {
	return distance * 2.0 / 3.0;
}

/** HP required to hold the max-spurt speed across the whole spurt zone (minus the 60m buffer). */
export function fullSpurtHpNeeded(h: MechHorse, c: MechCourse, ground: number): number {
	const maxDist = c.distance - phase2Start(c.distance);
	const spd = lastSpurtSpeed(h, c);
	const s = (maxDist - 60) / spd;
	return hpPerSecond(h, c, ground, spd, 2) * s;
}

/** True when the horse can spurt at max speed the whole way (the achievedMaxSpurt branch). */
export function canFullSpurt(h: MechHorse, c: MechCourse, ground: number): boolean {
	return maxHp(h, c) >= fullSpurtHpNeeded(h, c, ground);
}

/** Per-candidate acceptance chance (%) for the wisdom-gated fallback spurt roll. Uncapped; clamp for display. */
export function subparAcceptChance(h: MechHorse): number {
	return 15.0 + 0.05 * h.wisdom;
}

// --- Wisdom rolls (doc §Skill Activation Chance; memory skill-activation.md) ---

export function skillActivationChance(h: MechHorse): number {
	return Math.max(100.0 - 9000.0 / h.wisdom, 20.0);
}

/** Downhill-mode trigger probability per check. */
export function downhillTriggerRate(h: MechHorse): number {
	return h.wisdom * 0.0004;
}
