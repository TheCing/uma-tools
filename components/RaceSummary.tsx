import { h, Fragment } from 'preact';

import {
	RaceEventType,
	RaceEvent,
	RaceTip,
	getPhaseDistances,
	getPhaseName,
	getPosKeepStateName,
	buildEventTimeline,
	categorizeByPhase,
	generateTips,
	getFinalStats,
	formatTime
} from './RaceSummaryUtils';

import './RaceSummary.css';

interface RaceSummaryProps {
	medianrun: any;
	courseDistance: number;
	skillnames: Record<string, string[]>;
	result: number;  // Bashin difference (positive = ahead)
}

// Render a single event line
function EventLine({ event, courseDistance }: { event: RaceEvent; courseDistance: number }) {
	const positionStr = `${Math.round(event.position)}m`;
	const durationStr = event.data.duration ? ` (${event.data.duration.toFixed(1)}s)` : '';

	switch (event.type) {
		case RaceEventType.PhaseTransition:
			// Don't show phase 0 transition (race start)
			if (event.data.phaseNumber === 0) return null;
			return (
				<div class="raceSummaryEvent raceSummaryEvent--phase">
					<span class="raceSummaryEvent__position">{positionStr}</span>
					<span class="raceSummaryEvent__icon">📍</span>
					<span class="raceSummaryEvent__text">
						Entered {getPhaseName(event.data.phaseNumber!)} phase
					</span>
				</div>
			);

		case RaceEventType.SkillActivation:
			return (
				<div class="raceSummaryEvent raceSummaryEvent--skill">
					<span class="raceSummaryEvent__position">{positionStr}</span>
					<span class="raceSummaryEvent__icon">⚡</span>
					<span class="raceSummaryEvent__text">
						"{event.data.skillName}" activated{durationStr}
					</span>
				</div>
			);

		case RaceEventType.Rushed:
			return (
				<div class="raceSummaryEvent raceSummaryEvent--warning">
					<span class="raceSummaryEvent__position">{positionStr}</span>
					<span class="raceSummaryEvent__icon">{event.data.isEndEvent ? '✓' : '🔥'}</span>
					<span class="raceSummaryEvent__text">
						{event.data.isEndEvent ? 'Rushed ended' : `Rushed triggered${durationStr}`}
					</span>
				</div>
			);

		case RaceEventType.PosKeep:
			return (
				<div class="raceSummaryEvent raceSummaryEvent--poskeep">
					<span class="raceSummaryEvent__position">{positionStr}</span>
					<span class="raceSummaryEvent__icon">{event.data.isEndEvent ? '✓' : '🏃'}</span>
					<span class="raceSummaryEvent__text">
						{getPosKeepStateName(event.data.posKeepState!)} {event.data.isEndEvent ? 'ended' : 'active'}
					</span>
				</div>
			);

		case RaceEventType.CompeteFight:
			return (
				<div class="raceSummaryEvent raceSummaryEvent--mechanic">
					<span class="raceSummaryEvent__position">{positionStr}</span>
					<span class="raceSummaryEvent__icon">{event.data.isEndEvent ? '✓' : '⚔️'}</span>
					<span class="raceSummaryEvent__text">
						{event.data.isEndEvent ? 'Dueling ended' : `Dueling engaged${durationStr}`}
					</span>
				</div>
			);

		case RaceEventType.LeadCompetition:
			return (
				<div class="raceSummaryEvent raceSummaryEvent--mechanic">
					<span class="raceSummaryEvent__position">{positionStr}</span>
					<span class="raceSummaryEvent__icon">{event.data.isEndEvent ? '✓' : '🏆'}</span>
					<span class="raceSummaryEvent__text">
						{event.data.isEndEvent ? 'Spot Struggle ended' : `Spot Struggle${durationStr}`}
					</span>
				</div>
			);

		case RaceEventType.Downhill:
			return (
				<div class="raceSummaryEvent raceSummaryEvent--downhill">
					<span class="raceSummaryEvent__position">{positionStr}</span>
					<span class="raceSummaryEvent__icon">{event.data.isEndEvent ? '✓' : '⛷️'}</span>
					<span class="raceSummaryEvent__text">
						{event.data.isEndEvent ? 'Downhill mode ended' : 'Downhill mode activated'}
					</span>
				</div>
			);

		case RaceEventType.LastSpurt:
			return (
				<div class="raceSummaryEvent raceSummaryEvent--spurt">
					<span class="raceSummaryEvent__position">{positionStr}</span>
					<span class="raceSummaryEvent__icon">🚀</span>
					<span class="raceSummaryEvent__text">
						Last spurt began
					</span>
				</div>
			);

		case RaceEventType.HpDied:
			return (
				<div class="raceSummaryEvent raceSummaryEvent--warning">
					<span class="raceSummaryEvent__position">{positionStr}</span>
					<span class="raceSummaryEvent__icon">💀</span>
					<span class="raceSummaryEvent__text">
						Stamina depleted!
					</span>
				</div>
			);

		default:
			return null;
	}
}

// Render a tip/callout
function TipLine({ tip }: { tip: RaceTip }) {
	const iconMap = {
		info: '💡',
		success: '✓',
		warning: '⚠️'
	};

	return (
		<div class={`raceSummaryTip raceSummaryTip--${tip.type}`}>
			<span class="raceSummaryTip__icon">{iconMap[tip.type]}</span>
			<span class="raceSummaryTip__text">{tip.text}</span>
		</div>
	);
}

// Render a phase section
function PhaseSection({
	phase,
	events,
	phaseDistances,
	courseDistance
}: {
	phase: number;
	events: RaceEvent[];
	phaseDistances: ReturnType<typeof getPhaseDistances>;
	courseDistance: number;
}) {
	const phaseName = getPhaseName(phase);

	// Calculate phase range for display
	let startPos = 0, endPos = 0;
	switch (phase) {
		case 0: startPos = 0; endPos = phaseDistances.phase0End; break;
		case 1: startPos = phaseDistances.phase0End; endPos = phaseDistances.phase1End; break;
		case 2: startPos = phaseDistances.phase1End; endPos = phaseDistances.phase2End; break;
		case 3: startPos = phaseDistances.phase2End; endPos = phaseDistances.phase3End; break;
	}

	// Filter out phase transition events from display (they're shown as section headers)
	const displayEvents = events.filter(e => e.type !== RaceEventType.PhaseTransition);

	return (
		<div class="raceSummaryPhase">
			<div class="raceSummaryPhase__header">
				{phaseName} ({Math.round(startPos)}-{Math.round(endPos)}m)
			</div>
			<div class="raceSummaryPhase__content">
				{displayEvents.length === 0 ? (
					<div class="raceSummaryEvent raceSummaryEvent--empty">
						• No notable events
					</div>
				) : (
					displayEvents.map((event, i) => (
						<EventLine key={i} event={event} courseDistance={courseDistance} />
					))
				)}
			</div>
		</div>
	);
}

export function RaceSummary({ medianrun, courseDistance, skillnames, result }: RaceSummaryProps) {
	if (!medianrun) return null;

	const umaIndex = 0;  // Show Uma 1's perspective
	const phaseDistances = getPhaseDistances(courseDistance);

	// Build event timeline
	const events = buildEventTimeline(medianrun, skillnames, courseDistance, umaIndex);
	const eventsByPhase = categorizeByPhase(events);

	// Get final stats
	const stats = getFinalStats(medianrun, umaIndex, courseDistance);

	// Generate tips
	const tips = generateTips(medianrun, events, umaIndex, courseDistance);

	// Format result (negative = Uma 1 faster/ahead, positive = Uma 2 faster/Uma 1 behind)
	const resultStr = result <= 0
		? `${Math.abs(result).toFixed(1)} lengths ahead`
		: `${result.toFixed(1)} lengths behind`;

	return (
		<div class="raceSummary">
			{/* Disclaimer */}
			<div class="raceSummary__disclaimer">
				This summary represents the median simulation run - actual results vary based on RNG.
			</div>

			{/* Result header */}
			<div class="raceSummary__result">
				<span class="raceSummary__resultValue">{resultStr}</span>
				<span class="raceSummary__resultStat">Time: {formatTime(stats.time)}</span>
				<span class="raceSummary__resultStat">HP: {stats.hpPercent.toFixed(0)}%</span>
			</div>

			{/* Phase breakdown */}
			<div class="raceSummary__phases">
				{[0, 1, 2, 3].map(phase => (
					<PhaseSection
						key={phase}
						phase={phase}
						events={eventsByPhase.get(phase) || []}
						phaseDistances={phaseDistances}
						courseDistance={courseDistance}
					/>
				))}
			</div>

			{/* Key takeaways */}
			<div class="raceSummary__tips">
				<div class="raceSummary__tipsHeader">Key Takeaways</div>
				{tips.map((tip, i) => (
					<TipLine key={i} tip={tip} />
				))}
			</div>
		</div>
	);
}
