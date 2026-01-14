// RaceSummaryUtils.ts - Helper functions for deriving race events from simulation data

// Event types that can appear in the race summary
export const enum RaceEventType {
	PhaseTransition = 'phase',
	SkillActivation = 'skill',
	Rushed = 'rushed',
	PosKeep = 'poskeep',
	CompeteFight = 'competefight',
	LeadCompetition = 'leadcompetition',
	Downhill = 'downhill',
	LastSpurt = 'lastspurt',
	HpDied = 'hpdied'
}

export interface RaceEvent {
	type: RaceEventType;
	position: number;
	endPosition?: number;
	phase: number;  // Which phase this event occurred in (0-3)
	data: {
		skillId?: string;
		skillName?: string;
		duration?: number;  // in seconds
		posKeepState?: number;  // PositionKeepState enum value
		phaseNumber?: number;  // For phase transitions
		hpRemaining?: number;
	};
}

export interface PhaseDistances {
	phase0End: number;   // 1/6 of distance
	phase1End: number;   // 2/3 of distance
	phase2End: number;   // 5/6 of distance
	phase3End: number;   // full distance
}

export interface RaceTip {
	type: 'info' | 'success' | 'warning';
	text: string;
}

// Calculate phase boundary distances (matches CourseHelpers.phaseStart/phaseEnd)
export function getPhaseDistances(distance: number): PhaseDistances {
	return {
		phase0End: distance * (1 / 6),
		phase1End: distance * (2 / 3),
		phase2End: distance * (5 / 6),
		phase3End: distance
	};
}

// Determine which phase a position falls into
export function getPhaseAtPosition(position: number, phaseDistances: PhaseDistances): number {
	if (position < phaseDistances.phase0End) return 0;
	if (position < phaseDistances.phase1End) return 1;
	if (position < phaseDistances.phase2End) return 2;
	return 3;
}

// Get phase display name
export function getPhaseName(phase: number): string {
	switch (phase) {
		case 0: return 'Opening';
		case 1: return 'Middle';
		case 2: return 'Final';
		case 3: return 'Spurt';
		default: return 'Unknown';
	}
}

// Get position keep state name
export function getPosKeepStateName(state: number): string {
	switch (state) {
		case 1: return 'Pace Up';
		case 2: return 'Pace Down';
		case 3: return 'Speed Up';
		case 4: return 'Overtake';
		default: return 'Unknown';
	}
}

// Get position keep state abbreviation (for display)
export function getPosKeepStateAbbrev(state: number): string {
	switch (state) {
		case 1: return 'PU';
		case 2: return 'PD';
		case 3: return 'SU';
		case 4: return 'OT';
		default: return '??';
	}
}

// Build timeline of events from median run data
export function buildEventTimeline(
	medianrun: any,
	skillnames: Record<string, string[]>,
	courseDistance: number,
	umaIndex: 0 | 1
): RaceEvent[] {
	const events: RaceEvent[] = [];
	const phaseDistances = getPhaseDistances(courseDistance);

	// Add phase transitions
	events.push({
		type: RaceEventType.PhaseTransition,
		position: 0,
		phase: 0,
		data: { phaseNumber: 0 }
	});
	events.push({
		type: RaceEventType.PhaseTransition,
		position: phaseDistances.phase0End,
		phase: 1,
		data: { phaseNumber: 1 }
	});
	events.push({
		type: RaceEventType.PhaseTransition,
		position: phaseDistances.phase1End,
		phase: 2,
		data: { phaseNumber: 2 }
	});
	events.push({
		type: RaceEventType.PhaseTransition,
		position: phaseDistances.phase2End,
		phase: 3,
		data: { phaseNumber: 3 }
	});

	// Add skill activations
	const skillMap = medianrun.sk[umaIndex];
	if (skillMap && skillMap instanceof Map) {
		skillMap.forEach((activations: Array<[number, number]>, skillId: string) => {
			for (const [startPos, endPos] of activations) {
				const phase = getPhaseAtPosition(startPos, phaseDistances);
				const duration = endPos > startPos ? estimateDuration(startPos, endPos, medianrun, umaIndex) : undefined;
				// Get skill name: prefer EN name, fall back to JP name, then ID
				const skillEntry = skillnames[skillId];
				const skillName = skillEntry
					? (skillEntry[1] || skillEntry[0] || skillId)  // EN name, or JP name, or ID
					: skillId;
				events.push({
					type: RaceEventType.SkillActivation,
					position: startPos,
					endPosition: endPos > 0 ? endPos : undefined,
					phase,
					data: { skillId, skillName, duration }
				});
			}
		});
	}

	// Add rushed (kakari) events
	const rushed = medianrun.rushed[umaIndex];
	if (rushed && rushed.length > 0) {
		for (const [startPos, endPos] of rushed) {
			const phase = getPhaseAtPosition(startPos, phaseDistances);
			const duration = endPos > startPos ? estimateDuration(startPos, endPos, medianrun, umaIndex) : undefined;
			events.push({
				type: RaceEventType.Rushed,
				position: startPos,
				endPosition: endPos > 0 ? endPos : undefined,
				phase,
				data: { duration }
			});
		}
	}

	// Add position keep events
	const posKeep = medianrun.posKeep[umaIndex];
	if (posKeep && posKeep.length > 0) {
		for (const [startPos, endPos, state] of posKeep) {
			if (state === 0) continue; // Skip None state
			const phase = getPhaseAtPosition(startPos, phaseDistances);
			events.push({
				type: RaceEventType.PosKeep,
				position: startPos,
				endPosition: endPos > 0 ? endPos : undefined,
				phase,
				data: { posKeepState: state }
			});
		}
	}

	// Add compete fight (dueling)
	const competeFight = medianrun.competeFight[umaIndex];
	if (competeFight && competeFight.length === 2 && competeFight[0] != null) {
		const [startPos, endPos] = competeFight;
		const phase = getPhaseAtPosition(startPos, phaseDistances);
		const duration = estimateDuration(startPos, endPos, medianrun, umaIndex);
		events.push({
			type: RaceEventType.CompeteFight,
			position: startPos,
			endPosition: endPos,
			phase,
			data: { duration }
		});
	}

	// Add lead competition (spot struggle)
	const leadCompetition = medianrun.leadCompetition[umaIndex];
	if (leadCompetition && leadCompetition.length === 2 && leadCompetition[0] != null) {
		const [startPos, endPos] = leadCompetition;
		const phase = getPhaseAtPosition(startPos, phaseDistances);
		const duration = estimateDuration(startPos, endPos, medianrun, umaIndex);
		events.push({
			type: RaceEventType.LeadCompetition,
			position: startPos,
			endPosition: endPos,
			phase,
			data: { duration }
		});
	}

	// Add downhill mode events
	const downhill = medianrun.downhillActivations[umaIndex];
	if (downhill && downhill.length > 0) {
		for (const [startPos, endPos] of downhill) {
			const phase = getPhaseAtPosition(startPos, phaseDistances);
			events.push({
				type: RaceEventType.Downhill,
				position: startPos,
				endPosition: endPos > 0 ? endPos : undefined,
				phase,
				data: {}
			});
		}
	}

	// Detect last spurt transition from velocity data
	const lastSpurtPos = detectLastSpurtTransition(medianrun, umaIndex, phaseDistances);
	if (lastSpurtPos != null) {
		events.push({
			type: RaceEventType.LastSpurt,
			position: lastSpurtPos,
			phase: getPhaseAtPosition(lastSpurtPos, phaseDistances),
			data: {}
		});
	}

	// Check for HP death
	const hpDeathPos = detectHpDeath(medianrun, umaIndex, courseDistance);
	if (hpDeathPos != null) {
		events.push({
			type: RaceEventType.HpDied,
			position: hpDeathPos,
			phase: getPhaseAtPosition(hpDeathPos, phaseDistances),
			data: { hpRemaining: 0 }
		});
	}

	// Sort by position
	events.sort((a, b) => a.position - b.position);

	return events;
}

// Estimate duration of an event based on frame data (rough approximation)
function estimateDuration(startPos: number, endPos: number, medianrun: any, umaIndex: number): number | undefined {
	const positions = medianrun.p[umaIndex];
	const times = medianrun.t[umaIndex];

	if (!positions || !times || positions.length === 0) return undefined;

	let startTime: number | undefined;
	let endTime: number | undefined;

	for (let i = 0; i < positions.length; i++) {
		if (startTime === undefined && positions[i] >= startPos) {
			startTime = times[i];
		}
		if (startTime !== undefined && positions[i] >= endPos) {
			endTime = times[i];
			break;
		}
	}

	if (startTime !== undefined && endTime !== undefined) {
		return Math.round((endTime - startTime) * 10) / 10;  // Round to 1 decimal
	}

	return undefined;
}

// Detect last spurt transition from velocity spike
function detectLastSpurtTransition(medianrun: any, umaIndex: number, phaseDistances: PhaseDistances): number | null {
	const velocities = medianrun.v[umaIndex];
	const positions = medianrun.p[umaIndex];

	if (!velocities || !positions || velocities.length < 10) return null;

	// Last spurt starts in phase 2 (final phase)
	// Look for significant velocity increase after phase 1 end
	const phase2Start = phaseDistances.phase1End;

	for (let i = 1; i < positions.length; i++) {
		if (positions[i] >= phase2Start) {
			// Look for acceleration spike (velocity increasing significantly)
			const vDiff = velocities[i] - velocities[i - 1];
			if (vDiff > 0.1) {  // Threshold for "significant" acceleration
				return positions[i];
			}
		}
	}

	// Fallback: return phase 2 start
	return phase2Start;
}

// Detect if HP ran out during the race
function detectHpDeath(medianrun: any, umaIndex: number, courseDistance: number): number | null {
	const hpData = medianrun.hp[umaIndex];
	const positions = medianrun.p[umaIndex];

	if (!hpData || !positions) return null;

	for (let i = 0; i < hpData.length; i++) {
		if (hpData[i] <= 0 && positions[i] < courseDistance - 10) {
			return positions[i];
		}
	}

	return null;
}

// Group events by phase
export function categorizeByPhase(events: RaceEvent[]): Map<number, RaceEvent[]> {
	const byPhase = new Map<number, RaceEvent[]>();

	for (let phase = 0; phase <= 3; phase++) {
		byPhase.set(phase, []);
	}

	for (const event of events) {
		const phaseEvents = byPhase.get(event.phase);
		if (phaseEvents) {
			phaseEvents.push(event);
		}
	}

	return byPhase;
}

// Generate educational tips based on race events
export function generateTips(medianrun: any, events: RaceEvent[], umaIndex: number, courseDistance: number): RaceTip[] {
	const tips: RaceTip[] = [];

	// Check for rushed state
	const rushedEvents = events.filter(e => e.type === RaceEventType.Rushed);
	if (rushedEvents.length > 0) {
		tips.push({
			type: 'warning',
			text: 'Rushed triggered! Your horse got overexcited and burned extra stamina. Higher wit or the "Self-Control" skill reduces this chance.'
		});
	} else {
		tips.push({
			type: 'success',
			text: 'No rushed state - your wit stat helped maintain composure.'
		});
	}

	// Check HP status at end
	const hpData = medianrun.hp[umaIndex];
	if (hpData && hpData.length > 0) {
		const finalHp = hpData[hpData.length - 1];
		const startingHp = hpData[0];
		const hpPercent = startingHp > 0 ? (finalHp / startingHp) * 100 : 0;
		if (finalHp <= 0) {
			tips.push({
				type: 'warning',
				text: 'Stamina depleted before finish! Consider more recovery skills or reducing speed skills.'
			});
		} else if (hpPercent < 10) {
			tips.push({
				type: 'warning',
				text: `Very low stamina at finish (${hpPercent.toFixed(0)}%). This may have reduced your final speed.`
			});
		} else {
			tips.push({
				type: 'success',
				text: `Good stamina management - finished with ${hpPercent.toFixed(0)}% HP remaining.`
			});
		}
	}

	// Check for compete fight (dueling)
	const duelingEvents = events.filter(e => e.type === RaceEventType.CompeteFight);
	if (duelingEvents.length > 0) {
		tips.push({
			type: 'info',
			text: 'Dueling activated! Non-front runners can engage in speed contests during the final straight. Higher guts gives a bigger speed boost.'
		});
	}

	// Check for spot struggle
	const leadEvents = events.filter(e => e.type === RaceEventType.LeadCompetition);
	if (leadEvents.length > 0) {
		tips.push({
			type: 'info',
			text: 'Spot Struggle triggered - multiple front runners pushed each other for position. Duration depends on guts.'
		});
	}

	// Check skill activations
	const skillEvents = events.filter(e => e.type === RaceEventType.SkillActivation);
	const phase2Skills = skillEvents.filter(e => e.phase >= 2);
	if (phase2Skills.length > 0) {
		tips.push({
			type: 'success',
			text: `${phase2Skills.length} skill(s) activated in the final phases for a strong finish.`
		});
	}

	// Check position keep events
	const posKeepEvents = events.filter(e => e.type === RaceEventType.PosKeep);
	if (posKeepEvents.length > 0) {
		const hasPaceUp = posKeepEvents.some(e => e.data.posKeepState === 1);
		const hasPaceDown = posKeepEvents.some(e => e.data.posKeepState === 2);
		const hasSpeedUp = posKeepEvents.some(e => e.data.posKeepState === 3);
		const hasOvertake = posKeepEvents.some(e => e.data.posKeepState === 4);
		if (hasPaceUp) {
			tips.push({
				type: 'info',
				text: 'Pace Up triggered - the horse sped up to stay closer to the pack. Higher wit increases the chance of pace adjustments.'
			});
		}
		if (hasPaceDown) {
			tips.push({
				type: 'info',
				text: 'Pace Down triggered - the horse slowed to conserve stamina while ahead of target position.'
			});
		}
		if (hasSpeedUp) {
			tips.push({
				type: 'info',
				text: 'Speed Up triggered - front runner accelerated to maintain lead distance. Higher wit increases activation chance.'
			});
		}
		if (hasOvertake) {
			tips.push({
				type: 'info',
				text: 'Overtake triggered - front runner pushed to catch up to the leading horse. Higher wit increases activation chance.'
			});
		}
	}

	return tips;
}

// Get final race stats from median run
export function getFinalStats(medianrun: any, umaIndex: number, courseDistance: number): {
	time: number;
	hpRemaining: number;
	hpPercent: number;
} {
	const times = medianrun.t[umaIndex];
	const hpData = medianrun.hp[umaIndex];

	const finalTime = times && times.length > 0 ? times[times.length - 1] : 0;
	const finalHp = hpData && hpData.length > 0 ? hpData[hpData.length - 1] : 0;

	// Use starting HP as the baseline (HP can exceed starting value with heals)
	const startingHp = hpData && hpData.length > 0 ? hpData[0] : 100;
	const hpPercent = startingHp > 0 ? (finalHp / startingHp) * 100 : 0;

	return {
		time: finalTime,
		hpRemaining: finalHp,
		hpPercent: Math.max(0, hpPercent)
	};
}

// Format time as MM:SS.sss
export function formatTime(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	const secondsStr = remainingSeconds.toFixed(3).padStart(6, '0');
	return `${minutes}:${secondsStr}`;
}
