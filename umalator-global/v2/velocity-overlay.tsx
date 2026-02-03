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
	showHp?: boolean;
}

const COLORS = ['#2a77c5', '#c52a2a'];
const HP_COLORS = ['#688aab', '#ab6868'];

export function VelocityOverlay({
	data,
	courseDistance,
	width,
	height,
	xOffset,
	showHp = false,
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
			// Create array of indices
			const indices = data.p[i].map((_, j) => j);
			// Build path: x = position, y = velocity
			const pathData = d3
				.line<number>()
				.x((j) => x(data.p[i][j]))
				.y((j) => y(v[j]))(indices);
			return pathData ?? '';
		});
	}, [data, x, y]);

	// Generate HP paths using v1's exact approach
	const hpPaths = useMemo(() => {
		if (!showHp || !hpY || !data.hp || !data.p) return [];
		return data.hp.map((hp, i) => {
			const indices = data.p[i].map((_, j) => j);
			const pathData = d3
				.line<number>()
				.x((j) => x(data.p[i][j]))
				.y((j) => hpY(hp[j]))(indices);
			return pathData ?? '';
		});
	}, [data, showHp, x, hpY]);

	return (
		<Fragment>
			<g transform={`translate(${xOffset},5)`}>
				{/* Velocity curves */}
				{velocityPaths.map((path, i) => (
					<path
						key={`v-${i}`}
						fill="none"
						stroke={COLORS[i]}
						stroke-width="2.5"
						d={path}
					/>
				))}
				{/* HP curves (if enabled) */}
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
			</g>
			<g ref={axesRef} />
		</Fragment>
	);
}
