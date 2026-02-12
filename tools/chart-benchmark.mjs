#!/usr/bin/env node
/**
 * Benchmark different chart sampling strategies
 * Compares: kachi (3 rounds) vs v2 (2 rounds)
 */

import { performance } from 'perf_hooks';

// Simulate the time cost of running N samples for a skill
// In reality this depends on the simulation, but we can estimate
const SAMPLE_TIME_MS = 0.5; // ~0.5ms per sample (rough estimate)
const IPC_OVERHEAD_MS = 2;   // postMessage overhead

/**
 * Simulate kachi's 3-round strategy
 */
function simulateKachi(numSkills) {
  let totalSamples = 0;
  let ipcCalls = 0;

  // Round 1: 25 samples for all skills
  totalSamples += numSkills * 25;
  ipcCalls += 2; // progress + update

  // Filter: assume 60% pass max > 0.1L
  const afterMaxFilter = Math.floor(numSkills * 0.6);

  // Round 2: 50 samples for filtered skills
  totalSamples += afterMaxFilter * 50;
  ipcCalls += 2;

  // Filter: assume 70% of remaining pass variance > 0.1L
  const afterVarianceFilter = Math.floor(afterMaxFilter * 0.7);

  // Round 3: 125 samples for final skills
  totalSamples += afterVarianceFilter * 125;
  ipcCalls += 2;

  ipcCalls += 1; // complete

  return {
    name: 'Kachi (3 rounds)',
    totalSamples,
    ipcCalls,
    estimatedTime: totalSamples * SAMPLE_TIME_MS + ipcCalls * IPC_OVERHEAD_MS
  };
}

/**
 * Simulate V2's 2-round strategy (current: 75+125)
 */
function simulateV2Current(numSkills) {
  let totalSamples = 0;
  let ipcCalls = 0;

  // Round 1: 75 samples for all skills
  totalSamples += numSkills * 75;
  ipcCalls += 2; // progress + update

  // Filter: assume 60% pass max > 0.1L AND 70% pass variance > 0.1L
  // Combined: 60% * 70% = 42% pass both filters
  const afterBothFilters = Math.floor(numSkills * 0.6 * 0.7);

  // Round 2: 125 samples for filtered skills
  totalSamples += afterBothFilters * 125;
  ipcCalls += 2;

  ipcCalls += 1; // complete

  return {
    name: 'V2 Current (75+125)',
    totalSamples,
    ipcCalls,
    estimatedTime: totalSamples * SAMPLE_TIME_MS + ipcCalls * IPC_OVERHEAD_MS
  };
}

/**
 * Simulate V2 optimized: 25 initial + max filter only + 175 for promising
 */
function simulateV2Fast(numSkills) {
  let totalSamples = 0;
  let ipcCalls = 0;

  // Round 1: 25 samples for all skills (same as kachi)
  totalSamples += numSkills * 25;
  ipcCalls += 2;

  // Filter: 60% pass max > 0.1L only (skip variance filter entirely)
  const afterMaxFilter = Math.floor(numSkills * 0.6);

  // Round 2: 175 samples for filtered skills (total 200 for promising)
  totalSamples += afterMaxFilter * 175;
  ipcCalls += 2;

  ipcCalls += 1;

  return {
    name: 'V2 Fast (25+175)',
    totalSamples,
    ipcCalls,
    estimatedTime: totalSamples * SAMPLE_TIME_MS + ipcCalls * IPC_OVERHEAD_MS
  };
}

/**
 * V2 with variance filter: 2 rounds, but use variance from round 1
 * Key insight: compute variance from initial 25 samples, filter early
 */
function simulateV2WithVariance(numSkills) {
  let totalSamples = 0;
  let ipcCalls = 0;

  // Round 1: 25 samples for all skills
  totalSamples += numSkills * 25;
  ipcCalls += 2;

  // Combined filter: max > 0.1L AND variance > 0.1L (from 25 samples)
  // Same net result as kachi: 60% * 70% = 42%
  const afterBothFilters = Math.floor(numSkills * 0.6 * 0.7);

  // Round 2: 175 samples for promising skills (total 200)
  totalSamples += afterBothFilters * 175;
  ipcCalls += 2;

  ipcCalls += 1;

  return {
    name: 'V2 Variance (25+175 filtered)',
    totalSamples,
    ipcCalls,
    estimatedTime: totalSamples * SAMPLE_TIME_MS + ipcCalls * IPC_OVERHEAD_MS
  };
}

/**
 * Aggressive single round: fewer total samples, accept accuracy trade-off
 */
function simulateV2Turbo(numSkills) {
  let totalSamples = 0;
  let ipcCalls = 0;

  // Single round: 50 samples for all skills
  totalSamples += numSkills * 50;
  ipcCalls += 2; // progress + update

  ipcCalls += 1; // complete

  return {
    name: 'V2 Turbo (50 all)',
    totalSamples,
    ipcCalls,
    estimatedTime: totalSamples * SAMPLE_TIME_MS + ipcCalls * IPC_OVERHEAD_MS
  };
}

/**
 * Two-round with both filters: matches kachi's filter logic, fewer rounds
 */
function simulateV2Smart(numSkills) {
  let totalSamples = 0;
  let ipcCalls = 0;

  // Round 1: 25 samples for all skills
  totalSamples += numSkills * 25;
  ipcCalls += 2;

  // Apply BOTH filters from 25 samples (same filtering as kachi achieves)
  const afterBothFilters = Math.floor(numSkills * 0.6 * 0.7);

  // Round 2: 75 samples (total 100) - half kachi's final accuracy
  totalSamples += afterBothFilters * 75;
  ipcCalls += 2;

  ipcCalls += 1;

  return {
    name: 'V2 Smart (25+75 filtered)',
    totalSamples,
    ipcCalls,
    estimatedTime: totalSamples * SAMPLE_TIME_MS + ipcCalls * IPC_OVERHEAD_MS
  };
}

// Test with different skill counts
const skillCounts = [100, 200, 300, 400];

console.log('Chart Mode Sampling Strategy Benchmark');
console.log('======================================');
console.log(`Assumptions: ${SAMPLE_TIME_MS}ms/sample, ${IPC_OVERHEAD_MS}ms IPC overhead`);
console.log('Filter rates: 60% pass max filter, 70% pass variance filter');
console.log('');

for (const numSkills of skillCounts) {
  console.log(`\n--- ${numSkills} skills (per worker, 4 workers total = ${numSkills * 4} skills) ---`);

  const kachi = simulateKachi(numSkills);
  const v2Current = simulateV2Current(numSkills);
  const v2Fast = simulateV2Fast(numSkills);
  const v2Variance = simulateV2WithVariance(numSkills);
  const v2Turbo = simulateV2Turbo(numSkills);
  const v2Smart = simulateV2Smart(numSkills);

  const strategies = [kachi, v2Current, v2Fast, v2Variance, v2Turbo, v2Smart];

  for (const s of strategies) {
    console.log(`\n${s.name}:`);
    console.log(`  Total samples: ${s.totalSamples.toLocaleString()}`);
    console.log(`  IPC calls: ${s.ipcCalls}`);
    console.log(`  Estimated time: ${s.estimatedTime.toFixed(0)}ms`);
  }

  console.log(`\n--- Comparison (higher = faster than Kachi) ---`);
  console.log(`V2 Current (75+125):      ${(kachi.estimatedTime / v2Current.estimatedTime).toFixed(2)}x`);
  console.log(`V2 Fast (25+175):         ${(kachi.estimatedTime / v2Fast.estimatedTime).toFixed(2)}x`);
  console.log(`V2 Variance (25+175 flt): ${(kachi.estimatedTime / v2Variance.estimatedTime).toFixed(2)}x`);
  console.log(`V2 Turbo (50 all):        ${(kachi.estimatedTime / v2Turbo.estimatedTime).toFixed(2)}x`);
  console.log(`V2 Smart (25+75 flt):     ${(kachi.estimatedTime / v2Smart.estimatedTime).toFixed(2)}x`);
}

console.log('\n\n=== Analysis ===');
console.log('The key to kachi\'s efficiency is the VARIANCE FILTER:');
console.log('- After max filter (60%), variance filter cuts another 30%');
console.log('- Only 42% of skills get full sample treatment');
console.log('');
console.log('V2 strategies that SKIP variance filter test 60% fully = MORE samples');
console.log('');
console.log('To achieve 2x efficiency, V2 must either:');
console.log('1. Apply variance filter from round 1 data (V2 Variance/Smart)');
console.log('2. Accept lower accuracy with fewer samples (V2 Turbo)');
