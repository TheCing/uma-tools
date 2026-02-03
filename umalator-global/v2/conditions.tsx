/**
 * Compact Conditions Component
 * Weather, season, time, and ground condition selectors
 */

import { h } from 'preact';
import { CustomSelect, Tooltip } from './components';
import { GroundCondition } from '../../uma-skill-tools/RaceParameters';

// Ground condition options for CustomSelect
const GROUND_OPTIONS = [
	{ value: GroundCondition.Good, label: 'Firm' },
	{ value: GroundCondition.Yielding, label: 'Good' },
	{ value: GroundCondition.Soft, label: 'Soft' },
	{ value: GroundCondition.Heavy, label: 'Heavy' },
];

// Labels for tooltips
const WEATHER_LABELS = ['Sunny', 'Cloudy', 'Rainy', 'Snowy'];
const SEASON_LABELS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const TIME_LABELS = ['Midday', 'Evening', 'Night'];

interface CompactConditionsProps {
	ground: number;
	setGround: (v: number) => void;
	weather: number;
	setWeather: (v: number) => void;
	season: number;
	setSeason: (v: number) => void;
	time: number;
	setTime: (v: number) => void;
}

export function CompactConditions({
	ground,
	setGround,
	weather,
	setWeather,
	season,
	setSeason,
	time,
	setTime,
}: CompactConditionsProps) {
	return (
		<div class="v2-conditions">
			<CustomSelect
				value={ground}
				onChange={(val) => setGround(val as number)}
				options={GROUND_OPTIONS}
				className="v2-ground-select"
			/>
			<div class="v2-icon-group">
				{[1, 2, 3, 4].map((w) => (
					<Tooltip key={w} content={WEATHER_LABELS[w - 1]} position="bottom">
						<button
							type="button"
							class={weather === w ? 'selected' : ''}
							onClick={() => setWeather(w)}
						>
							<img
								src={`/uma-tools/icons/utx_ico_weather_0${w - 1}.png`}
								alt={WEATHER_LABELS[w - 1]}
								class="v2-condition-icon"
							/>
						</button>
					</Tooltip>
				))}
			</div>
			<div class="v2-icon-group">
				{[1, 2, 3, 4].map((s) => (
					<Tooltip key={s} content={SEASON_LABELS[s - 1]} position="bottom">
						<button
							type="button"
							class={season === s ? 'selected' : ''}
							onClick={() => setSeason(s)}
						>
							<img
								src={`/uma-tools/icons/global/utx_txt_season_0${s - 1}.png`}
								alt={SEASON_LABELS[s - 1]}
								class="v2-condition-icon v2-condition-icon-season"
							/>
						</button>
					</Tooltip>
				))}
			</div>
			<div class="v2-icon-group">
				{[2, 3, 4].map((t) => (
					<Tooltip key={t} content={TIME_LABELS[t - 2]} position="bottom">
						<button
							type="button"
							class={time === t ? 'selected' : ''}
							onClick={() => setTime(t)}
						>
							<img
								src={`/uma-tools/icons/utx_ico_timezone_0${t - 2}.png`}
								alt={TIME_LABELS[t - 2]}
								class="v2-condition-icon"
							/>
						</button>
					</Tooltip>
				))}
			</div>
		</div>
	);
}
