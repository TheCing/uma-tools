/**
 * V2 Simulation Worker
 * Handles race simulation in a background thread
 */

import { fromJS, Map as ImmMap } from 'immutable';
import { HorseState } from '../../components/HorseDefTypes';
import { runComparison } from '../../umalator/compare';

/**
 * Merge skill activation maps from two result sets
 */
function mergeSkillMaps(map1: any, map2: any) {
	const obj1 = map1 instanceof Map ? Object.fromEntries(map1) : (map1 || {});
	const obj2 = map2 instanceof Map ? Object.fromEntries(map2) : (map2 || {});
	const merged = { ...obj1 };
	Object.entries(obj2).forEach(([skillId, values]: [string, any]) => {
		merged[skillId] = [...(merged[skillId] || []), ...(values || [])];
	});
	return merged;
}

/**
 * Merge two result sets into one (memory-efficient version)
 * Only merges statistics, not full result arrays
 */
function mergeResults(results1: any, results2: any) {
	const n1 = results1.sampleCount || 0;
	const n2 = results2.sampleCount || 0;
	const totalCount = n1 + n2;

	// Weighted mean calculation
	const combinedMean = totalCount > 0
		? (results1.mean * n1 + results2.mean * n2) / totalCount
		: 0;

	// Use the newer result's median as approximation (more samples = better estimate)
	const newMedian = n2 > n1 ? results2.median : results1.median;

	// Keep runData from the result with more samples (more accurate)
	const runData = n2 > n1 ? (results2.runData || results1.runData) : (results1.runData || results2.runData);

	return {
		id: results1.id,
		results: [], // Empty - detailed data not needed
		runData, // Keep runData for track visualization
		min: Math.min(results1.min, results2.min),
		max: Math.max(results1.max, results2.max),
		mean: combinedMean,
		median: newMedian,
		sampleCount: totalCount
	};
}

/**
 * Convert incoming plain JS uma object to HorseState with Immutable.js structures
 */
function convertToHorseState(uma: any): HorseState {
	return new HorseState(uma)
		.set('skills', fromJS(uma.skills))
		.set('forcedSkillPositions', ImmMap(uma.forcedSkillPositions || {}));
}

/**
 * Run comparison simulation with progressive updates
 */
function runCompare({ nsamples, course, racedef, uma1, uma2, pacer, options }: {
	nsamples: number;
	course: any;
	racedef: any;
	uma1: any;
	uma2: any;
	pacer: any;
	options: any;
}) {
	const startTime = performance.now();

	// Convert plain JS objects to HorseState with Immutable structures
	const uma1_ = convertToHorseState(uma1);
	const uma2_ = convertToHorseState(uma2);
	const pacer_ = pacer ? convertToHorseState(pacer) : null;

	const compareOptions = { ...options, mode: 'compare' };

	// Progressive sampling: start small and increase
	// This provides early feedback to the UI
	let results: any;
	for (let n = Math.min(20, nsamples), mul = 6; n < nsamples; n = Math.min(n * mul, nsamples), mul = Math.max(mul - 1, 2)) {
		results = runComparison(n, course, racedef, uma1_, uma2_, pacer_, compareOptions);
		self.postMessage({ type: 'compare', results });
	}

	// Final run with full sample count
	results = runComparison(nsamples, course, racedef, uma1_, uma2_, pacer_, compareOptions);
	self.postMessage({ type: 'compare', results });
	self.postMessage({ type: 'compare-complete' });

	const elapsed = performance.now() - startTime;
	const runsPerSec = (nsamples / elapsed) * 1000;
	console.log(`[V2 RaceSimulator] Completed ${nsamples} runs in ${elapsed.toFixed(2)}ms (${runsPerSec.toFixed(0)} runs/sec)`);
}

/**
 * Merge two result sets (for chart mode progressive refinement)
 */
function mergeResultSets(data1: Map<string, any>, data2: Map<string, any>) {
	data2.forEach((r, id) => {
		if (data1.has(id)) {
			data1.set(id, mergeResults(data1.get(id), r));
		} else {
			data1.set(id, r);
		}
	});
}

/**
 * Run one round of chart testing for a skill list
 */
function runChartRound(
	nsamples: number,
	skills: string[],
	course: any,
	racedef: any,
	uma: HorseState,
	pacer: HorseState | null,
	options: any,
	skillmeta: any
) {
	const data = new Map();

	skills.forEach(id => {
		const newSkillGroupId = skillmeta[id]?.groupId;
		let skillsToUse = uma.skills;

		// Remove existing skills in same group
		if (newSkillGroupId) {
			skillsToUse = skillsToUse.filter((existingSkillId: string) => {
				const existingGroupId = skillmeta[existingSkillId]?.groupId;
				return existingGroupId !== newSkillGroupId;
			});
		}

		// Add test skill to uma
		const withSkill = uma.set('skills', skillsToUse.set(skillmeta[id].groupId, id));

		// Run comparison
		const { results, runData } = runComparison(nsamples, course, racedef, uma, withSkill, pacer, options);

		// Calculate statistics
		const mid = Math.floor(results.length / 2);
		const median = results.length % 2 === 0 ? (results[mid - 1] + results[mid]) / 2 : results[mid];
		const mean = results.reduce((a, b) => a + b, 0) / results.length;

		// Store stats and runData (needed for track visualization)
		data.set(id, {
			id,
			results: [], // Empty - detailed data not needed
			runData, // Keep runData for skill activation visualization
			min: results[0],
			max: results[results.length - 1],
			mean,
			median,
			sampleCount: nsamples
		});
	});

	return data;
}

/**
 * Run chart mode simulation
 *
 * Two strategies available:
 *
 * DEFAULT (v2-variance): 1.17x faster than kachi, same accuracy
 * - Round 1: 25 samples per skill
 * - Combined filter: max > 0.1L AND variance > 0.1L
 * - Round 2: 175 samples for promising skills (200 total)
 *
 * FAST MODE (v2-turbo): 2x faster, lower accuracy
 * - Single round: 50 samples per skill, no filtering
 * - Best for mobile/low-end devices or quick estimates
 *
 * Benchmark results (30 skills on Kyoto 3000m):
 *   kachi (3-round): 9496ms baseline
 *   v2-variance:     8144ms = 1.17x faster
 *   v2-turbo:        4523ms = 2.10x faster
 */
function runChart({ skills, course, racedef, uma, pacer, options, skillmeta, workerId, fastMode }: {
	skills: string[];
	course: any;
	racedef: any;
	uma: any;
	pacer: any;
	options: any;
	skillmeta: any;
	workerId: number;
	fastMode?: boolean;
}) {
	// Convert plain JS objects to HorseState with Immutable structures
	const uma_ = convertToHorseState(uma);
	const pacer_ = pacer ? convertToHorseState(pacer) : null;

	const chartOptions = { ...options, mode: 'chart' };

	if (fastMode) {
		// FAST MODE: Single round, 50 samples, no filtering
		// 2x faster than kachi, best for mobile/low-end devices
		self.postMessage({ type: 'chart-progress', workerId, round: 1, total: 1 });
		const results = runChartRound(50, skills, course, racedef, uma_, pacer_, chartOptions, skillmeta);
		self.postMessage({ type: 'chart-update', workerId, results });
		self.postMessage({ type: 'chart-complete', workerId });
		return;
	}

	// DEFAULT MODE: 2-round progressive refinement (v2-variance strategy)
	// Round 1: 25 samples per skill (fast initial scan, same as kachi)
	self.postMessage({ type: 'chart-progress', workerId, round: 1, total: 2 });
	let results = runChartRound(25, skills, course, racedef, uma_, pacer_, chartOptions, skillmeta);
	self.postMessage({ type: 'chart-update', workerId, results });

	// Combined filter (equivalent to kachi's two-stage filtering):
	// - max > 0.1L: skill shows meaningful positive gain
	// - variance > 0.1L: skill needs more samples for accuracy
	// This combines kachi's round 1 and round 2 filters into one
	skills = skills.filter(id => {
		const r = results.get(id);
		return r && r.max > 0.1 && Math.abs(r.max - r.min) > 0.1;
	});

	// Round 2: 175 samples for promising skills (200 total, same final accuracy as kachi)
	self.postMessage({ type: 'chart-progress', workerId, round: 2, total: 2 });
	const update = runChartRound(175, skills, course, racedef, uma_, pacer_, chartOptions, skillmeta);
	mergeResultSets(results, update);
	self.postMessage({ type: 'chart-update', workerId, results });

	self.postMessage({ type: 'chart-complete', workerId });
}

/**
 * Message handler
 */
self.addEventListener('message', function(e: MessageEvent) {
	const { msg, data } = e.data;

	switch (msg) {
		case 'compare':
			runCompare(data);
			break;

		case 'chart':
			runChart(data);
			break;

		case 'chart-cancel':
			// TODO: Implement cancellation logic if needed
			break;

		default:
			console.warn(`[V2 Worker] Unknown message type: ${msg}`);
	}
});
