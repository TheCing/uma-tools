/**
 * Mechanics Explorer — live readout of computed mechanic values.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, Fragment } from 'preact';

import { CollapsibleSection } from '../v2/uma-panel';
import { Tooltip, Badge } from '../v2/components';
import * as M from './mechanics';
import type { MechHorse, MechCourse } from './mechanics';

interface RowProps {
	label: string;
	value: string;
	formula: string;
	stat?: string;
}

function Row({ label, value, formula, stat }: RowProps) {
	return (
		<div class="mx-row">
			<span class="mx-row-label">
				{label}
				<Tooltip content={formula}><span class="mx-row-info">ⓘ</span></Tooltip>
			</span>
			<span class="mx-row-value">{value}</span>
			{stat ? <Badge>{stat}</Badge> : null}
		</div>
	);
}

interface ReadoutProps {
	horse: MechHorse;
	course: MechCourse;
	ground: number;
}

const f = (n: number, d = 3) => n.toFixed(d);

export function MechanicsReadout({ horse, course, ground }: ReadoutProps) {
	const needFull = M.fullSpurtHpNeeded(horse, course, ground);
	const maxHp = M.maxHp(horse, course);
	const canFull = M.canFullSpurt(horse, course, ground);

	return (
		<Fragment>
			<CollapsibleSection title="Speed & Accel" defaultOpen={true}>
				<Row label="Base speed (course)" value={f(M.baseSpeed(course.distance), 2)} formula="20 − (distance − 2000) / 1000" stat="distance" />
				<Row label="Target speed — phase 0" value={f(M.baseTargetSpeed(horse, course, 0))} formula="baseSpeed × strategyPhaseCoef[0]" stat="strategy" />
				<Row label="Target speed — phase 1" value={f(M.baseTargetSpeed(horse, course, 1))} formula="baseSpeed × strategyPhaseCoef[1]" stat="strategy" />
				<Row label="Target speed — phase 2" value={f(M.baseTargetSpeed(horse, course, 2))} formula="baseSpeed × coef[2] + √(500·speed)·distProf·0.002" stat="speed" />
				<Row label="Last-spurt speed" value={f(M.lastSpurtSpeed(horse, course))} formula="(targetSpeed₂ + 0.01·baseSpeed)·1.05 + √(500·speed)·distProf·0.002 + (450·guts)^0.597·0.0001" stat="speed/guts" />
				<Row label="Minimum speed" value={f(M.minSpeed(horse, course))} formula="0.85·baseSpeed + √(200·guts)·0.001" stat="guts" />
				<Row label="Base accel — phase 2 (flat)" value={f(M.baseAccel(horse, 2, false), 4)} formula="0.0006·√(500·power)·accelCoef·groundProf·distProf" stat="power" />
				<Row label="Base accel — phase 2 (uphill)" value={f(M.baseAccel(horse, 2, true), 4)} formula="0.0004·√(500·power)·accelCoef·groundProf·distProf" stat="power" />
				<Row label="Start-dash accel bonus" value={f(M.StartDashAccel, 1)} formula="Flat +24 while currentSpeed < 0.85·baseSpeed" />
			</CollapsibleSection>

			<CollapsibleSection title="HP & Stamina" defaultOpen={true}>
				<Row label="Max HP" value={f(maxHp, 1)} formula="0.8 · hpStrategyCoef · stamina + distance" stat="stamina" />
				<Row label="Guts HP modifier (phase ≥ 2)" value={f(M.gutsModifier(horse), 4)} formula="1 + 200/√(600·guts)" stat="guts" />
				<Row label="Ground drain modifier" value={f(M.groundModifier(course, ground), 3)} formula="hpConsumptionGroundModifier[surface][ground]" stat="ground" />
				<Row label="HP/s — phase 1 @ target" value={f(M.hpPerSecond(horse, course, ground, M.baseTargetSpeed(horse, course, 1), 1), 2)} formula="20·(v − baseSpeed + 12)²/144 · status · ground" stat="—" />
				<Row label="HP/s — phase 2 @ spurt" value={f(M.hpPerSecond(horse, course, ground, M.lastSpurtSpeed(horse, course), 2), 2)} formula="20·(v − baseSpeed + 12)²/144 · status · ground · gutsMod" stat="guts" />
			</CollapsibleSection>

			<CollapsibleSection title="Spurt" defaultOpen={true}>
				<Row label="Max-spurt speed" value={f(M.lastSpurtSpeed(horse, course))} formula="Same as last-spurt speed (target spurt velocity)" stat="speed/guts" />
				<Row label="HP needed for full spurt" value={f(needFull, 1)} formula="hpPerSecond(spurtSpeed) · (spurtZone − 60)/spurtSpeed" stat="stamina" />
				<Row label="Max HP" value={f(maxHp, 1)} formula="0.8 · hpStrategyCoef · stamina + distance" stat="stamina" />
				<Row label="Full spurt achievable?" value={canFull ? `Yes (+${f(maxHp - needFull, 0)} HP)` : `No (−${f(needFull - maxHp, 0)} HP)`} formula="maxHp ≥ hpNeeded" stat="stamina" />
				<Row label="Subpar-accept chance / candidate" value={`${f(Math.min(100, M.subparAcceptChance(horse)), 1)}%`} formula="15 + 0.05·wisdom (capped at 100% for display)" stat="wisdom" />
			</CollapsibleSection>

			<CollapsibleSection title="Wisdom Rolls" defaultOpen={true}>
				<Row label="Skill activation chance" value={`${f(M.skillActivationChance(horse), 1)}%`} formula="max(100 − 9000/wisdom, 20)" stat="wisdom" />
				<Row label="Downhill trigger rate / check" value={`${f(M.downhillTriggerRate(horse), 3)}%`} formula="wisdom · 0.0004 (× 100 for %)" stat="wisdom" />
				<Row label="Subpar-accept chance / candidate" value={`${f(Math.min(100, M.subparAcceptChance(horse)), 1)}%`} formula="15 + 0.05·wisdom (capped at 100% for display)" stat="wisdom" />
			</CollapsibleSection>
		</Fragment>
	);
}
