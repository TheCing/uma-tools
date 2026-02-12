/**
 * Chart components for Skill Chart mode
 *
 * Ported from umalator/app.tsx for v2
 * Includes: Histogram, BarChart, LengthDifferenceChart, ActivationFrequencyChart
 */

import { h } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
import * as d3 from 'd3';
import { CourseHelpers } from '../../uma-skill-tools/CourseData';
import type { SkillChartResult } from './skill-chart-types';

// Helper function for identity
const id = (x: any) => x;

/**
 * Histogram component - shows distribution of bashin results
 */
export function Histogram(props: {
	data: number[];
	width: number;
	height: number;
}) {
	const { data, width, height } = props;
	const axes = useRef<SVGGElement>(null);
	const xH = 20;
	const yW = 40;

	const x = d3.scaleLinear().domain(
		data[0] === 0 && data[data.length - 1] === 0
			? [-1, 1]
			: [Math.min(0, Math.floor(data[0])), Math.ceil(data[data.length - 1])]
	).range([yW, width - yW]);

	const bucketize = d3.bin().value(id).domain(x.domain() as [number, number]).thresholds(x.ticks(30));
	const buckets = bucketize(data);
	const y = d3.scaleLinear().domain([0, d3.max(buckets, b => b.length) || 0]).range([height - xH, xH]);

	useEffect(() => {
		if (!axes.current) return;
		const g = d3.select(axes.current);
		g.selectAll('*').remove();
		g.append('g').attr('transform', `translate(0,${height - xH})`).call(d3.axisBottom(x));
		g.append('g').attr('transform', `translate(${yW},0)`).call(d3.axisLeft(y));
	}, [data, width, height, x, y]);

	const rects = buckets.map((b, i) =>
		<rect key={i} fill="#2a77c5" stroke="black" x={x(b.x0 || 0)} y={y(b.length)} width={x(b.x1 || 0) - x(b.x0 || 0)} height={height - xH - y(b.length)} />
	);

	return (
		<svg id="histogram" width={width} height={height}>
			<g>{rects}</g>
			<g ref={axes}></g>
		</svg>
	);
}

interface PhaseBackground {
	start: number;
	end: number;
	color: string;
}

interface ChartBin {
	start: number;
	end: number;
	value: number;
}

/**
 * Generic BarChart component with phase backgrounds
 */
export function BarChart(props: {
	width: number;
	height: number;
	bins: ChartBin[];
	xScale: d3.ScaleLinear<number, number>;
	yScale: d3.ScaleLinear<number, number>;
	phaseBackgrounds?: PhaseBackground[];
	xAxisTicks: number;
	yAxisTicks: number;
	yTickValues?: number[];
	yAxisFormat?: (d: number, i: number, ticks: number[]) => string;
	barColor?: string;
}) {
	const { width, height, bins, xScale, yScale, phaseBackgrounds, xAxisTicks, yAxisTicks, yTickValues, yAxisFormat, barColor } = props;
	const axes = useRef<SVGGElement>(null);
	const gridLines = useRef<SVGGElement>(null);
	const xH = 20;
	const yW = 40;
	const chartWidth = width - yW - 5;
	const chartHeight = height - xH - 5;

	useEffect(() => {
		if (!axes.current || !gridLines.current) return;

		const axesG = d3.select(axes.current);
		axesG.selectAll('*').remove();

		const xAxis = d3.axisBottom(xScale).ticks(xAxisTicks);
		const yAxis = d3.axisLeft(yScale);

		if (yTickValues) {
			yAxis.tickValues(yTickValues);
		} else {
			yAxis.ticks(yAxisTicks);
		}

		if (yAxisFormat) {
			yAxis.tickFormat((d, i) => {
				const tickArr = yTickValues || yScale.ticks(yAxisTicks);
				return yAxisFormat(d as number, i, tickArr);
			});
		}

		axesG.append('g').attr('transform', `translate(0,${chartHeight})`).call(xAxis);
		axesG.append('g').attr('transform', `translate(0,0)`).call(yAxis);

		const gridG = d3.select(gridLines.current);
		gridG.selectAll('*').remove();

		xScale.ticks(xAxisTicks).forEach(tickValue => {
			gridG.append('line')
				.attr('class', 'grid-line')
				.attr('x1', xScale(tickValue))
				.attr('x2', xScale(tickValue))
				.attr('y1', 0)
				.attr('y2', chartHeight)
				.attr('stroke', 'rgba(128, 128, 128, 0.3)')
				.attr('stroke-width', 0.5);
		});

		const finalYTickValues = yTickValues || yScale.ticks(yAxisTicks);
		finalYTickValues.forEach((tickValue) => {
			gridG.append('line')
				.attr('class', 'grid-line')
				.attr('x1', 0)
				.attr('x2', chartWidth)
				.attr('y1', yScale(tickValue))
				.attr('y2', yScale(tickValue))
				.attr('stroke', 'rgba(128, 128, 128, 0.3)')
				.attr('stroke-width', 0.5);
		});
	}, [xScale, yScale, chartHeight, chartWidth, xAxisTicks, yAxisTicks, yTickValues, yAxisFormat]);

	const rects = bins.map((bin, i) => {
		const barHeight = chartHeight - yScale(bin.value);
		const binWidth = xScale(bin.end) - xScale(bin.start);
		const barWidth = Math.max(3, binWidth * 1.5);
		const barX = xScale(bin.start) + (binWidth - barWidth) / 2;
		return (
			<rect
				key={i}
				fill={barColor || "#2a77c5"}
				stroke="none"
				x={barX}
				y={yScale(bin.value)}
				width={barWidth}
				height={barHeight}
			/>
		);
	});

	return (
		<div class="barChart" style={`width: ${width}px; height: ${height}px;`}>
			<svg width={width} height={height} style="overflow: visible;">
				<g transform={`translate(${yW},5)`}>
					{phaseBackgrounds && phaseBackgrounds.map((phase, i) => (
						<rect
							key={i}
							x={xScale(phase.start)}
							y={0}
							width={xScale(phase.end) - xScale(phase.start)}
							height={chartHeight}
							fill={phase.color}
						/>
					))}
					<g ref={gridLines}></g>
					{rects}
					<g ref={axes}></g>
				</g>
			</svg>
		</div>
	);
}

/**
 * LengthDifferenceChart - shows バ身 gain by course position
 */
export function LengthDifferenceChart(props: {
	skillId: string;
	runData: SkillChartResult['runData'];
	courseDistance: number;
	umaIndex?: number;
}) {
	const { skillId, runData, courseDistance, umaIndex = 1 } = props;
	const width = 300;
	const height = 150;

	if (!skillId || !runData) {
		return null;
	}

	if (!runData.allruns || !runData.allruns.skBasinn || !Array.isArray(runData.allruns.skBasinn)) {
		return null;
	}

	const allActivations: Array<[number, number]> = [];

	const skBasinnToProcess = runData.allruns.skBasinn.length > umaIndex
		? [runData.allruns.skBasinn[umaIndex]]
		: runData.allruns.skBasinn;

	skBasinnToProcess.forEach((skBasinnMap: any) => {
		if (!skBasinnMap) return;
		let activations = null;

		// Handle both Map and plain object
		if (skBasinnMap instanceof Map || (typeof skBasinnMap.has === 'function' && typeof skBasinnMap.get === 'function')) {
			if (skBasinnMap.has(skillId)) {
				activations = skBasinnMap.get(skillId);
			}
		} else if (typeof skBasinnMap === 'object' && skillId in skBasinnMap) {
			activations = skBasinnMap[skillId];
		}

		if (activations && Array.isArray(activations)) {
			activations.forEach((activation: any) => {
				if (Array.isArray(activation) && activation.length === 2 &&
					typeof activation[0] === 'number' && typeof activation[1] === 'number') {
					allActivations.push([activation[0], activation[1]]);
				}
			});
		}
	});

	if (allActivations.length === 0) {
		return null;
	}

	const binSize = 10;
	const maxDistance = Math.ceil(courseDistance / binSize) * binSize;
	const bins: Array<{ start: number; end: number; maxBasinn: number; value: number }> = [];

	for (let i = 0; i < maxDistance; i += binSize) {
		bins.push({ start: i, end: i + binSize, maxBasinn: umaIndex === 0 ? Infinity : 0, value: 0 });
	}

	allActivations.forEach(([activationPos, basinn]) => {
		const isBeneficial = umaIndex === 0 ? basinn < 0 : basinn > 0;
		if (isBeneficial) {
			const binIndex = Math.floor(activationPos / binSize);
			if (binIndex >= 0 && binIndex < bins.length) {
				if (umaIndex === 0) {
					bins[binIndex].maxBasinn = Math.min(bins[binIndex].maxBasinn, basinn);
				} else {
					bins[binIndex].maxBasinn = Math.max(bins[binIndex].maxBasinn, basinn);
				}
			}
		}
	});

	bins.forEach(bin => {
		if (umaIndex === 0) {
			bin.value = bin.maxBasinn === Infinity ? 0 : Math.abs(bin.maxBasinn);
		} else {
			bin.value = bin.maxBasinn;
		}
	});

	const maxValue = Math.max(...bins.map(b => b.value), 0);
	if (maxValue === 0) {
		return null;
	}

	const x = d3.scaleLinear().domain([0, maxDistance]).range([0, width - 40 - 5]);
	const y = d3.scaleLinear().domain([0, maxValue]).range([height - 20 - 5, 0]);

	const baseTicks = y.ticks(5);
	const threshold = Math.max(maxValue * 0.02, 0.05);
	const yTickValues = baseTicks.filter(tick => Math.abs(tick - maxValue) >= threshold);
	if (!yTickValues.some(tick => Math.abs(tick - maxValue) < 0.01)) {
		yTickValues.push(maxValue);
		yTickValues.sort((a, b) => a - b);
	}

	const phase0End = CourseHelpers.phaseStart(courseDistance, 1);
	const phase1End = CourseHelpers.phaseStart(courseDistance, 2);

	const phaseBackgrounds = [
		{ start: 0, end: phase0End, color: 'rgba(173, 216, 230, 0.3)' },
		{ start: phase0End, end: phase1End, color: 'rgba(144, 238, 144, 0.3)' },
		{ start: phase1End, end: courseDistance, color: 'rgba(255, 182, 193, 0.3)' }
	];

	return (
		<BarChart
			width={width}
			height={height}
			bins={bins}
			xScale={x}
			yScale={y}
			phaseBackgrounds={phaseBackgrounds}
			xAxisTicks={Math.min(6, Math.floor(maxDistance / 200))}
			yAxisTicks={5}
			yTickValues={yTickValues}
			yAxisFormat={(d, i, ticks) => {
				const isMaxTick = ticks && i === ticks.length - 1;
				if (isMaxTick || Math.abs(d - maxValue) < 0.001) {
					return `${maxValue.toFixed(2)}L`;
				}
				return `${d.toFixed(1)}L`;
			}}
			barColor="#2a77c5"
		/>
	);
}

/**
 * ActivationFrequencyChart - shows skill activation frequency by position
 */
export function ActivationFrequencyChart(props: {
	skillId: string;
	runData: SkillChartResult['runData'];
	courseDistance: number;
	umaIndex?: number;
}) {
	const { skillId, runData, courseDistance, umaIndex = 1 } = props;
	const width = 300;
	const height = 50;
	const yW = 40;
	const chartWidth = width - yW - 5;
	const chartHeight = height - 20 - 5;

	if (!skillId || !runData) {
		return null;
	}

	const activations: number[] = [];
	if (!runData.allruns || !runData.allruns.sk || !Array.isArray(runData.allruns.sk)) {
		return null;
	}

	const skToProcess = runData.allruns.sk.length > umaIndex
		? [runData.allruns.sk[umaIndex]]
		: runData.allruns.sk;

	skToProcess.forEach((skMap: any) => {
		if (!skMap) return;
		let positions = null;

		// Handle both Map and plain object
		if (skMap instanceof Map || (typeof skMap.has === 'function' && typeof skMap.get === 'function')) {
			if (skMap.has(skillId)) {
				positions = skMap.get(skillId);
			}
		} else if (typeof skMap === 'object' && skillId in skMap) {
			positions = skMap[skillId];
		}

		if (positions && Array.isArray(positions)) {
			positions.forEach((pos: any) => {
				if (typeof pos === 'number') {
					activations.push(pos);
				}
			});
		}
	});

	if (activations.length === 0) {
		return null;
	}

	const binSize = 10;
	const maxDistance = Math.ceil(courseDistance / binSize) * binSize;
	const bins: Array<{ start: number; end: number; count: number }> = [];

	for (let i = 0; i < maxDistance; i += binSize) {
		bins.push({ start: i, end: i + binSize, count: 0 });
	}

	activations.forEach(pos => {
		const binIndex = Math.floor(pos / binSize);
		if (binIndex >= 0 && binIndex < bins.length) {
			bins[binIndex].count++;
		}
	});

	const maxCount = Math.max(...bins.map(b => b.count));
	const totalActivations = activations.length;

	const phase0End = CourseHelpers.phaseStart(courseDistance, 1);
	const phase1End = CourseHelpers.phaseStart(courseDistance, 2);

	const phaseBackgrounds = [
		{ start: 0, end: phase0End, color: 'rgba(173, 216, 230, 0.3)' },
		{ start: phase0End, end: phase1End, color: 'rgba(144, 238, 144, 0.3)' },
		{ start: phase1End, end: courseDistance, color: 'rgba(255, 182, 193, 0.3)' }
	];

	const chartBins = bins.map(bin => ({ ...bin, value: bin.count }));
	const xScale = d3.scaleLinear().domain([0, maxDistance]).range([0, chartWidth]);
	const yScale = d3.scaleLinear().domain([0, maxCount > 0 ? maxCount : 1]).range([chartHeight, 0]);

	const yTickValues = [0, maxCount > 0 ? maxCount : 1];

	return (
		<div class="activationFrequencyChart">
			<BarChart
				width={width}
				height={height}
				bins={chartBins}
				xScale={xScale}
				yScale={yScale}
				phaseBackgrounds={phaseBackgrounds}
				xAxisTicks={Math.min(6, Math.floor(maxDistance / 200))}
				yAxisTicks={2}
				yTickValues={yTickValues}
				yAxisFormat={(d, i, ticks) => {
					if (i === 0 || i === ticks.length - 1) {
						return `${Math.round((d / totalActivations) * 100)}%`;
					}
					return '';
				}}
				barColor="#2a77c5"
			/>
		</div>
	);
}
