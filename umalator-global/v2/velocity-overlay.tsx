/**
 * V2 Velocity Overlay
 * Renders velocity/HP curves INSIDE the RaceTrack SVG as an overlay
 *
 * Adapted from v1's VelocityLines component in umalator/app.tsx
 */

import { h, Fragment } from 'preact';
import { useMemo, useRef, useEffect } from 'preact/hooks';
import * as d3 from 'd3';
import { RaceSnapshot } from './results-pane';

interface VelocityOverlayProps {
	data: RaceSnapshot | null;
	courseDistance: number;
	width: number;
	height: number;
	xOffset: number;
	showVelocity?: boolean;
	showHp?: boolean;
	showPacerGap?: boolean;
}

const COLORS = ['#2a77c5', '#c52a2a'];
const HP_COLORS = ['#688aab', '#ab6868'];
const PACER_GAP_COLORS = COLORS; // Same as velocity colors, but dashed

export function VelocityOverlay({
	data,
	courseDistance,
	width,
	height,
	xOffset,
	showVelocity = true,
	showHp = true,
	showPacerGap = true,
}: VelocityOverlayProps) {
	const axesRef = useRef<SVGGElement>(null);

	// Don't render if no data
	if (!data) return null;

	// X scale - position along course (same as v1)
	const x = useMemo(
		() => d3.scaleLinear().domain([0, courseDistance]).range([0, width]),
		[courseDistance, width]
	);

	// Y scale - velocity (same as v1)
	const y = useMemo(() => {
		const maxV = d3.max(data.v, (v) => d3.max(v)) ?? 20;
		return d3.scaleLinear().domain([0, maxV]).range([height, 0]);
	}, [data.v, height]);

	// HP Y scale (same as v1)
	const hpY = useMemo(() => {
		if (!showHp || !data.hp) return null;
		const maxHp = d3.max(data.hp, (hp) => d3.max(hp)) ?? 100;
		return d3.scaleLinear().domain([0, maxHp]).range([height, 0]);
	}, [data.hp, showHp, height]);

	// Pacer gap Y scale - renders in bottom 40% of chart (same as v1)
	const pacerGapY = useMemo(() => {
		if (!showPacerGap || !data.pacerGap) return null;
		const allValues = data.pacerGap.flatMap(gap => gap.filter((d): d is number => d !== undefined));
		if (allValues.length === 0) return null;
		const maxValue = d3.max(allValues) ?? 10;
		const bottom60Percent = height * 0.6;
		const domainMax = Math.max(maxValue, 10);
		return d3.scaleLinear().domain([0, domainMax]).range([height, bottom60Percent]);
	}, [data.pacerGap, showPacerGap, height]);

	// Render axes (same as v1)
	useEffect(() => {
		if (!axesRef.current) return;
		const g = d3.select(axesRef.current);
		g.selectAll('*').remove();
		// X axis at bottom
		g.append('g')
			.attr('transform', `translate(${xOffset},${height + 5})`)
			.call(d3.axisBottom(x));
		// Y axis at left
		g.append('g')
			.attr('transform', `translate(${xOffset},4)`)
			.call(d3.axisLeft(y));
	}, [data, courseDistance, width, height, xOffset, x, y]);

	// Generate velocity paths using v1's exact approach
	const velocityPaths = useMemo(() => {
		if (!data.v || !data.p) return [];

		return data.v.map((v, i) => {
			// Defensive: ensure arrays exist and have same length
			if (!v || !data.p[i] || v.length !== data.p[i].length) {
				return '';
			}

			// Create array of indices
			const indices = data.p[i].map((_, j) => j);

			// Build path with defensive checks: x = position, y = velocity
			const pathData = d3
				.line<number>()
				.defined((j) => {
					const px = data.p[i][j];
					const vy = v[j];
					return px != null && !isNaN(px) && vy != null && !isNaN(vy);
				})
				.x((j) => x(data.p[i][j]))
				.y((j) => y(v[j]))(indices);
			return pathData ?? '';
		});
	}, [data, x, y]);

	// Generate HP paths using v1's exact approach
	const hpPaths = useMemo(() => {
		if (!showHp || !hpY || !data.hp || !data.p) return [];
		return data.hp.map((hp, i) => {
			// Defensive: ensure arrays exist and have same length
			if (!hp || !data.p[i] || hp.length !== data.p[i].length) {
				return '';
			}

			const indices = data.p[i].map((_, j) => j);
			const pathData = d3
				.line<number>()
				.defined((j) => {
					const px = data.p[i][j];
					const hpVal = hp[j];
					return px != null && !isNaN(px) && hpVal != null && !isNaN(hpVal);
				})
				.x((j) => x(data.p[i][j]))
				.y((j) => hpY(hp[j]))(indices);
			return pathData ?? '';
		});
	}, [data, showHp, x, hpY]);

	// Generate pacer gap paths - dashed lines at bottom of chart
	const pacerGapPaths = useMemo(() => {
		if (!showPacerGap || !pacerGapY || !data.pacerGap || !data.p) return [];
		return data.pacerGap.map((gap, i) => {
			// Filter to only valid points (gap defined and >= 0)
			const validPoints = data.p[i]
				.map((_, j) => ({ idx: j, gap: gap[j] }))
				.filter((p): p is { idx: number; gap: number } => p.gap !== undefined && p.gap >= 0);
			if (validPoints.length === 0) return '';
			const pathData = d3
				.line<{ idx: number; gap: number }>()
				.x((p) => x(data.p[i][p.idx]))
				.y((p) => pacerGapY(p.gap))(validPoints);
			return pathData ?? '';
		});
	}, [data, showPacerGap, x, pacerGapY]);

	return (
		<Fragment>
			<g transform={`translate(${xOffset},5)`}>
				{/* Velocity curves (if enabled) */}
				{showVelocity &&
					velocityPaths.map((path, i) => (
						<path
							key={`v-${i}`}
							fill="none"
							stroke={COLORS[i]}
							stroke-width="2.5"
							d={path}
						/>
					))}
				{/* HP curves (if enabled) - solid lines */}
				{showHp &&
					hpPaths.map((path, i) => (
						<path
							key={`hp-${i}`}
							fill="none"
							stroke={HP_COLORS[i]}
							stroke-width="2.5"
							d={path}
						/>
					))}
				{/* Pacer gap curves - dashed lines at bottom */}
				{showPacerGap &&
					pacerGapPaths.map((path, i) => (
						path && (
							<path
								key={`pg-${i}`}
								fill="none"
								stroke={PACER_GAP_COLORS[i]}
								stroke-width="2"
								stroke-dasharray="5,5"
								d={path}
							/>
						)
					))}
			</g>
			<g ref={axesRef} />
		</Fragment>
	);
}
