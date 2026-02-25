/**
 * V2 Velocity Chart
 * Displays velocity and HP curves for both umas over the race distance
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, Fragment } from 'preact';
import { useRef, useEffect, useMemo, useState } from 'preact/hooks';
import * as d3 from 'd3';
import { RaceSnapshot } from './results-pane';
import courseData from '../course_data.json';

// ============================================
// TYPES
// ============================================

interface PhaseRegion {
	start: number;
	end: number;
	phase: number;
	label: string;
}

interface VelocityChartProps {
	snapshot: RaceSnapshot;
	courseDistance: number;
	courseId?: string | number;
	width?: number;
	height?: number;
	showHp?: boolean;
	className?: string;
}

// ============================================
// CONSTANTS
// ============================================

const UMA_COLORS = {
	uma1: {
		velocity: '#2a77c5',
		hp: '#688aab',
	},
	uma2: {
		velocity: '#c52a2a',
		hp: '#ab6868',
	}
};

const PHASE_COLORS = {
	0: 'rgba(100, 200, 100, 0.15)', // Opening (green)
	1: 'rgba(100, 150, 200, 0.15)', // Mid 1 (blue)
	2: 'rgba(200, 150, 100, 0.15)', // Mid 2 (orange)
	3: 'rgba(200, 100, 100, 0.15)', // Final (red)
};

const PHASE_LABELS = ['Opening', 'Mid 1', 'Mid 2', 'Final'];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getPhaseRegions(courseId: string | number | undefined, distance: number): PhaseRegion[] {
	if (!courseId || !courseData[courseId]) {
		// Default phase breakdown: 1/6, 2/3, 5/6, finish
		return [
			{ start: 0, end: distance / 6, phase: 0, label: 'Opening' },
			{ start: distance / 6, end: distance * 2 / 3, phase: 1, label: 'Mid 1' },
			{ start: distance * 2 / 3, end: distance * 5 / 6, phase: 2, label: 'Mid 2' },
			{ start: distance * 5 / 6, end: distance, phase: 3, label: 'Final' },
		];
	}

	const course = courseData[courseId];
	const phases = course.phases || [];

	// Convert phase distances to regions
	const regions: PhaseRegion[] = [];
	let prevEnd = 0;

	phases.forEach((phaseEnd: number, idx: number) => {
		regions.push({
			start: prevEnd,
			end: phaseEnd,
			phase: idx,
			label: PHASE_LABELS[idx] || `Phase ${idx}`,
		});
		prevEnd = phaseEnd;
	});

	// Add final phase if needed
	if (prevEnd < distance) {
		regions.push({
			start: prevEnd,
			end: distance,
			phase: 3,
			label: 'Final',
		});
	}

	return regions;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function VelocityChart({
	snapshot,
	courseDistance,
	courseId,
	width = 600,
	height = 200,
	showHp = false,
	className = '',
}: VelocityChartProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const axesRef = useRef<SVGGElement>(null);

	// Margins for axes
	const margin = { top: 10, right: 20, bottom: 30, left: 45 };
	const innerWidth = width - margin.left - margin.right;
	const innerHeight = height - margin.top - margin.bottom;

	// Phase regions for background
	const phases = useMemo(() =>
		getPhaseRegions(courseId, courseDistance),
		[courseId, courseDistance]
	);

	// Scales
	const xScale = useMemo(() =>
		d3.scaleLinear()
			.domain([0, courseDistance])
			.range([0, innerWidth]),
		[courseDistance, innerWidth]
	);

	const yScale = useMemo(() => {
		const maxVelocity = Math.max(
			...snapshot.v[0],
			...snapshot.v[1]
		);
		return d3.scaleLinear()
			.domain([0, maxVelocity * 1.05])
			.range([innerHeight, 0]);
	}, [snapshot.v, innerHeight]);

	const hpScale = useMemo(() => {
		if (!showHp) return null;
		const maxHp = Math.max(
			...snapshot.hp[0],
			...snapshot.hp[1]
		);
		return d3.scaleLinear()
			.domain([0, maxHp * 1.05])
			.range([innerHeight, 0]);
	}, [snapshot.hp, showHp, innerHeight]);

	// Line generators
	const velocityLine = useMemo(() =>
		d3.line<number>()
			.x((_, i) => xScale(snapshot.p[0][i] ?? 0))
			.y(d => yScale(d)),
		[xScale, yScale, snapshot.p]
	);

	const velocityLine2 = useMemo(() =>
		d3.line<number>()
			.x((_, i) => xScale(snapshot.p[1][i] ?? 0))
			.y(d => yScale(d)),
		[xScale, yScale, snapshot.p]
	);

	const hpLine = useMemo(() => {
		if (!hpScale) return null;
		return d3.line<number>()
			.x((_, i) => xScale(snapshot.p[0][i] ?? 0))
			.y(d => hpScale(d));
	}, [xScale, hpScale, snapshot.p]);

	const hpLine2 = useMemo(() => {
		if (!hpScale) return null;
		return d3.line<number>()
			.x((_, i) => xScale(snapshot.p[1][i] ?? 0))
			.y(d => hpScale(d));
	}, [xScale, hpScale, snapshot.p]);

	// Draw axes
	useEffect(() => {
		if (!axesRef.current) return;

		const g = d3.select(axesRef.current);
		g.selectAll('*').remove();

		// X axis (position)
		g.append('g')
			.attr('transform', `translate(0, ${innerHeight})`)
			.call(d3.axisBottom(xScale).ticks(10))
			.selectAll('text')
			.style('font-size', '10px');

		// Y axis (velocity)
		g.append('g')
			.call(d3.axisLeft(yScale).ticks(6))
			.selectAll('text')
			.style('font-size', '10px');

		// Axis labels
		g.append('text')
			.attr('x', innerWidth / 2)
			.attr('y', innerHeight + 25)
			.attr('text-anchor', 'middle')
			.style('font-size', '11px')
			.style('fill', 'var(--text-secondary)')
			.text('Position (m)');

		g.append('text')
			.attr('transform', 'rotate(-90)')
			.attr('x', -innerHeight / 2)
			.attr('y', -35)
			.attr('text-anchor', 'middle')
			.style('font-size', '11px')
			.style('fill', 'var(--text-secondary)')
			.text('Velocity (m/s)');

	}, [xScale, yScale, innerWidth, innerHeight]);

	// Path data
	const velocityPath1 = useMemo(() =>
		velocityLine(snapshot.v[0]) ?? '',
		[velocityLine, snapshot.v]
	);

	const velocityPath2 = useMemo(() =>
		velocityLine2(snapshot.v[1]) ?? '',
		[velocityLine2, snapshot.v]
	);

	const hpPath1 = useMemo(() =>
		hpLine ? hpLine(snapshot.hp[0]) ?? '' : '',
		[hpLine, snapshot.hp]
	);

	const hpPath2 = useMemo(() =>
		hpLine2 ? hpLine2(snapshot.hp[1]) ?? '' : '',
		[hpLine2, snapshot.hp]
	);

	return (
		<div class={`v2-velocity-chart ${className}`}>
			<svg
				ref={svgRef}
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
			>
				<g transform={`translate(${margin.left}, ${margin.top})`}>
					{/* Phase backgrounds */}
					{phases.map((phase, i) => (
						<rect
							key={i}
							x={xScale(phase.start)}
							y={0}
							width={xScale(phase.end) - xScale(phase.start)}
							height={innerHeight}
							fill={PHASE_COLORS[phase.phase] || 'transparent'}
						/>
					))}

					{/* Grid lines */}
					<g class="grid-lines" opacity={0.3}>
						{yScale.ticks(6).map((tick, i) => (
							<line
								key={i}
								x1={0}
								y1={yScale(tick)}
								x2={innerWidth}
								y2={yScale(tick)}
								stroke="var(--border)"
								stroke-dasharray="2,2"
							/>
						))}
					</g>

					{/* HP curves (behind velocity) */}
					{showHp && (
						<Fragment>
							<path
								d={hpPath1}
								fill="none"
								stroke={UMA_COLORS.uma1.hp}
								stroke-width={2}
								stroke-dasharray="4,2"
								opacity={0.7}
							/>
							<path
								d={hpPath2}
								fill="none"
								stroke={UMA_COLORS.uma2.hp}
								stroke-width={2}
								stroke-dasharray="4,2"
								opacity={0.7}
							/>
						</Fragment>
					)}

					{/* Velocity curves */}
					<path
						d={velocityPath1}
						fill="none"
						stroke={UMA_COLORS.uma1.velocity}
						stroke-width={2.5}
					/>
					<path
						d={velocityPath2}
						fill="none"
						stroke={UMA_COLORS.uma2.velocity}
						stroke-width={2.5}
					/>

					{/* Axes group */}
					<g ref={axesRef} />
				</g>
			</svg>

			{/* Legend */}
			<div class="v2-velocity-legend">
				<div class="legend-item">
					<span class="legend-line uma1" />
					<span>Uma 1 Velocity</span>
				</div>
				<div class="legend-item">
					<span class="legend-line uma2" />
					<span>Uma 2 Velocity</span>
				</div>
				{showHp && (
					<Fragment>
						<div class="legend-item">
							<span class="legend-line uma1 dashed" />
							<span>Uma 1 HP</span>
						</div>
						<div class="legend-item">
							<span class="legend-line uma2 dashed" />
							<span>Uma 2 HP</span>
						</div>
					</Fragment>
				)}
			</div>
		</div>
	);
}

// ============================================
// COMPACT INLINE VERSION
// ============================================

interface InlineVelocityChartProps {
	snapshot: RaceSnapshot;
	courseDistance: number;
	width?: number;
	height?: number;
}

/**
 * Compact velocity chart for inline display (no axes/labels)
 */
export function InlineVelocityChart({
	snapshot,
	courseDistance,
	width = 300,
	height = 60,
}: InlineVelocityChartProps) {
	const xScale = useMemo(() =>
		d3.scaleLinear()
			.domain([0, courseDistance])
			.range([0, width]),
		[courseDistance, width]
	);

	const yScale = useMemo(() => {
		const maxVelocity = Math.max(...snapshot.v[0], ...snapshot.v[1]);
		const minVelocity = Math.min(...snapshot.v[0], ...snapshot.v[1]);
		return d3.scaleLinear()
			.domain([minVelocity * 0.95, maxVelocity * 1.02])
			.range([height - 2, 2]);
	}, [snapshot.v, height]);

	const path1 = useMemo(() => {
		const line = d3.line<number>()
			.x((_, i) => xScale(snapshot.p[0][i] ?? 0))
			.y(d => yScale(d));
		return line(snapshot.v[0]) ?? '';
	}, [snapshot, xScale, yScale]);

	const path2 = useMemo(() => {
		const line = d3.line<number>()
			.x((_, i) => xScale(snapshot.p[1][i] ?? 0))
			.y(d => yScale(d));
		return line(snapshot.v[1]) ?? '';
	}, [snapshot, xScale, yScale]);

	return (
		<svg
			class="v2-inline-velocity-chart"
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
		>
			<path d={path1} fill="none" stroke={UMA_COLORS.uma1.velocity} stroke-width={1.5} />
			<path d={path2} fill="none" stroke={UMA_COLORS.uma2.velocity} stroke-width={1.5} />
		</svg>
	);
}
