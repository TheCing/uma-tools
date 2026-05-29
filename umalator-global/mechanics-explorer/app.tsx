/**
 * Mechanics Explorer
 * Shows how uma stats feed the underlying race-mechanics formulas.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, render } from 'preact';
import { useState, useMemo, useCallback } from 'preact/hooks';

import { V2UmaPanel, UmaState, defaultUmaState } from '../v2/uma-panel';
import { V2TrackSelect } from '../v2/track-select';
import { SegmentedControl } from '../v2/components';
import { buildBaseStats, buildAdjustedStats } from '../../uma-skill-tools/RaceSolverBuilder';
import { CourseHelpers } from '../../uma-skill-tools/CourseData';
import type { MechHorse, MechCourse } from './mechanics';

import '../v2/v2.css';
import './mechanics-explorer.css';

const DefaultCourseId = 10906; // Tokyo turf 2200m

// Ground options: enum values are Good(1)=Firm, Yielding(2)=Good, Soft(3), Heavy(4).
const GROUND_OPTIONS = [
	{ value: 1, label: 'Firm' },
	{ value: 2, label: 'Good' },
	{ value: 3, label: 'Soft' },
	{ value: 4, label: 'Heavy' }
];

function App() {
	const [uma, setUma] = useState<UmaState>(defaultUmaState);
	const [courseId, setCourseId] = useState(DefaultCourseId);
	const [ground, setGround] = useState<number>(1);

	const onUmaChange = useCallback((updates: Partial<UmaState>) => {
		setUma(prev => ({ ...prev, ...updates }));
	}, []);

	const course = CourseHelpers.getCourse(courseId);

	// Canonical adjusted-stats pipeline (same as the simulator).
	const horse: MechHorse = useMemo(() => {
		const base = buildBaseStats(uma, uma.mood);
		const adj = buildAdjustedStats(base, course, ground as any);  // number → GroundCondition (enum not imported)
		return {
			speed: adj.speed, stamina: adj.stamina, power: adj.power,
			guts: adj.guts, wisdom: adj.wisdom,
			strategy: adj.strategy, distanceAptitude: adj.distanceAptitude,
			surfaceAptitude: adj.surfaceAptitude
		};
	}, [uma, courseId, ground]);

	const mechCourse: MechCourse = { distance: course.distance, surface: course.surface };

	return (
		<div class="mx-app">
			<div class="mx-header"><h1>Mechanics Explorer</h1></div>
			<div class="mx-layout">
				<div class="mx-panel">
					<V2UmaPanel
						state={uma}
						onChange={onUmaChange}
						onReset={() => setUma(defaultUmaState)}
						onResetAll={() => setUma(defaultUmaState)}
						onLoad={(s) => setUma(s)}
						title="Umamusume"
						courseDistance={course.distance}
						hideNotInGame={false}
					/>
				</div>
				<div class="mx-main">
					<div class="mx-controls">
						<div class="mx-control">
							<label class="mx-control-label">Course</label>
							<V2TrackSelect courseid={courseId} setCourseid={setCourseId} />
						</div>
						<div class="mx-control">
							<label class="mx-control-label">Ground</label>
							<SegmentedControl
								value={ground}
								onChange={setGround}
								options={GROUND_OPTIONS}
								ariaLabel="Ground condition"
							/>
						</div>
					</div>
					<pre class="mx-debug">{JSON.stringify({ horse, distance: mechCourse.distance, surface: mechCourse.surface, ground }, null, 2)}</pre>
				</div>
			</div>
		</div>
	);
}

render(<App />, document.getElementById('app')!);
