/**
 * v2 Stamina Calculator Results
 * Displays HP distribution histogram, spurt rate, and stamina requirements
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import * as d3 from 'd3';
import { Heart, Zap, TrendingDown } from 'lucide-react';

import type { HpCalcResults } from '../../umalator/hpcalc';

import './stacalc.css';

function maxHpToStamina(strategy: string, hp: number, distance: number): number {
	const coef = {
		'Nige': 0.95,
		'Senkou': 0.89,
		'Sasi': 1.0,
		'Oikomi': 0.995,
		'Oonige': 0.86
	}[strategy] || 1.0;
	let stam = 1.25 * (hp - distance) / coef;
	if (stam > 1200) stam = 1200 + (stam - 1200) * 2;
	return stam;
}

interface HpHistogramProps {
	data: number[];
	width: number;
	height: number;
}

function HpHistogram({ data, width, height }: HpHistogramProps) {
	const svgRef = useRef<SVGSVGElement>(null);

	useEffect(() => {
		if (!svgRef.current || data.length === 0) return;

		const svg = d3.select(svgRef.current);
		svg.selectAll('*').remove();

		const margin = { top: 10, right: 15, bottom: 30, left: 45 };
		const w = width - margin.left - margin.right;
		const h = height - margin.top - margin.bottom;

		const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

		const x = d3.scaleLinear()
			.domain([d3.min(data)!, d3.max(data)!])
			.range([0, w])
			.nice();

		const bins = d3.bin()
			.domain(x.domain() as [number, number])
			.thresholds(Math.min(40, Math.ceil(Math.sqrt(data.length))))(data);

		const y = d3.scaleLinear()
			.domain([0, d3.max(bins, d => d.length)!])
			.range([h, 0])
			.nice();

		// Bars
		g.selectAll('rect')
			.data(bins)
			.join('rect')
			.attr('x', d => x(d.x0!) + 1)
			.attr('y', d => y(d.length))
			.attr('width', d => Math.max(0, x(d.x1!) - x(d.x0!) - 2))
			.attr('height', d => h - y(d.length))
			.attr('class', d => (d.x0! + d.x1!) / 2 >= 0 ? 'stacalc-bar-positive' : 'stacalc-bar-negative');

		// Zero line if data spans negative
		if (d3.min(data)! < 0 && d3.max(data)! > 0) {
			g.append('line')
				.attr('x1', x(0)).attr('x2', x(0))
				.attr('y1', 0).attr('y2', h)
				.attr('class', 'stacalc-zero-line');
		}

		// X axis
		g.append('g')
			.attr('transform', `translate(0,${h})`)
			.call(d3.axisBottom(x).ticks(6).tickFormat(d => Math.round(d as number).toString()))
			.attr('class', 'stacalc-axis');

		// Y axis
		g.append('g')
			.call(d3.axisLeft(y).ticks(5))
			.attr('class', 'stacalc-axis');

		// X label
		g.append('text')
			.attr('x', w / 2).attr('y', h + 25)
			.attr('text-anchor', 'middle')
			.attr('class', 'stacalc-axis-label')
			.text('HP');

	}, [data, width, height]);

	return <svg ref={svgRef} width={width} height={height} />;
}

type RunType = 'minrun' | 'maxrun' | 'meanrun' | 'medianrun';

interface StaCalcResultsProps {
	results: HpCalcResults;
	nsamples: number;
	strategy: string;
	courseDistance: number;
	onSelectRun?: (runType: RunType, runData: any) => void;
}

export function StaCalcResults({ results, nsamples, strategy, courseDistance, onSelectRun }: StaCalcResultsProps) {
	const [displayedRun, setDisplayedRun] = useState<RunType>('medianrun');
	const [spurtPerc, setSpurtPerc] = useState(95);

	const { remainingHp, requiredHp, downhillSave } = results.results;
	const { nspurt } = results.runData;

	const min = remainingHp[0];
	const max = remainingHp[remainingHp.length - 1];
	const mid = Math.floor(remainingHp.length / 2);
	const median = remainingHp.length % 2 === 0
		? (remainingHp[mid - 1] + remainingHp[mid]) / 2
		: remainingHp[mid];
	const mean = remainingHp.reduce((a, b) => a + b, 0) / remainingHp.length;

	const spurtRate = (nspurt / nsamples * 100).toFixed(1);

	const requiredIdx = Math.min(Math.ceil(requiredHp.length * (spurtPerc / 100)) - 1, requiredHp.length - 1);
	const requiredStamina = requiredHp.length > 0
		? Math.round(maxHpToStamina(strategy, requiredHp[requiredIdx], courseDistance))
		: 0;

	const dhAvg = downhillSave.length > 0
		? Math.round(downhillSave.reduce((a, b) => a + b, 0) / downhillSave.length)
		: 0;
	const hasDH = downhillSave.length > 0 && dhAvg > 0;

	function selectRun(type: RunType) {
		setDisplayedRun(type);
		if (onSelectRun && results.runData[type]) {
			onSelectRun(type, results.runData[type]);
		}
	}

	const runTypes: { key: RunType; label: string; value: number }[] = [
		{ key: 'minrun', label: 'Min', value: min },
		{ key: 'maxrun', label: 'Max', value: max },
		{ key: 'meanrun', label: 'Mean', value: mean },
		{ key: 'medianrun', label: 'Median', value: median },
	];

	return (
		<div class="stacalc-wrapper">
			<div class="stacalc-section">
				<div class="stacalc-section-header">
					<Heart size={16} />
					<span>Remaining HP</span>
				</div>
				<div class="stacalc-summary">
					{runTypes.map(({ key, label, value }) => (
						<button
							key={key}
							class={`stacalc-summary-btn ${displayedRun === key ? 'active' : ''}`}
							onClick={() => selectRun(key)}
							title={`Show ${label.toLowerCase()} run`}
						>
							<span class="stacalc-summary-label">{label}</span>
							<span class={`stacalc-summary-value ${value >= 0 ? 'positive' : 'negative'}`}>
								{Math.round(value)}
							</span>
						</button>
					))}
				</div>
				<div class="stacalc-histogram-container">
					<HpHistogram data={remainingHp} width={460} height={200} />
				</div>
			</div>

			<div class="stacalc-section">
				<div class="stacalc-stats-grid">
					<div class="stacalc-stat">
						<div class="stacalc-stat-header">
							<Zap size={14} />
							<span>Full Spurt Rate</span>
						</div>
						<div class={`stacalc-stat-value ${parseFloat(spurtRate) >= 90 ? 'positive' : parseFloat(spurtRate) >= 50 ? 'warning' : 'negative'}`}>
							{spurtRate}%
						</div>
					</div>

					<div class="stacalc-stat stacalc-req-stamina">
						<div class="stacalc-stat-header">
							<TrendingDown size={14} />
							<span>Stamina for</span>
							<input
								type="number"
								class="stacalc-perc-input"
								min="1"
								max="100"
								value={spurtPerc}
								onInput={e => setSpurtPerc(+(e.target as HTMLInputElement).value)}
							/>
							<span>% spurt</span>
						</div>
						<div class="stacalc-stat-value">{requiredStamina}</div>
					</div>

					{hasDH && (
						<div class="stacalc-stat">
							<div class="stacalc-stat-header">
								<span>Downhill Savings</span>
							</div>
							<div class="stacalc-stat-value">
								{Math.round(downhillSave[0])} – {Math.round(downhillSave[downhillSave.length - 1])}
								<span class="stacalc-stat-sub"> (avg {dhAvg})</span>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
