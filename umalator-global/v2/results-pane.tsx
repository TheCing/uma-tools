/**
 * v2 Results Pane
 * Displays simulation results inline below the track
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 * Compare mode only (chart mode deferred)
 */

import { h, Fragment } from 'preact';
import { useMemo } from 'preact/hooks';
import { Clock, Zap, Heart, Shield, Swords, Flag, TrendingUp } from 'lucide-react';
import skillnames from '../skillnames.json';

// ============================================
// TYPES
// ============================================

// Skill activation data
export interface SkillActivation {
	pos: number;
	endPos: number;
}

// Race snapshot from a single run
export interface RaceSnapshot {
	t: [number[], number[]];  // Times at each frame
	p: [number[], number[]];  // Positions (m)
	v: [number[], number[]];  // Velocities (m/s)
	hp: [number[], number[]]; // HP values
	sk: [Map<string, number[][]>, Map<string, number[][]>]; // Skill activations [pos, endPos]
	sdly: [number, number];   // Start delays
	rushed: [[number, number][], [number, number][]]; // Rushed periods
	posKeep: any[];           // Position keep events
	competeFight: [[number, number], [number, number]]; // Dueling periods
	leadCompetition: [[number, number], [number, number]]; // Spot struggle
	downhillActivations: [[number, number][], [number, number][]];
	pacerGap?: [(number | undefined)[], (number | undefined)[]]; // Gap to virtual pacemaker
}

// Aggregated stats across all runs
export interface AggregatedStats {
	min: number;
	max: number;
	mean: number;
	frequency: number;
}

// All runs data
export interface AllRunsData {
	sk: [Map<string, number[][]>, Map<string, number[][]>];
	skBasinn: [Map<string, [number, number][]>, Map<string, [number, number][]>];
	totalRuns: number;
	rushed: [AggregatedStats, AggregatedStats];
	leadCompetition: [AggregatedStats, AggregatedStats];
	competeFight: [AggregatedStats, AggregatedStats];
}

// HP/Stamina position stats
export interface PositionStats {
	count: number;
	min: number | null;
	max: number | null;
	mean: number | null;
	median: number | null;
}

// Stamina stats per uma
export interface UmaStaminaStats {
	staminaSurvivalRate: number;
	fullSpurtRate: number;
	hpDiedPositionStatsFullSpurt: PositionStats;
	hpDiedPositionStatsNonFullSpurt: PositionStats;
	nonFullSpurtVelocityStats: PositionStats;
	nonFullSpurtDelayStats: PositionStats;
}

// First place stats
export interface FirstUmaStats {
	uma1: { firstPlaceRate: number };
	uma2: { firstPlaceRate: number };
}

// Full comparison results
export interface CompareResults {
	results: number[];  // Sorted bashin differences
	runData: {
		minrun: RaceSnapshot;
		maxrun: RaceSnapshot;
		meanrun: RaceSnapshot;
		medianrun: RaceSnapshot;
		allruns: AllRunsData;
	};
	staminaStats: {
		uma1: UmaStaminaStats;
		uma2: UmaStaminaStats;
	};
	firstUmaStats: FirstUmaStats;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatTime(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}:${remainingSeconds.toFixed(3).padStart(6, '0')}`;
}

function formatBashin(bashin: number): string {
	const sign = bashin >= 0 ? '+' : '';
	return `${sign}${bashin.toFixed(2)}L`;
}

function calcStats(results: number[]) {
	if (results.length === 0) return { min: 0, max: 0, mean: 0, median: 0 };
	const sorted = [...results].sort((a, b) => a - b);
	const min = sorted[0];
	const max = sorted[sorted.length - 1];
	const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
	const mid = Math.floor(sorted.length / 2);
	const median = sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
	return { min, max, mean, median };
}

function getFinishTime(snapshot: RaceSnapshot, umaIndex: 0 | 1): number {
	const times = snapshot.t[umaIndex];
	return times[times.length - 1] || 0;
}

function getMaxVelocity(snapshot: RaceSnapshot, umaIndex: 0 | 1): number {
	return Math.max(...snapshot.v[umaIndex]);
}

// ============================================
// COMPONENTS
// ============================================

interface ResultsSummaryProps {
	stats: { min: number; max: number; mean: number; median: number };
	samples: number;
	displayRun: 'mean' | 'median' | 'min' | 'max';
}

function ResultsSummary({ stats, samples, displayRun }: ResultsSummaryProps) {
	return (
		<div class="v2-results-summary">
			<div class={`v2-results-stat${displayRun === 'min' ? ' highlight' : ''}`}>
				<span class="v2-results-stat-label">Min</span>
				<span class="v2-results-stat-value uma1">{formatBashin(stats.min)}</span>
			</div>
			<div class={`v2-results-stat${displayRun === 'max' ? ' highlight' : ''}`}>
				<span class="v2-results-stat-label">Max</span>
				<span class="v2-results-stat-value uma2">{formatBashin(stats.max)}</span>
			</div>
			<div class={`v2-results-stat${displayRun === 'mean' ? ' highlight' : ''}`}>
				<span class="v2-results-stat-label">Mean</span>
				<span class="v2-results-stat-value">{formatBashin(stats.mean)}</span>
			</div>
			<div class={`v2-results-stat${displayRun === 'median' ? ' highlight' : ''}`}>
				<span class="v2-results-stat-label">Median</span>
				<span class="v2-results-stat-value">{formatBashin(stats.median)}</span>
			</div>
			<div class="v2-results-stat muted">
				<span class="v2-results-stat-label">Samples</span>
				<span class="v2-results-stat-value">{samples}</span>
			</div>
		</div>
	);
}

interface HistogramProps {
	results: number[];
	width?: number;
	height?: number;
	markerValue?: number;
}

function Histogram({ results, width = 400, height = 100, markerValue }: HistogramProps) {
	const { bins, maxCount } = useMemo(() => {
		if (results.length === 0) return { bins: [], maxCount: 0 };

		const min = Math.min(...results);
		const max = Math.max(...results);
		const range = max - min || 1;
		const binCount = 30;
		const binWidth = range / binCount;

		const bins: { start: number; end: number; count: number }[] = [];
		for (let i = 0; i < binCount; i++) {
			bins.push({
				start: min + i * binWidth,
				end: min + (i + 1) * binWidth,
				count: 0
			});
		}

		results.forEach(val => {
			const idx = Math.min(Math.floor((val - min) / binWidth), binCount - 1);
			bins[idx].count++;
		});

		const maxCount = Math.max(...bins.map(b => b.count));
		return { bins, maxCount };
	}, [results]);

	if (bins.length === 0) {
		return <div class="v2-histogram-empty">No data</div>;
	}

	const barWidth = width / bins.length;
	const padding = 2;

	return (
		<svg class="v2-histogram" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
			{bins.map((bin, i) => {
				const barHeight = maxCount > 0 ? (bin.count / maxCount) * (height - 20) : 0;
				const isPositive = bin.start >= 0;
				return (
					<rect
						key={i}
						x={i * barWidth + padding / 2}
						y={height - 20 - barHeight}
						width={barWidth - padding}
						height={barHeight}
						class={isPositive ? 'uma2' : 'uma1'}
					/>
				);
			})}
			{/* Zero line */}
			{bins[0].start < 0 && bins[bins.length - 1].end > 0 && (
				<line
					x1={((-bins[0].start) / (bins[bins.length - 1].end - bins[0].start)) * width}
					y1={0}
					x2={((-bins[0].start) / (bins[bins.length - 1].end - bins[0].start)) * width}
					y2={height - 20}
					class="zero-line"
				/>
			)}
			{/* Marker line for selected run */}
			{markerValue !== undefined && bins.length > 0 && (() => {
				const minVal = bins[0].start;
				const maxVal = bins[bins.length - 1].end;
				const range = maxVal - minVal;
				if (range > 0 && markerValue >= minVal && markerValue <= maxVal) {
					const x = ((markerValue - minVal) / range) * width;
					return (
						<line
							x1={x}
							y1={0}
							x2={x}
							y2={height - 20}
							class="marker-line"
						/>
					);
				}
				return null;
			})()}
			{/* X axis labels */}
			<text x={5} y={height - 5} class="axis-label">{bins[0].start.toFixed(1)}L</text>
			<text x={width - 5} y={height - 5} class="axis-label" text-anchor="end">{bins[bins.length - 1].end.toFixed(1)}L</text>
		</svg>
	);
}

interface UmaStatsCardProps {
	label: string;
	snapshot: RaceSnapshot;
	umaIndex: 0 | 1;
	staminaStats: UmaStaminaStats;
	allruns: AllRunsData;
	colorClass: 'uma1' | 'uma2';
}

function UmaStatsCard({ label, snapshot, umaIndex, staminaStats, allruns, colorClass }: UmaStatsCardProps) {
	const finishTime = getFinishTime(snapshot, umaIndex);
	const maxSpeed = getMaxVelocity(snapshot, umaIndex);
	const startDelay = snapshot.sdly[umaIndex];
	const rushed = allruns.rushed[umaIndex];
	const leadComp = allruns.leadCompetition[umaIndex];
	const duel = allruns.competeFight[umaIndex];

	// Get skill activations from the snapshot
	const skillActivations = snapshot.sk[umaIndex];

	// Apply 1.18x multiplier to convert actual time to displayed time
	// Per game mechanics: DisplayedTime = ActualTime * 1.18
	const displayedFinishTime = finishTime * 1.18;

	return (
		<div class={`v2-uma-stats-card ${colorClass}`}>
			<div class="v2-uma-stats-header">
				<span class="v2-uma-stats-label">{label}</span>
			</div>

			<div class="v2-uma-stats-details">
				{/* Primary stats row */}
				<div class="v2-stats-primary">
					<div class="v2-stat-item">
						<Clock size={14} />
						<span class="value">{formatTime(displayedFinishTime)}</span>
						<span class="label">Finish</span>
					</div>
					<div class="v2-stat-item">
						<Zap size={14} />
						<span class="value">{maxSpeed.toFixed(2)}</span>
						<span class="label">Max m/s</span>
					</div>
					<div class="v2-stat-item">
						<Heart size={14} />
						<span class="value">{staminaStats.fullSpurtRate.toFixed(0)}%</span>
						<span class="label">Full Spurt</span>
					</div>
					<div class="v2-stat-item">
						<Shield size={14} />
						<span class="value">{staminaStats.staminaSurvivalRate.toFixed(1)}%</span>
						<span class="label">HP Survival</span>
					</div>
				</div>

				{/* Secondary stats */}
				<div class="v2-stats-secondary">
					<div class="v2-stat-row">
						<span class="label">Start Delay</span>
						<span class="value">{startDelay.toFixed(3)}s</span>
					</div>
				</div>

				{/* Race mechanics */}
				{(rushed.frequency > 0 || leadComp.frequency > 0 || duel.frequency > 0) && (
					<div class="v2-mechanics-section">
						<h4>Race Mechanics</h4>
						<div class="v2-stats-secondary">
							{rushed.frequency > 0 && (
								<div class="v2-stat-row">
									<span class="label">
										<TrendingUp size={12} /> Rushed
									</span>
									<span class="value">{rushed.frequency.toFixed(1)}% ({rushed.mean.toFixed(0)}m)</span>
								</div>
							)}
							{leadComp.frequency > 0 && (
								<div class="v2-stat-row">
									<span class="label">
										<Flag size={12} /> Spot Struggle
									</span>
									<span class="value">{leadComp.frequency.toFixed(1)}%</span>
								</div>
							)}
							{duel.frequency > 0 && (
								<div class="v2-stat-row">
									<span class="label">
										<Swords size={12} /> Dueling
									</span>
									<span class="value">{duel.frequency.toFixed(1)}%</span>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Skills */}
				{skillActivations && skillActivations.size > 0 && (
					<div class="v2-skills-section">
						<h4>Skills ({skillActivations.size})</h4>
						<div class="v2-skill-activations">
							{Array.from(skillActivations.entries()).map(([skillId, activations]) => {
								const roll = activations[0]?.[3];
								const rollLabel = roll != null ? (roll === 0 ? ' [0% drain]' : ` [-${(roll * 100).toFixed(0)}% HP]`) : '';
								return (
								<div key={skillId} class="v2-skill-activation">
									<span class="skill-id">{(skillnames as Record<string, string[]>)[skillId]?.[0] ?? skillId}</span>
									<span class="skill-pos">
										{activations[0]?.[0]?.toFixed(0)}m – {activations[0]?.[1]?.toFixed(0)}m{activations[0]?.[1] !== -1 && activations[0]?.[2] != null && ` (${activations[0][2].toFixed(1)}s)`}{rollLabel}
									</span>
								</div>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// ============================================
// MAIN COMPONENT
// ============================================

interface V2ResultsPaneProps {
	results: CompareResults | null;
	isRunning: boolean;
	progress?: number;
	courseId?: string | number; // Keep for potential future use
	onRunSimulation?: () => void;
	displayRun: 'mean' | 'median' | 'min' | 'max';
	onDisplayRunChange: (run: 'mean' | 'median' | 'min' | 'max') => void;
}

export function V2ResultsPane({ results, isRunning, progress, onRunSimulation, displayRun, onDisplayRunChange }: V2ResultsPaneProps) {

	const stats = useMemo(() => {
		if (!results) return null;
		return calcStats(results.results);
	}, [results]);

	const currentSnapshot = useMemo(() => {
		if (!results) return null;
		switch (displayRun) {
			case 'min': return results.runData.minrun;
			case 'max': return results.runData.maxrun;
			case 'mean': return results.runData.meanrun;
			case 'median': return results.runData.medianrun;
		}
	}, [results, displayRun]);

	if (!results) {
		return (
			<div class="v2-results-pane v2-results-empty">
				{isRunning ? (
					<div class="v2-results-running">
						<div class="v2-results-spinner" />
						<span>Running simulation{progress ? ` ${progress}%` : '...'}</span>
					</div>
				) : (
					onRunSimulation && (
						<button class="v2-button v2-button-primary v2-button-md" onClick={onRunSimulation}>
							Run Simulation
						</button>
					)
				)}
			</div>
		);
	}

	return (
		<div class="v2-results-pane">
			{/* Summary stats */}
			<ResultsSummary stats={stats!} samples={results.results.length} displayRun={displayRun} />

			{/* Histogram */}
			<div class="v2-results-histogram">
				<Histogram results={results.results} width={500} height={80} markerValue={stats![displayRun]} />
			</div>

			{/* Run selector */}
			<div class="v2-run-selector">
				<span class="label">Viewing:</span>
				{(['mean', 'median', 'min', 'max'] as const).map(run => (
					<button
						key={run}
						class={displayRun === run ? 'active' : ''}
						onClick={() => onDisplayRunChange(run)}
					>
						{run.charAt(0).toUpperCase() + run.slice(1)}
					</button>
				))}
			</div>

			{/* Per-uma stats */}
			{currentSnapshot && (
				<div class="v2-uma-stats-container">
					<UmaStatsCard
						label="Uma 1"
						snapshot={currentSnapshot}
						umaIndex={0}
						staminaStats={results.staminaStats.uma1}
						allruns={results.runData.allruns}
						colorClass="uma1"
					/>
					<UmaStatsCard
						label="Uma 2"
						snapshot={currentSnapshot}
						umaIndex={1}
						staminaStats={results.staminaStats.uma2}
						allruns={results.runData.allruns}
						colorClass="uma2"
					/>
				</div>
			)}

			{/* Race Summary Timeline - moved to separate drawer */}
			{/* Velocity Chart - moved to track overlay */}
		</div>
	);
}
