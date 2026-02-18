/**
 * V1 Adapter
 *
 * Extracts comparison logic from uma-skill-tools/tools/compare.ts for parity testing.
 * This adapter runs the v1 simulation directly using RaceSolver.
 */

import { SkillData, buildSkillData, buildHorseParameters } from '../../uma-skill-tools/tools/ToolCLI';
import { CourseHelpers } from '../../uma-skill-tools/CourseData';
import { Region, RegionList } from '../../uma-skill-tools/Region';
import { Rule30CARng } from '../../uma-skill-tools/Random';
import { RaceSolver, PendingSkill } from '../../uma-skill-tools/RaceSolver';
import { NoopHpPolicy } from '../../uma-skill-tools/HpPolicy';

import { TestCase, HorseConfig, CompareResult } from './v2-adapter';

// ============================================
// HELPERS
// ============================================

function parseGround(str?: string): string {
	return str || 'good';
}

function addSkill(skills: PendingSkill[], sd: SkillData, triggers: Region[], i: number) {
	skills.push({
		skillId: sd.skillId,
		rarity: sd.rarity,
		trigger: triggers[i % triggers.length],
		extraCondition: sd.extraCondition,
		effects: sd.effects
	});
}

function calcMedian(arr: number[]): number {
	const mid = Math.floor(arr.length / 2);
	return arr.length % 2 === 0
		? (arr[mid - 1] + arr[mid]) / 2
		: arr[mid];
}

// ============================================
// MAIN ADAPTER
// ============================================

/**
 * Run V1 comparison using RaceSolver directly.
 * This matches the logic in uma-skill-tools/tools/compare.ts
 */
export function runV1Comparison(tc: TestCase): CompareResult {
	const course = CourseHelpers.getCourse(String(tc.courseId));
	if (!course) {
		throw new Error(`Course ID ${tc.courseId} not found`);
	}

	const mood = tc.horse1.mood ?? 2;
	const ground = parseGround(tc.ground);

	// Build horse parameters
	const desc1 = {
		...tc.horse1,
		skills: (tc.horse1.skills || []).map(s => String(s))
	};
	const desc2 = {
		...tc.horse2,
		skills: (tc.horse2.skills || []).map(s => String(s))
	};

	const horse1 = buildHorseParameters(desc1, course, mood, ground);
	const horse2 = buildHorseParameters(desc2, course, tc.horse2.mood ?? mood, ground);

	// Build whole course region
	const wholeCourse = new RegionList();
	wholeCourse.push(new Region(0, course.distance));
	Object.freeze(wholeCourse);

	// Build skill data
	const skillDefs1 = desc1.skills.map(s => buildSkillData(horse1, course, wholeCourse, s)).filter(s => s != null) as SkillData[];
	const skillDefs2 = desc2.skills.map(s => buildSkillData(horse2, course, wholeCourse, s)).filter(s => s != null) as SkillData[];

	// Initialize RNGs with same seed for fair comparison
	const rng1 = new Rule30CARng(tc.seed);
	const rng2 = new Rule30CARng(tc.seed);

	// Sample triggers
	const triggers1 = skillDefs1.map(sd => sd.samplePolicy.sample(sd.regions, tc.nsamples, rng1));
	const triggers2 = skillDefs2.map(sd => sd.samplePolicy.sample(sd.regions, tc.nsamples, rng2));

	// Solver RNG (needs fresh seed after skill sampling)
	const solverRngSeed = rng1.int32();
	const solverRng1 = new Rule30CARng(solverRngSeed);
	const solverRng2 = new Rule30CARng(solverRngSeed);

	// Run simulations
	const gain: number[] = [];
	for (let i = 0; i < tc.nsamples; ++i) {
		// Horse 1
		const skills1: PendingSkill[] = [];
		skillDefs1.forEach((sd, sdi) => addSkill(skills1, sd, triggers1[sdi], i));
		const s = new RaceSolver({ horse: horse1, course, skills: skills1, hp: NoopHpPolicy, rng: solverRng1 });

		while (s.pos < course.distance) {
			s.step(1 / 60);
		}

		// Horse 2
		const skills2: PendingSkill[] = [];
		skillDefs2.forEach((sd, sdi) => addSkill(skills2, sd, triggers2[sdi], i));
		const s2 = new RaceSolver({ horse: horse2, course, skills: skills2, hp: NoopHpPolicy, rng: solverRng2 });

		// Run until horse 2 reaches the same time as horse 1
		while (s2.accumulatetime.t < s.accumulatetime.t) {
			s2.step(1 / 60);
		}

		// Calculate position difference in bashin (horse lengths)
		gain.push((s.pos - s2.pos) / 2.5);
	}

	// Sort results
	gain.sort((a, b) => a - b);

	return {
		bashin: gain,
		min: gain[0],
		max: gain[gain.length - 1],
		mean: gain.reduce((a, b) => a + b, 0) / gain.length,
		median: calcMedian(gain),
		seed: tc.seed
	};
}
