/**
 * Mechanics Explorer — stat-sweep line chart.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import { useRef, useEffect, useMemo } from 'preact/hooks';
import * as d3 from 'd3';

export interface SweepChartProps {
	label: string;
	xLabel: string;
	yLabel: string;
	xMin: number;
	xMax: number;
	compute: (x: number) => number;
	currentX: number;
	width?: number;
	height?: number;
	samples?: number;
}

export function SweepChart({
	label, xLabel, yLabel, xMin, xMax, compute, currentX,
	width = 420, height = 220, samples = 80
}: SweepChartProps) {
	const axesRef = useRef<SVGGElement>(null);

	const margin = { top: 16, right: 16, bottom: 36, left: 52 };
	const innerW = width - margin.left - margin.right;
	const innerH = height - margin.top - margin.bottom;

	const data = useMemo(() => {
		const pts: [number, number][] = [];
		for (let i = 0; i <= samples; i++) {
			const x = xMin + (xMax - xMin) * (i / samples);
			pts.push([x, compute(x)]);
		}
		return pts;
	}, [xMin, xMax, samples, compute]);

	const xScale = useMemo(() => d3.scaleLinear().domain([xMin, xMax]).range([0, innerW]), [xMin, xMax, innerW]);
	const yScale = useMemo(() => {
		const ys = data.map(d => d[1]);
		const lo = Math.min(...ys), hi = Math.max(...ys);
		const pad = (hi - lo) * 0.08 || 1;
		return d3.scaleLinear().domain([lo - pad, hi + pad]).range([innerH, 0]);
	}, [data, innerH]);

	const linePath = useMemo(() => {
		const line = d3.line<[number, number]>().x(d => xScale(d[0])).y(d => yScale(d[1]));
		return line(data) || '';
	}, [data, xScale, yScale]);

	const curY = compute(currentX);

	useEffect(() => {
		const g = d3.select(axesRef.current);
		g.selectAll('*').remove();
		g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(xScale).ticks(6));
		g.append('g').call(d3.axisLeft(yScale).ticks(5));
	}, [xScale, yScale, innerH]);

	return (
		<div class="mx-sweep">
			<div class="mx-sweep-title">{label}</div>
			<svg width={width} height={height} class="mx-sweep-svg">
				<g transform={`translate(${margin.left},${margin.top})`}>
					<g ref={axesRef} class="mx-sweep-axes" />
					<path d={linePath} class="mx-sweep-line" fill="none" />
					<line
						class="mx-sweep-marker"
						x1={xScale(currentX)} x2={xScale(currentX)}
						y1={0} y2={innerH}
					/>
					<circle class="mx-sweep-dot" cx={xScale(currentX)} cy={yScale(curY)} r={4} />
					<text class="mx-sweep-xlabel" x={innerW / 2} y={innerH + 32} text-anchor="middle">{xLabel}</text>
					<text class="mx-sweep-ylabel" transform={`translate(${-40},${innerH / 2}) rotate(-90)`} text-anchor="middle">{yLabel}</text>
				</g>
			</svg>
		</div>
	);
}
