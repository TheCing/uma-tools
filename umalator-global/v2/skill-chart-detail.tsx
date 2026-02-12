/**
 * Skill Chart Detail Component
 *
 * Expandable detail view showing charts for a selected skill
 */

import { h } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import {
	Histogram,
	LengthDifferenceChart,
	ActivationFrequencyChart
} from './skill-charts';
import { VelocityChart } from './velocity-chart';
import type { SkillChartResult } from './skill-chart-types';

interface SkillChartDetailProps {
	skillId: string;
	runData: SkillChartResult['runData'] | null;
	courseDistance: number;
	umaIndex?: number;
	sampleCount?: number;
}

/**
 * Calculate effectiveness rate (percentage of runs where skill activated)
 */
function calculateEffectivenessRate(runData: SkillChartResult['runData'], skillId: string): number {
	if (!runData.allruns || !runData.allruns.sk || !Array.isArray(runData.allruns.sk)) {
		return 0;
	}

	let activationCount = 0;
	const totalRuns = runData.allruns.totalRuns || 0;

	if (totalRuns === 0) return 0;

	// Count runs where skill activated
	runData.allruns.sk.forEach((skMap: any) => {
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

		if (positions && Array.isArray(positions) && positions.length > 0) {
			activationCount++;
		}
	});

	return (activationCount / totalRuns) * 100;
}

/**
 * Effectiveness rate bar visualization
 */
function EffectivenessRateBar(props: { rate: number }) {
	const { rate } = props;
	const percentage = Math.min(100, Math.max(0, rate));

	return (
		<div class="v2-effectiveness-rate">
			<div class="v2-effectiveness-label">
				Effectiveness Rate: <strong>{percentage.toFixed(1)}%</strong>
			</div>
			<div class="v2-effectiveness-bar-container">
				<div class="v2-effectiveness-bar" style={`width: ${percentage}%`}></div>
			</div>
		</div>
	);
}

/**
 * Chart tabs selector
 */
function ChartTabs(props: {
	activeTab: string;
	setActiveTab: (tab: string) => void;
	availableCharts: string[];
}) {
	const { activeTab, setActiveTab, availableCharts } = props;

	const tabLabels: Record<string, string> = {
		'length': 'Length Difference',
		'frequency': 'Activation Frequency',
		'velocity': 'Velocity',
		'histogram': 'Histogram'
	};

	return (
		<div class="v2-chart-tabs">
			{availableCharts.map(tab => (
				<button
					key={tab}
					type="button"
					class={activeTab === tab ? 'active' : ''}
					onClick={() => setActiveTab(tab)}
				>
					{tabLabels[tab]}
				</button>
			))}
		</div>
	);
}

/**
 * Main Skill Chart Detail Component
 */
export function SkillChartDetail(props: SkillChartDetailProps) {
	const { skillId, runData, courseDistance, umaIndex = 1 } = props;

	// Handle case where runData is not available
	if (!runData) {
		return (
			<div class="v2-skill-chart-detail">
				<div class="v2-skill-chart-detail-empty">
					<p>Stats calculated from {props.sampleCount || 275} samples.</p>
				</div>
			</div>
		);
	}

	const effectivenessRate = useMemo(() => {
		return calculateEffectivenessRate(runData, skillId);
	}, [runData, skillId]);

	// Determine which charts are available
	const availableCharts = useMemo(() => {
		const charts: string[] = [];

		// Length difference chart
		if (runData.allruns?.skBasinn) {
			charts.push('length');
		}

		// Activation frequency chart
		if (runData.allruns?.sk) {
			charts.push('frequency');
		}

		// Velocity chart (always available if we have runData)
		if (runData.medianrun) {
			charts.push('velocity');
		}

		// Histogram (always available if we have results)
		if (runData.allruns?.totalRuns) {
			charts.push('histogram');
		}

		return charts;
	}, [runData]);

	const [activeTab, setActiveTab] = useState(availableCharts[0] || 'length');

	// Ensure activeTab is valid
	if (!availableCharts.includes(activeTab) && availableCharts.length > 0) {
		setActiveTab(availableCharts[0]);
	}

	return (
		<div class="v2-skill-chart-detail">
			<EffectivenessRateBar rate={effectivenessRate} />

			{availableCharts.length > 0 && (
				<>
					<ChartTabs
						activeTab={activeTab}
						setActiveTab={setActiveTab}
						availableCharts={availableCharts}
					/>

					<div class="v2-chart-display">
						{activeTab === 'length' && (
							<LengthDifferenceChart
								skillId={skillId}
								runData={runData}
								courseDistance={courseDistance}
								umaIndex={umaIndex}
							/>
						)}

						{activeTab === 'frequency' && (
							<ActivationFrequencyChart
								skillId={skillId}
								runData={runData}
								courseDistance={courseDistance}
								umaIndex={umaIndex}
							/>
						)}

						{activeTab === 'velocity' && runData.medianrun && (
							<VelocityChart
								snapshot={runData.medianrun}
								courseDistance={courseDistance}
							/>
						)}

						{activeTab === 'histogram' && (
							<Histogram
								data={runData.allruns?.bashinResults || []}
								width={600}
								height={200}
							/>
						)}
					</div>
				</>
			)}

			{availableCharts.length === 0 && (
				<div class="v2-no-charts">No chart data available for this skill</div>
			)}
		</div>
	);
}
