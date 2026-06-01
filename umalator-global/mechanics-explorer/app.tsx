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
import { SegmentedControl, CustomSelect } from '../v2/components';
import { MechanicsReadout } from './mechanics-readout';
import { buildBaseStats, buildAdjustedStats } from '../../uma-skill-tools/RaceSolverBuilder';
import { CourseHelpers } from '../../uma-skill-tools/CourseData';
import type { MechHorse, MechCourse } from './mechanics';
import { SweepChart } from './sweep-chart';
import * as M from './mechanics';

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

type StatKey = 'speed' | 'stamina' | 'power' | 'guts' | 'wisdom';

const MECHANICS: { id: string; label: string; yLabel: string; defaultStat: StatKey; compute: (h: MechHorse, c: MechCourse, g: number) => number }[] = [
	{ id: 'targetSpeed2', label: 'Target speed — phase 2', yLabel: 'm/s', defaultStat: 'speed', compute: (h, c) => M.baseTargetSpeed(h, c, 2) },
	{ id: 'lastSpurt', label: 'Last-spurt speed', yLabel: 'm/s', defaultStat: 'speed', compute: (h, c) => M.lastSpurtSpeed(h, c) },
	{ id: 'baseAccel2', label: 'Base accel — phase 2', yLabel: 'm/s²', defaultStat: 'power', compute: (h) => M.baseAccel(h, 2, false) },
	{ id: 'maxHp', label: 'Max HP', yLabel: 'HP', defaultStat: 'stamina', compute: (h, c) => M.maxHp(h, c) },
	{ id: 'hpPerSec2', label: 'HP/s — phase 2 @ spurt', yLabel: 'HP/s', defaultStat: 'guts', compute: (h, c, g) => M.hpPerSecond(h, c, g, M.lastSpurtSpeed(h, c), 2) },
	{ id: 'skillAct', label: 'Skill activation chance', yLabel: '%', defaultStat: 'wisdom', compute: (h) => M.skillActivationChance(h) },
	{ id: 'subpar', label: 'Subpar-accept chance', yLabel: '%', defaultStat: 'wisdom', compute: (h) => Math.min(100, M.subparAcceptChance(h)) }
];

const STAT_OPTIONS = [
	{ value: 'speed', label: 'Speed' },
	{ value: 'stamina', label: 'Stamina' },
	{ value: 'power', label: 'Power' },
	{ value: 'guts', label: 'Guts' },
	{ value: 'wisdom', label: 'Wisdom' }
];

const SWEEP_MIN = 1;
const SWEEP_MAX = 1600;

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

	const [mechId, setMechId] = useState('targetSpeed2');
	const [sweepStat, setSweepStat] = useState<StatKey>('speed');

	const mechDef = MECHANICS.find(m => m.id === mechId)!;

	// Rebuild the adjusted horse with one RAW stat replaced by x, then compute the mechanic.
	const sweepCompute = useCallback((x: number) => {
		const probe = { ...uma, [sweepStat]: x };
		const base = buildBaseStats(probe, probe.mood);
		const adj = buildAdjustedStats(base, course, ground as any);
		const h: MechHorse = {
			speed: adj.speed, stamina: adj.stamina, power: adj.power,
			guts: adj.guts, wisdom: adj.wisdom,
			strategy: adj.strategy, distanceAptitude: adj.distanceAptitude,
			surfaceAptitude: adj.surfaceAptitude
		};
		return mechDef.compute(h, mechCourse, ground);
	}, [uma, sweepStat, courseId, ground, mechId]);

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
					<MechanicsReadout horse={horse} course={mechCourse} ground={ground} />
					<div class="mx-sweep-panel">
						<div class="mx-sweep-controls">
							<div class="mx-control">
								<label class="mx-control-label">Mechanic</label>
								<CustomSelect
									value={mechId}
									onChange={(v) => {
										const id = v as string;
										setMechId(id);
										const def = MECHANICS.find(m => m.id === id)!;
										setSweepStat(def.defaultStat);
									}}
									options={MECHANICS.map(m => ({ value: m.id, label: m.label }))}
								/>
							</div>
							<div class="mx-control">
								<label class="mx-control-label">Vary stat</label>
								<CustomSelect
									value={sweepStat}
									onChange={(v) => setSweepStat(v as StatKey)}
									options={STAT_OPTIONS}
								/>
							</div>
						</div>
						<SweepChart
							label={`${mechDef.label} vs ${sweepStat}`}
							xLabel={sweepStat}
							yLabel={mechDef.yLabel}
							xMin={SWEEP_MIN}
							xMax={SWEEP_MAX}
							compute={sweepCompute}
							currentX={uma[sweepStat]}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

render(<App />, document.getElementById('app')!);
