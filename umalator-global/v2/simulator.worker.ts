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
 * Merge two result sets into one
 */
function mergeResults(results1: any, results2: any) {
	const n1 = results1.results.length;
	const n2 = results2.results.length;
	const combinedResults = results1.results.concat(results2.results).sort((a: number, b: number) => a - b);
	const combinedMean = (results1.mean * n1 + results2.mean * n2) / (n1 + n2);
	const mid = Math.floor(combinedResults.length / 2);
	const newMedian = combinedResults.length % 2 === 0
		? (combinedResults[mid - 1] + combinedResults[mid]) / 2
		: combinedResults[mid];

	const allruns1 = results1.runData?.allruns || {};
	const allruns2 = results2.runData?.allruns || {};
	const { skBasinn: skBasinn1, sk: sk1, totalRuns: totalRuns1, ...rest1 } = allruns1;
	const { skBasinn: skBasinn2, sk: sk2, totalRuns: totalRuns2, ...rest2 } = allruns2;

	const mergedAllRuns: any = {
		...rest1,
		...rest2,
		totalRuns: (totalRuns1 || 0) + (totalRuns2 || 0)
	};

	if (skBasinn1 && skBasinn2) {
		mergedAllRuns.skBasinn = [
			mergeSkillMaps(skBasinn1[0] || {}, skBasinn2[0] || {}),
			mergeSkillMaps(skBasinn1[1] || {}, skBasinn2[1] || {})
		];
	} else if (skBasinn1 || skBasinn2) {
		mergedAllRuns.skBasinn = skBasinn1 || skBasinn2;
	}

	if (sk1 && sk2) {
		mergedAllRuns.sk = [
			mergeSkillMaps(sk1[0] || {}, sk2[0] || {}),
			mergeSkillMaps(sk1[1] || {}, sk2[1] || {})
		];
	} else if (sk1 || sk2) {
		mergedAllRuns.sk = sk1 || sk2;
	}

	return {
		results: combinedResults,
		min: Math.min(results1.min, results2.min),
		max: Math.max(results1.max, results2.max),
		mean: combinedMean,
		median: newMedian,
		runData: {
			...(n2 > n1 ? results2.runData : results1.runData),
			allruns: mergedAllRuns,
			minrun: results1.min < results2.min ? results1.runData.minrun : results2.runData.minrun,
			maxrun: results1.max > results2.max ? results1.runData.maxrun : results2.runData.maxrun,
		}
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
 * Message handler
 */
self.addEventListener('message', function(e: MessageEvent) {
	const { msg, data } = e.data;

	switch (msg) {
		case 'compare':
			runCompare(data);
			break;

		// Chart mode can be added later
		// case 'chart':
		//     runChart(data);
		//     break;

		default:
			console.warn(`[V2 Worker] Unknown message type: ${msg}`);
	}
});

// Signal that worker is ready
console.log('[V2 RaceSimulator] Worker initialized');
